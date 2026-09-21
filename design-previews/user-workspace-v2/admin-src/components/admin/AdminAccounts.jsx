import { useEffect, useState } from 'react'
import AdminHeader, { AdminIcon } from './AdminHeader.jsx'
import { useSession } from '../auth/SessionGate.jsx'
import { AccountDrawer } from './AccountDrawer.jsx'
import { adminRequest, dateTime } from './api.js'
import './admin.css'
import './invitations.css'

export default function AdminAccounts() {
 const user = useSession()
 const [selectedId, setSelectedId] = useState(undefined)
 const [data, setData] = useState(null), [search, setSearch] = useState(''), [query, setQuery] = useState(''), [approval, setApproval] = useState(() => new URLSearchParams(location.search).get('approval') === 'pending' ? 'pending' : ''), [role, setRole] = useState(''), [status, setStatus] = useState(''), [page, setPage] = useState(1), [revision, setRevision] = useState(0)
 const [error, setError] = useState(''), [loading, setLoading] = useState(true), [drawer, setDrawer] = useState(null), [confirm, setConfirm] = useState(null), [busy, setBusy] = useState(false), [notice, setNotice] = useState('')
 useEffect(() => { const timer = setTimeout(() => { setQuery(search); setPage(1) }, 250); return () => clearTimeout(timer) }, [search])
 useEffect(() => {
  const controller = new AbortController(); setLoading(true); setError('')
  adminRequest(`/admin/accounts?${new URLSearchParams({ q: query, role, status, approval, page })}`, { signal: controller.signal }).then(result => { if (!controller.signal.aborted) setData(result) }).catch(e => { if (!controller.signal.aborted) setError(e.message) }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
  return () => controller.abort()
 }, [query, role, status, approval, page, revision])
 useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 4500); return () => clearTimeout(timer) }, [notice])
 const saved = message => { setDrawer(null); setConfirm(null); setNotice(message); setSelectedId(undefined); setRevision(v => v + 1) }
 async function toggle() {
  setBusy(true); setError('')
  try { await adminRequest(`/admin/accounts/${confirm.id}`, { method: 'PATCH', body: JSON.stringify({ ...confirm, status: confirm.status === 'enabled' ? 'disabled' : 'enabled' }) }); saved(confirm.status === 'enabled' ? '账号已停用，登录状态已撤销' : '账号已启用') }
  catch (e) { setError(e.message); setConfirm(null) } finally { setBusy(false) }
 }
 const summary = data?.summary
 const selected = selectedId === null ? null : data?.records.find(row => row.id === selectedId) || (selectedId === undefined ? data?.records.find(row => row.approval === 'pending') || data?.records[0] : null)
 return <div className="admin-app accounts-app"><AdminHeader/><main className="admin-main">
  <div className="accounts-hero">
   <div className="admin-title"><div><h2>账号管理</h2><p>用户与注册申请</p></div><a className="admin-primary" href="/admin/invitations?create=1">＋ 创建邀请码</a></div>
   <div className="account-summary" aria-label="账号统计">{[['全部账号', summary?.total, 'accounts'], ['待审核', summary?.pending, 'clock'], ['已启用', summary?.enabled, 'check']].map(([label, value, icon]) => <div key={label}><span className={`summary-icon ${icon}`}>{icon === 'accounts' ? <AdminIcon name="accounts"/> : icon === 'clock' ? <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="currentColor"/><path d="M12 5v7l4 3" stroke="white" strokeWidth="1.8" strokeLinecap="round"/></svg> : <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="currentColor"/><path d="m7 12 3 3 7-7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}</span><div><strong>{value ?? '—'}</strong><span>{label}</span></div></div>)}</div>
   <div className="invitation-sculpture" aria-hidden="true"><img src="/assets/admin-invitation-glass.png" alt=""/><span>邀请码</span></div>
  </div>
  <div className={`account-workspace ${selected && !drawer ? 'with-inspector' : ''}`}>
  <section className="admin-list-card" aria-label="系统账号">
  <div className="account-toolbar">
  <div className="account-tabs" role="group" aria-label="账号分类">{[['', '全部账号'], ['pending', '待审核'], ['rejected', '未通过']].map(([value, label]) => <button key={value} aria-pressed={approval === value} onClick={() => { setApproval(value); setStatus(''); setPage(1) }}>{label}{value === 'pending' && <em>{summary?.pending ?? 0}</em>}</button>)}</div>
   <div className="account-filters"><div className="account-search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></svg><input aria-label="搜索账号或姓名" placeholder="搜索账号或姓名" maxLength={64} value={search} onChange={e => setSearch(e.target.value)}/></div></div></div><details className="account-filter-options"><summary>筛选与管理</summary><div className="account-filter-controls"><select aria-label="筛选角色" value={role} onChange={e => { setRole(e.target.value); setPage(1) }}><option value="">全部角色</option><option value="user">普通用户</option><option value="admin">管理员</option></select><select aria-label="筛选状态" value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}><option value="">全部状态</option><option value="enabled">启用</option><option value="disabled">停用</option></select><button className="admin-refresh" aria-label="刷新账号列表" disabled={loading} onClick={() => setRevision(v => v + 1)}>↻</button><button className="admin-secondary" onClick={() => setDrawer({ mode: 'create' })}>新建账号</button></div></details>
   {error && <div className="admin-inline-error" role="alert">{error}<button onClick={() => setRevision(v => v + 1)}>重新加载</button></div>}
   {!error && <div className="account-table-frame" aria-busy={loading}>
    <table className="account-table"><thead><tr>{['用户', '状态', '注册时间', '操作'].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{data?.records.map(record => <tr key={record.id} className={selected?.id === record.id ? 'is-selected' : ''}>
     <td data-label="账号"><button className="account-cell" aria-label={`查看 ${record.name}`} aria-pressed={selected?.id === record.id} onClick={() => setSelectedId(record.id)}><span className="table-avatar" aria-hidden="true">{record.name.slice(0, 1)}</span><div><strong>{record.name}{record.id === user.id && <em>我</em>}</strong><small>{record.login}</small></div></button></td>
     <td data-label="状态"><span className={`account-status ${record.approval === 'approved' ? record.status : record.approval}`}>{record.approval === 'pending' ? '待审核' : record.approval === 'rejected' ? '未通过' : record.status === 'enabled' ? '已启用' : '已停用'}</span></td><td data-label="注册时间" className="account-date">{dateTime(record.createdAt).split(' ')[0]}</td>
     <td data-label="操作"><div className="account-row-actions"><button aria-label={`查看 ${record.name} 的操作`} onClick={() => setSelectedId(record.id)}>···</button></div></td>
    </tr>)}</tbody></table>
    {!data?.records.length && <div className="admin-empty"><AdminIcon name="accounts"/><h3>{loading ? '正在读取账号…' : approval === 'pending' && !query ? '暂无待审核申请' : '没有匹配的账号'}</h3>{!loading && <><p>{approval === 'pending' ? '新的注册申请会显示在这里。' : '调整搜索条件，或新建一个账号。'}</p>{(query || role || status) && <button onClick={() => { setSearch(''); setRole(''); setStatus(''); setPage(1) }}>清除筛选</button>}</>}</div>}
   </div>}
   <div className="admin-pagination"><span>{loading ? '正在读取…' : `共 ${data?.total ?? 0} 个账号`}</span><div><button aria-label="上一页" disabled={loading || !data || data.page <= 1} onClick={() => setPage(data.page - 1)}>‹</button><span>{data?.page || 1} / {data?.pages || 1}</span><button aria-label="下一页" disabled={loading || !data || data.page >= data.pages} onClick={() => setPage(data.page + 1)}>›</button></div></div>
  </section>
  {selected && !drawer && <AccountDrawer key={`${selected.id}-${selected.revision}`} inline record={selected} initialMode={selected.approval === 'pending' ? 'review' : 'detail'} currentUserId={user.id} onToggle={() => setConfirm(selected)} onClose={() => setSelectedId(null)} onSaved={saved}/>}
  </div>
  {notice && <div className="admin-toast" role="status">{notice}</div>}
  {drawer && <AccountDrawer record={drawer.record} initialMode={drawer.mode} currentUserId={user.id} onClose={() => setDrawer(null)} onSaved={saved}/>}
  {confirm && <StatusConfirmation record={confirm} busy={busy} onClose={() => setConfirm(null)} onConfirm={toggle}/>}
 </main></div>
}
function StatusConfirmation({ record, busy, onClose, onConfirm }) {
 const [dialog, setDialog] = useState(null)
 useEffect(() => { if (dialog && !dialog.open) dialog.showModal() }, [dialog])
 return <dialog ref={setDialog} className="admin-confirm" aria-labelledby="status-confirm-title" onCancel={e => { e.preventDefault(); if (!busy) onClose() }}><h2 id="status-confirm-title">{record.status === 'enabled' ? '停用' : '启用'}账号</h2><p>{record.name}（{record.login}）{record.status === 'enabled' ? '将无法登录，现有登录状态会立即失效。' : '将恢复登录和使用权限。'}</p><div><button className="admin-secondary" disabled={busy} onClick={onClose}>取消</button><button className="admin-primary" disabled={busy} onClick={onConfirm}>{busy ? '处理中…' : '确认'}</button></div></dialog>
}
