import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import express from 'express'
import { createVisionStore, createVisionRouter, callVision, parseRecognition, validateImage, VisionError } from './vision.js'
import { recognitionToCanvas } from '../src/visionGeometry.js'

const fixture = { isFloorPlan:true, northAngleDeg:90, outline:[[100,100],[900,100],[900,900],[100,900]], rooms:['客厅'], notes:['请核对外墙'] }
const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6i8AAAAASUVORK5CYII='

test('归一化轮廓保持非正方形图片比例，北向映射南上展示，未知方向保留',()=>{
 const result=recognitionToCanvas({...fixture,outline:[[0,0],[1000,0],[1000,1000]]},2000,1000)
 assert.deepEqual(result.points,[[245,322.5],[555,322.5],[555,477.5]])
 assert.equal(result.angle,270)
 assert.equal(recognitionToCanvas({...fixture,northAngleDeg:null},1000,2000).angle,null)
 for(const angle of [0,90,180,270])assert.equal((angle+recognitionToCanvas({...fixture,northAngleDeg:angle},100,100).angle+180)%360,180)
})

test('密钥加密、重启恢复、不回显、替换清除旧测试状态、删除',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jiaju-vision-'))
 const db=new Database(path.join(dir,'test.sqlite')), master=path.join(dir,'master')
 try{
  const store=createVisionStore(db,master), key='local-test-secret-not-a-real-key'
  store.save('gemini',key)
  assert.equal(store.read('gemini').key,key)
  assert.equal(JSON.stringify(store.list()).includes(key),false)
  assert.equal(db.prepare('SELECT encrypted_key FROM vision_settings').get().encrypted_key.includes(key),false)
  assert.equal(fs.statSync(master).mode & 0o777,0o600)
  const reopened=createVisionStore(db,master);assert.equal(reopened.read('gemini').key,key)
  const revision=store.read('gemini').revision;store.checked('gemini',revision,true)
  assert.equal(store.list()[0].checkState,'ok')
  store.save('gemini',key+'2');store.checked('gemini',revision,true)
  assert.equal(store.list()[0].checkState,'untested')
  fs.unlinkSync(master)
  assert.throws(()=>store.read('gemini'),/无法读取/)
  store.remove('gemini');assert.equal(store.list()[0].configured,false)
 }finally{db.close();fs.rmSync(dir,{recursive:true,force:true})}
})

test('图片与结构化结果拒绝 URL、伪图片、越界坐标与臆造方向',()=>{
 assert.equal(validateImage(image).mimeType,'image/png')
 assert.throws(()=>validateImage('https://example.com/private-image'))
 assert.throws(()=>validateImage('data:image/png;base64,aGVsbG8='))
 assert.deepEqual(parseRecognition(JSON.stringify(fixture)),fixture)
 assert.equal(parseRecognition(JSON.stringify({...fixture,northAngleDeg:null})).northAngleDeg,null)
 for(const bad of [{...fixture,northAngleDeg:360},{...fixture,northAngleDeg:'90'},{...fixture,outline:[[0,0],[2,4],[1001,5]]},{...fixture,outline:[[0,0]]}])assert.throws(()=>parseRecognition(JSON.stringify(bad)))
 assert.deepEqual(parseRecognition(JSON.stringify({...fixture,isFloorPlan:false})).outline,[])
})

test('真实适配器请求格式、固定端点、密钥只进请求头、错误不泄露密钥',async()=>{
 for(const id of ['gemini','qwen']){
  const secret='mock-api-secret-only-in-header'
  const mock=async(url,options)=>{
   assert.equal(url.includes(secret),false);assert.equal(options.body.includes(secret),false)
   assert.equal(options.redirect,'error');assert.ok(options.signal)
   const body=JSON.parse(options.body)
   if(id==='gemini'){
    assert.equal(options.headers['x-goog-api-key'],secret);assert.match(url,/gemini-3.8-flash:generateContent$/)
    assert.equal(body.contents[0].parts[1].inlineData.mimeType,'image/png')
    return Response.json({candidates:[{content:{parts:[{text:JSON.stringify(fixture)}]}}]})
   }
   assert.equal(options.headers.Authorization,`Bearer ${secret}`);assert.equal(body.model,'qwen3.7-plus')
   assert.match(body.messages[0].content[1].image_url.url,/^data:image\/png/)
   return Response.json({choices:[{message:{content:JSON.stringify(fixture)}}]})
  }
  assert.deepEqual(await callVision(id,secret,{image:validateImage(image)},mock),fixture)
  await assert.rejects(callVision(id,secret,{},async()=>Response.json({error:secret},{status:401})),e=>!e.message.includes(secret)&&e.retryable)
 }
})

test('管理员权限、持久配置、连接测试、备用切换与无配置提示',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jiaju-vision-api-')),db=new Database(':memory:')
 const store=createVisionStore(db,path.join(dir,'master')), calls=[]
 const app=express()
 app.use('/api',createVisionRouter({store,currentUser:req=>req.headers['x-test-role']?{id:1,role:req.headers['x-test-role']}:null,invoke:async(id,key,options)=>{
  calls.push({id,test:!!options.test})
  if(options.test)return {ok:true}
  if(id==='gemini')throw new VisionError('模拟主模型超时',502,true)
  return fixture
 }}))
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve))
 const base=`http://127.0.0.1:${server.address().port}/api`
 async function request(url,role='admin',method='GET',data){return fetch(base+url,{method,headers:{...(role?{'x-test-role':role}:{}),...(data?{'Content-Type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{})})}
 try{
  assert.equal((await request('/admin/vision',null)).status,401)
  for(const method of ['GET','POST','DELETE'])assert.equal((await request('/admin/vision'+(method==='GET'?'':'/gemini'),'user',method,method==='GET'?undefined:{apiKey:'fake-key-for-tests-only'})).status,403)
  assert.equal((await request('/admin/vision/gemini/test','user','POST')).status,403)
  assert.equal((await request('/vision/recognize','user','POST',{image})).status,503)
  assert.equal((await request('/admin/vision/gemini','admin','POST',{apiKey:''})).status,400)
  for(const id of ['gemini','qwen'])assert.equal((await request(`/admin/vision/${id}`,'admin','POST',{apiKey:'fake-key-for-tests-only'})).status,200)
  assert.equal(JSON.stringify(await (await request('/admin/vision')).json()).includes('fake-key-for-tests-only'),false)
  assert.equal((await request('/admin/vision/gemini/test','admin','POST')).status,200)
  assert.equal(store.list()[0].checkState,'ok')
  const data=await(await request('/vision/recognize','user','POST',{image})).json()
  assert.equal(data.usedFallback,true);assert.equal(data.model,'qwen3.7-plus');assert.deepEqual(data.result,fixture)
  assert.deepEqual(calls.map(c=>c.id),['gemini','gemini','qwen'])
  for(const id of ['gemini','qwen'])assert.equal((await request(`/admin/vision/${id}`,'admin','DELETE')).status,200)
  assert.equal((await(await request('/vision/status','user')).json()).ready,false)
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));db.close();fs.rmSync(dir,{recursive:true,force:true})}
})
