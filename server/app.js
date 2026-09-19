import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import express from 'express'
import { createVisionStore, createVisionRouter } from './vision.js'
import { createUsageStore } from './usage.js'
import { createAccountSettingsRouter } from './account-settings.js'
import { initializeAccounts, createAuditWriter, createAdminRouter, invitationDigest } from './admin.js'

export function createApplication({ db, masterPath, version, secureCookie = false, cookieName = 'zx_local_session', origins = ['http://127.0.0.1:5178', 'http://localhost:5178'], now = Date.now }) {
 initializeAccounts(db)
 const app = express(), audit = createAuditWriter(db, now), attempts = new Map()
 const ttl = 14 * 86400000
 const publicUser = row => ({ id: row.id, name: row.name, phone: row.phone, role: row.role })
 const tokenOf = req => {
  const value = (req.headers.cookie || '').split(';').map(p => p.trim()).find(p => p.startsWith(cookieName + '='))?.slice(cookieName.length + 1)
  return value && /^[a-f0-9]{64}$/.test(value) ? value : null
 }
 const currentUser = req => {
  const token = tokenOf(req)
  if (!token) return null
  return db.prepare("SELECT u.id,u.phone,u.name,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>? AND u.status='enabled' AND u.approval_status='approved'").get(token, now()) || null
 }
 const setCookie = (res, token, age) => res.setHeader('Set-Cookie', `${cookieName}=${token}; HttpOnly; Path=/; Max-Age=${age}; SameSite=Lax${secureCookie ? '; Secure' : ''}`)
 const clearSessionCookie = res => setCookie(res, '', 0)
 const createSession = (res, id) => {
  const token = crypto.randomBytes(32).toString('hex')
  db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(now())
  db.prepare('INSERT INTO sessions(token,user_id,expires_at) VALUES(?,?,?)').run(token, id, now() + ttl)
  db.prepare('UPDATE users SET last_login_at=? WHERE id=?').run(new Date(now()).toISOString(), id)
  setCookie(res, token, Math.floor(ttl / 1000))
 }
 const limit = req => {
  for (const [key, value] of attempts) if (value.until <= now()) attempts.delete(key)
  const login = String(req.body?.login || req.body?.phone || '').trim().toLowerCase().slice(0, 64)
  const keys = [`ip:${req.ip}`, `account:${login}`]
  for (const key of keys) {
   const value = attempts.get(key)
   if (value && value.count >= (key.startsWith('ip:') ? 40 : 8)) return false
  }
  for (const key of keys) { const value = attempts.get(key) || { count: 0, until: now() + 15 * 60000 }; value.count++; attempts.set(key, value) }
  return true
 }
 app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin && !origins.includes(req.headers.origin)) return res.status(403).json({ error: '不允许的请求来源' })
  next()
 })
 const visionStore = createVisionStore(db, masterPath), usageStore = createUsageStore(db)
 // Record only action names and identifiers. Request bodies can contain passwords or keys.
 app.use('/api', (req, res, next) => {
  const match = req.path.match(/^\/admin\/vision\/(gemini|qwen)(\/test)?$/)
  const action = match && req.method !== 'GET' ? (match[2] ? 'model.test' : req.method === 'DELETE' ? 'model.remove' : 'model.save') : req.path === '/account/password' && req.method === 'POST' ? 'password.change' : req.path === '/account/profile' && req.method === 'PATCH' ? 'profile.edit' : null
  const actor = action && currentUser(req)
  if (actor) res.on('finish', () => audit(actor, action, match?.[1] || actor, res.statusCode < 400 ? 'success' : 'failed'))
  next()
 })
 app.use('/api', createVisionRouter({ store: visionStore, currentUser, usageStore }))
 app.use(express.json({ limit: '16kb' }))
 app.use('/api', createAccountSettingsRouter({ db, currentUser, clearSessionCookie, version }))
 app.use('/api', createAdminRouter({ db, currentUser, audit, visionStore, usageStore, now }))
 app.post('/api/register', async (req, res) => {
  if (!limit(req)) return res.status(429).json({ error: '操作过于频繁，请 15 分钟后重试' })
  const name = String(req.body?.name || '').trim(), phone = String(req.body?.login || req.body?.phone || '').trim().toLowerCase(), password = req.body?.password
  if (!name || name.length > 24 || /[\u0000-\u001f\u007f]/.test(name)) return res.status(400).json({ error: '请输入 1–24 个字的显示名称' })
  if (req.body?.role && req.body.role !== 'user') return res.status(403).json({ error: '管理员账号需由现有管理员创建' })
  if (!/^[a-z0-9][a-z0-9_.@+-]{2,63}$/.test(phone)) return res.status(400).json({ error: '请输入有效的 3–64 位登录账号' })
  if (typeof password !== 'string' || password.length < 8 || Buffer.byteLength(password, 'utf8') > 72) return res.status(400).json({ error: '密码至少 8 位，最多 72 字节' })
  const findInvitation = () => db.prepare('SELECT * FROM invitations WHERE code_hash=? AND enabled=1 AND expires_at>? AND use_count<max_uses').get(invitationDigest(req.body?.inviteCode), new Date(now()).toISOString())
  if (!findInvitation()) return res.status(400).json({ error: '邀请码无效、已到期或已用完，请联系管理员' })
  const hash = await bcrypt.hash(password, 10)
  if (db.prepare('SELECT id FROM users WHERE phone=?').get(phone)) return res.status(409).json({ error: '该账号已注册，请直接登录' })
  const user = db.transaction(() => {
   const invite = findInvitation()
   if (!invite) return null
   const info = db.prepare("INSERT INTO users(phone,name,password_hash,status,approval_status,invitation_id) VALUES(?,?,?,'disabled','pending',?)").run(phone, name, hash, invite.id)
   db.prepare('UPDATE invitations SET use_count=use_count+1 WHERE id=?').run(invite.id)
   const row = db.prepare('SELECT * FROM users WHERE id=?').get(info.lastInsertRowid)
   audit(row, 'account.register', row); return publicUser(row)
  })()
  if (!user) return res.status(400).json({ error: '邀请码已失效，请联系管理员' })
  res.status(201).json({ pendingApproval: true })
 })
 app.post('/api/login', async (req, res) => {
  if (!limit(req)) { res.setHeader('Retry-After', '900'); return res.status(429).json({ error: '尝试次数过多，请 15 分钟后重试' }) }
  const phone = String(req.body?.login || req.body?.phone || '').trim().toLowerCase(), password = req.body?.password
  if (typeof password !== 'string' || Buffer.byteLength(password, 'utf8') > 72) return res.status(401).json({ error: '账号或密码不正确' })
  const original = db.prepare('SELECT * FROM users WHERE phone=?').get(phone)
  if (!original || !(await bcrypt.compare(password, original.password_hash))) return res.status(401).json({ error: '账号或密码不正确' })
  // Re-read after hashing so a concurrent suspension, role change or reset cannot issue a stale session.
  const row = db.prepare('SELECT * FROM users WHERE id=?').get(original.id)
  if (!row || row.password_hash !== original.password_hash || row.revision !== original.revision) return res.status(401).json({ error: '账号信息已变更，请重新登录' })
  if (row.approval_status === 'pending') return res.status(403).json({ error: '注册申请正在审核，通过后即可登录' })
  if (row.approval_status === 'rejected') return res.status(403).json({ error: `注册申请未通过审核${row.review_note ? '：' + row.review_note : '，请联系管理员'}` })
  if (row.status !== 'enabled') return res.status(403).json({ error: '账号已停用，请联系管理员' })
  if (req.body?.audience === 'admin' && row.role !== 'admin') return res.status(403).json({ error: '此账号没有管理员权限' })
  db.transaction(() => { createSession(res, row.id); audit(row, 'account.login', row) })()
  attempts.delete(`account:${phone}`)
  res.json({ user: publicUser(row) })
 })
 app.post('/api/logout', (req, res) => {
  const actor = currentUser(req), token = tokenOf(req)
  if (token) db.prepare('DELETE FROM sessions WHERE token=?').run(token)
  if (actor) audit(actor, 'account.logout', actor)
  clearSessionCookie(res); res.json({ ok: true })
 })
 app.get('/api/me', (req, res) => res.json({ user: currentUser(req) }))
 app.get('/api/admin/access', (req, res) => res.json({ user: currentUser(req) }))
 app.use('/api', (req, res) => res.status(404).json({ error: '请求的服务不存在' }))
 app.use((error, req, res, next) => {
  if (res.headersSent) return next(error)
  const status = error.type === 'entity.parse.failed' ? 400 : error.type === 'entity.too.large' ? 413 : 500
  res.status(status).json({ error: status === 400 ? '请求格式不正确' : status === 413 ? '请求内容过大' : '服务暂不可用，请稍后重试' })
 })
 return { app, currentUser }
}
