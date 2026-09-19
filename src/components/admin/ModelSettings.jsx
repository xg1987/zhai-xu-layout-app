import { useEffect, useState } from 'react'
import AdminHeader from './AdminHeader.jsx'
import './admin.css'
import './models.css'

async function request(path, options) {
 const response = await fetch(`/api/admin/vision${path}`, options)
 const data = await response.json().catch(()=>{throw new Error('配置服务尚未就绪，请刷新后重试')})
 if (!response.ok) throw new Error(data.error || '操作未完成，请重试')
 return data
}
const statusLabels = { empty:'未配置', untested:'已保存 · 未测试', ok:'连接正常', error:'测试未通过' }

function ProviderCard({ provider, onUpdate }) {
 const [key, setKey] = useState(''), [busy,setBusy] = useState(''), [feedback,setFeedback] = useState(null), [removing,setRemoving] = useState(false)
 useEffect(()=>{const clear=()=>setKey('');window.addEventListener('pagehide',clear);return()=>window.removeEventListener('pagehide',clear)},[])
 async function run(action) {
  if (busy) return
  setBusy(action);setFeedback(null)
  try {
   const result=await request(`/${provider.id}${action==='test'?'/test':''}`,{method:action==='remove'?'DELETE':'POST',...(action==='save'?{headers:{'Content-Type':'application/json'},body:JSON.stringify({apiKey:key.trim()})}:{})})
   onUpdate(result.providers);setKey('');setRemoving(false)
   setFeedback({ok:true,text:action==='save'?'已保存，可测试连接。':action==='remove'?'已移除此模型的密钥。':'连接成功，模型可调用。'})
  } catch(error) {setFeedback({ok:false,text:error.message})}
  finally {setBusy('');if(action==='test'){try{onUpdate((await request('')).providers)}catch{}}}
 }
 return <section className="model-card" aria-labelledby={`model-${provider.id}`}>
  <div className="model-card-top"><span className="model-priority">{provider.priority}</span><span className={`model-status ${provider.checkState}`}><i/>{statusLabels[provider.checkState]}</span></div>
  <div className="model-name"><div className={`model-symbol ${provider.id}`} aria-hidden="true">{provider.id==='gemini'?<svg viewBox="0 0 32 32"><path d="M16 3C16 11 21 16 29 16C21 16 16 21 16 29C16 21 11 16 3 16C11 16 16 11 16 3Z"/></svg>:<svg viewBox="0 0 32 32"><path d="m16 4 11 6v12l-11 6-11-6V10Z M5 10l11 6 11-6 M16 16v12"/></svg>}</div><div><h3 id={`model-${provider.id}`}>{provider.name}</h3><p>{provider.region}</p></div></div>
  <p className="model-description">{provider.id==='gemini'?'优先识别户型文字、方位标记与房屋边界。':'主模型暂时不可用时接替识别，也可单独使用。'}</p>
  <form onSubmit={e=>{e.preventDefault();run('save')}} autoComplete="off">
   <label htmlFor={`key-${provider.id}`}>API Key <span>{provider.configured?'已保存，填写新密钥可替换':'待填写'}</span></label>
   <input id={`key-${provider.id}`} type="password" value={key} onChange={e=>{setKey(e.target.value);setFeedback(null)}} placeholder={provider.configured?'已安全保存 · 不回显原密钥':'粘贴你的 API Key'} autoComplete="new-password" spellCheck={false} autoCapitalize="none" maxLength={512} disabled={!!busy} />
   <div className="model-key-help"><span>{provider.id==='qwen'?'请使用百炼北京地域的 API Key':'使用 Google AI Studio 的 API Key'}</span><a href={provider.keyUrl} target="_blank" rel="noreferrer">获取密钥 ↗</a></div>
   <div className="model-actions"><button type="submit" className="admin-primary" disabled={!!busy||!key.trim()}>{busy==='save'?'正在保存…':'保存密钥'}</button><button type="button" className="admin-secondary" disabled={!!busy||!provider.configured||!!key.trim()} onClick={()=>run('test')}>{busy==='test'?'连接测试中…':'测试连接'}</button>{provider.configured&&<button type="button" className="model-remove" disabled={!!busy} onClick={()=>setRemoving(v=>!v)}>移除</button>}</div>
  </form>
  {removing&&<div className="model-remove-confirm"><p>移除后此模型将停止识别，之后可以重新填写密钥。</p><button disabled={!!busy} onClick={()=>run('remove')}>确认移除</button><button disabled={!!busy} onClick={()=>setRemoving(false)}>取消</button></div>}
  {feedback&&<p role={feedback.ok?'status':'alert'} className={`model-feedback ${feedback.ok?'success':'error'}`}>{feedback.text}</p>}
  {provider.checkedAt&&<small className="model-last-test">上次测试 {new Date(provider.checkedAt).toLocaleString('zh-CN')}</small>}
 </section>
}

export default function ModelSettings() {
 const [providers,setProviders]=useState(null),[error,setError]=useState('')
 async function load(){try{setError('');setProviders((await request('')).providers)}catch(e){setError(e.message)}}
 useEffect(()=>{let live=true;request('').then(data=>live&&setProviders(data.providers)).catch(e=>live&&setError(e.message));return()=>{live=false}},[])
 return <div className="admin-app models-app"><AdminHeader active="models"/><main className="admin-main models-main"><div className="admin-title"><div><div className="models-eyebrow">识别服务</div><h2>图片识别设置</h2></div><span className="models-summary">{providers?.some(p=>p.configured)?'配置已保存':'等待连接'}</span></div>
  {error&&<div className="model-feedback error" role="alert">{error}<button onClick={load}>重新加载</button></div>}
  {!providers&&!error?<p role="status">正在读取模型配置…</p>:<div className="model-grid">{providers?.map(provider=><ProviderCard key={provider.id} provider={provider} onUpdate={setProviders}/>)}</div>}
 </main></div>
}
