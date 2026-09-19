import test from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import bcrypt from 'bcryptjs'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createApplication } from './app.js'

async function fixture() {
 const db = new Database(':memory:'), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'layout-admin-test-'))
 let clock = Date.now()
 const { app } = createApplication({ db, masterPath: path.join(dir, 'key'), version: '0.1.0', now: () => clock })
 const password = 'fixture-password-123', hash = await bcrypt.hash(password, 4)
 for (const [id, role] of [[1, 'admin'], [2, 'user']]) {
  db.prepare('INSERT INTO users(id,phone,name,role,password_hash) VALUES(?,?,?,?,?)').run(id, role, role, role, hash)
  db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(String(id).repeat(64), id, clock + 86400000)
 }
 const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve))
 const request = (url, method = 'GET', body, cookie = '1'.repeat(64), headers = {}) => fetch(`http://127.0.0.1:${server.address().port}/api${url}`, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: `zx_local_session=${cookie}` } : {}), ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) })
 const create = (login, extra = {}) => request('/admin/accounts', 'POST', { login, name: '测试成员', role: 'user', status: 'enabled', password, confirmPassword: password, ...extra })
 return { db, request, create, password, advance: ms => { clock += ms }, close: async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); db.close(); fs.rmSync(dir, { recursive: true, force: true }) } }
}

test('真实账号列表、分页搜索、权限隔离、响应不泄露密码', async () => {
 const f = await fixture()
 try {
  for (const route of ['/admin/access', '/admin/accounts', '/admin/events', '/admin/overview', '/admin/invitations']) {
   assert.equal((await f.request(route, 'GET', null, null)).status, 401)
   assert.equal((await f.request(route, 'GET', null, '2'.repeat(64))).status, 403)
  }
  const list = await (await f.request('/admin/accounts')).json()
  assert.equal(list.total, 2); assert.equal(list.summary.admins, 1); assert.equal(list.summary.pending, 0)
  assert.equal((await (await f.request('/admin/accounts?role=user')).json()).total, 1)
  assert.equal((await (await f.request('/admin/accounts?q=%25')).json()).total, 0)
  assert.equal(JSON.stringify(list).includes('password_hash'), false)
  assert.equal((await f.create('user-three')).status, 201)
  const login = await f.request('/login', 'POST', { login: 'user-three', password: f.password }, null)
  assert.equal(login.status, 200); assert.match(login.headers.get('set-cookie'), /HttpOnly/)
  assert.equal((await f.create('user-three')).status, 409)
  assert.equal((await f.create('bad', { role: 'owner' })).status, 400)
  assert.equal((await f.create('short', { password: 'x', confirmPassword: 'x' })).status, 400)
  assert.equal((await f.request('/admin/accounts', 'POST', {}, '2'.repeat(64))).status, 403)
 } finally { await f.close() }
})

test('停用、角色变更、密码重置撤销真实会话，保护自己，防止旧资料覆盖', async () => {
 const f = await fixture()
 try {
  let list = await (await f.request('/admin/accounts')).json(), user = list.records.find(r => r.id === 2), admin = list.records.find(r => r.id === 1)
  assert.equal((await f.request('/admin/accounts/1', 'PATCH', { ...admin, status: 'disabled' })).status, 400)
  assert.equal((await f.request('/admin/accounts/1', 'PATCH', { ...admin, role: 'user' })).status, 400)
  assert.equal((await f.request('/admin/accounts/2', 'PATCH', { ...user, status: 'disabled' })).status, 200)
  assert.equal((await (await f.request('/me', 'GET', null, '2'.repeat(64))).json()).user, null)
  assert.equal((await f.request('/login', 'POST', { login: 'user', password: f.password }, null)).status, 403)
  assert.equal((await f.request('/admin/accounts/2', 'PATCH', { ...user, name: '旧数据' })).status, 409)
  user = (await (await f.request('/admin/accounts')).json()).records.find(r => r.id === 2)
  assert.equal((await f.request('/admin/accounts/2', 'PATCH', { ...user, status: 'enabled', role: 'admin' })).status, 200)
  const login = await f.request('/login', 'POST', { login: 'user', password: f.password, audience: 'admin' }, null)
  const token = login.headers.get('set-cookie').split(';')[0].split('=')[1]
  assert.equal(login.status, 200)
  assert.equal((await f.request('/admin/access', 'GET', null, token)).status, 200)
  assert.equal((await f.request('/admin/accounts/2/password', 'POST', { password: 'reset-password-123', confirmPassword: 'reset-password-123' })).status, 200)
  assert.equal((await f.request('/admin/access', 'GET', null, token)).status, 401)
  assert.equal((await f.request('/login', 'POST', { login: 'user', password: f.password }, null)).status, 401)
  assert.equal((await f.request('/login', 'POST', { login: 'user', password: 'reset-password-123' }, null)).status, 200)
  const events = await (await f.request('/admin/events')).json()
  assert.ok(events.records.some(r => r.action === 'account.password'))
  assert.equal(JSON.stringify(events).includes('reset-password-123'), false)
 } finally { await f.close() }
})

test('邀请码注册不发放会话，管理员审核通过才能登录，拒绝原因可见', async () => {
 const f = await fixture()
 try {
  const register = (login, inviteCode) => f.request('/register', 'POST', { login, name: '邀请成员', password: f.password, inviteCode }, null)
  assert.equal((await register('new-one', '')).status, 400)
  const invite = await (await f.request('/admin/invitations', 'POST', { name: '第一批', maxUses: 2, expiresInDays: 7 })).json()
  assert.ok(invite.code)
  assert.equal(JSON.stringify(await (await f.request('/admin/invitations')).json()).includes(invite.code), false)
  const registration = await register('new-one', invite.code)
  assert.equal(registration.status, 201); assert.equal(registration.headers.get('set-cookie'), null)
  assert.equal((await registration.json()).pendingApproval, true)
  assert.equal((await f.request('/login', 'POST', { login: 'new-one', password: f.password }, null)).status, 403)
  const pending = await (await f.request('/admin/accounts?approval=pending')).json(), row = pending.records[0]
  assert.equal(pending.total, 1); assert.equal(row.role, 'user')
  assert.equal((await f.request(`/admin/accounts/${row.id}`, 'PATCH', { ...row, status: 'enabled' })).status, 400)
  assert.equal((await f.request(`/admin/accounts/${row.id}/review`, 'POST', { decision: 'approved' }, '2'.repeat(64))).status, 403)
  assert.equal((await f.request(`/admin/accounts/${row.id}/review`, 'POST', { decision: 'approved' })).status, 200)
  assert.equal((await f.request(`/admin/accounts/${row.id}/review`, 'POST', { decision: 'approved' })).status, 409)
  assert.equal((await f.request('/login', 'POST', { login: 'new-one', password: f.password }, null)).status, 200)
  assert.equal((await register('new-two', invite.code)).status, 201)
  const rejected = (await (await f.request('/admin/accounts?approval=pending')).json()).records[0]
  assert.equal((await f.request(`/admin/accounts/${rejected.id}/review`, 'POST', { decision: 'rejected' })).status, 400)
  assert.equal((await f.request(`/admin/accounts/${rejected.id}/review`, 'POST', { decision: 'rejected', reason: '请核对姓名' })).status, 200)
  const denied = await f.request('/login', 'POST', { login: 'new-two', password: f.password }, null)
  assert.equal(denied.status, 403); assert.match((await denied.json()).error, /请核对姓名/)
  assert.equal((await register('new-three', invite.code)).status, 400)
 } finally { await f.close() }
})

test('邀请码并发不能超额使用，停用及到期不可用', async () => {
 const f = await fixture()
 try {
  const issue = async () => (await (await f.request('/admin/invitations', 'POST', { name: '单人邀请', maxUses: 1, expiresInDays: 1 })).json())
  const register = (login, inviteCode) => f.request('/register', 'POST', { login, name: '测试', password: f.password, inviteCode }, null)
  const invite = await issue()
  const results = await Promise.all([register('parallel-one', invite.code), register('parallel-two', invite.code)])
  assert.deepEqual(results.map(r => r.status).sort(), [201, 400])
  assert.equal(f.db.prepare('SELECT use_count FROM invitations WHERE id=?').get(invite.invitation.id).use_count, 1)
  const disabled = await issue()
  assert.equal((await f.request(`/admin/invitations/${disabled.invitation.id}`, 'PATCH', { enabled: false })).status, 200)
  assert.equal((await register('disabled-invite', disabled.code)).status, 400)
  const expired = await issue(); f.advance(2 * 86400000)
  assert.equal((await register('expired-invite', expired.code)).status, 400)
 } finally { await f.close() }
})

test('登录限流、跨站写请求拒绝，旧数据库兼容初始化', async () => {
 const f = await fixture()
 try {
  for (let i = 0; i < 8; i++) assert.equal((await f.request('/login', 'POST', { login: 'nonexistent', password: 'invalid-pass' }, null)).status, 401)
  assert.equal((await f.request('/login', 'POST', { login: 'nonexistent', password: 'invalid-pass' }, null)).status, 429)
  f.advance(16 * 60000)
  assert.equal((await f.request('/login', 'POST', { login: 'nonexistent', password: 'invalid-pass' }, null)).status, 401)
  assert.equal((await f.request('/admin/accounts', 'POST', {}, '1'.repeat(64), { Origin: 'https://untrusted.example' })).status, 403)
  const user = f.db.prepare('SELECT status,approval_status FROM users WHERE id=1').get()
  assert.deepEqual(user, { status: 'enabled', approval_status: 'approved' })
 } finally { await f.close() }
})

test('迁移旧账户保留密码和会话，不将既有用户误设为待审核', async () => {
 const db = new Database(':memory:'), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'layout-migration-'))
 try {
  db.exec("CREATE TABLE users(id INTEGER PRIMARY KEY,phone TEXT UNIQUE,name TEXT,role TEXT,password_hash TEXT,created_at TEXT); CREATE TABLE sessions(token TEXT PRIMARY KEY,user_id INTEGER,expires_at INTEGER);")
  db.prepare('INSERT INTO users VALUES(1,?,?,?,?,?)').run('existing','现有账户','admin','existing-password-hash','2026-09-17 10:00:00')
  db.prepare('INSERT INTO sessions VALUES(?,?,?)').run('existing-session',1,Date.now()+60000)
  createApplication({db,masterPath:path.join(dir,'key'),version:'0.1.0'})
  const row = db.prepare('SELECT password_hash,role,status,approval_status FROM users WHERE id=1').get()
  assert.deepEqual(row,{password_hash:'existing-password-hash',role:'admin',status:'enabled',approval_status:'approved'})
  assert.equal(db.prepare('SELECT COUNT(*) n FROM sessions').get().n,1)
 } finally { db.close(); fs.rmSync(dir,{recursive:true,force:true}) }
})
