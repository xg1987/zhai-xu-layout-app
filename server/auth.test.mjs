import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { api, hashPassword } from './auth-core.mjs';
import { onRequest as middleware } from '../functions/_middleware.js';
const schema=(await readFile(new URL('../migrations/0001_accounts.sql',import.meta.url),'utf8'))+(await readFile(new URL('../migrations/0002_original_admin.sql',import.meta.url),'utf8'));
const auditSchema=await readFile(new URL('../migrations/0003_audit_result.sql',import.meta.url),'utf8');
const enabledSchema=await readFile(new URL('../migrations/0004_model_enabled.sql',import.meta.url),'utf8');
const planSchema=await readFile(new URL('../migrations/0005_plan_analysis.sql',import.meta.url),'utf8');
const planTitleSchema=await readFile(new URL('../migrations/0009_plan_titles.sql',import.meta.url),'utf8');
const password='Test-only!472905';
async function setup(){
 const sql=new DatabaseSync(':memory:');sql.exec(schema+auditSchema+enabledSchema+planSchema+planTitleSchema);
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
 assert.equal((await middleware(context('/live'))).status,302);
 assert.equal((await middleware(context('/settings'))).headers.get('Location'),'https://app.example/login');
 assert.equal((await middleware(context('/admin/'))).headers.get('Location'),'https://app.example/login');
 const settings=await middleware(context('/settings',admin.cookie));assert.equal(settings.status,200);assert.equal(settings.headers.get('Cache-Control'),'no-store');
 const live=await middleware(context('/live',admin.cookie));assert.equal(live.status,200);assert.equal(live.headers.get('Cache-Control'),'no-store');
 const logged=await middleware(context('/admin',admin.cookie));assert.equal(logged.status,200);assert.equal(logged.headers.get('Cache-Control'),'no-store');assert.equal(await logged.text(),'page');sql.close();
});
test('ordinary users can open personal settings without admin access',async()=>{
 const {db,sql,request,admin}=await setup();
 const created=await request('/api/admin/accounts','POST',{login:'settings-user',name:'普通用户',password,confirmPassword:password,role:'user'},admin.cookie);
 assert.equal(created.status,201);
 const login=await request('/api/login','POST',{login:'settings-user',password});assert.equal(login.status,200);
 const settings=await request('/api/account/settings','GET',undefined,login.cookie);
 assert.equal(settings.status,200);assert.equal(settings.data.user.name,'普通用户');assert.equal(settings.data.user.role,'user');
 assert.equal((await request('/api/admin/settings','GET',undefined,login.cookie)).status,403);
 const context={request:new Request('https://app.example/settings',{headers:{Cookie:login.cookie}}),env:{DB:db},next:async()=>new Response('settings page')};
 assert.equal((await middleware(context)).status,200);
 sql.close();
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
 const result=await call('/api/admin/vision');assert.deepEqual(result.data.providers.map(p=>[p.id,p.role,p.priority]),[['qwen','primary','主模型'],['gemini','fallback','备用模型']]);assert.ok(!JSON.stringify(result.data).includes(key));assert.equal(result.data.providers.find(p=>p.id==='qwen').checkState,'untested');
 const usage=await call('/api/admin/vision/usage');assert.equal(usage.data.summary.calls,0);assert.equal(usage.data.records.length,0);
 assert.equal((await call('/api/admin/vision/qwen','DELETE')).status,200);assert.equal((await call('/api/admin/vision/qwen/test','POST')).status,400);sql.close();
 });
test('model test records real normalized usage and redacts upstream errors',async()=>{
 const {sql,request,admin}=await setup(),call=(p,m='GET',b)=>request(p,m,b,admin.cookie);
 await call('/api/admin/vision/qwen','POST',{apiKey:'synthetic-provider-key-only-19483'});
 const originalFetch=globalThis.fetch;
 try{
  globalThis.fetch=async(url,options)=>{assert.equal(url,'https://ws-ve2w77z439rxpw30.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions');assert.equal(options.redirect,'manual');assert.equal(JSON.parse(options.body).model,'qwen3.8-max');return new Response(JSON.stringify({choices:[{message:{content:'{"ok":true}'}}],usage:{prompt_tokens:100,completion_tokens:10}}),{status:200});};
  const tested=await call('/api/admin/vision/qwen/test','POST');assert.equal(tested.status,200);assert.equal(tested.data.providers.find(p=>p.id==='qwen').checkState,'ok');
  const usage=await call('/api/admin/vision/usage');assert.equal(usage.data.summary.calls,1);assert.equal(usage.data.summary.successful,1);assert.equal(usage.data.records[0].usage.input,100);assert.equal(usage.data.records[0].model,'qwen3.8-max');assert.equal(usage.data.records[0].cnyAmount,0.00156);
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

test('model toggles persist, preserve keys, block disabled calls and expose shared prices',async()=>{
 const {sql,request,admin}=await setup(),call=(p,m='GET',b)=>request(p,m,b,admin.cookie);
 assert.equal((await call('/api/admin/vision/qwen','PATCH',{enabled:true})).status,400);
 await call('/api/admin/vision/qwen','POST',{apiKey:'synthetic-toggle-key-123456'});
 const before=sql.prepare("SELECT encrypted_key FROM vision_settings WHERE provider='qwen'").get().encrypted_key;
 assert.equal((await call('/api/admin/vision/qwen','PATCH',{enabled:'false'})).status,400);
 await call('/api/admin/vision/qwen','PATCH',{enabled:false});
 let p=(await call('/api/admin/vision')).data.providers[0];assert.equal(p.enabled,false);assert.equal(p.price.input,12);assert.equal(p.price.output,36);
 assert.equal((await call('/api/admin/vision/qwen/test','POST')).status,409);
 assert.equal((await call('/api/admin/vision/usage')).data.summary.calls,0);
 await call('/api/admin/vision/qwen','POST',{apiKey:'synthetic-toggle-key-123456'});
 assert.equal((await call('/api/admin/vision')).data.providers[0].enabled,false);
 await call('/api/admin/vision/qwen','PATCH',{enabled:true});assert.equal((await call('/api/admin/vision')).data.providers[0].enabled,true);
 assert.ok(before);assert.equal((await request('/api/admin/vision/qwen','PATCH',{enabled:false})).status,401);sql.close();
});

test('real analysis flow: Qwen first, fallback, metering, saved confirmation, ownership and duplicate protection',async()=>{
 const {sql,request,admin}=await setup(),call=(p,m='GET',b)=>request(p,m,b,admin.cookie),originalFetch=globalThis.fetch;
 const image='data:image/png;base64,iVBORw0KGgo=',id=crypto.randomUUID(),outline=[[100,100],[900,100],[900,900],[100,900]];
 try{
  for(const id of ['qwen','gemini'])await call('/api/admin/vision/'+id,'POST',{apiKey:'synthetic-plan-key-123456'});
  let calls=[];globalThis.fetch=async(url,options)=>{if(url.includes('frankfurter'))return Response.json({base:'USD',quote:'CNY',date:new Date().toISOString().slice(0,10),rate:7});calls.push(url);if(url.includes('aliyuncs'))return Response.json({error:'Unavailable'},{status:503});return Response.json({candidates:[{content:{parts:[{text:JSON.stringify({isFloorPlan:true,northAngleDeg:0,outline,rooms:['客厅'],notes:[]})}]}}],usageMetadata:{promptTokenCount:100,candidatesTokenCount:50}});};
  const recognized=await call('/api/plans/'+id,'POST',{image,width:800,height:800});assert.equal(recognized.status,200);assert.equal(recognized.data.plan.status,'recognized');assert.equal(calls.length,2);assert.ok(calls[0].includes('aliyuncs'));assert.equal(recognized.data.plan.recognition.provider,'Gemini 3.8 Flash');
  const repeat=await call('/api/plans/'+id,'POST',{image,width:800,height:800});assert.equal(repeat.status,200);assert.equal(calls.length,2);
  assert.equal((await call('/api/plans/'+id+'/confirm','POST',{outline,northAngleDeg:null})).status,400);
  assert.equal((await call('/api/plans/'+id+'/confirm','POST',{outline:[[0,0],[900,900],[0,900],[900,0]],northAngleDeg:0})).status,400);
  const completed=await call('/api/plans/'+id+'/confirm','POST',{outline,northAngleDeg:0});assert.equal(completed.status,200);assert.equal(completed.data.plan.status,'complete');assert.equal(completed.data.plan.result.sectors.length,8);assert.ok(completed.data.plan.image.startsWith('data:image/'));
  assert.equal((await call('/api/plans/'+id)).data.plan.result.version,1);assert.equal((await call('/api/plans')).data.plans.length,1);assert.equal((await call('/api/plans')).data.plans[0].image,undefined);
  assert.equal((await call('/api/plans/'+id,'PATCH',{title:'南山新家'})).data.plan.title,'南山新家');
  assert.equal((await call('/api/plans')).data.plans[0].title,'南山新家');
  assert.equal((await call('/api/plans/'+id,'PATCH',{title:'  '})).status,400);
  const usage=(await call('/api/admin/vision/usage')).data;assert.equal(usage.summary.calls,2);assert.equal(usage.summary.successful,1);assert.equal(usage.records.filter(r=>r.operation==='recognize').length,2);assert.ok(usage.records.some(r=>r.attempt===2));
  await call('/api/admin/users','POST',{login:'plan-other',name:'另一用户',password,role:'user'});const other=await request('/api/login','POST',{login:'plan-other',password});assert.equal(other.status,200);
  assert.equal((await request('/api/plans/'+id,'GET',undefined,other.cookie)).status,404);assert.equal((await request('/api/plans/'+id,'PATCH',{title:'别人的家'},other.cookie)).status,404);assert.equal((await request('/api/plans/'+id+'/confirm','POST',{outline,northAngleDeg:0},other.cookie)).status,404);assert.equal((await request('/api/plans','GET',undefined,other.cookie)).data.plans.length,0);
  assert.equal((await request('/api/plans/'+id,'POST',{image,width:800,height:800},other.cookie)).status,409);assert.equal(calls.length,2);
 }finally{globalThis.fetch=originalFetch;sql.close();}
});
test('disabled models, failure retries, non-plan images and invalid request handling',async()=>{
 const {sql,request,admin}=await setup(),call=(p,m='GET',b)=>request(p,m,b,admin.cookie),originalFetch=globalThis.fetch,id=crypto.randomUUID(),body={image:'data:image/png;base64,iVBORw0KGgo=',width:800,height:800};let calls=0;
 try{
  assert.equal((await call('/api/plans/'+id,'POST',body)).status,503);
  await call('/api/admin/vision/qwen','POST',{apiKey:'synthetic-plan-key-123456'});await call('/api/admin/vision/qwen','PATCH',{enabled:false});assert.equal((await call('/api/plans/'+id,'POST',body)).status,503);
  await call('/api/admin/vision/qwen','PATCH',{enabled:true});globalThis.fetch=async()=>{calls++;return new Response('',{status:503});};
  assert.equal((await call('/api/plans/'+id,'POST',{...body,image:'invalid'})).status,400);assert.equal(calls,0);
  assert.equal((await call('/api/plans/'+id,'POST',body)).status,502);assert.equal((await call('/api/plans/'+id)).data.plan.status,'failed');
  globalThis.fetch=async()=>{calls++;return Response.json({choices:[{message:{content:JSON.stringify({isFloorPlan:false,northAngleDeg:null,outline:[],rooms:[],notes:['不是户型图']})}}],usage:{prompt_tokens:10,completion_tokens:20}});};
  assert.equal((await call('/api/plans/'+id,'POST',body)).data.plan.status,'not_plan');assert.equal((await call('/api/plans/'+id+'/confirm','POST',{})).status,409);assert.equal(calls,2);
  sql.prepare("UPDATE plans SET status='processing',updated_at=? WHERE id=?").run(new Date().toISOString(),id);assert.equal((await call('/api/plans/'+id,'POST',body)).status,409);assert.equal(calls,2);
 }finally{globalThis.fetch=originalFetch;sql.close();}
});
test('geometry preserves aspect ratio, rejects intersecting edges, rotates directions',async()=>{
 const {analyzePlan,validateOutline}=await import('./plan-geometry.mjs');
 const outline=[[0,0],[1000,0],[1000,1000],[0,1000]],a=analyzePlan({outline,northAngleDeg:0,width:1000,height:500}),b=analyzePlan({outline,northAngleDeg:90,width:1000,height:500});
 assert.deepEqual(a.center,[500,500]);assert.ok(a.sectors[2].percent>a.sectors[0].percent);assert.equal(a.sectors[2].percent,b.sectors[0].percent);assert.ok(Math.abs(a.sectors.reduce((n,s)=>n+s.percent,0)-100)<.5);
 assert.throws(()=>validateOutline([[0,0],[1000,0],[500,0],[1000,1000],[0,1000]]));assert.throws(()=>analyzePlan({outline,northAngleDeg:360,width:1000,height:500}));
});
