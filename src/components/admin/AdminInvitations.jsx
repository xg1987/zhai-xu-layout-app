import { useEffect, useRef, useState } from 'react'
import AdminHeader, { AdminIcon } from './AdminHeader.jsx'
import { adminRequest, dateTime } from './api.js'
import './admin.css'
import './invitations.css'
const labels = { active: '可使用', disabled: '已停用', expired: '已到期', exhausted: '已用完' }
export default function AdminInvitations() {
 const [data, setData] = useState(null), [revision, setRevision] = useState(0), [page, setPage] = useState(1), [loading, setLoading] = useState(true), [error, setError] = useState(''), [creating, setCreating] = useState(() => new URLSearchParams(location.search).get('create') === '1'), [busy, setBusy] = useState(null)
 useEffect(() => {
  const controller = new AbortController(); setLoading(true); setError('')
  adminRequest(`/admin/invitations?page=${page}`, { signal: controller.signal }).then(result => { if (!controller.signal.aborted) setData(result) }).catch(e => { if (!controller.signal.aborted) setError(e.message) }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
  return () => controller.abort()
 }, [revision, page])
 async function toggle(row) {
  setBusy(row.id); setError('')
  try { await adminRequest(`/admin/invitations/${row.id}`, { method: 'PATCH', body: JSON.stringify({ enabled: !row.enabled }) }); setRevision(v => v + 1) }
  catch (e) { setError(e.message) } finally { setBusy(null) }
 }
 return <div className="admin-app"><AdminHeader active="invitations"/><main className="admin-main">
  <div className="admin-title"><div><h2>邀请码</h2><p>邀请用户注册，审核通过后开放使用。</p></div><button className="admin-primary" onClick={() => setCreating(true)}>＋ 创建邀请码</button></div>
  <div className="invitation-flow" aria-label="注册流程"><span>邀请码注册</span><i>→</i><span>管理员审核</span><i>→</i><span>开通账号</span><a href="/admin?approval=pending">查看待审核 →</a></div>
  <section className="admin-list-card">
   {error && <div className="admin-inline-error" role="alert">{error}<button onClick={() => setRevision(v => v + 1)}>重试</button></div>}
   <table className="account-table invitation-table"><thead><tr>{['名称', '使用情况', '到期时间', '状态', '操作'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{data?.records.map(row => <tr key={row.id}><td data-label="名称"><div><strong>{row.name}</strong><small>尾号 {row.hint}</small></div></td><td data-label="使用情况">{row.uses} / {row.maxUses}</td><td data-label="到期时间">{dateTime(row.expiresAt)}</td><td data-label="状态"><span className={`account-status ${row.state === 'active' ? 'enabled' : 'disabled'}`}>{labels[row.state]}</span></td><td data-label="操作"><button className="invitation-toggle" disabled={busy !== null || row.state === 'expired' || row.state === 'exhausted'} onClick={() => toggle(row)}>{busy === row.id ? '处理中…' : row.enabled ? '停用' : '启用'}</button></td></tr>)}</tbody></table>
   {!data?.records.length && <div className="admin-empty"><AdminIcon name="invitations"/><h3>{loading ? '正在读取邀请码…' : '还没有邀请码'}</h3><p>创建后，将邀请码交给需要注册的用户。</p></div>}
   <div className="admin-pagination"><span>共 {data?.total ?? 0} 个邀请码</span><div><button aria-label="上一页" disabled={loading || !data || data.page <= 1} onClick={() => setPage(data.page - 1)}>‹</button><span>{data?.page || 1} / {data?.pages || 1}</span><button aria-label="下一页" disabled={loading || !data || data.page >= data.pages} onClick={() => setPage(data.page + 1)}>›</button></div></div>
  </section>
  {creating && <InvitationDrawer onClose={() => setCreating(false)} onCreated={() => setRevision(v => v + 1)}/>}
 </main></div>
}
function InvitationDrawer({ onClose, onCreated }) {
 const dialog = useRef(null), [name, setName] = useState(''), [maxUses, setMaxUses] = useState(1), [days, setDays] = useState(7), [result, setResult] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [copied, setCopied] = useState('')
 useEffect(() => { if (!copied) return; const timer = setTimeout(() => setCopied(''), 3500); return () => clearTimeout(timer) }, [copied])
 useEffect(() => { const element = dialog.current; element.showModal(); return () => element.close() }, [])
 async function create(e) {
  e.preventDefault(); if (busy) return; setBusy(true); setError('')
  try { const data = await adminRequest('/admin/invitations', { method: 'POST', body: JSON.stringify({ name, maxUses: Number(maxUses), expiresInDays: Number(days) }) }); setResult(data); onCreated() }
  catch (e) { setError(e.message) } finally { setBusy(false) }
 }
 async function copy(link) {
  const value = link ? `${window.location.origin}/register?invite=${encodeURIComponent(result.code)}` : result.code
  try { await navigator.clipboard.writeText(value); setCopied(link ? '注册链接已复制' : '邀请码已复制') } catch { setCopied('无法自动复制，请选中邀请码复制') }
 }
 return <dialog ref={dialog} className="admin-drawer" aria-labelledby="invitation-title" onCancel={e => { e.preventDefault(); if (!busy) onClose() }}><div className="drawer-inner"><div className="drawer-heading"><div><span className="drawer-kicker">邀请注册</span><h2 id="invitation-title">{result ? '邀请码已创建' : '创建邀请码'}</h2></div><button className="drawer-close" aria-label="关闭邀请码面板" disabled={busy} onClick={onClose}>×</button></div>
  {result ? <div className="invitation-created"><p>{result.invitation.name}</p><label htmlFor="created-invitation">邀请码</label><input id="created-invitation" readOnly value={result.code}/><small>完整邀请码仅在此处显示，请复制保存。</small><dl className="account-details"><div><dt>可注册人数</dt><dd>{result.invitation.maxUses} 人</dd></div><div><dt>到期时间</dt><dd>{dateTime(result.invitation.expiresAt)}</dd></div></dl><div className="invitation-copy-actions"><button className={`admin-primary ${copied === '邀请码已复制' ? 'copy-complete' : ''}`} onClick={() => copy(false)}>{copied === '邀请码已复制' ? '✓ 已复制' : '复制邀请码'}</button><button className="admin-secondary" onClick={() => copy(true)}>{copied === '注册链接已复制' ? '✓ 链接已复制' : '复制注册链接'}</button></div>{copied && <p className="invitation-copy-notice" role="status">{copied}</p>}<div className="drawer-actions"><button className="admin-secondary" onClick={onClose}>完成</button></div></div> : <form className="admin-form" onSubmit={create}><label htmlFor="invite-name">名称</label><input id="invite-name" autoFocus required maxLength={40} value={name} onChange={e => setName(e.target.value)} placeholder="例如 第一批客户" disabled={busy}/><label htmlFor="invite-uses">可注册人数</label><input id="invite-uses" type="number" min={1} max={1000} required value={maxUses} onChange={e => setMaxUses(e.target.value)} disabled={busy}/><small>每提交一份注册申请，使用次数计为一次。</small><label htmlFor="invite-days">有效期</label><select id="invite-days" value={days} onChange={e => setDays(e.target.value)} disabled={busy}><option value={1}>1 天</option><option value={7}>7 天</option><option value={30}>30 天</option><option value={90}>90 天</option></select>{error && <p role="alert" className="admin-error">{error}</p>}<div className="drawer-actions"><button className="admin-secondary" type="button" disabled={busy} onClick={onClose}>取消</button><button className="admin-primary" disabled={busy}>{busy ? '创建中…' : '创建邀请码'}</button></div></form>}
 </div></dialog>
}
