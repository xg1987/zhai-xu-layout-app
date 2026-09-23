import { useEffect, useRef, useState } from 'react'
import { adminRequest, dateTime } from './api.js'
export const roleLabel = role => role === 'admin' ? '管理员' : '普通用户'
export const statusLabel = status => status === 'enabled' ? '启用' : '停用'
export const accountDate = value => dateTime(value)
export function AccountDrawer({ record, initialMode, currentUserId, onClose, onSaved, onToggle, inline = false }) {
 const dialog = useRef(null)
 const [mode, setMode] = useState(initialMode), [draft, setDraft] = useState(record || { login: '', name: '', role: 'user', status: 'enabled' }), [password, setPassword] = useState(''), [confirm, setConfirm] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [reason, setReason] = useState('')
 const reviewing = mode === 'review', readOnly = mode === 'detail' || reviewing, resetting = mode === 'password', self = record?.id === currentUserId
 useEffect(() => {
  if (inline) return
  const element = dialog.current, previous = document.activeElement, overflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'; element.showModal()
  const clear = () => { setPassword(''); setConfirm('') }; window.addEventListener('pagehide', clear)
  return () => { element.close(); document.body.style.overflow = overflow; previous?.focus(); window.removeEventListener('pagehide', clear) }
 }, [inline])
 async function save(event) {
  event.preventDefault(); if (busy) return; setBusy(true); setError('')
  try {
   if (resetting) await adminRequest(`/admin/accounts/${record.id}/password`, { method: 'POST', body: JSON.stringify({ password, confirmPassword: confirm }) })
   else await adminRequest(record ? `/admin/accounts/${record.id}` : '/admin/accounts', { method: record ? 'PATCH' : 'POST', body: JSON.stringify({ ...draft, ...(!record ? { password, confirmPassword: confirm } : {}) }) })
   if (self) window.dispatchEvent(new Event('account-profile-updated'))
   setPassword(''); setConfirm(''); onSaved(resetting ? '密码已重置，该账号需重新登录' : record ? '账号信息已保存' : '账号已创建')
  } catch (e) { setError(e.message) } finally { setBusy(false) }
 }
 async function review(decision) {
  if (busy) return; setBusy(true); setError('')
  try { await adminRequest(`/admin/accounts/${record.id}/review`, { method: 'POST', body: JSON.stringify({ decision, reason }) }); onSaved(decision === 'approved' ? '审核已通过，用户现在可以登录' : '注册申请已拒绝') }
  catch (e) { setError(e.message) } finally { setBusy(false) }
 }
 const title = reviewing ? '注册审核' : resetting ? '重置密码' : readOnly ? '账号详情' : record ? '编辑账号' : '新建账号'
 const Container = inline ? 'section' : 'dialog'
 return <Container ref={dialog} className={`admin-drawer${inline ? ' account-inspector' : ''}`} aria-labelledby="drawer-title" onCancel={e => { e.preventDefault(); if (!busy) onClose() }} onClick={e => { if (!inline && e.target === e.currentTarget && !busy) onClose() }}><div className="drawer-inner">
  <div className="drawer-heading"><div><h2 id="drawer-title">{title}</h2></div><button type="button" className="drawer-close" aria-label="关闭账号面板" disabled={busy} onClick={onClose}>×</button></div>
  <form className="admin-form" onSubmit={save}>
   {readOnly ? <><div className="drawer-profile"><span className="admin-avatar">{draft.name.slice(0, 1)}</span><div><strong>{draft.name}</strong><p>{draft.login}</p></div></div><dl className="account-details">{(reviewing ? [['邀请来源', draft.invitationId ? '邀请码注册' : '—'], ['注册时间', accountDate(draft.createdAt)]] : [['角色', roleLabel(draft.role)], ['状态', draft.approval === 'pending' ? '待审核' : draft.approval === 'rejected' ? '未通过' : statusLabel(draft.status)], ['创建时间', accountDate(draft.createdAt)], ['最近登录', dateTime(draft.lastLoginAt)]]).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>{!reviewing && draft.invitationId && <p className="drawer-note">邀请码编号 · {draft.invitationId}</p>}{draft.reviewNote && <p className="drawer-note">审核说明：{draft.reviewNote}</p>}{!self && draft.approval === 'approved' && onToggle && <button type="button" className="drawer-reset-password" onClick={onToggle}>{draft.status === 'enabled' ? '停用账号' : '启用账号'}<span>→</span></button>}{!self && draft.approval === 'approved' && <button type="button" className="drawer-reset-password" onClick={() => { setMode('password'); setError('') }}>重置登录密码 <span>→</span></button>}</> : <>
    {!resetting ? <><label htmlFor="admin-login">登录账号</label><input id="admin-login" autoFocus={!record} value={draft.login} maxLength={64} required readOnly={!!record} autoComplete="off" placeholder="例如 zhangsan" onChange={e => setDraft({ ...draft, login: e.target.value })}/><small>{record ? '登录账号创建后不可修改。' : '3–64 位字母、数字或 _ . @ + -'}</small>
     <label htmlFor="admin-name">姓名</label><input id="admin-name" autoFocus={!!record} value={draft.name} required maxLength={24} disabled={busy} placeholder="填写显示名称" onChange={e => setDraft({ ...draft, name: e.target.value })}/>
     <label htmlFor="admin-role">角色</label><select id="admin-role" disabled={busy || self} value={draft.role} onChange={e => setDraft({ ...draft, role: e.target.value })}><option value="user">普通用户</option><option value="admin">管理员</option></select>
     <label htmlFor="admin-status">状态</label><select id="admin-status" disabled={busy || self} value={draft.status} onChange={e => setDraft({ ...draft, status: e.target.value })}><option value="enabled">启用</option><option value="disabled">停用</option></select>{self && <small>自己的角色和状态受保护。</small>}
    </> : <p className="drawer-note">为 {record.name}（{record.login}）设置新密码。保存后，该账号在各设备的登录状态将失效。</p>}
    {(!record || resetting) && <><label htmlFor="admin-password">{resetting ? '新密码' : '初始密码'}</label><input id="admin-password" type="password" autoComplete="new-password" required minLength={8} maxLength={72} value={password} disabled={busy} onChange={e => setPassword(e.target.value)}/><small>至少 8 位，建议组合字母、数字与符号。</small><label htmlFor="admin-password-confirm">确认密码</label><input id="admin-password-confirm" type="password" autoComplete="new-password" required minLength={8} maxLength={72} value={confirm} disabled={busy} onChange={e => setConfirm(e.target.value)}/></>}
   </>}
   {reviewing && <div className="review-field"><label htmlFor="review-reason">审核备注</label><textarea id="review-reason" maxLength={200} value={reason} onChange={e => setReason(e.target.value)} disabled={busy} placeholder="填写审核说明"/><small>{reason.length}/200 · 拒绝时须填写原因</small></div>}
   {error && <p className="admin-error" role="alert">{error}</p>}
   <div className="drawer-actions">{!reviewing && <button type="button" className="admin-secondary" disabled={busy} onClick={onClose}>{readOnly ? '关闭' : '取消'}</button>}{reviewing ? <><button type="button" className="admin-secondary review-reject" disabled={busy} onClick={() => review('rejected')}>拒绝</button><button type="button" className="admin-primary" disabled={busy} onClick={() => review('approved')}>通过审核</button></> : readOnly ? (draft.approval === 'pending' ? <button type="button" className="admin-primary" onClick={() => setMode('review')}>审核申请</button> : draft.approval === 'approved' ? <button type="button" className="admin-primary" onClick={() => setMode('edit')}>编辑账号</button> : null) : <button type="submit" className="admin-primary" disabled={busy}>{busy ? '保存中…' : resetting ? '确认重置' : record ? '保存修改' : '创建账号'}</button>}</div>
  </form>
 </div></Container>
}
