import { useEffect, useRef, useState } from 'react'
import { recognitionToCanvas } from '../visionGeometry.js'
import './vision.css'

export async function prepareImage(photo) {
 const image = new Image();image.src=photo;await image.decode()
 const scale=Math.min(1,2048/Math.max(image.naturalWidth,image.naturalHeight))
 const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale))
 const context=canvas.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height)
 return {image:canvas.toDataURL('image/jpeg',.9),width:image.naturalWidth,height:image.naturalHeight}
}
export default function VisionAssist({photo,onApply}) {
 const [ready,setReady]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[answer,setAnswer]=useState(null),[applied,setApplied]=useState(false)
 const controller=useRef(null),alive=useRef(true)
 useEffect(()=>{alive.current=true;const abort=new AbortController();fetch('/api/vision/status',{signal:abort.signal}).then(r=>{if(!r.ok)throw Error();return r.json()}).then(d=>setReady(d.ready)).catch(e=>{if(e.name!=='AbortError')setError('识别服务状态读取失败')});return()=>{alive.current=false;abort.abort();controller.current?.abort()}},[])
 async function recognize(){
  setBusy(true);setError('');setAnswer(null);setApplied(false);controller.current=new AbortController()
  try{
   const prepared=await prepareImage(photo)
   if(!alive.current)return
   const response=await fetch('/api/vision/recognize',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image:prepared.image}),signal:controller.current.signal})
   const data=await response.json().catch(()=>{throw new Error('识别服务尚未就绪，请稍后重试')});if(!response.ok)throw new Error(data.error||'识别未完成')
   setAnswer({...data,width:prepared.width,height:prepared.height})
  }catch(e){if(alive.current&&e.name!=='AbortError')setError(e.message||'图片无法识别，请手动校准')}
  finally{if(alive.current)setBusy(false)}
 }
 return <div className="vision-assist"><div className="vision-heading"><span>图片辅助识别</span><button disabled={busy||!ready} onClick={recognize}>{busy?'正在识别…':answer?'重新识别':'识别方位与轮廓'}</button></div>
  <small>{ready===false?'管理员尚未配置识别模型，可以继续手动校准。':'点击识别会将此图片发送至管理员配置的模型服务，结果需人工核对。'}</small>
  {busy&&<p role="status">正在读取图片中的方位与外墙边界，请稍候。</p>}
  {error&&<p className="vision-error" role="alert">{error}</p>}
  {answer&&<div className="vision-result"><p className="vision-source">{answer.provider}{answer.usedFallback?' · 已使用备用模型':''}</p>{!answer.result.isFloorPlan?<p>未识别为户型图，请更换图片或手动标注。</p>:<><dl><div><dt>北向标记</dt><dd>{answer.result.northAngleDeg===null?'无法确定':`图中 ${answer.result.northAngleDeg}°`}</dd></div><div><dt>轮廓节点</dt><dd>{answer.result.outline.length||'未确定'}</dd></div></dl>{answer.result.rooms.length>0&&<p>房间：{answer.result.rooms.join('、')}</p>}{answer.result.notes.map((note,i)=><p key={i}>{note}</p>)}<button className="vision-apply" disabled={applied||(!answer.result.outline.length&&answer.result.northAngleDeg===null)} onClick={()=>{onApply(recognitionToCanvas(answer.result,answer.width,answer.height));setApplied(true)}}>{applied?'已填入，请核对':'填入校准与轮廓'}</button><small>会替换识别到的方向和轮廓，未识别的部分保持原样。</small></>}</div>}
 </div>
}
