import { useEffect, useRef, useState } from 'react'
import AdminHeader from './AdminHeader.jsx'
import './admin.css'
import './models.css'
import './settings.css'

async function request(url, options) {
 const response = await fetch(url, options)
 const data = await response.json().catch(() => { throw new Error('设置服务暂不可用，请稍后重试') })
 if (response.status === 401) { window.location.replace('/login'); throw new Error('请重新登录') }
 if (!response.ok) throw new Error(data.error || '保存失败，请重试')
 return data
}
function ProfileForm({ user, onSaved, onCancel }) {
 const [name, setName] = useState(user.name), [busy, setBusy] = useState(false), [feedback, setFeedback] = useState(null)
 async function save(event) {
  event.preventDefault()
  if (busy) return
  setBusy(true); setFeedback(null)
  try {
   const data = await request('/api/account/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim() }) })
   onSaved(data.user); window.dispatchEvent(new Event('account-profile-updated')); setName(data.user.name); setFeedback({ ok: true, text: '个人资料已保存' })
  } catch (e) { setFeedback({ ok: false, text: e.message }) }
  finally { setBusy(false) }
 }
 return <form className="system-form" onSubmit={save}>
  <div className="system-identity"><span className="system-avatar" aria-hidden="true">{user.name.slice(0, 1)}</span><div><strong>{user.phone}</strong></div></div>
  <label htmlFor="settings-name">显示名称</label>
  <input id="settings-name" name="name" value={name} onChange={e => { setName(e.target.value); setFeedback(null) }} autoComplete="nickname" required maxLength={24} disabled={busy}/>
  <div className="system-form-actions"><button className="admin-primary" disabled={busy || !name.trim() || name.trim() === user.name}>{busy ? '保存中…' : '确认保存'}</button><button type="button" className="system-cancel" disabled={busy} onClick={onCancel}>取消</button>{feedback && <p className={`system-feedback ${feedback.ok ? 'success' : 'error'}`} role={feedback.ok ? 'status' : 'alert'}>{feedback.text}</p>}</div>
 </form>
}
function PasswordForm({ onCancel }) {
 const [current, setCurrent] = useState(''), [password, setPassword] = useState(''), [confirm, setConfirm] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('')
 const form = useRef(null)
 useEffect(() => {
  const clear = () => { setCurrent(''); setPassword(''); setConfirm('') }
  window.addEventListener('pagehide', clear)
  return () => window.removeEventListener('pagehide', clear)
 }, [])
 async function save(event) {
  event.preventDefault()
  if (busy) return
  setError('')
  if (password.length < 8 || new TextEncoder().encode(password).length > 72) { setError('新密码至少 8 位，长度不能超过 72 字节'); form.current.elements.newPassword.focus(); return }
  if (password !== confirm) { setError('两次输入的新密码不一致'); form.current.elements.confirmPassword.focus(); return }
  if (current === password) { setError('新密码不能与当前密码相同'); return }
  setBusy(true)
  try {
   await request('/api/account/password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword: current, newPassword: password, confirmPassword: confirm }) })
   setCurrent(''); setPassword(''); setConfirm('')
   window.location.replace('/login?passwordChanged=1')
  } catch (e) { setError(e.message); setCurrent(''); setPassword(''); setConfirm('') }
  finally { setBusy(false) }
 }
 return <form ref={form} className="system-form system-password-form" onSubmit={save}>
  <label htmlFor="settings-current-password">当前密码</label><input id="settings-current-password" name="currentPassword" type="password" autoComplete="current-password" value={current} onChange={e => setCurrent(e.target.value)} required maxLength={72} disabled={busy}/>
  <label htmlFor="settings-new-password">新密码</label><input id="settings-new-password" name="newPassword" type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} maxLength={72} disabled={busy} aria-describedby="settings-password-hint"/>
  <small id="settings-password-hint">至少 8 位，建议组合字母、数字和符号。</small>
  <label htmlFor="settings-confirm-password">确认新密码</label><input id="settings-confirm-password" name="confirmPassword" type="password" autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} required minLength={8} maxLength={72} disabled={busy}/>
  {error && <p className="system-feedback error" role="alert">{error}</p>}
  <div className="system-form-actions"><button className="admin-primary" disabled={busy}>{busy ? '正在修改…' : '确认修改'}</button><button type="button" className="system-cancel" disabled={busy} onClick={onCancel}>取消</button></div>
 </form>
}
export default function SystemSettings() {
 const [data, setData] = useState(null), [error, setError] = useState(''), [revision, setRevision] = useState(0), [editingPassword, setEditingPassword] = useState(false)
 const [editingProfile, setEditingProfile] = useState(false)
 const profileButton = useRef(null), profileDialog = useRef(null)
 const passwordButton = useRef(null), passwordDialog = useRef(null)
 useEffect(() => { if (editingProfile) profileDialog.current?.showModal() }, [editingProfile])
 useEffect(() => { if (editingPassword) passwordDialog.current?.showModal() }, [editingPassword])
 useEffect(() => {
  let live = true
  setError('')
  request('/api/account/settings').then(result => { if (live) setData(result) }).catch(e => { if (live) setError(e.message) })
  return () => { live = false }
 }, [revision])
 const closeProfile = () => { setEditingProfile(false); profileButton.current?.focus() }
 const closePassword = () => { setEditingPassword(false); passwordButton.current?.focus() }
 return <div className="admin-app system-app">{location.pathname.startsWith('/admin')?<AdminHeader active="settings"/>:<header className="system-user-header"><a href="/">← 返回工作台</a><strong>家居风水</strong></header>}<main className="admin-main system-main">
  <div className="admin-title"><div><h2>系统设置</h2></div></div>
  {error && <p className="system-feedback error" role="alert">{error}<button onClick={() => setRevision(v => v + 1)}>重新加载</button></p>}
  {!data && !error && <p role="status" className="system-loading">正在读取设置…</p>}
  {data && <><div className="system-sections">
   <section className="system-section system-profile-card" aria-labelledby="settings-profile-title"><div className="system-section-heading"><h3 id="settings-profile-title">账户资料</h3></div><div className="system-setting-row system-profile-summary"><div className="system-identity"><span className="system-avatar" aria-hidden="true">{data.user.name.slice(0, 1)}</span><div><strong>{data.user.name}</strong><small>{data.user.phone}</small></div></div><button ref={profileButton} className="admin-secondary" type="button" aria-haspopup="dialog" onClick={() => setEditingProfile(true)}>修改信息</button></div></section>
   <section className="system-section system-security-card" aria-labelledby="settings-security-title"><div className="system-section-heading"><h3 id="settings-security-title">账号安全</h3></div><div className="system-security"><div className="system-setting-row"><div><strong>登录密码</strong></div><button ref={passwordButton} className="admin-secondary" type="button" aria-haspopup="dialog" onClick={() => setEditingPassword(true)}>修改密码</button></div></div></section>
   <section className="system-section system-about-card" aria-labelledby="settings-about-title"><div className="system-section-heading"><h3 id="settings-about-title">关于软件</h3></div><dl className="system-about"><div><dt>软件名称</dt><dd>{data.software.name}</dd></div><div><dt>当前版本</dt><dd><span className="system-version">v{data.software.version}</span></dd></div><div><dt>界面语言</dt><dd>{data.software.language}</dd></div></dl></section>
  </div></>}
 </main>
  {editingProfile && data && <dialog ref={profileDialog} className="system-password-dialog system-profile-dialog" aria-labelledby="profile-dialog-title" onCancel={event => { event.preventDefault(); closeProfile() }}>
   <div className="system-password-dialog-heading"><h2 id="profile-dialog-title">修改信息</h2><button type="button" aria-label="关闭修改信息" onClick={closeProfile}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div>
   <ProfileForm user={data.user} onCancel={closeProfile} onSaved={user => { setData(value => ({ ...value, user })); closeProfile() }}/>
  </dialog>}
  {editingPassword && <dialog ref={passwordDialog} className="system-password-dialog" aria-labelledby="password-dialog-title" onCancel={event => { event.preventDefault(); closePassword() }} onClick={event => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closePassword() } }}>
   <div className="system-password-dialog-heading"><h2 id="password-dialog-title">修改密码</h2><button type="button" aria-label="关闭修改密码" onClick={closePassword}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div>
   <PasswordForm onCancel={closePassword}/>
  </dialog>}
 </div>
}
