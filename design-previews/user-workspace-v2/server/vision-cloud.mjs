import { PROVIDERS, callVision } from './vision-provider.mjs';
import { normalizeUsage, priceSnapshot, calculateCost } from './usage-math.mjs';
export async function providers(db){
 const rows=(await db.prepare('SELECT provider,checked_at,check_state FROM vision_settings').all()).results;
 return Object.values(PROVIDERS).map(p=>{const r=rows.find(r=>r.provider===p.id);return {...p,configured:!!r,checkedAt:r?.checked_at||null,checkState:r?.check_state||'empty'};});
}
async function encryptionKey(env){
 if(!/^[a-f0-9]{64}$/.test(env.MODEL_ENCRYPTION_KEY||''))throw new Error('Encryption unavailable');
 return crypto.subtle.importKey('raw',Uint8Array.from(env.MODEL_ENCRYPTION_KEY.match(/../g),v=>parseInt(v,16)),'AES-GCM',false,['encrypt','decrypt']);
}
async function seal(value,env){const iv=crypto.getRandomValues(new Uint8Array(12)),data=await crypto.subtle.encrypt({name:'AES-GCM',iv},await encryptionKey(env),new TextEncoder().encode(value));return JSON.stringify({iv:Array.from(iv),data:Array.from(new Uint8Array(data))});}
async function open(value,env){const {iv,data}=JSON.parse(value);return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(iv)},await encryptionKey(env),new Uint8Array(data)));}
async function exchange(db,date){
 const cached=await db.prepare('SELECT * FROM vision_fx WHERE requested_date=?').bind(date).first();
 if(cached&&Date.now()-Date.parse(cached.fetched_at)<21600000)return JSON.parse(cached.rate_json);
 try{
  const res=await fetch(`https://api.frankfurter.dev/v2/rate/USD/CNY?providers=ecb&date=${date}`,{signal:AbortSignal.timeout(4000),redirect:'error'});if(!res.ok)throw 0;const v=await res.json(),age=Date.parse(date)-Date.parse(v.date);
  if(v.base!=='USD'||v.quote!=='CNY'||!Number.isFinite(v.rate)||v.rate<=0||v.rate>100||!Number.isFinite(age)||age<0||age>7*86400000)throw 0;
  const fx={rate:v.rate,date:v.date,source:'Frankfurter / ECB'};await db.prepare('INSERT INTO vision_fx VALUES(?,?,?) ON CONFLICT(requested_date) DO UPDATE SET rate_json=excluded.rate_json,fetched_at=excluded.fetched_at').bind(date,JSON.stringify(fx),new Date().toISOString()).run();return fx;
 }catch{return cached?JSON.parse(cached.rate_json):null;}
}
const serialize=r=>({id:r.id,requestId:r.request_id,attempt:r.attempt,account:r.account,name:r.user_name,provider:r.provider,model:r.model,operation:r.operation,startedAt:r.started_at,finishedAt:r.finished_at,status:r.status,usage:r.usage_json?JSON.parse(r.usage_json):null,price:JSON.parse(r.price_json),fx:r.fx_json?JSON.parse(r.fx_json):null,nativeAmount:r.native_nano===null?null:r.native_nano/1e9,cnyAmount:r.cny_nano===null?null:r.cny_nano/1e9,costState:r.cost_state});
export async function usageList(db,query={}){
 await db.prepare("UPDATE vision_usage SET status='interrupted' WHERE status='running' AND started_at<?").bind(new Date(Date.now()-120000).toISOString()).run();
 const clauses=[],args=[];
 if(['gemini','qwen'].includes(query.provider)){clauses.push('provider=?');args.push(query.provider);}
 if(['success','failed','interrupted','running'].includes(query.status)){clauses.push('status=?');args.push(query.status);}
 if(['today','month'].includes(query.period)){const now=new Date(Date.now()+8*3600000).toISOString();clauses.push('started_at>=?');args.push(new Date((query.period==='today'?now.slice(0,10):now.slice(0,7)+'-01')+'T00:00:00+08:00').toISOString());}
 const where=clauses.length?' WHERE '+clauses.join(' AND '):'';
 const summary=await db.prepare("SELECT COUNT(*) AS calls,COALESCE(SUM(cny_nano),0) AS totalNano,COALESCE(SUM(cny_nano IS NULL),0) AS pending,COALESCE(SUM(status='success'),0) AS successful FROM vision_usage"+where).bind(...args).first();
 const pages=Math.max(1,Math.ceil(summary.calls/20)),page=Math.min(pages,Math.max(1,parseInt(query.page)||1));
 const rows=await db.prepare('SELECT * FROM vision_usage'+where+' ORDER BY started_at DESC,id LIMIT 20 OFFSET ?').bind(...args,(page-1)*20).all();
 return {records:rows.results.map(serialize),summary:{calls:summary.calls,cnyAmount:summary.totalNano/1e9,pending:summary.pending,successful:summary.successful},page,pages,pageSize:20};
}
export async function visionRoute(c){
 const {request,env,db,url,path,method,user,json,fail,bodyOf,event,limit}=c;
 if(path==='/api/admin/vision'&&method==='GET')return json({providers:await providers(db)});
 if(path==='/api/admin/vision/usage'&&method==='GET'){
  const pending=(await db.prepare("SELECT * FROM vision_usage WHERE cost_state='fx_missing' ORDER BY started_at DESC LIMIT 20").all()).results;
  for(const row of pending){const fx=await exchange(db,row.started_at.slice(0,10));if(fx){const cost=calculateCost(JSON.parse(row.usage_json),JSON.parse(row.price_json),fx);await db.prepare('UPDATE vision_usage SET fx_json=?,cny_nano=?,cost_state=? WHERE id=?').bind(JSON.stringify(fx),cost.cnyNano,cost.costState,row.id).run();}}
  return json(await usageList(db,Object.fromEntries(url.searchParams)));
 }
 const match=path.match(/^\/api\/admin\/vision\/(gemini|qwen)(\/test)?$/);if(!match)fail('模型接口不存在',404);const id=match[1];
 if(method==='POST'&&!match[2]){
  const b=await bodyOf(request),key=b.apiKey;if(typeof key!=='string'||key.trim().length<16||key.length>512||/[^\x21-\x7e]/.test(key.trim()))fail('请输入完整有效的 API Key');
  let encrypted;try{encrypted=await seal(key.trim(),env);}catch{fail('密钥加密服务尚未就绪',503);}
  await db.batch([db.prepare("INSERT INTO vision_settings(provider,encrypted_key,revision) VALUES(?,?,?) ON CONFLICT(provider) DO UPDATE SET encrypted_key=excluded.encrypted_key,revision=excluded.revision,checked_at=NULL,check_state='untested'").bind(id,encrypted,crypto.randomUUID()),event(db,user,'model.save',id)]);return json({providers:await providers(db)});
 }
 if(method==='DELETE'&&!match[2]){await db.batch([db.prepare('DELETE FROM vision_settings WHERE provider=?').bind(id),event(db,user,'model.remove',id)]);return json({providers:await providers(db)});}
 if(method==='POST'&&match[2]){
  await limit(db,'vision-test:'+user.id,15);
  const saved=await db.prepare('SELECT * FROM vision_settings WHERE provider=?').bind(id).first();if(!saved)fail('请先保存此模型的 API Key');
  let key;try{key=await open(saved.encrypted_key,env);}catch{fail('模型密钥无法读取，请重新保存',503);}
  const at=new Date().toISOString(),record=crypto.randomUUID(),price=priceSnapshot(id,at),fx=price.currency==='USD'?await exchange(db,at.slice(0,10)):null;
  await db.prepare('INSERT INTO vision_usage(id,request_id,attempt,user_id,account,user_name,provider,model,operation,started_at,price_json,fx_json) VALUES(?,?,1,?,?,?,?,?,?,?, ?,?)').bind(record,record,user.id,user.login,user.name,id,PROVIDERS[id].model,'test',at,JSON.stringify(price),fx?JSON.stringify(fx):null).run();
  let usage=null,error=null;try{await callVision(id,key,{test:true,onUsage:data=>{usage=normalizeUsage(id,data);}});}catch(e){error=e;}
  const cost=calculateCost(usage,price,fx),finished=new Date().toISOString();
  await db.batch([db.prepare('UPDATE vision_usage SET finished_at=?,status=?,usage_json=?,price_json=?,native_nano=?,cny_nano=?,cost_state=? WHERE id=?').bind(finished,error?'failed':'success',usage?JSON.stringify(usage):null,JSON.stringify(cost.price),cost.nativeNano,cost.cnyNano,cost.costState,record),db.prepare('UPDATE vision_settings SET checked_at=?,check_state=? WHERE provider=? AND revision=?').bind(finished,error?'error':'ok',id,saved.revision),event(db,user,'model.test',id,error?'failed':'success')]);
  if(error)fail(error.message,error.status||502);return json({ok:true,providers:await providers(db)});
 }
 fail('不支持此操作',405);
}
