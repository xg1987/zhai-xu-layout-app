import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { api, hashPassword } from './auth-core.mjs';
import { onRequest as middleware } from '../functions/_middleware.js';
const schema=await readFile(new URL('../migrations/0001_accounts.sql',import.meta.url),'utf8');
const password='Test-only!472905';
async function setup(){
 const sql=new DatabaseSync(':memory:');sql.exec(schema);
 const db={async batch(statements){sql.exec('BEGIN');try{const out=[];for(const statement of statements)out.push(await statement.run());sql.exec('COMMIT');return out;}catch(error){sql.exec('ROLLBACK');throw error;}}};
 // D1 batches return SELECT rows as well as mutation metadata.
 db.prepare=query=>{const bound=(values=[])=>({async first(){return sql.prepare(query).get(...values)||null;},async all(){return {results:sql.prepare(query).all(...values)};},async run(){const stmt=sql.prepare(query);if(/^SELECT/i.test(query))return {results:stmt.all(...values),meta:{changes:0}};return {results:[],meta:{changes:Number(stmt.run(...values).changes)}};},bind(...v){return bound(v);}});return bound();};
 sql.prepare("INSERT INTO users(id,login,name,password_hash,role,status,approval,created_at) VALUES(?,?,?,?,?,'enabled','approved',?)").run('00000000-0000-4000-8000-000000000001','test-admin','测试管理员',await hashPassword(password),'admin',Date.now());
 async function request(path,method='GET',body,cookie='',origin='https://app.example'){
  const headers={Origin:origin};if(body!==undefined)headers['Content-Type']='application/json';if(cookie)headers.Cookie=cookie;
  const response=await api({request:new Request('https://app.example'+path,{method,headers,body:body!==undefined?JSON.stringify(body):undefined}),env:{DB:db}});
  return {status:response.status,data:await response.json(),headers:response.headers,cookie:response.headers.get('Set-Cookie')?.split(';')[0]||''};
 }
 const admin=await request('/api/login','POST',{login:'test-admin',password,audience:'admin'});assert.equal(admin.status,200);
 return {db,sql,request,admin};
}
test('anonymous access, wrong credentials, origin protection, secure sessions',async()=>{
 const {sql,request,admin}=await setup();
 assert.equal((await request('/api/admin/users')).status,401);
 assert.equal((await request('/api/login','POST',{login:'test-admin',password:'wrong-password'})).status,401);
 assert.equal((await request('/api/logout','POST',{},admin.cookie,'https://attacker.example')).status,403);
 assert.match(admin.headers.get('Set-Cookie'),/HttpOnly; Secure; SameSite=Lax/);
 assert.equal((await request('/api/me','GET',undefined,admin.cookie)).data.user.role,'admin');
 const session=sql.prepare('SELECT token_hash FROM sessions').get();assert.notEqual(session.token_hash,admin.cookie.split('=')[1]);
 assert.equal((await request('/api/logout','POST',{},admin.cookie)).status,200);
 assert.equal((await request('/api/me','GET',undefined,admin.cookie)).data.user,null);sql.close();
});
test('invitation registration is pending, consumes once, and cannot request admin role',async()=>{
 const {sql,request,admin}=await setup();
 const created=await request('/api/admin/invitations','POST',{name:'测试邀请',maxUses:1,days:7},admin.cookie);assert.equal(created.status,201);
 const body={login:'test-user',name:'测试用户',password,inviteCode:created.data.code};
 assert.equal((await request('/api/register','POST',{...body,role:'admin'})).status,403);
 assert.equal((await request('/api/register','POST',{...body,inviteCode:'invalid'})).status,400);
 assert.equal((await request('/api/register','POST',body)).status,201);
 assert.equal((await request('/api/login','POST',{login:'test-user',password})).status,403);
 assert.equal((await request('/api/register','POST',{...body,login:'another-user'})).status,400);
 assert.equal(sql.prepare('SELECT use_count FROM invitations').get().use_count,1);
 const user=sql.prepare("SELECT * FROM users WHERE login='test-user'").get();
 assert.equal(user.role,'user');assert.equal(user.approval,'pending');
 assert.equal((await request('/api/admin/users/'+user.id,'PATCH',{action:'approve'},admin.cookie)).status,200);
 const login=await request('/api/login','POST',{login:'test-user',password});assert.equal(login.status,200);
 assert.equal((await request('/api/admin/users','GET',undefined,login.cookie)).status,403);
 assert.equal((await request('/api/login','POST',{login:'test-user',password,audience:'admin'})).status,403);
 assert.equal((await request('/api/admin/users/'+user.id,'PATCH',{action:'disable'},admin.cookie)).status,200);
 assert.equal((await request('/api/me','GET',undefined,login.cookie)).data.user,null);
 assert.equal((await request('/api/admin/users/'+user.id,'PATCH',{action:'enable'},admin.cookie)).status,200);
 assert.equal((await request('/api/me','GET',undefined,login.cookie)).data.user,null);sql.close();
});
test('duplicate registration rolls back invitation usage; disabled invites reject registration',async()=>{
 const {sql,request,admin}=await setup();
 const {data}=await request('/api/admin/invitations','POST',{name:'限额测试',maxUses:2},admin.cookie);
 const body={login:'duplicate-user',name:'测试用户',password,inviteCode:data.code};
 assert.equal((await request('/api/register','POST',body)).status,201);
 assert.equal((await request('/api/register','POST',body)).status,409);
 assert.equal(sql.prepare('SELECT use_count FROM invitations').get().use_count,1);
 const invite=sql.prepare('SELECT id FROM invitations').get();
 assert.equal((await request('/api/admin/invitations/'+invite.id,'PATCH',{enabled:false},admin.cookie)).status,200);
 assert.equal((await request('/api/register','POST',{...body,login:'new-user'})).status,400);sql.close();
});
test('account management lists real users, hides hashes and protects administrators',async()=>{
 const {sql,request,admin}=await setup();
 assert.equal((await request('/api/admin/users','POST',{login:'created-user',name:'新用户',password},admin.cookie)).status,201);
 const list=await request('/api/admin/users','GET',undefined,admin.cookie);assert.equal(list.data.total,2);assert.ok(list.data.users.every(u=>!('password_hash' in u)));
 const overview=await request('/api/admin/overview','GET',undefined,admin.cookie);assert.equal(overview.data.enabled,2);
 const self=list.data.users.find(u=>u.role==='admin');assert.equal((await request('/api/admin/users/'+self.id,'PATCH',{action:'disable'},admin.cookie)).status,409);
 assert.equal((await request('/api/admin/users','POST',{login:'unsafe-role',name:'用户',password,role:'owner'},admin.cookie)).status,400);
 assert.equal((await request('/api/admin/events','GET',undefined,admin.cookie)).data.events.length,1);sql.close();
});
test('persistent rate limit stops repeated password guessing',async()=>{
 const {sql,request}=await setup();let response;for(let i=0;i<11;i++)response=await request('/api/login','POST',{login:'unknown-user',password});assert.equal(response.status,429);sql.close();
});
test('workspace and admin HTML require a valid session and are not cached',async()=>{
 const {db,sql,admin}=await setup();
 const context=(path,cookie='')=>({request:new Request('https://app.example'+path,{headers:{Cookie:cookie}}),env:{DB:db},next:async()=>new Response('page')});
 assert.equal((await middleware(context('/'))).status,302);
 assert.match((await middleware(context('/admin/'))).headers.get('Location'),/login\?admin=1/);
 const logged=await middleware(context('/admin',admin.cookie));assert.equal(logged.status,200);assert.equal(logged.headers.get('Cache-Control'),'no-store');assert.equal(await logged.text(),'page');sql.close();
});
