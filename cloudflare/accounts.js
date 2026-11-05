import bcrypt from 'bcryptjs'

const COOKIE_NAME = 'zx_session'
const TTL = 14 * 86400000
const encoder = new TextEncoder()
const columns = {
 role: "TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('admin','user'))",
 status: "TEXT NOT NULL DEFAULT 'enabled' CHECK(status IN ('enabled','disabled'))",
 updated_at: 'TEXT', last_login_at: 'TEXT', revision: 'INTEGER NOT NULL DEFAULT 0',
 approval_status: "TEXT NOT NULL DEFAULT 'approved' CHECK(approval_status IN ('pending','approved','rejected'))",
 review_note: "TEXT NOT NULL DEFAULT ''", reviewed_at: 'TEXT', reviewed_by: 'INTEGER', invitation_id: 'INTEGER', mutation_id: 'TEXT',
}
const schema = [
 `CREATE TABLE IF NOT EXISTS invitations (id INTEGER PRIMARY KEY AUTOINCREMENT, code_hash TEXT UNIQUE NOT NULL, hint TEXT NOT NULL, name TEXT NOT NULL, created_by INTEGER NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, max_uses INTEGER NOT NULL CHECK(max_uses BETWEEN 1 AND 1000), use_count INTEGER NOT NULL DEFAULT 0 CHECK(use_count >= 0), enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)))`,
 `CREATE TABLE IF NOT EXISTS admin_events (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL, actor_id INTEGER, actor_name TEXT NOT NULL, actor_login TEXT NOT NULL, action TEXT NOT NULL, target_id INTEGER, target TEXT NOT NULL, result TEXT NOT NULL)`,
 'CREATE INDEX IF NOT EXISTS admin_events_time ON admin_events(created_at)',
 'CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id)',
 'CREATE INDEX IF NOT EXISTS sessions_expiration ON sessions(expires_at)',
 'CREATE TABLE IF NOT EXISTS auth_rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL)',
 'CREATE INDEX IF NOT EXISTS auth_rate_expiration ON auth_rate_limits(expires_at)',
 'CREATE TRIGGER IF NOT EXISTS invitations_consume_signup AFTER INSERT ON users WHEN NEW.invitation_id IS NOT NULL BEGIN UPDATE invitations SET use_count=use_count+1 WHERE id=NEW.invitation_id; END',
]

// Deployment-time helper. This only adds absent columns/tables; it never changes
// an existing role, password, approval, session, or account identifier.
export async function ensureSchema(env) {
 const db = env.DB || env
 const existing = new Set((await db.prepare('PRAGMA table_info(users)').all()).results.map(row => row.name))
 if (!existing.size) throw new Error('Apply migrations/0001_auth.sql before the accounts migration')
 for (const [name, definition] of Object.entries(columns)) {
  if (!existing.has(name)) await db.prepare(`ALTER TABLE users ADD COLUMN ${name} ${definition}`).run()
 }
 await db.batch(schema.map(sql => db.prepare(sql)))
}

class AccountError extends Error {
 constructor(message, status = 400, headers = {}) { super(message); this.status = status; this.headers = headers }
}
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers } })
const stmt = (db, sql, ...args) => db.prepare(sql).bind(...args)
const first = (db, sql, ...args) => stmt(db, sql, ...args).first()
const all = async (db, sql, ...args) => (await stmt(db, sql, ...args).all()).results
const iso = value => value ? (/Z$|[+-]\d\d:\d\d$/.test(value) ? value : value.replace(' ', 'T') + 'Z') : null
const publicUser = row => row ? ({ id: row.id, name: row.name, phone: row.phone, role: row.role, ...(row.created_at ? { createdAt: iso(row.created_at) } : {}) }) : null
const account = row => ({ id: row.id, login: row.phone, name: row.name, role: row.role, status: row.status, approval: row.approval_status, reviewNote: row.review_note, reviewedAt: iso(row.reviewed_at), invitationId: row.invitation_id, createdAt: iso(row.created_at), updatedAt: iso(row.updated_at), lastLoginAt: iso(row.last_login_at), revision: row.revision })
const integer = (value, fallback = 1) => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : fallback
const searchValue = value => `%${String(value || '').slice(0, 64).replace(/[\\%_]/g, '\\$&')}%`
const randomToken = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('')
const cookie = (request, token, seconds) => `${COOKIE_NAME}=${token}; HttpOnly; Path=/; Max-Age=${seconds}; SameSite=Lax${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`
function tokenOf(request) {
 const value = (request.headers.get('Cookie') || '').split(';').map(part => part.trim()).find(part => part.startsWith(COOKIE_NAME + '='))?.slice(COOKIE_NAME.length + 1)
 return value && /^[a-f0-9]{64}$/.test(value) ? value : null
}
async function digest(value) {
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))), byte => byte.toString(16).padStart(2, '0')).join('')
}
export const invitationDigest = code => digest(String(code || '').trim().toUpperCase().replace(/-/g, ''))

// Existing production PBKDF2 hashes and imported bcrypt hashes remain valid.
// New hashes use native WebCrypto to keep password work off the Worker JS CPU.
export async function verifyPassword(password, encoded) {
 if (typeof password !== 'string' || typeof encoded !== 'string') return false
 if (/^\$2[aby]\$\d\d\$/.test(encoded)) return bcrypt.compare(password, encoded).catch(() => false)
 const [algorithm, count, salt64, expected64, extra] = encoded.split('$')
 const iterations = Number(count)
 if (algorithm !== 'pbkdf2' || !Number.isInteger(iterations) || iterations < 1 || iterations > 1_000_000 || !salt64 || !expected64 || extra) return false
 try {
  const bytes = value => Uint8Array.from(atob(value), ch => ch.charCodeAt(0))
  const salt = bytes(salt64), expected = bytes(expected64)
  if (salt.length < 8 || salt.length > 64 || expected.length !== 32) return false
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
  const actual = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256))
  let delta = 0
  for (let index = 0; index < actual.length; index++) delta |= actual[index] ^ expected[index]
  return delta === 0
 } catch { return false }
}
export async function hashPassword(password) {
 const salt = crypto.getRandomValues(new Uint8Array(16)), iterations = 100000
 const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
 const hash = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256))
 const base64 = bytes => btoa(String.fromCharCode(...bytes))
 return `pbkdf2$${iterations}$${base64(salt)}$${base64(hash)}`
}

export async function currentUser(request, env) {
 const token = tokenOf(request)
 if (!token) return null
 return first(env.DB, `SELECT u.id,u.phone,u.name,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>? AND u.status='enabled' AND u.approval_status='approved'`, token, Date.now())
}
const authCondition = (admin = false) => `EXISTS (SELECT 1 FROM sessions s JOIN users actor ON actor.id=s.user_id WHERE s.token=? AND s.expires_at>? AND actor.id=? AND actor.status='enabled' AND actor.approval_status='approved'${admin ? " AND actor.role='admin'" : ''})`
const authArgs = (request, user, at) => [tokenOf(request) || '', at, user.id]
function requireUser(user, admin = false) {
 if (!user) throw new AccountError('登录已失效，请重新登录', 401)
 if (admin && user.role !== 'admin') throw new AccountError('此账号没有管理员权限', 403)
 return user
}
const auditStatement = (db, actor, action, target, result = 'success', condition = '1', args = []) => stmt(db, `INSERT INTO admin_events(created_at,actor_id,actor_name,actor_login,action,target_id,target,result) SELECT ?,?,?,?,?,?,?,? WHERE ${condition}`, new Date().toISOString(), actor?.id ?? null, actor?.name || '未登录', actor?.phone || '', action, typeof target === 'object' ? target?.id ?? null : null, String(typeof target === 'object' ? target?.phone || '' : target || '').slice(0, 100), result, ...args)
export async function auditEvent(env, actor, action, target, result = 'success') { await auditStatement(env.DB, actor, action, target, result).run() }
const mutationAudit = (db, actor, action, row, mutation) => auditStatement(db, actor, action, row, 'success', 'EXISTS (SELECT 1 FROM users WHERE mutation_id=?)', [mutation])
async function readBody(request) {
 const length = request.headers.get('Content-Length')
 if (length && Number(length) > 16384) throw new AccountError('请求内容过大', 413)
 // Bound memory before parsing, including requests sent without Content-Length.
 if (!request.body) throw new AccountError('请求格式不正确')
 const reader = request.body.getReader(), chunks = []; let size = 0
 while (true) {
  const { done, value } = await reader.read()
  if (done) break
  size += value.byteLength
  if (size > 16384) { await reader.cancel(); throw new AccountError('请求内容过大', 413) }
  chunks.push(value)
 }
 try {
  const data = new Uint8Array(size); let offset = 0
  for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength }
  const value = JSON.parse(new TextDecoder().decode(data))
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error()
  return value
 } catch { throw new AccountError('请求格式不正确') }
}
function validateName(value, label = '显示名称') {
 const name = typeof value === 'string' ? value.trim() : ''
 if (!name || name.length > 24 || /[\u0000-\u001f\u007f]/.test(value)) throw new AccountError(`请输入 1–24 个字的${label}`)
 return name
}
function validateLogin(value) {
 const login = typeof value === 'string' ? value.trim().toLowerCase() : ''
 if (!/^[a-z0-9][a-z0-9_.@+-]{2,63}$/.test(login)) throw new AccountError('账号需为 3–64 位字母、数字或 _ . @ + -')
 return login
}
function validatePassword(value, confirmation) {
 if (typeof value !== 'string' || value.length < 8 || encoder.encode(value).length > 72) throw new AccountError('密码至少 8 位，最多 72 字节')
 if (confirmation !== undefined && value !== confirmation) throw new AccountError('两次输入的密码不一致')
 return value
}
function confirmedPassword(value, confirmation) {
 validatePassword(value)
 if (value !== confirmation) throw new AccountError('两次输入的密码不一致')
 return value
}
function validateDraft(body) {
 const name = validateName(body.name, '姓名')
 if (!['admin', 'user'].includes(body.role)) throw new AccountError('请选择有效的角色')
 if (!['enabled', 'disabled'].includes(body.status)) throw new AccountError('请选择有效的账号状态')
 return { name, role: body.role, status: body.status }
}
async function rateLimit(db, keys, maximums) {
 const at = Date.now(), until = at + 15 * 60000
 const results = await db.batch(keys.map(key => stmt(db, `INSERT INTO auth_rate_limits(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires_at<=? THEN 1 ELSE count+1 END, expires_at=CASE WHEN expires_at<=? THEN excluded.expires_at ELSE expires_at END RETURNING count,expires_at`, key, until, at, at)))
 for (let index = 0; index < results.length; index++) {
  const row = results[index].results[0]
  if (row.count > maximums[index]) throw new AccountError('尝试次数过多，请 15 分钟后重试', 429, { 'Retry-After': String(Math.max(1, Math.ceil((row.expires_at - at) / 1000))) })
 }
}
const findAccount = async (db, id) => {
 const row = await first(db, 'SELECT * FROM users WHERE id=?', integer(id, 0))
 if (!row) throw new AccountError('账号不存在', 404)
 return row
}
async function freshUser(request, env, admin = false) { return requireUser(await currentUser(request, env), admin) }
async function events(db, query = new URLSearchParams()) {
 const clause = query.get('q') ? " WHERE (actor_login LIKE ? ESCAPE '\\' OR actor_name LIKE ? ESCAPE '\\' OR target LIKE ? ESCAPE '\\')" : ''
 const args = clause ? Array(3).fill(searchValue(query.get('q'))) : []
 const total = (await first(db, `SELECT COUNT(*) n FROM admin_events${clause}`, ...args)).n
 const pages = Math.max(1, Math.ceil(total / 20)), page = Math.min(integer(query.get('page')), pages)
 return { records: await all(db, `SELECT * FROM admin_events${clause} ORDER BY id DESC LIMIT 20 OFFSET ?`, ...args, (page - 1) * 20), total, pages, page }
}
const invitation = row => ({ id: row.id, name: row.name, hint: row.hint, createdAt: row.created_at, expiresAt: row.expires_at, maxUses: row.max_uses, uses: row.use_count, enabled: !!row.enabled, state: !row.enabled ? 'disabled' : row.expires_at <= new Date().toISOString() ? 'expired' : row.use_count >= row.max_uses ? 'exhausted' : 'active' })

// Returns null for routes owned by another module. Callers may supply provider
// metadata and today's metered usage for the shared admin overview response.
export async function handleAccounts({ request, env, user, path, version, providers = [], usage = null }) {
 path = (path || new URL(request.url).pathname).replace(/^\/api/, '')
 const method = request.method, db = env.DB, query = new URL(request.url).searchParams
 const authRoute = ['/login', '/register', '/logout', '/me', '/admin/access', '/admin/settings', '/account/profile', '/account/password'].includes(path)
 const adminRoute = /^\/admin\/(accounts(?:\/\d+(?:\/(?:password|review))?)?|invitations(?:\/\d+)?|events|overview)$/.test(path)
 if (!authRoute && !adminRoute) return null
 let actor = null, failureAction = null
 try {
  if (path === '/me' && method === 'GET') return json({ user: user === undefined ? await currentUser(request, env) : user })
  if (path === '/login' && method === 'POST') {
   const body = await readBody(request), login = String(body.login || body.phone || '').trim().toLowerCase()
   const accountKey = 'login:account:' + await digest(login.slice(0, 64)), ipKey = 'login:ip:' + await digest(request.headers.get('CF-Connecting-IP') || 'unknown')
   await rateLimit(db, [ipKey, accountKey], [40, 8])
   if (typeof body.password !== 'string') throw new AccountError('账号或密码不正确', 401)
   const original = await first(db, 'SELECT * FROM users WHERE phone=?', login)
   // The old PBKDF2 service did not impose bcrypt's 72-byte password limit.
   if (original?.password_hash?.startsWith('$2') && encoder.encode(body.password).length > 72) throw new AccountError('账号或密码不正确', 401)
   if (!original || !await verifyPassword(body.password, original.password_hash)) throw new AccountError('账号或密码不正确', 401)
   const row = await findAccount(db, original.id)
   if (row.password_hash !== original.password_hash || row.revision !== original.revision) throw new AccountError('账号信息已变更，请重新登录', 401)
   if (row.approval_status === 'pending') throw new AccountError('注册申请正在审核，通过后即可登录', 403)
   if (row.approval_status === 'rejected') throw new AccountError(`注册申请未通过审核${row.review_note ? '：' + row.review_note : '，请联系管理员'}`, 403)
   if (row.status !== 'enabled') throw new AccountError('账号已停用，请联系管理员', 403)
   if (body.audience === 'admin' && row.role !== 'admin') throw new AccountError('此账号没有管理员权限', 403)
   const token = randomToken(), at = Date.now(), stamp = new Date(at).toISOString()
   const result = await db.batch([
    stmt(db, `INSERT INTO sessions(token,user_id,expires_at) SELECT ?,id,? FROM users WHERE id=? AND password_hash=? AND revision=? AND status='enabled' AND approval_status='approved'${body.audience === 'admin' ? " AND role='admin'" : ''} RETURNING token`, token, at + TTL, row.id, row.password_hash, row.revision),
    stmt(db, 'UPDATE users SET last_login_at=? WHERE id=? AND EXISTS (SELECT 1 FROM sessions WHERE token=?)', stamp, row.id, token),
    auditStatement(db, row, 'account.login', row, 'success', 'EXISTS (SELECT 1 FROM sessions WHERE token=?)', [token]),
    stmt(db, 'DELETE FROM auth_rate_limits WHERE key=? AND EXISTS (SELECT 1 FROM sessions WHERE token=?)', accountKey, token),
    stmt(db, 'DELETE FROM sessions WHERE expires_at<=?', at),
   ])
   if (!result[0].results.length) throw new AccountError('账号信息已变更，请重新登录', 401)
   return json({ user: publicUser(row) }, 200, { 'Set-Cookie': cookie(request, token, Math.floor(TTL / 1000)) })
  }
  if (path === '/register' && method === 'POST') {
   const body = await readBody(request), login = validateLogin(body.login || body.phone), name = validateName(body.name), password = validatePassword(body.password)
   await rateLimit(db, ['login:ip:' + await digest(request.headers.get('CF-Connecting-IP') || 'unknown'), 'login:account:' + await digest(login)], [40, 8])
   if (body.role && body.role !== 'user') throw new AccountError('管理员账号需由现有管理员创建', 403)
   const codeHash = await invitationDigest(body.inviteCode), at = new Date().toISOString()
   if (!await first(db, 'SELECT id FROM invitations WHERE code_hash=? AND enabled=1 AND expires_at>? AND use_count<max_uses', codeHash, at)) throw new AccountError('邀请码无效、已到期或已用完，请联系管理员')
   const hash = await hashPassword(password), mutation = crypto.randomUUID()
   if (await first(db, 'SELECT id FROM users WHERE phone=?', login)) throw new AccountError('该账号已注册，请直接登录', 409)
   const results = await db.batch([
    stmt(db, `INSERT INTO users(phone,name,password_hash,role,status,approval_status,invitation_id,mutation_id,created_at) SELECT ?,?,?,'user','disabled','pending',id,?,? FROM invitations WHERE code_hash=? AND enabled=1 AND expires_at>? AND use_count<max_uses RETURNING id`, login, name, hash, mutation, at, codeHash, new Date().toISOString()),
    stmt(db, `INSERT INTO admin_events(created_at,actor_id,actor_name,actor_login,action,target_id,target,result) SELECT ?,id,name,phone,'account.register',id,phone,'success' FROM users WHERE mutation_id=?`, at, mutation),
   ])
   if (!results[0].results.length) throw new AccountError('邀请码已失效，请联系管理员')
   return json({ pendingApproval: true }, 201)
  }
  if (path === '/logout' && method === 'POST') {
   actor = user === undefined ? await currentUser(request, env) : user
   const statements = [stmt(db, 'DELETE FROM sessions WHERE token=?', tokenOf(request) || '')]
   if (actor) statements.push(auditStatement(db, actor, 'account.logout', actor))
   await db.batch(statements)
   return json({ ok: true }, 200, { 'Set-Cookie': cookie(request, '', 0) })
  }
  actor = await freshUser(request, env, path.startsWith('/admin/'))
  if (path === '/admin/access' && method === 'GET') return json({ user: publicUser(actor) })
  if (path === '/admin/settings' && method === 'GET') return json({ user: publicUser(await findAccount(db, actor.id)), software: { name: '家居风水系统', version, language: '简体中文' } })
  if (path === '/account/profile' && method === 'PATCH') {
   failureAction = 'profile.edit'
   const body = await readBody(request), name = validateName(body.name), mutation = crypto.randomUUID(), at = Date.now()
   const original = await findAccount(db, actor.id)
   const results = await db.batch([
    stmt(db, `UPDATE users SET name=?,updated_at=?,revision=revision+1,mutation_id=? WHERE id=? AND revision=? AND ${authCondition()} RETURNING *`, name, new Date(at).toISOString(), mutation, actor.id, original.revision, ...authArgs(request, actor, at)),
    mutationAudit(db, actor, 'profile.edit', original, mutation),
   ])
   if (!results[0].results.length) throw new AccountError('账号信息已更新，请重新登录或刷新后重试', 409)
   return json({ user: publicUser(results[0].results[0]) })
  }
  if (path === '/account/password' && method === 'POST') {
   failureAction = 'password.change'
   const body = await readBody(request), { currentPassword, newPassword, confirmPassword } = body
   if (typeof currentPassword !== 'string' || !currentPassword) throw new AccountError('请输入正确的当前密码')
   confirmedPassword(newPassword, confirmPassword)
   if (newPassword === currentPassword) throw new AccountError('新密码不能与当前密码相同')
   await rateLimit(db, [`password:user:${actor.id}`], [5])
   const original = await findAccount(db, actor.id)
   if (!await verifyPassword(currentPassword, original.password_hash)) throw new AccountError('当前密码不正确')
   const hash = await hashPassword(newPassword), mutation = crypto.randomUUID(), at = Date.now()
   const results = await db.batch([
    stmt(db, `UPDATE users SET password_hash=?,updated_at=?,revision=revision+1,mutation_id=? WHERE id=? AND password_hash=? AND revision=? AND ${authCondition()} RETURNING id`, hash, new Date(at).toISOString(), mutation, actor.id, original.password_hash, original.revision, ...authArgs(request, actor, at)),
    mutationAudit(db, actor, 'password.change', original, mutation),
    stmt(db, 'DELETE FROM sessions WHERE user_id=? AND EXISTS (SELECT 1 FROM users WHERE mutation_id=?)', actor.id, mutation),
    stmt(db, 'DELETE FROM auth_rate_limits WHERE key=? AND EXISTS (SELECT 1 FROM users WHERE mutation_id=?)', `password:user:${actor.id}`, mutation),
   ])
   if (!results[0].results.length) throw new AccountError('密码或登录状态已变更，请重新登录', 409)
   return json({ ok: true, requiresLogin: true }, 200, { 'Set-Cookie': cookie(request, '', 0) })
  }
  if (path === '/admin/accounts' && method === 'GET') {
   const clauses = [], args = []
   if (query.get('q')) { clauses.push("(phone LIKE ? ESCAPE '\\' OR name LIKE ? ESCAPE '\\')"); args.push(searchValue(query.get('q')), searchValue(query.get('q'))) }
   for (const [key, values] of [['role', ['admin', 'user']], ['status', ['enabled', 'disabled']]]) if (values.includes(query.get(key))) { clauses.push(`${key}=?`); args.push(query.get(key)) }
   if (['approved', 'pending', 'rejected'].includes(query.get('approval'))) { clauses.push('approval_status=?'); args.push(query.get('approval')) }
   const where = clauses.length ? ' WHERE ' + clauses.join(' AND ') : ''
   const total = (await first(db, `SELECT COUNT(*) n FROM users${where}`, ...args)).n, pages = Math.max(1, Math.ceil(total / 20)), page = Math.min(integer(query.get('page')), pages)
   const records = (await all(db, `SELECT * FROM users${where} ORDER BY id DESC LIMIT 20 OFFSET ?`, ...args, (page - 1) * 20)).map(account)
   const summary = await first(db, "SELECT COUNT(*) total, COALESCE(SUM(status='enabled' AND approval_status='approved'),0) enabled, COALESCE(SUM(status='disabled'),0) disabled, COALESCE(SUM(role='admin'),0) admins, COALESCE(SUM(approval_status='pending'),0) pending FROM users")
   return json({ records, total, pages, page, summary })
  }
  if (path === '/admin/accounts' && method === 'POST') {
   const body = await readBody(request), draft = validateDraft(body), login = validateLogin(body.login), hash = await hashPassword(confirmedPassword(body.password, body.confirmPassword))
   actor = await freshUser(request, env, true)
   if (await first(db, 'SELECT id FROM users WHERE phone=?', login)) throw new AccountError('该登录账号已存在', 409)
   const mutation = crypto.randomUUID(), at = Date.now(), stamp = new Date(at).toISOString()
   const results = await db.batch([
    stmt(db, `INSERT INTO users(phone,name,role,status,password_hash,created_at,updated_at,mutation_id) SELECT ?,?,?,?,?,?,?,? WHERE ${authCondition(true)} RETURNING *`, login, draft.name, draft.role, draft.status, hash, stamp, stamp, mutation, ...authArgs(request, actor, at)),
    stmt(db, `INSERT INTO admin_events(created_at,actor_id,actor_name,actor_login,action,target_id,target,result) SELECT ?,?,?,?,'account.create',id,phone,'success' FROM users WHERE mutation_id=?`, stamp, actor.id, actor.name, actor.phone, mutation),
   ])
   if (!results[0].results.length) throw new AccountError('登录状态已失效，请重新登录', 401)
   return json({ account: account(results[0].results[0]) }, 201)
  }
  const accountMatch = /^\/admin\/accounts\/(\d+)(?:\/(password|review))?$/.exec(path)
  if (accountMatch) {
   const original = await findAccount(db, accountMatch[1]), action = accountMatch[2], body = await readBody(request)
   if (!action && method === 'PATCH') {
    const draft = validateDraft(body)
    if (original.approval_status !== 'approved') throw new AccountError('此账号尚未通过审核，请先处理注册申请')
    if (body.revision !== original.revision) throw new AccountError('账号信息已更新，请刷新后重试', 409)
    if (body.login !== undefined && body.login !== original.phone) throw new AccountError('登录账号不可修改')
    if (original.id === actor.id && (draft.role !== 'admin' || draft.status !== 'enabled')) throw new AccountError('不能停用自己或移除自己的管理员权限')
    const removesAdmin = original.role === 'admin' && original.status === 'enabled' && (draft.role !== 'admin' || draft.status !== 'enabled')
    const count = await first(db, "SELECT COUNT(*) n FROM users WHERE role='admin' AND status='enabled' AND approval_status='approved'")
    if (removesAdmin && count.n <= 1) throw new AccountError('系统至少需要保留一位启用的管理员')
    const mutation = crypto.randomUUID(), at = Date.now(), changedAccess = original.role !== draft.role || original.status !== draft.status
    const event = original.role !== draft.role ? 'account.role' : original.status !== draft.status ? (draft.status === 'enabled' ? 'account.enable' : 'account.disable') : 'account.edit'
    const statements = [stmt(db, `UPDATE users SET name=?,role=?,status=?,updated_at=?,revision=revision+1,mutation_id=? WHERE id=? AND revision=? AND approval_status='approved' AND ${authCondition(true)}${removesAdmin ? " AND (SELECT COUNT(*) FROM users WHERE role='admin' AND status='enabled' AND approval_status='approved')>1" : ''} RETURNING *`, draft.name, draft.role, draft.status, new Date(at).toISOString(), mutation, original.id, original.revision, ...authArgs(request, actor, at)), mutationAudit(db, actor, event, original, mutation)]
    if (changedAccess) statements.push(stmt(db, 'DELETE FROM sessions WHERE user_id=? AND EXISTS (SELECT 1 FROM users WHERE mutation_id=?)', original.id, mutation))
    const results = await db.batch(statements)
    if (!results[0].results.length) throw new AccountError('账号信息或管理员权限已更新，请刷新后重试', 409)
    return json({ account: account(results[0].results[0]) })
   }
   if (action === 'password' && method === 'POST') {
    if (original.id === actor.id) throw new AccountError('请在系统设置中修改自己的密码')
    const hash = await hashPassword(confirmedPassword(body.password, body.confirmPassword)), mutation = crypto.randomUUID(), at = Date.now()
    const results = await db.batch([
     stmt(db, `UPDATE users SET password_hash=?,updated_at=?,revision=revision+1,mutation_id=? WHERE id=? AND revision=? AND password_hash=? AND ${authCondition(true)} RETURNING id`, hash, new Date(at).toISOString(), mutation, original.id, original.revision, original.password_hash, ...authArgs(request, actor, at)),
     mutationAudit(db, actor, 'account.password', original, mutation),
     stmt(db, 'DELETE FROM sessions WHERE user_id=? AND EXISTS (SELECT 1 FROM users WHERE mutation_id=?)', original.id, mutation),
    ])
    if (!results[0].results.length) throw new AccountError('账号信息已更新，请刷新后重试', 409)
    return json({ ok: true })
   }
   if (action === 'review' && method === 'POST') {
    const { decision, reason = '' } = body
    if (!['approved', 'rejected'].includes(decision)) throw new AccountError('请选择审核结果')
    if (typeof reason !== 'string' || reason.length > 200 || /[\u0000-\u001f\u007f]/.test(reason) || (decision === 'rejected' && !reason.trim())) throw new AccountError('拒绝时请填写原因，最多 200 个字')
    if (original.approval_status !== 'pending' || original.role !== 'user') throw new AccountError('该申请已处理，请刷新列表', 409)
    const mutation = crypto.randomUUID(), at = Date.now(), stamp = new Date(at).toISOString()
    const results = await db.batch([
     stmt(db, `UPDATE users SET approval_status=?,status=?,review_note=?,reviewed_at=?,reviewed_by=?,updated_at=?,revision=revision+1,mutation_id=? WHERE id=? AND revision=? AND approval_status='pending' AND role='user' AND ${authCondition(true)} RETURNING *`, decision, decision === 'approved' ? 'enabled' : 'disabled', reason.trim(), stamp, actor.id, stamp, mutation, original.id, original.revision, ...authArgs(request, actor, at)),
     mutationAudit(db, actor, decision === 'approved' ? 'account.approve' : 'account.reject', original, mutation),
     stmt(db, 'DELETE FROM sessions WHERE user_id=? AND EXISTS (SELECT 1 FROM users WHERE mutation_id=?)', original.id, mutation),
    ])
    if (!results[0].results.length) throw new AccountError('该申请已处理或权限已更新，请刷新列表', 409)
    return json({ account: account(results[0].results[0]) })
   }
  }
  if (path === '/admin/invitations' && method === 'GET') {
   const total = (await first(db, 'SELECT COUNT(*) n FROM invitations')).n, pages = Math.max(1, Math.ceil(total / 20)), page = Math.min(integer(query.get('page')), pages)
   return json({ records: (await all(db, 'SELECT * FROM invitations ORDER BY id DESC LIMIT 20 OFFSET ?', (page - 1) * 20)).map(invitation), total, page, pages })
  }
  if (path === '/admin/invitations' && method === 'POST') {
   const { name, maxUses, expiresInDays } = await readBody(request)
   if (typeof name !== 'string' || !name.trim() || name.trim().length > 40 || /[\u0000-\u001f\u007f]/.test(name)) throw new AccountError('请输入 1–40 个字的邀请码名称')
   if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 1000 || !Number.isInteger(expiresInDays) || expiresInDays < 1 || expiresInDays > 90) throw new AccountError('使用次数需为 1–1000，有效期需为 1–90 天')
   const code = Array.from(crypto.getRandomValues(new Uint8Array(12)), byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase(), hash = await invitationDigest(code), at = Date.now(), stamp = new Date(at).toISOString()
   const results = await db.batch([
    stmt(db, `INSERT INTO invitations(code_hash,hint,name,created_by,created_at,expires_at,max_uses) SELECT ?,?,?,?,?,?,? WHERE ${authCondition(true)} RETURNING *`, hash, code.slice(-4), name.trim(), actor.id, stamp, new Date(at + expiresInDays * 86400000).toISOString(), maxUses, ...authArgs(request, actor, at)),
    auditStatement(db, actor, 'invitation.create', name.trim(), 'success', 'EXISTS (SELECT 1 FROM invitations WHERE code_hash=?)', [hash]),
   ])
   if (!results[0].results.length) throw new AccountError('登录状态已失效，请重新登录', 401)
   return json({ invitation: invitation(results[0].results[0]), code: code.match(/.{6}/g).join('-') }, 201)
  }
  const invitationMatch = /^\/admin\/invitations\/(\d+)$/.exec(path)
  if (invitationMatch && method === 'PATCH') {
   const body = await readBody(request)
   if (typeof body.enabled !== 'boolean') throw new AccountError('请选择有效状态')
   const row = await first(db, 'SELECT * FROM invitations WHERE id=?', integer(invitationMatch[1], 0))
   if (!row) throw new AccountError('邀请码不存在', 404)
   const at = Date.now()
   const results = await db.batch([
    stmt(db, `UPDATE invitations SET enabled=? WHERE id=? AND ${authCondition(true)} RETURNING *`, body.enabled ? 1 : 0, row.id, ...authArgs(request, actor, at)),
    auditStatement(db, actor, body.enabled ? 'invitation.enable' : 'invitation.disable', row.name, 'success', authCondition(true), authArgs(request, actor, at)),
   ])
   if (!results[0].results.length) throw new AccountError('登录状态已失效，请重新登录', 401)
   return json({ invitation: invitation(results[0].results[0]) })
  }
  if (path === '/admin/events' && method === 'GET') return json(await events(db, query))
  if (path === '/admin/overview' && method === 'GET') {
   const users = await first(db, "SELECT COUNT(*) total, COALESCE(SUM(status='enabled' AND approval_status='approved'),0) enabled, COALESCE(SUM(role='admin'),0) admins, COALESCE(SUM(approval_status='pending'),0) pending FROM users")
   return json({ users, usage: usage || { calls: 0, successful: 0, cnyAmount: 0, pending: 0 }, providers, events: (await events(db)).records.slice(0, 5), time: new Date().toISOString() })
  }
  return json({ error: '请求的服务不存在' }, 404)
 } catch (error) {
  if (actor && failureAction) await auditEvent(env, actor, failureAction, actor, 'failed').catch(() => {})
  if (error instanceof AccountError) return json({ error: error.message }, error.status, error.headers)
  if (/UNIQUE constraint failed: users.phone/.test(String(error))) return json({ error: '该登录账号已存在', }, 409)
  return json({ error: '账号服务暂不可用，请稍后重试' }, 500)
 }
}
