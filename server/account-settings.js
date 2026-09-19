import express from 'express'
import bcrypt from 'bcryptjs'

class AccountError extends Error {
 constructor(message, status = 400) { super(message); this.status = status }
}
const publicUser = user => ({ id: user.id, name: user.name, phone: user.phone, role: user.role, createdAt: user.created_at })

export function createAccountSettingsRouter({ db, currentUser, clearSessionCookie, version, now = Date.now }) {
 const router = express.Router(), attempts = new Map()
 router.use((req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next() })
 const auth = (admin = false) => (req, res, next) => {
  const user = currentUser(req)
  if (!user) return res.status(401).json({ error: '请重新登录' })
  if (admin && user.role !== 'admin') return res.status(403).json({ error: '此账号没有管理员权限' })
  req.accountUser = user; next()
 }
 router.get('/admin/settings', auth(true), (req, res) => {
  const user = db.prepare('SELECT id,name,phone,role,created_at FROM users WHERE id=?').get(req.accountUser.id)
  res.json({ user: publicUser(user), software: { name: '家居风水系统', version, language: '简体中文' } })
 })
 router.patch('/account/profile', auth(), (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : ''
  if (!name || name.length > 24 || /[\u0000-\u001f\u007f]/.test(name)) throw new AccountError('请输入 1–24 个字的显示名称')
  // Login identifier, role and target user cannot be changed by this endpoint.
  db.prepare('UPDATE users SET name=? WHERE id=?').run(name, req.accountUser.id)
  res.json({ user: publicUser(db.prepare('SELECT id,name,phone,role,created_at FROM users WHERE id=?').get(req.accountUser.id)) })
 })
 router.post('/account/password', auth(), async (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body || {}
  if (typeof currentPassword !== 'string' || !currentPassword || Buffer.byteLength(currentPassword, 'utf8') > 72) throw new AccountError('请输入正确的当前密码')
  if (typeof newPassword !== 'string' || newPassword.length < 8 || Buffer.byteLength(newPassword, 'utf8') > 72) throw new AccountError('新密码至少 8 位，长度不能超过 72 字节')
  if (newPassword !== confirmPassword) throw new AccountError('两次输入的新密码不一致')
  if (newPassword === currentPassword) throw new AccountError('新密码不能与当前密码相同')
  const id = req.accountUser.id, at = now()
  for (const [key, value] of attempts) if (value.until <= at) attempts.delete(key)
  const budget = attempts.get(id) || { count: 0, until: at + 15 * 60000 }
  if (budget.count >= 5) { res.setHeader('Retry-After', Math.ceil((budget.until - at) / 1000)); throw new AccountError('尝试次数过多，请稍后重试', 429) }
  attempts.set(id, { ...budget, count: budget.count + 1 })
  const user = db.prepare('SELECT id,password_hash FROM users WHERE id=?').get(id)
  if (!user || !await bcrypt.compare(currentPassword, user.password_hash)) throw new AccountError('当前密码不正确')
  const hash = await bcrypt.hash(newPassword, 10)
  db.transaction(() => {
   // Recheck after hashing: another password change/logout may have revoked this session.
   if (currentUser(req)?.id !== id) throw new AccountError('登录状态已失效，请重新登录', 401)
   const update = db.prepare('UPDATE users SET password_hash=? WHERE id=? AND password_hash=?').run(hash, id, user.password_hash)
   if (update.changes !== 1) throw new AccountError('密码已变更，请重新登录', 409)
   db.prepare('DELETE FROM sessions WHERE user_id=?').run(id)
  })()
  attempts.delete(id)
  clearSessionCookie(res)
  res.json({ ok: true, requiresLogin: true })
 })
 router.use((error, req, res, next) => {
  if (res.headersSent) return next(error)
  if (error.type === 'entity.parse.failed') return res.status(400).json({ error: '请求内容格式不正确' })
  if (error.type === 'entity.too.large') return res.status(413).json({ error: '请求内容过大' })
  res.status(error instanceof AccountError ? error.status : 500).json({ error: error instanceof AccountError ? error.message : '账户设置暂不可用，请稍后重试' })
 })
 return router
}
