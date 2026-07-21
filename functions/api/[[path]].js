import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BASE64_LENGTH, analyzeFloorPlan } from '../../server/floorplan.js'

const COOKIE_NAME = 'zx_session'
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14
const PASSWORD_ITERATIONS = 100_000
const encoder = new TextEncoder()

const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  },
})

const bytesToBase64 = (bytes) => {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

const base64ToBytes = (value) => {
  const binary = atob(value)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

const derivePassword = async (password, salt, iterations) => {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({
    name: 'PBKDF2',
    hash: 'SHA-256',
    salt,
    iterations,
  }, key, 256)
  return new Uint8Array(bits)
}

const hashPassword = async (password) => {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await derivePassword(password, salt, PASSWORD_ITERATIONS)
  return `pbkdf2$${PASSWORD_ITERATIONS}$${bytesToBase64(salt)}$${bytesToBase64(hash)}`
}

const verifyPassword = async (password, encoded) => {
  const [algorithm, iterationText, saltText, hashText] = String(encoded || '').split('$')
  const iterations = Number(iterationText)
  if (algorithm !== 'pbkdf2' || !Number.isInteger(iterations) || !saltText || !hashText) return false

  const expected = base64ToBytes(hashText)
  const actual = await derivePassword(password, base64ToBytes(saltText), iterations)
  if (actual.length !== expected.length) return false

  let difference = 0
  for (let index = 0; index < actual.length; index += 1) difference |= actual[index] ^ expected[index]
  return difference === 0
}

const randomToken = () => Array.from(
  crypto.getRandomValues(new Uint8Array(32)),
  (byte) => byte.toString(16).padStart(2, '0'),
).join('')

const getCookie = (request, name) => {
  const header = request.headers.get('Cookie')
  if (!header) return null
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) return decodeURIComponent(rest.join('='))
  }
  return null
}

const sessionCookie = (token, maxAge) => (
  `${COOKIE_NAME}=${token}; HttpOnly; Secure; Path=/; Max-Age=${maxAge}; SameSite=Lax`
)

const parseBody = async (request) => {
  try {
    return await request.json()
  } catch {
    return null
  }
}

const createSession = async (db, userId) => {
  const token = randomToken()
  await db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(token, userId, Date.now() + SESSION_TTL_MS)
    .run()
  return token
}

const publicUser = (user) => ({ id: user.id, name: user.name, phone: user.phone })

const register = async (request, db) => {
  const body = await parseBody(request)
  if (!body) return json({ error: '请求格式不正确' }, 400)

  const name = String(body.name || '').trim()
  const phone = String(body.phone || '').trim()
  const password = String(body.password || '')

  if (name.length < 2 || name.length > 20) return json({ error: '请输入 2-20 个字的姓名' }, 400)
  if (!/^1\d{10}$/.test(phone)) return json({ error: '请输入正确的 11 位手机号' }, 400)
  if (password.length < 8) return json({ error: '密码至少需要 8 位' }, 400)

  const existing = await db.prepare('SELECT id FROM users WHERE phone = ?').bind(phone).first()
  if (existing) return json({ error: '该手机号已注册，请直接登录' }, 409)

  const passwordHash = await hashPassword(password)
  try {
    await db.prepare('INSERT INTO users (phone, name, password_hash) VALUES (?, ?, ?)')
      .bind(phone, name, passwordHash)
      .run()
  } catch (error) {
    if (String(error).includes('UNIQUE')) return json({ error: '该手机号已注册，请直接登录' }, 409)
    throw error
  }

  const user = await db.prepare('SELECT id, name, phone FROM users WHERE phone = ?').bind(phone).first()
  const token = await createSession(db, user.id)
  return json({ user: publicUser(user) }, 201, {
    'Set-Cookie': sessionCookie(token, Math.floor(SESSION_TTL_MS / 1000)),
  })
}

const login = async (request, db) => {
  const body = await parseBody(request)
  if (!body) return json({ error: '请求格式不正确' }, 400)

  const phone = String(body.phone || '').trim()
  const password = String(body.password || '')
  const user = await db.prepare('SELECT * FROM users WHERE phone = ?').bind(phone).first()
  const valid = user && await verifyPassword(password, user.password_hash)
  if (!valid) return json({ error: '手机号或密码不正确' }, 401)

  const token = await createSession(db, user.id)
  return json({ user: publicUser(user) }, 200, {
    'Set-Cookie': sessionCookie(token, Math.floor(SESSION_TTL_MS / 1000)),
  })
}

const logout = async (request, db) => {
  const token = getCookie(request, COOKIE_NAME)
  if (token) await db.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run()
  return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie('', 0) })
}

const sessionUser = async (request, db) => {
  const token = getCookie(request, COOKIE_NAME)
  if (!token) return null

  const now = Date.now()
  await db.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now).run()
  const user = await db.prepare(`
    SELECT u.id, u.name, u.phone
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND s.expires_at >= ?
  `).bind(token, now).first()
  return user || null
}

const currentUser = async (request, db) => {
  const user = await sessionUser(request, db)
  return json({ user: user ? publicUser(user) : null })
}

const analyzeFloorPlanRoute = async (request, db, env) => {
  if (!(await sessionUser(request, db))) return json({ error: '请先登录' }, 401)

  const body = await parseBody(request)
  if (!body) return json({ error: '请求格式不正确' }, 400)

  const imageBase64 = String(body.image || '')
  const mediaType = String(body.mediaType || '')
  if (!ALLOWED_IMAGE_TYPES.includes(mediaType)) {
    return json({ error: '请上传 JPG、PNG 或 WebP 格式的户型图' }, 400)
  }
  if (!imageBase64 || imageBase64.length > MAX_IMAGE_BASE64_LENGTH) {
    return json({ error: '图片过大或为空，请上传 10MB 以内的户型图' }, 400)
  }
  if (!env.ANTHROPIC_API_KEY) {
    return json({ error: '服务端尚未配置 AI 密钥（ANTHROPIC_API_KEY）' }, 503)
  }

  try {
    const result = await analyzeFloorPlan({
      apiKey: env.ANTHROPIC_API_KEY,
      imageBase64,
      mediaType,
    })
    return json(result)
  } catch (error) {
    if (error.code === 'refusal' || error.code === 'empty') {
      return json({ error: error.message }, 422)
    }
    if (error.status === 401) return json({ error: '服务端 AI 密钥无效' }, 503)
    if (error.status === 429) return json({ error: 'AI 分析请求过于频繁，请稍后重试' }, 429)
    console.error('Floor plan analysis error', error)
    return json({ error: 'AI 分析暂时不可用，请稍后重试' }, 502)
  }
}

export const onRequest = async ({ request, env }) => {
  if (!env.DB) return json({ error: '数据库尚未绑定' }, 503)

  const { pathname } = new URL(request.url)
  try {
    if (pathname === '/api/register' && request.method === 'POST') return await register(request, env.DB)
    if (pathname === '/api/login' && request.method === 'POST') return await login(request, env.DB)
    if (pathname === '/api/logout' && request.method === 'POST') return await logout(request, env.DB)
    if (pathname === '/api/me' && request.method === 'GET') return await currentUser(request, env.DB)
    if (pathname === '/api/analyze-floorplan' && request.method === 'POST') {
      return await analyzeFloorPlanRoute(request, env.DB, env)
    }
    return json({ error: '接口不存在' }, 404)
  } catch (error) {
    console.error('Auth API error', error)
    return json({ error: '服务暂时不可用，请稍后重试' }, 500)
  }
}
