import crypto from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Anthropic from '@anthropic-ai/sdk'
import bcrypt from 'bcryptjs'
import Database from 'better-sqlite3'
import express from 'express'
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BASE64_LENGTH, analyzeFloorPlan } from './floorplan.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const db = new Database(path.join(__dirname, 'data.db'))
db.pragma('journal_mode = WAL')
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );
`)

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14
const COOKIE_NAME = 'zx_session'

const app = express()
app.use(express.json({ limit: '20mb' }))

const publicUser = (user) => ({ id: user.id, name: user.name, phone: user.phone })

const getCookie = (req, name) => {
  const header = req.headers.cookie
  if (!header) return null
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) return decodeURIComponent(rest.join('='))
  }
  return null
}

const createSession = (res, userId) => {
  const token = crypto.randomBytes(32).toString('hex')
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)')
    .run(token, userId, Date.now() + SESSION_TTL_MS)
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${token}; HttpOnly; Path=/; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}; SameSite=Lax`,
  )
}

const clearSessionCookie = (res) => {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`)
}

const currentUser = (req) => {
  const token = getCookie(req, COOKIE_NAME)
  if (!token) return null
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now())
  const row = db.prepare(
    `SELECT u.id, u.name, u.phone FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND s.expires_at >= ?`,
  ).get(token, Date.now())
  return row || null
}

app.post('/api/register', async (req, res) => {
  const name = String(req.body?.name || '').trim()
  const phone = String(req.body?.phone || '').trim()
  const password = String(req.body?.password || '')

  if (name.length < 2 || name.length > 20) return res.status(400).json({ error: '请输入 2-20 个字的姓名' })
  if (!/^1\d{10}$/.test(phone)) return res.status(400).json({ error: '请输入正确的 11 位手机号' })
  if (password.length < 8) return res.status(400).json({ error: '密码至少需要 8 位' })

  if (db.prepare('SELECT id FROM users WHERE phone = ?').get(phone)) {
    return res.status(409).json({ error: '该手机号已注册，请直接登录' })
  }

  const passwordHash = await bcrypt.hash(password, 10)
  const info = db.prepare('INSERT INTO users (phone, name, password_hash) VALUES (?, ?, ?)')
    .run(phone, name, passwordHash)
  const user = { id: info.lastInsertRowid, name, phone }
  createSession(res, user.id)
  res.status(201).json({ user })
})

app.post('/api/login', async (req, res) => {
  const phone = String(req.body?.phone || '').trim()
  const password = String(req.body?.password || '')
  const row = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone)
  const ok = row && await bcrypt.compare(password, row.password_hash)
  if (!ok) return res.status(401).json({ error: '手机号或密码不正确' })
  createSession(res, row.id)
  res.json({ user: publicUser(row) })
})

app.post('/api/logout', (req, res) => {
  const token = getCookie(req, COOKIE_NAME)
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token)
  clearSessionCookie(res)
  res.json({ ok: true })
})

app.get('/api/me', (req, res) => {
  res.json({ user: currentUser(req) })
})

app.post('/api/analyze-floorplan', async (req, res) => {
  if (!currentUser(req)) return res.status(401).json({ error: '请先登录' })

  const imageBase64 = String(req.body?.image || '')
  const mediaType = String(req.body?.mediaType || '')
  if (!ALLOWED_IMAGE_TYPES.includes(mediaType)) {
    return res.status(400).json({ error: '请上传 JPG、PNG 或 WebP 格式的户型图' })
  }
  if (!imageBase64 || imageBase64.length > MAX_IMAGE_BASE64_LENGTH) {
    return res.status(400).json({ error: '图片过大或为空，请上传 10MB 以内的户型图' })
  }

  try {
    const result = await analyzeFloorPlan({
      apiKey: process.env.ANTHROPIC_API_KEY,
      imageBase64,
      mediaType,
    })
    res.json(result)
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      return res.status(503).json({ error: '服务端 AI 密钥无效，请检查 ANTHROPIC_API_KEY' })
    }
    if (error instanceof Anthropic.RateLimitError) {
      return res.status(429).json({ error: 'AI 分析请求过于频繁，请稍后重试' })
    }
    if (error.code === 'refusal' || error.code === 'empty') {
      return res.status(422).json({ error: error.message })
    }
    if (error instanceof Anthropic.APIError) {
      console.error('Floor plan analysis API error', error.status, error.message)
      return res.status(502).json({ error: 'AI 分析暂时不可用，请稍后重试' })
    }
    if (String(error.message).includes('Could not resolve authentication method')) {
      return res.status(503).json({ error: '服务端尚未配置 AI 密钥（ANTHROPIC_API_KEY）' })
    }
    console.error('Floor plan analysis error', error)
    res.status(502).json({ error: 'AI 分析暂时不可用，请稍后重试' })
  }
})

if (process.env.NODE_ENV === 'production') {
  const dist = path.join(__dirname, '..', 'dist')
  app.use(express.static(dist))
  app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')))
}

const port = Number(process.env.PORT) || 3001
app.listen(port, '127.0.0.1', () => {
  console.log(`[api] listening on http://127.0.0.1:${port}`)
})
