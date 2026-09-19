import test from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import express from 'express'
import bcrypt from 'bcryptjs'
import { createAccountSettingsRouter } from './account-settings.js'

async function fixture() {
 const db = new Database(':memory:')
 db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY,name TEXT,phone TEXT,role TEXT,password_hash TEXT,created_at TEXT); CREATE TABLE sessions(token TEXT PRIMARY KEY,user_id INTEGER,expires_at INTEGER);')
 const old = 'fixture-old-password', next = 'fixture-new-password'
 const hash = await bcrypt.hash(old, 4)
 for (const id of [1, 2]) {
  db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?)').run(id, id === 1 ? '管理员' : '普通用户', id === 1 ? 'admin' : 'demo', id === 1 ? 'admin' : 'user', hash, '2026-09-17')
  db.prepare('INSERT INTO sessions VALUES(?,?,?)').run('session-' + id, id, Date.now() + 86400000)
 }
 db.prepare('INSERT INTO sessions VALUES(?,?,?)').run('another-admin-device', 1, Date.now() + 86400000)
 const currentUser = req => db.prepare('SELECT u.id,u.name,u.phone,u.role FROM sessions s JOIN users u ON s.user_id=u.id WHERE token=? AND expires_at>?').get(req.headers['x-test-session'] || '', Date.now())
 const app = express(); app.use(express.json({ limit:'16kb' }))
 app.use('/api', createAccountSettingsRouter({db,currentUser,clearSessionCookie:res=>res.setHeader('Set-Cookie','zx_local_session=; HttpOnly; Max-Age=0; Path=/'),version:'0.1.0'}))
 const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r))
 const request = (url, method='GET', body, session='session-1') => fetch(`http://127.0.0.1:${server.address().port}/api${url}`, { method, headers: { 'Content-Type':'application/json', ...(session ? { 'x-test-session':session } : {}) }, ...(body ? {body:JSON.stringify(body)} : {}) })
 return {db,request,old,next,close:async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));db.close()}}
}

test('设置需登录及管理员权限，名称只修改当前账号，不返回哈希', async()=>{
 const f=await fixture()
 try {
  assert.equal((await f.request('/admin/settings','GET',null,null)).status,401)
  assert.equal((await f.request('/admin/settings','GET',null,'session-2')).status,403)
  const result=await(await f.request('/admin/settings')).json()
  assert.equal(result.software.version,'0.1.0');assert.equal(result.user.phone,'admin')
  assert.equal('password_hash' in result.user,false)
  assert.equal((await f.request('/account/profile','PATCH',{name:'  管理员新名称  ',id:2,role:'user',phone:'changed'})).status,200)
  assert.equal((await(await f.request('/admin/settings')).json()).user.name,'管理员新名称')
  assert.deepEqual(f.db.prepare('SELECT name,phone,role FROM users WHERE id=1').get(),{name:'管理员新名称',phone:'admin',role:'admin'})
  assert.equal(f.db.prepare('SELECT name FROM users WHERE id=2').get().name,'普通用户')
  for(const name of ['', ' ', 'x'.repeat(25), '\nhello'])assert.equal((await f.request('/account/profile','PATCH',{name:name==='\nhello'?'he\nllo':name})).status,400)
 }finally{await f.close()}
})

test('密码校验和修改生效，旧密码失效，所有旧会话撤销，其他账号保留',async()=>{
 const f=await fixture()
 const body=(currentPassword=f.old,newPassword=f.next,confirmPassword=f.next)=>({currentPassword,newPassword,confirmPassword})
 try{
  assert.equal((await f.request('/account/password','POST',body(),null)).status,401)
  for(const value of [body('wrong-password'),body(f.old,'short','short'),body(f.old,f.next,'different'),body(f.old,f.old,f.old),body(f.old,'密'.repeat(25),'密'.repeat(25))])assert.equal((await f.request('/account/password','POST',value)).status,400)
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM sessions WHERE user_id=1').get().n,2)
  const response=await f.request('/account/password','POST',body())
  assert.equal(response.status,200);assert.match(response.headers.get('set-cookie'),/Max-Age=0/)
  assert.deepEqual(await response.json(),{ok:true,requiresLogin:true})
  const hash=f.db.prepare('SELECT password_hash FROM users WHERE id=1').get().password_hash
  assert.equal(await bcrypt.compare(f.next,hash),true);assert.equal(await bcrypt.compare(f.old,hash),false)
  assert.equal((await f.request('/admin/settings')).status,401)
  assert.equal((await f.request('/admin/settings','GET',null,'another-admin-device')).status,401)
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM sessions WHERE user_id=2').get().n,1)
 }finally{await f.close()}
})

test('多次错误尝试受限，并发修改只能成功一次',async()=>{
 const f=await fixture()
 try{
  for(let i=0;i<5;i++)assert.equal((await f.request('/account/password','POST',{currentPassword:'wrong-password',newPassword:f.next,confirmPassword:f.next},'session-2')).status,400)
  const limited=await f.request('/account/password','POST',{currentPassword:f.old,newPassword:f.next,confirmPassword:f.next},'session-2')
  assert.equal(limited.status,429);assert.ok(Number(limited.headers.get('retry-after'))>0)
  const body={currentPassword:f.old,newPassword:f.next,confirmPassword:f.next}
  const results=await Promise.all([f.request('/account/password','POST',body),f.request('/account/password','POST',{...body,newPassword:f.next+'2',confirmPassword:f.next+'2'})])
  assert.equal(results.filter(r=>r.status===200).length,1)
  assert.equal(results.filter(r=>[401,409].includes(r.status)).length,1)
 }finally{await f.close()}
})
