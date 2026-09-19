import test from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import express from 'express'
import { normalizeUsage, priceSnapshot, calculateCost, createUsageStore } from './usage.js'
import { callVision, createVisionRouter } from './vision.js'

const gemini = { usageMetadata: { promptTokenCount: 2000, cachedContentTokenCount: 1000, candidatesTokenCount: 500, thoughtsTokenCount: 200 } }
const qwen = { usage: { prompt_tokens: 2000, prompt_tokens_details: { cached_tokens: 1000 }, completion_tokens: 700, completion_tokens_details: { reasoning_tokens: 200 } } }
const fx = { rate: 7, date: '2026-09-16', base: 'USD', quote: 'CNY' }
const fixedNow = () => new Date('2026-09-17T04:00:00Z')
const record = { requestId:'test-request', attempt:1, user:{id:1,phone:'demo',name:'用户'}, provider:'gemini',model:'gemini-3.8-flash',operation:'recognize' }
const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6i8AAAAASUVORK5CYII='

test('真实用量：缓存只扣一次，Gemini 思考相加，千问思考不重复', () => {
 assert.deepEqual(normalizeUsage('gemini',gemini),{input:2000,cached:1000,output:700,thinking:200,total:2700})
 assert.deepEqual(normalizeUsage('qwen',qwen),normalizeUsage('gemini',gemini))
 assert.equal(normalizeUsage('gemini',{}),null)
 assert.equal(normalizeUsage('qwen',{usage:{prompt_tokens:2,completion_tokens:3,prompt_tokens_details:{cached_tokens:4}}}),null)
 assert.equal(normalizeUsage('gemini',{usageMetadata:{promptTokenCount:5,candidatesTokenCount:-1}}),null)
 const cost=calculateCost(normalizeUsage('gemini',gemini),priceSnapshot('gemini','2026-09-17'),fx)
 assert.equal(cost.nativeNano,3450000);assert.equal(cost.cnyNano,24150000)
 assert.equal(calculateCost(normalizeUsage('qwen',qwen),priceSnapshot('qwen'),null).cnyNano,8000000)
 assert.equal(calculateCost(null,priceSnapshot('gemini'),fx).cnyNano,null)
 assert.equal(calculateCost(normalizeUsage('gemini',gemini),priceSnapshot('gemini'),null).costState,'fx_missing')
})

test('阶梯边界、跨年单价和低于一分钱的费用保留', () => {
 const price=priceSnapshot('qwen')
 assert.equal(calculateCost({input:256000,cached:0,output:1},price,null).price.input,2)
 assert.equal(calculateCost({input:256001,cached:0,output:1},price,null).price.input,6)
 assert.equal(priceSnapshot('gemini','2027-01-01').output,7.5)
 assert.equal(calculateCost({input:1,cached:0,output:0},price,null).cnyNano,2000)
})

test('持久用量、独立汇率快照、缺失汇率恢复，不把未知费用算成零', async () => {
 const db=new Database(':memory:');let offline=true, rate=7
 const fetchImpl=async()=>{if(offline)throw new Error('offline');return Response.json({...fx,rate})}
 const store=createUsageStore(db,{fetchImpl,now:fixedNow})
 try {
  const id=await store.begin(record);store.meter(id,gemini);store.finish(id,'failed')
  let data=store.list();assert.equal(data.summary.pending,1);assert.equal(data.records[0].cnyAmount,null)
  offline=false;await store.reconcile();data=store.list();assert.equal(data.summary.pending,0);assert.equal(data.records[0].cnyAmount,0.02415)
  rate=8;await store.reconcile();assert.equal(store.list().records[0].fx.rate,7)
  const interrupted=await store.begin({...record,requestId:'interrupted'})
  const reopened=createUsageStore(db,{fetchImpl,now:fixedNow})
  assert.equal(reopened.list().records.find(r=>r.id===interrupted).status,'interrupted')
  assert.equal(reopened.list().summary.pending,1)
  assert.equal(reopened.list({provider:'qwen'}).summary.calls,0)
  assert.equal(reopened.list({status:'failed'}).summary.cnyAmount,0.02415)
 } finally {db.close()}
})

test('请求失败保留已返回用量，备用重试逐笔计费，管理权限与分页', async () => {
 const db=new Database(':memory:')
 const usageStore=createUsageStore(db,{fetchImpl:async()=>Response.json(fx),now:fixedNow})
 const providers=['gemini','qwen'].map(id=>({id,configured:true}))
 const store={list:()=>providers,read:()=>({key:'not-a-real-key',revision:'r'}),checked:()=>{}}
 const fakeFetch=async(url)=>url.includes('googleapis') ? Response.json({...gemini,candidates:[{content:{parts:[{text:'invalid json'}]}}]}) : Response.json({...qwen,choices:[{message:{content:'{"isFloorPlan":false,"northAngleDeg":null,"outline":[],"rooms":[],"notes":[]}'}}]})
 const app=express();app.use(createVisionRouter({store,usageStore,currentUser:req=>req.headers['x-role']?{id:1,phone:'demo',role:req.headers['x-role']}:null,invoke:(id,key,options)=>callVision(id,key,options,fakeFetch)}))
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`
 const get=(role='admin',path='/admin/vision/usage')=>fetch(base+path,{headers:role?{'x-role':role}:{}})
 try {
  assert.equal((await get(null)).status,401);assert.equal((await get('user')).status,403)
  const response=await fetch(base+'/vision/recognize',{method:'POST',headers:{'x-role':'user','Content-Type':'application/json'},body:JSON.stringify({image})})
  assert.equal(response.status,200);assert.equal((await response.json()).usedFallback,true)
  let data=await(await get()).json();assert.equal(data.summary.calls,2);assert.equal(data.summary.cnyAmount,0.03215)
  assert.equal(data.records[0].requestId,data.records[1].requestId);assert.equal(data.records[0].attempt,2)
  assert.equal(data.records.find(r=>r.provider==='gemini').status,'failed');assert.equal(data.summary.pending,0)
  assert.equal(JSON.stringify(data).includes('not-a-real-key'),false);assert.equal(JSON.stringify(data).includes('invalid json'),false)
  await fetch(base+'/admin/vision/gemini/test',{method:'POST',headers:{'x-role':'admin'}})
  assert.equal(usageStore.list().records[0].operation,'test')
  for(let i=0;i<22;i++){const id=await usageStore.begin({...record,provider:'qwen',model:'qwen3.7-plus'});usageStore.meter(id,qwen);usageStore.finish(id,'success')}
  data=await(await get('admin','/admin/vision/usage?provider=qwen&page=2')).json()
  assert.equal(data.records.length,3);assert.equal(data.page,2);assert.equal(data.summary.calls,23)
  const before=usageStore.list().summary.calls
  await fetch(base+'/vision/recognize',{method:'POST',headers:{'x-role':'user','Content-Type':'application/json'},body:'{"image":"invalid"}'})
  assert.equal(usageStore.list().summary.calls,before)
 } finally {server.closeAllConnections();await new Promise(r=>server.close(r));db.close()}
})

test('沪时区月初与日初筛选，未来或异常汇率不能计费', async()=>{
 const db=new Database(':memory:');let current=new Date('2026-08-31T15:59:00Z')
 const store=createUsageStore(db,{now:()=>current,fetchImpl:async()=>Response.json({...fx,date:'2099-01-01'})})
 try{
  let id=await store.begin(record);store.meter(id,gemini);store.finish(id,'success')
  current=new Date('2026-08-31T16:01:00Z')
  id=await store.begin(record);store.finish(id,'failed')
  assert.equal(store.list({period:'today'}).summary.calls,1)
  assert.equal(store.list({period:'month'}).summary.calls,1)
  assert.equal(store.list().summary.pending,2)
 }finally{db.close()}
})
