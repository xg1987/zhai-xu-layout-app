import {validateImage,callVision,PROVIDERS} from './vision-provider.mjs';
import {open,exchange} from './vision-cloud.mjs';
import {normalizeUsage,priceSnapshot,calculateCost} from './usage-math.mjs';
import {analyzePlan} from './plan-geometry.mjs';
const serialize=r=>({id:r.id,status:r.status,width:r.width,height:r.height,created:r.created_at,updated:r.updated_at,error:r.error,recognition:r.recognition_json?JSON.parse(r.recognition_json):null,result:r.result_json?JSON.parse(r.result_json):null,...(r.image?{image:r.image}:{})});
async function readBody(request,fail){if(!request.headers.get('Content-Type')?.startsWith('application/json'))fail('请使用 JSON 请求',415);if(Number(request.headers.get('Content-Length'))>900000)fail('图片过大，请压缩后再试',413);const text=await request.text();if(text.length>900000)fail('图片过大，请压缩后再试',413);try{return JSON.parse(text);}catch{fail('请求格式不正确');}}
export async function planRoute(c){
 const {path,method,db,user,request,env,json,fail,bodyOf,limit}=c;if(!path.startsWith('/api/plans'))return null;
 if(path==='/api/plans'&&method==='GET'){const rows=await db.prepare('SELECT id,status,width,height,created_at,updated_at,error,recognition_json,result_json FROM plans WHERE user_id=? ORDER BY created_at DESC LIMIT 100').bind(user.id).all();return json({plans:rows.results.map(serialize)});}
 const match=path.match(/^\/api\/plans\/([a-f0-9-]{36})(\/confirm)?$/);if(!match)fail('接口不存在',404);const id=match[1];let row=await db.prepare('SELECT * FROM plans WHERE id=? AND user_id=?').bind(id,user.id).first();
 if(method==='GET'&&!match[2]){if(!row)fail('记录不存在',404);return json({plan:serialize(row)});}
 if(method==='POST'&&match[2]){if(!row)fail('记录不存在',404);if(!['recognized','complete'].includes(row.status))fail('请先完成识别',409);const b=await bodyOf(request);let result;try{result=analyzePlan({...b,width:row.width,height:row.height});}catch(e){fail(e.message);}await db.prepare("UPDATE plans SET status='complete',result_json=?,updated_at=? WHERE id=? AND user_id=?").bind(JSON.stringify(result),new Date().toISOString(),id,user.id).run();return json({plan:serialize({...row,status:'complete',result_json:JSON.stringify(result)})});}
 if(method!=='POST'||match[2])fail('不支持此操作',405);
 if(row&&['recognized','complete'].includes(row.status))return json({plan:serialize(row)});
 if(row?.status==='processing'&&Date.now()-Date.parse(row.updated_at)<120000)fail('图片正在识别，请稍候',409);
 const b=await readBody(request,fail);if(!b||typeof b!=='object')fail('请求格式不正确');if(![b.width,b.height].every(n=>Number.isInteger(n)&&n>0&&n<=2400))fail('图片尺寸无效');let image;try{image=validateImage(b.image);}catch(e){fail(e.message);}
 if(b.image.length>850000)fail('图片过大，请压缩后再试',413);
 const available=(await db.prepare('SELECT * FROM vision_settings WHERE enabled=1').all()).results;const choices=Object.values(PROVIDERS).filter(p=>available.some(s=>s.provider===p.id));if(!choices.length)fail('当前没有开启的识别模型，请联系管理员',503);
 await limit(db,'plan:'+user.id,20);const at=new Date().toISOString();
 if(row){const changed=await db.prepare("UPDATE plans SET status='processing',image=?,width=?,height=?,updated_at=?,error=NULL WHERE id=? AND user_id=? AND updated_at=?").bind(b.image,b.width,b.height,at,id,user.id,row.updated_at).run();if(!changed.meta.changes)fail('图片正在处理中',409);}
 else {const added=await db.prepare("INSERT OR IGNORE INTO plans(id,user_id,image,width,height,status,created_at,updated_at) VALUES(?,?,?,?,?,'processing',?,?)").bind(id,user.id,b.image,b.width,b.height,at,at).run();if(!added.meta.changes)fail('请求编号已使用，请重新上传',409);}
 let recognition=null,lastError='识别失败，请稍后重试';let attempt=0;
 for(const provider of choices){const saved=await db.prepare('SELECT * FROM vision_settings WHERE provider=? AND enabled=1').bind(provider.id).first();if(!saved)continue;const started=new Date().toISOString(),usageId=crypto.randomUUID(),price=priceSnapshot(provider.id),fx=price.currency==='USD'?await exchange(db,started.slice(0,10)):null;attempt++;
 await db.prepare("INSERT INTO vision_usage(id,request_id,attempt,user_id,account,user_name,provider,model,operation,started_at,price_json,fx_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").bind(usageId,id,attempt,user.id,user.login,user.name,provider.id,provider.model,'recognize',started,JSON.stringify(price),fx?JSON.stringify(fx):null).run();
 let usage=null,error=null;try{const key=await open(saved.encrypted_key,env);recognition=await callVision(provider.id,key,{image,onUsage:d=>{usage=normalizeUsage(provider.id,d);}});recognition.provider=provider.name;}catch(e){error=e;lastError=e.status?e.message:'模型服务异常，请联系管理员或稍后重试';}
 const cost=calculateCost(usage,price,fx);await db.prepare('UPDATE vision_usage SET finished_at=?,status=?,usage_json=?,native_nano=?,cny_nano=?,cost_state=? WHERE id=?').bind(new Date().toISOString(),error?'failed':'success',usage?JSON.stringify(usage):null,cost.nativeNano,cost.cnyNano,cost.costState,usageId).run();if(recognition)break;
 }
 const finished=new Date().toISOString();if(!recognition){await db.prepare("UPDATE plans SET status='failed',error=?,updated_at=? WHERE id=? AND user_id=?").bind(lastError,finished,id,user.id).run();fail(lastError,502);}
 const status=recognition.isFloorPlan?'recognized':'not_plan';await db.prepare('UPDATE plans SET status=?,recognition_json=?,updated_at=? WHERE id=? AND user_id=?').bind(status,JSON.stringify(recognition),finished,id,user.id).run();row=await db.prepare('SELECT * FROM plans WHERE id=? AND user_id=?').bind(id,user.id).first();return json({plan:serialize(row)});
}
