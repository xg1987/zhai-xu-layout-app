import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import Database from 'better-sqlite3'
import bcrypt from 'bcryptjs'
import { currentUser, ensureSchema, handleAccounts, verifyPassword } from './accounts.js'

// A synchronous SQLite transaction models D1 batch atomicity; no ports,
// production databases, external services, or live credentials are used.
function d1(database) {
 const wrap = (sql, args = []) => ({
  bind(...values) { return wrap(sql, values) },
  async first() { return database.prepare(sql).get(...args) || null },
  async all() { return { results: database.prepare(sql).all(...args), success: true } },
  async run() { const result = database.prepare(sql).run(...args); return { results: [], success: true, meta: { changes: result.changes, last_row_id: Number(result.lastInsertRowid) } } },
  execute() {
   const statement = database.prepare(sql)
   if (statement.reader) return { results: statement.all(...args), success: true }
   const result = statement.run(...args)
   return { results: [], success: true, meta: { changes: result.changes, last_row_id: Number(result.lastInsertRowid) } }
  },
 })
 return { prepare: sql => wrap(sql), async batch(statements) { return database.transaction(() => statements.map(statement => statement.execute()))() } }
}
async function fixture() {
 const database = new Database(':memory:')
 database.exec(fs.readFileSync(new URL('../migrations/0001_auth.sql', import.meta.url), 'utf8'))
 const env = { DB: d1(database) }
 await ensureSchema(env)
 const password = 'isolated-test-password', hash = await bcrypt.hash(password, 4)
 for (const [id, role] of [[1, 'admin'], [2, 'user']]) {
  database.prepare('INSERT INTO users(id,phone,name,role,password_hash) VALUES(?,?,?,?,?)').run(id, role, role, role, hash)
  database.prepare('INSERT INTO sessions VALUES(?,?,?)').run(String(id).repeat(64), id, Date.now() + 86400000)
 }
 function request(path, method = 'GET', body, token = '1'.repeat(64), headers = {}) {
  return new Request(`https://fixture.example/api${path}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Cookie: `zx_session=${token}` } : {}), ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) })
 }
 const call = (path, method, body, token, headers) => handleAccounts({ request: request(path, method, body, token, headers), env, path: path.split('?')[0], version: 'fixture-version' })
 const create = (login, extra = {}) => call('/admin/accounts', 'POST', { login, name: '测试成员', role: 'user', status: 'enabled', password, confirmPassword: password, ...extra })
 return { database, env, password, call, request, create, close: () => database.close() }
}
test('additive migration preserves old PBKDF2 passwords, sessions, roles and approvals', async () => {
 const database = new Database(':memory:')
 try {
  database.exec(fs.readFileSync(new URL('../migrations/0001_auth.sql', import.meta.url), 'utf8'))
  const salt = crypto.getRandomValues(new Uint8Array(16)), password = 'legacy-isolated-password'
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const derived = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 }, key, 256))
  const hash = `pbkdf2$100000$${Buffer.from(salt).toString('base64')}$${Buffer.from(derived).toString('base64')}`
  database.prepare('INSERT INTO users(id,phone,name,password_hash) VALUES(1,?,?,?)').run('old-login', '既有用户', hash)
  database.prepare('INSERT INTO sessions VALUES(?,?,?)').run('a'.repeat(64), 1, Date.now() + 86400000)
  const env = { DB: d1(database) }
  await ensureSchema(env)
  assert.deepEqual(database.prepare('SELECT role,status,approval_status,password_hash FROM users').get(), { role: 'user', status: 'enabled', approval_status: 'approved', password_hash: hash })
  database.prepare("UPDATE users SET role='admin'").run()
  await ensureSchema(env)
  assert.equal(database.prepare('SELECT role FROM users').get().role, 'admin')
  assert.equal(database.prepare('SELECT COUNT(*) n FROM sessions').get().n, 1)
  assert.equal(await verifyPassword(password, hash), true)
  assert.equal(await verifyPassword('invalid', hash), false)
  const response = await handleAccounts({ request: new Request('https://fixture.example/api/login', { method: 'POST', body: JSON.stringify({ login: 'old-login', password, audience: 'admin' }) }), env, version: 'fixture' })
  assert.equal(response.status, 200)
  assert.match(response.headers.get('Set-Cookie'), /HttpOnly.*Secure/)
  assert.equal(database.prepare('SELECT password_hash FROM users').get().password_hash, hash)
 } finally { database.close() }
})
test('list, profile, settings and administrator access follow the Node contract and redact hashes', async () => {
 const f = await fixture()
 try {
  for (const route of ['/admin/access', '/admin/accounts', '/admin/events', '/admin/overview', '/admin/invitations', '/admin/settings']) {
   assert.equal((await f.call(route, 'GET', null, null)).status, 401)
   assert.equal((await f.call(route, 'GET', null, '2'.repeat(64))).status, 403)
  }
  const list = await (await f.call('/admin/accounts')).json()
  assert.equal(list.total, 2); assert.equal(list.summary.admins, 1)
  assert.equal(JSON.stringify(list).includes('password_hash'), false)
  assert.equal((await (await f.call('/admin/accounts?role=user')).json()).total, 1)
  // Explicit path excludes query, as in a Pages router.
  const filtered = await handleAccounts({ request: f.request('/admin/accounts?q=%25'), env: f.env, path: '/admin/accounts' })
  assert.equal((await filtered.json()).total, 0)
  const settings = await (await f.call('/admin/settings')).json()
  assert.equal(settings.software.version, 'fixture-version')
  assert.equal((await f.call('/account/profile', 'PATCH', { name: '新名称', role: 'user', id: 2, phone: 'changed' })).status, 200)
  assert.deepEqual(f.database.prepare('SELECT name,phone,role FROM users WHERE id=1').get(), { name: '新名称', phone: 'admin', role: 'admin' })
  assert.equal(f.database.prepare('SELECT name FROM users WHERE id=2').get().name, 'user')
  assert.equal((await currentUser(f.request('/me'), f.env)).name, '新名称')
  assert.equal((await f.call('/account/profile', 'PATCH', { name: 'he\nllo' })).status, 400)
 } finally { f.close() }
})
test('admin account edits use CAS, revoke sessions, reject self-demotion and reset passwords', async () => {
 const f = await fixture()
 try {
  assert.equal((await f.create('third')).status, 201)
  assert.equal((await f.create('third')).status, 409)
  assert.equal((await f.create('missing-confirm', { confirmPassword: undefined })).status, 400)
  let list = await (await f.call('/admin/accounts')).json(), row = list.records.find(r => r.id === 2), admin = list.records.find(r => r.id === 1)
  assert.equal((await f.call('/admin/accounts/1', 'PATCH', { ...admin, status: 'disabled' })).status, 400)
  assert.equal((await f.call('/admin/accounts/2', 'PATCH', { ...row, status: 'disabled' })).status, 200)
  assert.equal(await currentUser(f.request('/me', 'GET', null, '2'.repeat(64)), f.env), null)
  assert.equal((await f.call('/admin/accounts/2', 'PATCH', { ...row, name: '旧信息' })).status, 409)
  row = (await (await f.call('/admin/accounts')).json()).records.find(r => r.id === 2)
  assert.equal((await f.call('/admin/accounts/2', 'PATCH', { ...row, status: 'enabled' })).status, 200)
  const nextPassword = 'reset-isolated-password'
  assert.equal((await f.call('/admin/accounts/2/password', 'POST', { password: nextPassword, confirmPassword: nextPassword })).status, 200)
  assert.equal((await f.call('/login', 'POST', { login: 'user', password: f.password }, null)).status, 401)
  const login = await f.call('/login', 'POST', { login: 'user', password: nextPassword }, null)
  assert.equal(login.status, 200)
  const token = login.headers.get('Set-Cookie').match(/^zx_session=([^;]+)/)[1]
  assert.equal((await f.call('/admin/access', 'GET', null, token)).status, 403)
  assert.equal((await f.call('/logout', 'POST', null, token)).status, 200)
  assert.equal(await currentUser(f.request('/me', 'GET', null, token), f.env), null)
  assert.ok((await (await f.call('/admin/events')).json()).records.some(event => event.action === 'account.password'))
 } finally { f.close() }
})
test('invitation consumption is atomic, registration stays pending, approval and rejection are enforced', async () => {
 const f = await fixture()
 try {
  const invitation = await (await f.call('/admin/invitations', 'POST', { name: '单次邀请', maxUses: 1, expiresInDays: 1 })).json()
  assert.ok(invitation.code)
  const register = login => f.call('/register', 'POST', { login, name: '注册成员', password: f.password, inviteCode: invitation.code }, null)
  const results = await Promise.all([register('first-new'), register('second-new')])
  assert.deepEqual(results.map(response => response.status).sort(), [201, 400])
  const created = results.find(response => response.status === 201)
  assert.equal(created.headers.get('Set-Cookie'), null)
  assert.deepEqual(await created.json(), { pendingApproval: true })
  assert.equal(f.database.prepare('SELECT use_count FROM invitations').get().use_count, 1)
  const pending = (await (await f.call('/admin/accounts')).json()).records.find(row => row.approval === 'pending')
  assert.equal((await f.call('/login', 'POST', { login: pending.login, password: f.password }, null)).status, 403)
  assert.equal((await f.call(`/admin/accounts/${pending.id}/review`, 'POST', { decision: 'approved' })).status, 200)
  assert.equal((await f.call(`/admin/accounts/${pending.id}/review`, 'POST', { decision: 'approved' })).status, 409)
  assert.equal((await f.call('/login', 'POST', { login: pending.login, password: f.password }, null)).status, 200)
  const another = await (await f.call('/admin/invitations', 'POST', { name: '拒绝邀请', maxUses: 1, expiresInDays: 1 })).json()
  assert.equal((await f.call('/register', 'POST', { login: 'rejected-new', name: '注册成员', password: f.password, inviteCode: another.code }, null)).status, 201)
  const rejected = f.database.prepare("SELECT id FROM users WHERE phone='rejected-new'").get()
  assert.equal((await f.call(`/admin/accounts/${rejected.id}/review`, 'POST', { decision: 'rejected', reason: '核对姓名' })).status, 200)
  const denied = await f.call('/login', 'POST', { login: 'rejected-new', password: f.password }, null)
  assert.match((await denied.json()).error, /核对姓名/)
  assert.equal(JSON.stringify(await (await f.call('/admin/invitations')).json()).includes(invitation.code), false)
 } finally { f.close() }
})
test('password changes compare-and-swap, revoke all own sessions, and throttle incorrect attempts', async () => {
 const f = await fixture()
 try {
  f.database.prepare('INSERT INTO sessions VALUES(?,?,?)').run('a'.repeat(64), 1, Date.now() + 86400000)
  const body = { currentPassword: f.password, newPassword: 'next-isolated-password', confirmPassword: 'next-isolated-password' }
  assert.equal((await f.call('/account/password', 'POST', { ...body, confirmPassword: undefined })).status, 400)
  for (let index = 0; index < 5; index++) assert.equal((await f.call('/account/password', 'POST', { ...body, currentPassword: 'wrong-password' }, '2'.repeat(64))).status, 400)
  assert.equal((await f.call('/account/password', 'POST', body, '2'.repeat(64))).status, 429)
  const results = await Promise.all([f.call('/account/password', 'POST', body), f.call('/account/password', 'POST', { ...body, newPassword: body.newPassword + 'x', confirmPassword: body.newPassword + 'x' })])
  assert.equal(results.filter(response => response.status === 200).length, 1)
  assert.ok(results.some(response => [401, 409].includes(response.status)))
  assert.equal(f.database.prepare('SELECT COUNT(*) n FROM sessions WHERE user_id=1').get().n, 0)
  assert.equal(f.database.prepare('SELECT COUNT(*) n FROM sessions WHERE user_id=2').get().n, 1)
 } finally { f.close() }
})
test('persistent login rate limiting and malformed/oversize input do not leak internals', async () => {
 const f = await fixture()
 try {
  for (let index = 0; index < 8; index++) assert.equal((await f.call('/login', 'POST', { login: 'missing', password: f.password }, null)).status, 401)
  const limited = await f.call('/login', 'POST', { login: 'missing', password: f.password }, null)
  assert.equal(limited.status, 429); assert.ok(Number(limited.headers.get('Retry-After')) > 0)
  const malformed = await handleAccounts({ request: new Request('https://fixture.example/api/login', { method: 'POST', body: '{' }), env: f.env })
  assert.equal(malformed.status, 400)
  const large = await handleAccounts({ request: new Request('https://fixture.example/api/login', { method: 'POST', body: 'a'.repeat(17000) }), env: f.env })
  assert.equal(large.status, 413)
  assert.equal(await handleAccounts({ request: f.request('/vision/status'), env: f.env }), null)
 } finally { f.close() }
})
