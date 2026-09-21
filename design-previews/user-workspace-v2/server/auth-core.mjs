import { planRoute } from './plan-cloud.mjs';
import { originalAdmin } from './original-admin.mjs';
const enc = new TextEncoder();
export const COOKIE = '__Host-zx_workspace';
const TTL = 7 * 86400000;
export const json = (data, status=200, extra={}) => new Response(JSON.stringify(data), {status, headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra}});
class ApiError extends Error { constructor(message,status=400){super(message);this.status=status;} }
const fail = (message,status=400) => {throw new ApiError(message,status);};
const hex = bytes => Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
const unhex = text => Uint8Array.from(text.match(/../g)||[],b=>parseInt(b,16));
export const digest = async text => hex(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(text))));
export async function hashPassword(password){
 const salt=crypto.getRandomValues(new Uint8Array(16));
 const key=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']);
 const value=await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations:100000,hash:'SHA-256'},key,256);
 return `pbkdf2$100000$${hex(salt)}$${hex(new Uint8Array(value))}`;
}
async function verifyPassword(password,stored){
 const [type,rounds,salt,expected]=String(stored).split('$');
 if(type!=='pbkdf2'||rounds!=='100000'||! /^[a-f0-9]{32}$/.test(salt)||! /^[a-f0-9]{64}$/.test(expected))return false;
 const key=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']);
 const actual=hex(new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',salt:unhex(salt),iterations:100000,hash:'SHA-256'},key,256)));
 let diff=0;for(let i=0;i<actual.length;i++)diff|=actual.charCodeAt(i)^expected.charCodeAt(i);return diff===0;
}
const cookie=(token,age)=>`${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
const rawToken=request=>request.headers.get('Cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='))?.slice(COOKIE.length+1)||'';
const publicUser=u=>({id:u.id,phone:u.login,invitationId:u.invitation_id,reviewNote:u.review_note||'',login:u.login,name:u.name,role:u.role,status:u.status,approval:u.approval,createdAt:u.created_at,lastLoginAt:u.last_login_at});
export async function currentUser(request,db){
 const token=rawToken(request);if(!/^[a-f0-9]{64}$/.test(token))return null;
 return db.prepare("SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.status='enabled' AND u.approval='approved'").bind(await digest(token),Date.now()).first();
}
async function bodyOf(request){
 if(!request.headers.get('Content-Type')?.startsWith('application/json'))fail('请使用 JSON 请求',415);
 if(Number(request.headers.get('Content-Length'))>16384)fail('请求内容过大',413);
 const text=await request.text();if(enc.encode(text).length>16384)fail('请求内容过大',413);
 try{const data=JSON.parse(text);if(!data||typeof data!=='object'||Array.isArray(data))throw 0;return data;}catch{fail('请求格式不正确');}
}
function fields(body){
 const login=String(body.login||'').trim().toLowerCase(),name=String(body.name||'').trim(),password=body.password;
 if(!/^[a-z0-9][a-z0-9_.@+-]{2,63}$/.test(login))fail('账号需要 3–64 位字母、数字或常用账号符号');
 if(!name||name.length>24||/[\x00-\x1f\x7f]/.test(name))fail('显示名称需要 1–24 个字');
 if(typeof password!=='string'||password.length<8||enc.encode(password).length>72)fail('密码至少 8 位，最多 72 字节');
 return {login,name,password};
}
async function limit(db,key,max){
 const at=Date.now(),until=at+15*60000;
 const row=await db.prepare('INSERT INTO auth_limits(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires_at<=? THEN 1 ELSE count+1 END,expires_at=CASE WHEN expires_at<=? THEN ? ELSE expires_at END RETURNING count').bind(await digest(key),until,at,at,until).first();
 if(row.count>max)fail('尝试次数过多，请 15 分钟后重试',429);
}
const event=(db,user,action,target,result='success')=>db.prepare('INSERT INTO audit_events(actor_id,action,target,created_at,result) VALUES(?,?,?,?,?)').bind(user.id,action,target,Date.now(),result);
const inviteDigest=code=>digest(String(code||'').trim().toUpperCase().replace(/-/g,''));

export async function api({request,env}){
 try{
  if(!env.DB)fail('账号服务暂不可用',503);
  const db=env.DB,url=new URL(request.url),path=url.pathname,method=request.method;
  if(!['GET','HEAD'].includes(method)){
   const origin=request.headers.get('Origin');
   if((origin&&origin!==url.origin)||request.headers.get('Sec-Fetch-Site')==='cross-site')fail('不允许的请求来源',403);
  }
  if(path==='/api/login'&&method==='POST'){
   const body=await bodyOf(request),login=String(body.login||'').trim().toLowerCase(),password=body.password;
   await limit(db,'login-ip:'+(request.headers.get('CF-Connecting-IP')||'local'),60);
   await limit(db,'login-user:'+login.slice(0,64),10);
   if(typeof password!=='string'||enc.encode(password).length>72)fail('账号或密码不正确',401);
   const user=await db.prepare('SELECT * FROM users WHERE login=?').bind(login).first();
   if(!user||!await verifyPassword(password,user.password_hash))fail('账号或密码不正确',401);
   if(user.approval==='pending')fail('注册申请正在审核',403);
   if(user.approval==='rejected')fail('注册申请未通过审核，请联系管理员',403);
   if(user.status!=='enabled')fail('账号已停用，请联系管理员',403);
   if(body.audience==='admin'&&user.role!=='admin')fail('此账号没有管理员权限',403);
   const token=hex(crypto.getRandomValues(new Uint8Array(32))),at=Date.now();
   const result=await db.batch([
    db.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) SELECT ?,id,? FROM users WHERE id=? AND status='enabled' AND approval='approved' AND password_hash=?").bind(await digest(token),at+TTL,user.id,user.password_hash),
    db.prepare('UPDATE users SET last_login_at=? WHERE id=?').bind(at,user.id),
    db.prepare('DELETE FROM sessions WHERE expires_at<=?').bind(at),
    db.prepare('DELETE FROM auth_limits WHERE expires_at<=? OR key=?').bind(at,await digest('login-user:'+login))
   ]);
   if(!result[0].meta.changes)fail('账号已变更，请重新登录',401);
   return json({user:publicUser(user)},200,{'Set-Cookie':cookie(token,TTL/1000)});
  }
  if(path==='/api/register'&&method==='POST'){
   const body=await bodyOf(request);await limit(db,'register-ip:'+(request.headers.get('CF-Connecting-IP')||'local'),20);
   if(body.role&&body.role!=='user')fail('管理员账号只能由管理员创建',403);
   const {login,name,password}=fields(body),hash=await hashPassword(password),id=crypto.randomUUID(),at=Date.now();
   const result=await db.batch([
    db.prepare("INSERT INTO users(id,login,name,password_hash,role,status,approval,invitation_id,created_at) SELECT ?,?,?,?,'user','disabled','pending',id,? FROM invitations WHERE code_hash=? AND enabled=1 AND expires_at>? AND use_count<max_uses").bind(id,login,name,hash,at,await inviteDigest(body.inviteCode),at),
    db.prepare('UPDATE invitations SET use_count=use_count+1 WHERE id=(SELECT invitation_id FROM users WHERE id=?)').bind(id)
   ]);
   if(!result[0].meta.changes)fail('邀请码无效、已到期或已用完');
   return json({pendingApproval:true},201);
  }
  if(path==='/api/logout'&&method==='POST'){
   await db.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await digest(rawToken(request))).run();
   return json({ok:true},200,{'Set-Cookie':cookie('',0)});
  }
  const user=await currentUser(request,db);
  if(path==='/api/me'&&method==='GET')return json({user:user?publicUser(user):null});
  if(!user)fail('请先登录',401);
  const planResponse=await planRoute({request,env,db,url,path,method,user,json,fail,bodyOf,limit});if(planResponse)return planResponse;
  const restored=await originalAdmin({request,env,db,url,path,method,user,json,fail,bodyOf,fields,hashPassword,verifyPassword,publicUser,event,limit});
  if(restored)return restored;
  if(!path.startsWith('/api/admin/'))fail('接口不存在',404);
  if(user.role!=='admin')fail('此账号没有管理员权限',403);
  if(path==='/api/admin/overview'&&method==='GET'){
   return json(await db.prepare("SELECT COUNT(*) AS total,SUM(approval='pending') AS pending,SUM(status='enabled' AND approval='approved') AS enabled FROM users").first());
  }
  if(path==='/api/admin/users'&&method==='GET'){
   const q='%'+String(url.searchParams.get('q')||'').slice(0,64)+'%',page=Math.max(1,Math.min(100000,Number.parseInt(url.searchParams.get('page'))||1));
   const results=await db.batch([db.prepare('SELECT * FROM users WHERE login LIKE ? OR name LIKE ? ORDER BY created_at DESC LIMIT 20 OFFSET ?').bind(q,q,(page-1)*20),db.prepare('SELECT COUNT(*) AS total FROM users WHERE login LIKE ? OR name LIKE ?').bind(q,q)]);
   return json({users:results[0].results.map(publicUser),total:results[1].results[0].total,page});
  }
  if(path==='/api/admin/users'&&method==='POST'){
   const body=await bodyOf(request),{login,name,password}=fields(body),role=body.role||'user';
   if(!['user','admin'].includes(role))fail('无效的账号角色');
   const id=crypto.randomUUID();
   await db.batch([db.prepare("INSERT INTO users(id,login,name,password_hash,role,status,approval,created_at) VALUES(?,?,?,?,?,'enabled','approved',?)").bind(id,login,name,await hashPassword(password),role,Date.now()),event(db,user,'account.create',login)]);
   return json({ok:true},201);
  }
  const accountMatch=path.match(/^\/api\/admin\/users\/([a-f0-9-]+)$/);
  if(accountMatch&&method==='PATCH'){
   const target=await db.prepare('SELECT * FROM users WHERE id=?').bind(accountMatch[1]).first();if(!target)fail('账号不存在',404);
   if(target.role==='admin')fail('管理员账号不可在此停用或审核',409);
   const body=await bodyOf(request),action=body.action;let status,approval=target.approval;
   if(['approve','reject'].includes(action)){
    if(approval!=='pending')fail('该申请已处理，请刷新',409);
    approval=action==='approve'?'approved':'rejected';status=action==='approve'?'enabled':'disabled';
   }else if(['enable','disable'].includes(action)){
    if(approval!=='approved')fail('请先审核该账号',409);status=action==='enable'?'enabled':'disabled';
   }else fail('无效的账号操作');
   const changed=await db.batch([
    db.prepare('UPDATE users SET status=?,approval=? WHERE id=? AND status=? AND approval=?').bind(status,approval,target.id,target.status,target.approval),
    db.prepare('DELETE FROM sessions WHERE user_id=?').bind(target.id),event(db,user,'account.'+action,target.login)
   ]);
   if(!changed[0].meta.changes)fail('账号已变更，请刷新',409);
   return json({ok:true});
  }
  if(path==='/api/admin/invitations'&&method==='GET'){
   return json({invitations:(await db.prepare('SELECT id,hint,name,created_at,expires_at,max_uses,use_count,enabled FROM invitations ORDER BY created_at DESC LIMIT 50').all()).results});
  }
  if(path==='/api/admin/invitations'&&method==='POST'){
   const body=await bodyOf(request),name=String(body.name||'邀请注册').trim().slice(0,40),uses=Number(body.maxUses||1),days=Number(body.expiresInDays||body.days||7);
   if(!Number.isInteger(uses)||uses<1||uses>1000||!Number.isInteger(days)||days<1||days>90)fail('使用次数需为 1–1000，有效天数需为 1–90');
   const code=hex(crypto.getRandomValues(new Uint8Array(12))).toUpperCase(),id=crypto.randomUUID(),at=Date.now();
   await db.batch([db.prepare('INSERT INTO invitations(id,code_hash,hint,name,created_by,created_at,expires_at,max_uses) VALUES(?,?,?,?,?,?,?,?)').bind(id,await inviteDigest(code),code.slice(-4),name,user.id,at,at+days*86400000,uses),event(db,user,'invitation.create',name)]);
   return json({code,invitation:{id,name,maxUses:uses,expiresAt:at+days*86400000}},201);
  }
  const invitationMatch=path.match(/^\/api\/admin\/invitations\/([a-f0-9-]+)$/);
  if(invitationMatch&&method==='PATCH'){
   const body=await bodyOf(request);if(typeof body.enabled!=='boolean')fail('无效的邀请状态');
   const changed=await db.batch([db.prepare('UPDATE invitations SET enabled=? WHERE id=?').bind(Number(body.enabled),invitationMatch[1]),event(db,user,'invitation.'+(body.enabled?'enable':'disable'),invitationMatch[1])]);
   if(!changed[0].meta.changes)fail('邀请码不存在',404);return json({ok:true});
  }
  if(path==='/api/admin/events'&&method==='GET')return json({events:(await db.prepare('SELECT e.action,e.target,e.created_at,u.name AS actor FROM audit_events e LEFT JOIN users u ON u.id=e.actor_id ORDER BY e.id DESC LIMIT 50').all()).results});
  fail('接口不存在',404);
 }catch(error){
  if(error instanceof ApiError)return json({error:error.message},error.status);
  if(String(error.message).includes('UNIQUE constraint failed: users.login'))return json({error:'该账号已存在'},409);
  return json({error:'服务暂不可用，请稍后重试'},500);
 }
}
