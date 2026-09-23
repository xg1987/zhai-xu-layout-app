import { providers, visionRoute, usageList } from './vision-cloud.mjs';
const pageOf=url=>Math.max(1,Math.min(100000,parseInt(url.searchParams.get('page'))||1));
const pagination=(total,page)=>({total,page,pages:Math.max(1,Math.ceil(total/20)),pageSize:20});
export async function originalAdmin(c){
 const {request,env,db,url,path,method,user,json,fail,bodyOf,fields,hashPassword,verifyPassword,publicUser,event,limit}=c;
 if(path==='/api/account/profile'&&method==='PATCH'){
  const b=await bodyOf(request),name=String(b.name||'').trim();if(!name||name.length>24||/[\x00-\x1f]/.test(name))fail('请输入 1–24 字的姓名');
  await db.batch([db.prepare('UPDATE users SET name=? WHERE id=?').bind(name,user.id),event(db,user,'profile.edit',user.login)]);return json({user:publicUser({...user,name})});
 }
 if(path==='/api/account/password'&&method==='POST'){
  const b=await bodyOf(request);await limit(db,'password:'+user.id,10);
  if(typeof b.currentPassword!=='string'||b.currentPassword.length>72||!await verifyPassword(b.currentPassword,user.password_hash))fail('当前密码不正确');
  if(b.newPassword!==b.confirmPassword||b.currentPassword===b.newPassword)fail('请核对新密码与确认密码');
  const {password}=fields({login:user.login,name:user.name,password:b.newPassword});
  await db.batch([db.prepare('UPDATE users SET password_hash=? WHERE id=?').bind(await hashPassword(password),user.id),db.prepare('DELETE FROM sessions WHERE user_id=?').bind(user.id),event(db,user,'password.change',user.login)]);return json({ok:true});
 }
 if(path==='/api/account/settings'&&method==='GET')return json({user:publicUser(user),software:{name:'家居风水',version:'0.4.2',language:'简体中文'}});
 if(!path.startsWith('/api/admin/'))return null;
 if(user.role!=='admin')fail('此账号没有管理员权限',403);
 if(path==='/api/admin/access'&&method==='GET')return json({user:publicUser(user)});
 if(path==='/api/admin/settings'&&method==='GET')return json({user:publicUser(user),software:{name:'家居风水',version:'0.4.2',language:'简体中文'}});
 const summary=()=>db.prepare("SELECT COUNT(*) AS total,COALESCE(SUM(approval='pending'),0) AS pending,COALESCE(SUM(status='enabled' AND approval='approved'),0) AS enabled FROM users").first();
 const events=async(q='',page=1)=>{
  const pattern='%'+q+'%',where=' WHERE u.name LIKE ? OR u.login LIKE ? OR e.target LIKE ?';
  const args=[pattern,pattern,pattern];
  const [count,rows]=await Promise.all([db.prepare('SELECT COUNT(*) AS n FROM audit_events e LEFT JOIN users u ON u.id=e.actor_id'+where).bind(...args).first(),db.prepare("SELECT e.*,u.name AS actor_name,u.login AS actor_login FROM audit_events e LEFT JOIN users u ON u.id=e.actor_id"+where+' ORDER BY e.id DESC LIMIT 20 OFFSET ?').bind(...args,(page-1)*20).all()]);return {records:rows.results,...pagination(count.n,page)};
 };
 if(path==='/api/admin/overview'&&method==='GET'){
  const [users,ps,log,usage]=await Promise.all([summary(),providers(db),events(),usageList(db,{period:'today'})]);return json({...users,users,providers:ps,events:log.records.slice(0,6),usage:usage.summary});
 }
 if(path==='/api/admin/events'&&method==='GET'){const data=await events((url.searchParams.get('q')||'').slice(0,64),pageOf(url));return json({...data,events:data.records});}
 if(path==='/api/admin/accounts'&&method==='GET'){
  const clauses=[],args=[];for(const key of ['role','status','approval']){const v=url.searchParams.get(key);if(v){clauses.push(key+'=?');args.push(v);}}
  const q=url.searchParams.get('q');if(q){clauses.push('(login LIKE ? OR name LIKE ?)');args.push('%'+q.slice(0,64)+'%','%'+q.slice(0,64)+'%');}
  const where=clauses.length?' WHERE '+clauses.join(' AND '):'',page=pageOf(url);
  const [count,rows,stats]=await Promise.all([db.prepare('SELECT COUNT(*) AS n FROM users'+where).bind(...args).first(),db.prepare('SELECT * FROM users'+where+' ORDER BY created_at DESC,id LIMIT 20 OFFSET ?').bind(...args,(page-1)*20).all(),summary()]);
  return json({records:rows.results.map(publicUser),summary:stats,...pagination(count.n,page)});
 }
 if(path==='/api/admin/accounts'&&method==='POST'){
  const b=await bodyOf(request),f=fields(b);if(b.password!==b.confirmPassword)fail('两次密码不一致');
  const role=b.role||'user',status=b.status||'enabled';if(!['admin','user'].includes(role)||!['enabled','disabled'].includes(status))fail('账号角色或状态不正确');
  await db.batch([db.prepare("INSERT INTO users(id,login,name,password_hash,role,status,approval,created_at) VALUES(?,?,?,?,?,?,'approved',?)").bind(crypto.randomUUID(),f.login,f.name,await hashPassword(f.password),role,status,Date.now()),event(db,user,'account.create',f.login)]);return json({ok:true},201);
 }
 const match=path.match(/^\/api\/admin\/accounts\/([a-f0-9-]+)(?:\/(review|password))?$/);
 if(match){
  const target=await db.prepare('SELECT * FROM users WHERE id=?').bind(match[1]).first();if(!target)fail('账号不存在',404);
  if(method!=='PATCH'&&method!=='POST')return null;
  const b=await bodyOf(request);
  if(match[2]==='review'&&method==='POST'){
   const decision=b.decision,reason=String(b.reason||'').trim();if(!['approved','rejected'].includes(decision)||reason.length>200||(decision==='rejected'&&!reason))fail('请填写正确的审核决定与备注');
   if(target.approval!=='pending')fail('此申请已处理，请刷新',409);
   const changes=await db.batch([db.prepare("UPDATE users SET approval=?,status=?,review_note=? WHERE id=? AND approval='pending'").bind(decision,decision==='approved'?'enabled':'disabled',reason,target.id),event(db,user,decision==='approved'?'account.approve':'account.reject',target.login)]);if(!changes[0].meta.changes)fail('此申请已处理，请刷新',409);return json({ok:true});
  }
  if(match[2]==='password'&&method==='POST'){
   if(target.id===user.id)fail('请在系统设置中修改自己的密码');if(b.password!==b.confirmPassword)fail('两次密码不一致');
   const f=fields({login:target.login,name:target.name,password:b.password});
   await db.batch([db.prepare('UPDATE users SET password_hash=? WHERE id=?').bind(await hashPassword(f.password),target.id),db.prepare('DELETE FROM sessions WHERE user_id=?').bind(target.id),event(db,user,'account.password',target.login)]);return json({ok:true});
  }
  if(!match[2]&&method==='PATCH'){
   const name=String(b.name||'').trim(),role=b.role,status=b.status;if(!name||name.length>24||/[\x00-\x1f]/.test(name)||!['admin','user'].includes(role)||!['enabled','disabled'].includes(status))fail('请填写有效的姓名、角色和状态');
   if(target.approval!=='approved')fail('请先完成注册审核');if(target.id===user.id&&(role!==target.role||status!==target.status))fail('不能修改自己的角色或状态',409);
   const condition=" AND (role!='admin' OR status!='enabled' OR (?='admin' AND ?='enabled') OR (SELECT COUNT(*) FROM users WHERE role='admin' AND status='enabled' AND approval='approved')>1)";
   const result=await db.batch([db.prepare('UPDATE users SET name=?,role=?,status=? WHERE id=?'+condition).bind(name,role,status,target.id,role,status),...(role!==target.role||status!==target.status?[db.prepare('DELETE FROM sessions WHERE user_id=?').bind(target.id)]:[]),event(db,user,'account.edit',target.login)]);
   if(!result[0].meta.changes)fail('必须保留一个启用的管理员',409);return json({ok:true});
  }
 }
 if(path==='/api/admin/invitations'&&method==='GET'){
  const page=pageOf(url),[count,rows]=await Promise.all([db.prepare('SELECT COUNT(*) AS n FROM invitations').first(),db.prepare('SELECT id,hint,name,created_at,expires_at,max_uses,use_count,enabled FROM invitations ORDER BY created_at DESC LIMIT 20 OFFSET ?').bind((page-1)*20).all()]);
  const records=rows.results.map(r=>({...r,enabled:!!r.enabled,uses:r.use_count,maxUses:r.max_uses,expiresAt:r.expires_at,state:!r.enabled?'disabled':r.expires_at<=Date.now()?'expired':r.use_count>=r.max_uses?'exhausted':'active'}));return json({records,invitations:rows.results,...pagination(count.n,page)});
 }
 if(path.startsWith('/api/admin/vision'))return visionRoute(c);
 return null;
}
