import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { api, hashPassword } from './auth-core.mjs';
import { onRequest as middleware } from '../functions/_middleware.js';
const schema=(await readFile(new URL('../migrations/0001_accounts.sql',import.meta.url),'utf8'))+(await readFile(new URL('../migrations/0002_original_admin.sql',import.meta.url),'utf8'));
const auditSchema=await readFile(new URL('../migrations/0003_audit_result.sql',import.meta.url),'utf8');
const password='Test-only!472905';
async function setup(){
 const sql=new DatabaseSync(':memory:');sql.exec(schema+auditSchema);
 const db={async batch(statements){sql.exec('BEGIN');try{const out=[];for(const statement of statements)out.push(await statement.run());sql.exec('COMMIT');return out;}catch(error){sql.exec('ROLLBACK');throw error;}}};
 // D1 batches return SELECT rows as well as mutation metadata.
 db.prepare=query=>{const bound=(values=[])=>({async first(){return sql.prepare(query).get(...values)||null;},async all(){return {results:sql.prepare(query).all(...values)};},async run(){const stmt=sql.prepare(query);if(/^SELECT/i.test(query))return {results:stmt.all(...values),meta:{changes:0}};return {results:[],meta:{changes:Number(stmt.run(...values).changes)}};},bind(...v){return bound(v);}});return bound();};
 sql.prepare("INSERT INTO users(id,login,name,password_hash,role,status,approval,created_at) VALUES(?,?,?,?,?,'enabled','approved',?)").run('00000000-0000-4000-8000-000000000001','test-admin','测试管理员',await hashPassword(password),'admin',Date.now());
 async function request(path,method='GET',body,cookie='',origin='https://app.example'){
  const headers={Origin:origin};if(body!==undefined)headers['Content-Type']='application/json';if(cookie)headers.Cookie=cookie;
  const response=await api({request:new Request('https://app.example'+path,{method,headers,body:body!==undefined?JSON.stringify(body):undefined}),env:{DB:db,MODEL_ENCRYPTION_KEY:'ab'.repeat(32)}});
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
 const context=(path,cookie='')=>({request:new Request('https://app.example'+path,{headers:{Cookie:cookie}}),env:{DB:db,MODEL_ENCRYPTION_KEY:'ab'.repeat(32)},next:async()=>new Response('page')});
 assert.equal((await middleware(context('/'))).status,302);
 assert.match((await middleware(context('/admin/'))).headers.get('Location'),/login\?admin=1/);
 const logged=await middleware(context('/admin',admin.cookie));assert.equal(logged.status,200);assert.equal(logged.headers.get('Cache-Control'),'no-store');assert.equal(await logged.text(),'page');sql.close();
});

 test('original admin contracts, filtering, profile, review and session revocation',async()=>{
 const {sql,request,admin}=await setup(),call=(p,m='GET',b)=>request(p,m,b,admin.cookie);
 for(const path of ['/api/admin/access','/api/admin/overview','/api/admin/settings','/api/admin/accounts','/api/admin/invitations','/api/admin/events','/api/admin/vision','/api/admin/vision/usage'])assert.equal((await call(path)).status,200,path);
 assert.equal((await call('/api/admin/accounts','POST',{login:'original-user',name:'原版用户',password,confirmPassword:password,role:'user',status:'enabled'})).status,201);
 const list=await call('/api/admin/accounts?q=original&role=user');assert.equal(list.data.records.length,1);const target=list.data.records[0];assert.equal(target.login,'original-user');assert.equal(list.data.summary.total,2);
 const logged=await request('/api/login','POST',{login:target.login,password});
 assert.equal((await call('/api/admin/accounts/'+target.id,'PATCH',{name:'新姓名',role:'user',status:'disabled'})).status,200);
 assert.equal((await request('/api/me','GET',undefined,logged.cookie)).data.user,null);
 assert.equal((await call('/api/admin/accounts/'+admin.data.user.id,'PATCH',{name:'管理员',role:'user',status:'disabled'})).status,409);
 assert.equal((await call('/api/admin/accounts/'+target.id+'/password','POST',{password:'Changed-only!839',confirmPassword:'Changed-only!839'})).status,200);
 const invite=await call('/api/admin/invitations','POST',{name:'原版邀请',maxUses:3,expiresInDays:30});assert.equal(invite.status,201);assert.equal(invite.data.invitation.maxUses,3);assert.ok(invite.data.invitation.expiresAt>Date.now()+29*86400000);
 await request('/api/register','POST',{login:'pending-user',name:'待审核',password,inviteCode:invite.data.code});
 const pending=(await call('/api/admin/accounts?approval=pending')).data.records[0];
 assert.equal((await call('/api/admin/accounts/'+pending.id+'/review','POST',{decision:'rejected',reason:''})).status,400);
 assert.equal((await call('/api/admin/accounts/'+pending.id+'/review','POST',{decision:'approved',reason:'审核通过'})).status,200);
 assert.equal((await request('/api/login','POST',{login:'pending-user',password})).status,200);
 assert.equal((await call('/api/account/profile','PATCH',{name:'已更新管理员'})).data.user.name,'已更新管理员');
 assert.equal((await call('/api/admin/settings')).data.user.name,'已更新管理员');
 assert.ok((await call('/api/admin/events?q=original')).data.records.length>0);
 assert.equal((await call('/api/account/password','POST',{currentPassword:password,newPassword:'Updated-only!383',confirmPassword:'Updated-only!383'})).status,200);
 assert.equal((await call('/api/admin/access')).status,401);sql.close();
 });
 test('cloud model keys are encrypted and never returned; usage starts empty',async()=>{
 const {sql,request,admin}=await setup(),call=(p,m='GET',b)=>request(p,m,b,admin.cookie);
 const key='synthetic-provider-key-only-19483';
 assert.equal((await call('/api/admin/vision/qwen','POST',{apiKey:key})).status,200);
 const stored=sql.prepare('SELECT encrypted_key FROM vision_settings').get();assert.ok(!stored.encrypted_key.includes(key));
 const result=await call('/api/admin/vision');assert.ok(!JSON.stringify(result.data).includes(key));assert.equal(result.data.providers.find(p=>p.id==='qwen').checkState,'untested');
 const usage=await call('/api/admin/vision/usage');assert.equal(usage.data.summary.calls,0);assert.equal(usage.data.records.length,0);
 assert.equal((await call('/api/admin/vision/qwen','DELETE')).status,200);assert.equal((await call('/api/admin/vision/qwen/test','POST')).status,400);sql.close();
 });
test('model test records real normalized usage and redacts upstream errors',async()=>{
 const {sql,request,admin}=await setup(),call=(p,m='GET',b)=>request(p,m,b,admin.cookie);
 await call('/api/admin/vision/qwen','POST',{apiKey:'synthetic-provider-key-only-19483'});
 const originalFetch=globalThis.fetch;
 try{
  globalThis.fetch=async(url,options)=>{assert.equal(url,'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions');assert.equal(options.redirect,'manual');return new Response(JSON.stringify({choices:[{message:{content:'{"ok":true}'}}],usage:{prompt_tokens:100,completion_tokens:10}}),{status:200});};
  const tested=await call('/api/admin/vision/qwen/test','POST');assert.equal(tested.status,200);assert.equal(tested.data.providers.find(p=>p.id==='qwen').checkState,'ok');
  const usage=await call('/api/admin/vision/usage');assert.equal(usage.data.summary.calls,1);assert.equal(usage.data.summary.successful,1);assert.equal(usage.data.records[0].usage.input,100);assert.ok(usage.data.records[0].cnyAmount>0);
  globalThis.fetch=async()=>new Response(JSON.stringify({error:'synthetic-provider-key-only-19483'}),{status:401});
  const failed=await call('/api/admin/vision/qwen/test','POST');assert.equal(failed.status,502);assert.ok(!JSON.stringify(failed.data).includes('synthetic-provider-key-only-19483'));
  assert.equal((await call('/api/admin/vision/usage?status=failed')).data.summary.calls,1);assert.equal((await call('/api/admin/events')).data.records[0].result,'failed');
 }finally{globalThis.fetch=originalFetch;sql.close();}
});

test('Workers request compatibility and distinct, sanitized failure reporting',async()=>{
 const {callVision}=await import('./vision-provider.mjs');
 const {upstreamFetch}=await import('./upstream-fetch.mjs');
 for(const [error,pattern,status] of [[new DOMException('secret','TimeoutError'),/响应超时/,504],[new TypeError('fetch failed secret'),/无法连接/,502],[new TypeError('Invalid redirect value secret'),/配置异常/,502]]){
  await assert.rejects(()=>callVision('gemini','synthetic-key',{test:true},async()=>{throw error;}),e=>pattern.test(e.message)&&e.status===status&&!e.message.includes('secret'));
 }
 let calls=0;
 await assert.rejects(()=>callVision('gemini','synthetic-key',{test:true},async(url,options)=>{calls++;assert.equal(options.redirect,'manual');return new Response('',{status:302,headers:{Location:'https://untrusted.example'}});}),/已阻止转发密钥/);assert.equal(calls,1);
 await assert.rejects(()=>upstreamFetch('https://api.frankfurter.dev/v2/rate/USD/CNY',{},async(url,options)=>{assert.equal(options.redirect,'manual');return new Response('',{status:307});}),/redirect/);
 const result=await callVision('gemini','synthetic-key',{test:true},async(url,options)=>{assert.equal(options.redirect,'manual');assert.ok(url.endsWith('gemini-3.8-flash:generateContent'));return Response.json({candidates:[{content:{parts:[{text:'{"ok":true}'}]}}]});});assert.equal(result.ok,true);
});
