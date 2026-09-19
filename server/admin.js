import express from 'express'
import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'

export class AdminError extends Error {
 constructor(message, status = 400) { super(message); this.status = status }
}
const iso = value => value ? (/Z$|[+-]\d\d:\d\d$/.test(value) ? value : value.replace(' ', 'T') + 'Z') : null
const account = row => ({ id: row.id, login: row.phone, name: row.name, role: row.role, status: row.status, approval: row.approval_status, reviewNote: row.review_note, reviewedAt: iso(row.reviewed_at), invitationId: row.invitation_id, createdAt: iso(row.created_at), updatedAt: iso(row.updated_at), lastLoginAt: iso(row.last_login_at), revision: row.revision })
export const invitationDigest = code => crypto.createHash('sha256').update(String(code || '').trim().toUpperCase().replace(/-/g, '')).digest('hex')
const integer = (value, fallback = 1) => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : fallback
const searchValue = value => `%${String(value || '').slice(0, 64).replace(/[\\%_]/g, '\\$&')}%`

export function initializeAccounts(db) {
 db.pragma('foreign_keys = ON')
 db.exec(`CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT, phone TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('admin','user')), password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
 ); CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);`)
 const columns = new Set(db.prepare('PRAGMA table_info(users)').all().map(r => r.name))
 db.transaction(() => {
  for (const [name, definition] of Object.entries({role: "TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('admin','user'))", status: "TEXT NOT NULL DEFAULT 'enabled' CHECK(status IN ('enabled','disabled'))", updated_at: 'TEXT', last_login_at: 'TEXT', revision: 'INTEGER NOT NULL DEFAULT 0', approval_status: "TEXT NOT NULL DEFAULT 'approved' CHECK(approval_status IN ('pending','approved','rejected'))", review_note: "TEXT NOT NULL DEFAULT ''", reviewed_at: 'TEXT', reviewed_by: 'INTEGER', invitation_id: 'INTEGER'})) {
   if (!columns.has(name)) db.exec(`ALTER TABLE users ADD COLUMN ${name} ${definition}`)
  }
  db.exec(`CREATE TABLE IF NOT EXISTS admin_events (
   id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL,
   actor_id INTEGER, actor_name TEXT NOT NULL, actor_login TEXT NOT NULL,
   action TEXT NOT NULL, target_id INTEGER, target TEXT NOT NULL, result TEXT NOT NULL
  ); CREATE INDEX IF NOT EXISTS admin_events_time ON admin_events(created_at);
  CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
  CREATE TABLE IF NOT EXISTS invitations (
   id INTEGER PRIMARY KEY AUTOINCREMENT, code_hash TEXT UNIQUE NOT NULL, hint TEXT NOT NULL,
   name TEXT NOT NULL, created_by INTEGER NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL,
   max_uses INTEGER NOT NULL, use_count INTEGER NOT NULL DEFAULT 0,
   enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1))
  );`)
 })()
}

export function createAuditWriter(db, now = Date.now) {
 const insert = db.prepare('INSERT INTO admin_events(created_at,actor_id,actor_name,actor_login,action,target_id,target,result) VALUES(?,?,?,?,?,?,?,?)')
 return (actor, action, target, result = 'success') => insert.run(new Date(now()).toISOString(), actor?.id ?? null, actor?.name || '未登录', actor?.phone || '', action, target?.id ?? null, String(target?.phone || target || '').slice(0, 100), result)
}

export function createAdminRouter({ db, currentUser, audit, visionStore, usageStore, now = Date.now }) {
 const router = express.Router()
 const requireAdmin = req => {
  const actor = currentUser(req)
  if (!actor) throw new AdminError('登录已失效，请重新登录', 401)
  if (actor.role !== 'admin') throw new AdminError('此账号没有管理员权限', 403)
  return actor
 }
 router.use('/admin', (req, res, next) => { req.adminActor = requireAdmin(req); next() })
 const find = id => {
  const row = db.prepare('SELECT * FROM users WHERE id=?').get(integer(id, 0))
  if (!row) throw new AdminError('账号不存在', 404)
  return row
 }
 const validate = body => {
  if (typeof body?.name !== 'string' || !body.name.trim() || body.name.trim().length > 24 || /[\u0000-\u001f\u007f]/.test(body.name)) throw new AdminError('请输入 1–24 个字的姓名')
  if (!['admin', 'user'].includes(body.role)) throw new AdminError('请选择有效的角色')
  if (!['enabled', 'disabled'].includes(body.status)) throw new AdminError('请选择有效的账号状态')
  return { name: body.name.trim(), role: body.role, status: body.status }
 }
 const password = body => {
  const value = body?.password
  if (typeof value !== 'string' || value.length < 8 || Buffer.byteLength(value, 'utf8') > 72) throw new AdminError('密码至少 8 位，最多 72 字节')
  if (value !== body.confirmPassword) throw new AdminError('两次输入的密码不一致')
  return value
 }
 router.get('/admin/accounts', (req, res) => {
  const clauses = [], args = []
  if (req.query.q) { clauses.push("(phone LIKE ? ESCAPE '\\' OR name LIKE ? ESCAPE '\\')"); args.push(searchValue(req.query.q), searchValue(req.query.q)) }
  for (const [key, values] of [['role', ['admin', 'user']], ['status', ['enabled', 'disabled']]]) if (values.includes(req.query[key])) { clauses.push(`${key}=?`); args.push(req.query[key]) }
  if (['approved', 'pending', 'rejected'].includes(req.query.approval)) { clauses.push('approval_status=?'); args.push(req.query.approval) }
  const where = clauses.length ? ' WHERE ' + clauses.join(' AND ') : ''
  const total = db.prepare(`SELECT COUNT(*) n FROM users${where}`).get(...args).n
  const pageSize = 20, pages = Math.max(1, Math.ceil(total / pageSize)), page = Math.min(integer(req.query.page), pages)
  const records = db.prepare(`SELECT * FROM users${where} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...args, pageSize, (page - 1) * pageSize).map(account)
  const summary = db.prepare("SELECT COUNT(*) total, COALESCE(SUM(status='enabled' AND approval_status='approved'),0) enabled, COALESCE(SUM(status='disabled'),0) disabled, COALESCE(SUM(role='admin'),0) admins, COALESCE(SUM(approval_status='pending'),0) pending FROM users").get()
  res.json({ records, total, pages, page, summary })
 })
 router.post('/admin/accounts', async (req, res) => {
  const draft = validate(req.body), login = typeof req.body.login === 'string' ? req.body.login.trim().toLowerCase() : ''
  if (!/^[a-z0-9][a-z0-9_.@+-]{2,63}$/.test(login)) throw new AdminError('账号需为 3–64 位字母、数字或 _ . @ + -')
  const hash = await bcrypt.hash(password(req.body), 10)
  const saved = db.transaction(() => {
   const actor = requireAdmin(req)
   if (db.prepare('SELECT id FROM users WHERE phone=?').get(login)) throw new AdminError('该登录账号已存在', 409)
   const at = new Date(now()).toISOString()
   const { lastInsertRowid } = db.prepare('INSERT INTO users(phone,name,role,status,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(login, draft.name, draft.role, draft.status, hash, at, at)
   const row = find(lastInsertRowid); audit(actor, 'account.create', row); return account(row)
  })()
  res.status(201).json({ account: saved })
 })
 router.patch('/admin/accounts/:id', (req, res) => {
  const draft = validate(req.body)
  const saved = db.transaction(() => {
   const actor = requireAdmin(req), row = find(req.params.id)
   if (row.approval_status !== 'approved') throw new AdminError('此账号尚未通过审核，请先处理注册申请')
   if (req.body.revision !== row.revision) throw new AdminError('账号信息已更新，请刷新后重试', 409)
   if (req.body.login !== undefined && req.body.login !== row.phone) throw new AdminError('登录账号不可修改')
   if (row.id === actor.id && (draft.role !== 'admin' || draft.status !== 'enabled')) throw new AdminError('不能停用自己或移除自己的管理员权限')
   if (row.role === 'admin' && row.status === 'enabled' && (draft.role !== 'admin' || draft.status !== 'enabled') && db.prepare("SELECT COUNT(*) n FROM users WHERE role='admin' AND status='enabled'").get().n <= 1) throw new AdminError('系统至少需要保留一位启用的管理员')
   db.prepare('UPDATE users SET name=?,role=?,status=?,updated_at=?,revision=revision+1 WHERE id=?').run(draft.name, draft.role, draft.status, new Date(now()).toISOString(), row.id)
   if (row.role !== draft.role || row.status !== draft.status) db.prepare('DELETE FROM sessions WHERE user_id=?').run(row.id)
   audit(actor, row.role !== draft.role ? 'account.role' : row.status !== draft.status ? (draft.status === 'enabled' ? 'account.enable' : 'account.disable') : 'account.edit', row)
   return account(find(row.id))
  })()
  res.json({ account: saved })
 })
 router.post('/admin/accounts/:id/password', async (req, res) => {
  const original = find(req.params.id)
  if (original.id === req.adminActor.id) throw new AdminError('请在系统设置中修改自己的密码')
  const hash = await bcrypt.hash(password(req.body), 10)
  db.transaction(() => {
   const actor = requireAdmin(req), row = find(original.id)
   if (row.revision !== original.revision || row.password_hash !== original.password_hash) throw new AdminError('账号信息已更新，请刷新后重试', 409)
   db.prepare('UPDATE users SET password_hash=?,updated_at=?,revision=revision+1 WHERE id=?').run(hash, new Date(now()).toISOString(), row.id)
   db.prepare('DELETE FROM sessions WHERE user_id=?').run(row.id)
   audit(actor, 'account.password', row)
  })()
  res.json({ ok: true })
 })
 router.post('/admin/accounts/:id/review', (req, res) => {
  const { decision, reason = '' } = req.body || {}
  if (!['approved', 'rejected'].includes(decision)) throw new AdminError('请选择审核结果')
  if (typeof reason !== 'string' || reason.length > 200 || /[\u0000-\u001f\u007f]/.test(reason) || (decision === 'rejected' && !reason.trim())) throw new AdminError('拒绝时请填写原因，最多 200 个字')
  const saved = db.transaction(() => {
   const actor = requireAdmin(req), row = find(req.params.id)
   if (row.approval_status !== 'pending' || row.role !== 'user') throw new AdminError('该申请已处理，请刷新列表', 409)
   db.prepare('UPDATE users SET approval_status=?,status=?,review_note=?,reviewed_at=?,reviewed_by=?,updated_at=?,revision=revision+1 WHERE id=?').run(decision, decision === 'approved' ? 'enabled' : 'disabled', reason.trim(), new Date(now()).toISOString(), actor.id, new Date(now()).toISOString(), row.id)
   db.prepare('DELETE FROM sessions WHERE user_id=?').run(row.id)
   audit(actor, decision === 'approved' ? 'account.approve' : 'account.reject', row)
   return account(find(row.id))
  })()
  res.json({ account: saved })
 })
 const invitation = row => ({ id: row.id, name: row.name, hint: row.hint, createdAt: row.created_at, expiresAt: row.expires_at, maxUses: row.max_uses, uses: row.use_count, enabled: !!row.enabled, state: !row.enabled ? 'disabled' : row.expires_at <= new Date(now()).toISOString() ? 'expired' : row.use_count >= row.max_uses ? 'exhausted' : 'active' })
 router.get('/admin/invitations', (req, res) => {
  const total = db.prepare('SELECT COUNT(*) n FROM invitations').get().n, pages = Math.max(1, Math.ceil(total / 20)), page = Math.min(integer(req.query.page), pages)
  res.json({ records: db.prepare('SELECT * FROM invitations ORDER BY id DESC LIMIT 20 OFFSET ?').all((page - 1) * 20).map(invitation), total, page, pages })
 })
 router.post('/admin/invitations', (req, res) => {
  const { name, maxUses, expiresInDays } = req.body || {}
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 40 || /[\u0000-\u001f\u007f]/.test(name)) throw new AdminError('请输入 1–40 个字的邀请码名称')
  if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 1000 || !Number.isInteger(expiresInDays) || expiresInDays < 1 || expiresInDays > 90) throw new AdminError('使用次数需为 1–1000，有效期需为 1–90 天')
  const code = crypto.randomBytes(12).toString('hex').toUpperCase(), at = new Date(now()).toISOString()
  const saved = db.transaction(() => {
   const { lastInsertRowid } = db.prepare('INSERT INTO invitations(code_hash,hint,name,created_by,created_at,expires_at,max_uses) VALUES(?,?,?,?,?,?,?)').run(invitationDigest(code), code.slice(-4), name.trim(), req.adminActor.id, at, new Date(now() + expiresInDays * 86400000).toISOString(), maxUses)
   audit(req.adminActor, 'invitation.create', name.trim())
   return invitation(db.prepare('SELECT * FROM invitations WHERE id=?').get(lastInsertRowid))
  })()
  res.status(201).json({ invitation: saved, code: code.match(/.{6}/g).join('-') })
 })
 router.patch('/admin/invitations/:id', (req, res) => {
  if (typeof req.body?.enabled !== 'boolean') throw new AdminError('请选择有效状态')
  const saved = db.transaction(() => {
   const row = db.prepare('SELECT * FROM invitations WHERE id=?').get(integer(req.params.id, 0))
   if (!row) throw new AdminError('邀请码不存在', 404)
   db.prepare('UPDATE invitations SET enabled=? WHERE id=?').run(req.body.enabled ? 1 : 0, row.id)
   audit(req.adminActor, req.body.enabled ? 'invitation.enable' : 'invitation.disable', row.name)
   return invitation({ ...row, enabled: req.body.enabled ? 1 : 0 })
  })()
  res.json({ invitation: saved })
 })
 const events = query => {
  const clauses = [], args = []
  if (query.q) { clauses.push("(actor_login LIKE ? ESCAPE '\\' OR actor_name LIKE ? ESCAPE '\\' OR target LIKE ? ESCAPE '\\')"); args.push(...Array(3).fill(searchValue(query.q))) }
  const where = clauses.length ? ' WHERE ' + clauses.join(' AND ') : ''
  const total = db.prepare(`SELECT COUNT(*) n FROM admin_events${where}`).get(...args).n
  const pages = Math.max(1, Math.ceil(total / 20)), page = Math.min(integer(query.page), pages)
  return { records: db.prepare(`SELECT * FROM admin_events${where} ORDER BY id DESC LIMIT 20 OFFSET ?`).all(...args, (page - 1) * 20), total, page, pages }
 }
 router.get('/admin/events', (req, res) => res.json(events(req.query)))
 router.get('/admin/overview', (req, res) => {
  const users = db.prepare("SELECT COUNT(*) total, COALESCE(SUM(status='enabled' AND approval_status='approved'),0) enabled, COALESCE(SUM(role='admin'),0) admins, COALESCE(SUM(approval_status='pending'),0) pending FROM users").get()
  res.json({ users, usage: usageStore.list({ period: 'today' }).summary, providers: visionStore.list(), events: events({}).records.slice(0, 5), time: new Date(now()).toISOString() })
 })
 router.use((error, req, res, next) => {
  if (res.headersSent) return next(error)
  res.status(error instanceof AdminError ? error.status : 500).json({ error: error instanceof AdminError ? error.message : '账号服务暂不可用，请稍后重试' })
 })
 return router
}
