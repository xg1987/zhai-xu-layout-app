import { useEffect, useRef, useState } from 'react'
import ResidentialScene from './ResidentialScene.jsx'
import './auth.css'
function Eye({open}){return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>{open&&<path d="m4 3 16 18"/>}</svg>}
function PasswordField({id,label,value,onChange,visible,onToggle,error,hint}){
 return <div className="auth-field"><label htmlFor={id}>{label}</label><div className="auth-password"><input id={id} data-sensitive="true" type={visible?'text':'password'} value={value} onChange={onChange} placeholder={`请输入${label}`} autoComplete="off" maxLength={128} aria-invalid={!!error} aria-describedby={error?`${id}-error`:hint?`${id}-hint`:undefined}/><button type="button" aria-label={`${visible?'隐藏':'显示'}${label}`} aria-pressed={visible} onClick={onToggle}><Eye open={visible}/></button></div>{hint&&!error&&<small id={`${id}-hint`}>{hint}</small>}{error&&<p className="auth-error" role="alert" id={`${id}-error`}>{error}</p>}</div>
}
function AuthForm({register,admin,onNavigate}){
 const form=useRef(null)
 const [inviteCode,setInviteCode]=useState(() => new URLSearchParams(location.search).get('invite') || ''),[login,setLogin]=useState(''),[name,setName]=useState(''),[password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[visible,setVisible]=useState(false),[confirmVisible,setConfirmVisible]=useState(false),[errors,setErrors]=useState({}),[notice,setNotice]=useState(() => new URLSearchParams(window.location.search).get('passwordChanged') === '1' ? '密码已修改，请使用新密码登录' : ''),[busy,setBusy]=useState(false)
 function clearPasswords(){setPassword('');setConfirm('');setVisible(false);setConfirmVisible(false);form.current?.querySelectorAll('[data-sensitive]').forEach(input=>{input.value=''})}
 useEffect(()=>{const clear=()=>clearPasswords();window.addEventListener('pagehide',clear);window.addEventListener('pageshow',clear);return()=>{window.removeEventListener('pagehide',clear);window.removeEventListener('pageshow',clear)}},[])
 async function submit(e){e.preventDefault();if(busy)return;setNotice('');const next={}
 if(!login.trim())next.login='请输入登录账号'
 else if(!/^[a-zA-Z0-9][a-zA-Z0-9_.@+-]{2,63}$/.test(login.trim()))next.login='账号需为 3–64 位字母、数字或 _ . @ + -，以字母或数字开头'
 if(register&&!inviteCode.trim())next.invite='请输入邀请码'
 if(register&&!name.trim())next.name='请输入显示名称'
 else if(register&&name.trim().length>24)next.name='显示名称最多 24 个字'
 if(!password)next.password='请输入密码'
 else if(password.length<8||new TextEncoder().encode(password).length>72)next.password='密码至少 8 位，最多 72 字节'
 if(register&&!confirm)next.confirm='请再次输入密码'
 else if(register&&password!==confirm)next.confirm='两次输入的密码不一致'
 setErrors(next)
 if(Object.keys(next).length){const field=Object.keys(next)[0];form.current?.querySelector(`#auth-${field}`)?.focus();return}
 setBusy(true)
 try{const response=await fetch(register?'/api/register':'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({login:login.trim(),name:name.trim(),password,inviteCode,audience:admin?'admin':'user'})});const data=await response.json();if(!response.ok){setNotice(data.error||'操作未完成');return}clearPasswords();window.location.assign(data.pendingApproval?'/register?submitted=1':data.user.role==='admin'?'/admin/overview':'/')}
 catch{setNotice('登录服务暂不可用，请稍后重试')}
 finally{clearPasswords();setBusy(false)}
 }
 return <><form ref={form} className="auth-form" onSubmit={submit} aria-busy={busy} noValidate autoComplete="off">
 <div className="auth-field"><label htmlFor="auth-login">账号</label><input id="auth-login" value={login} onChange={e=>setLogin(e.target.value)} maxLength={64} placeholder="请输入账号" autoComplete="off" autoCapitalize="none" spellCheck={false} aria-invalid={!!errors.login} aria-describedby={errors.login?'auth-login-error':undefined}/>{errors.login&&<p id="auth-login-error" className="auth-error" role="alert">{errors.login}</p>}</div>
 {register&&<div className="auth-field"><label htmlFor="auth-name">显示名称</label><input id="auth-name" value={name} onChange={e=>setName(e.target.value)} maxLength={24} placeholder="请输入显示名称" autoComplete="off" aria-invalid={!!errors.name} aria-describedby={errors.name?'auth-name-error':undefined}/>{errors.name&&<p id="auth-name-error" className="auth-error" role="alert">{errors.name}</p>}</div>}
 {register&&<div className="auth-field"><label htmlFor="auth-invite">邀请码</label><input id="auth-invite" value={inviteCode} onChange={e=>setInviteCode(e.target.value)} maxLength={64} placeholder="请输入管理员提供的邀请码" autoComplete="off" spellCheck={false} aria-invalid={!!errors.invite} aria-describedby={errors.invite?'auth-invite-error':undefined}/>{errors.invite&&<p id="auth-invite-error" className="auth-error" role="alert">{errors.invite}</p>}</div>}
 <PasswordField id="auth-password" label="密码" value={password} onChange={e=>setPassword(e.target.value)} visible={visible} onToggle={()=>setVisible(v=>!v)} error={errors.password} hint={register?'至少 8 位，最多 72 字节':undefined}/>
 {register&&<PasswordField id="auth-confirm" label="确认密码" value={confirm} onChange={e=>setConfirm(e.target.value)} visible={confirmVisible} onToggle={()=>setConfirmVisible(v=>!v)} error={errors.confirm}/>}
 <button className="auth-submit" type="submit" disabled={busy}><span>{busy?'提交中…':register?'提交注册申请':'登录'}</span>{!busy&&<svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 12h16m-6-6 6 6-6 6"/></svg>}</button>
 {notice&&<p className="auth-feedback" role="status">{notice}</p>}
 </form>{!admin&&<p className="auth-switch">{register?'已有账号？':'还没有账号？'}<a href={`/${register?'login':'register'}`} onClick={e=>{clearPasswords();onNavigate(e,register?'/login':'/register')}}>{register?'立即登录':'注册账号'}</a></p>}</>

}
export default function AuthScreens({admin:initialAdmin=false,register:initialRegister=false}) {
 const [page,setPage]=useState({admin:initialAdmin,register:initialRegister})
 const heading=useRef(null)
 const {admin,register}=page
 const submitted=!admin&&register&&new URLSearchParams(location.search).get('submitted')==='1'
 const adminRequest=admin&&register
 useEffect(()=>{
   const sync=()=>setPage({admin:location.pathname.startsWith('/admin/'),register:location.pathname.endsWith('/register')})
   window.addEventListener('popstate',sync)
   return()=>window.removeEventListener('popstate',sync)
 },[])
 function navigate(event,path){
   if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return
   event.preventDefault()
   history.pushState(null,'',path)
   setPage({admin:path.startsWith('/admin/'),register:path.endsWith('/register')})
   requestAnimationFrame(()=>heading.current?.focus({preventScroll:true}))
 }
 const title=submitted?'申请已提交':adminRequest?'管理员账号开通':admin?'管理员登录':register?'注册账号':'登录'
 return <div className={`auth-app residential-auth ${register?'auth-registration':''}`}>
   <ResidentialScene/>
   <div className="auth-stage">
     <main className="auth-main" aria-labelledby="auth-title" key={`${admin}-${register}-${submitted}`}>
       <h1 id="auth-title" ref={heading} tabIndex={-1}>{title}</h1>
       {(submitted||adminRequest)&&<p className="auth-intro">{submitted?'管理员审核通过后，即可使用该账号登录。':'请联系现有管理员，在账号管理中开通。'}</p>}
       {submitted?<a className="auth-submit auth-status-link" href="/login" onClick={e=>navigate(e,'/login')}>前往登录</a>:adminRequest?<a className="auth-submit auth-status-link" href="/admin/login" onClick={e=>navigate(e,'/admin/login')}>返回管理员登录</a>:<AuthForm {...{admin,register}} onNavigate={navigate}/>}
     </main>
   </div>
 </div>
}
