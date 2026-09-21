import { useEffect, useState } from 'react'
import AdminHeader, { AdminIcon } from './AdminHeader.jsx'
import { adminRequest, dateTime, eventNames } from './api.js'
import './admin.css'
import './overview.css'
export default function AdminEvents() {
 const [data, setData] = useState(null), [search, setSearch] = useState(''), [query, setQuery] = useState(''), [page, setPage] = useState(1), [revision, setRevision] = useState(0), [loading, setLoading] = useState(true), [error, setError] = useState('')
 useEffect(() => { const timer = setTimeout(() => { setQuery(search); setPage(1) }, 250); return () => clearTimeout(timer) }, [search])
 useEffect(() => {
  const controller = new AbortController(); setError(''); setLoading(true)
  adminRequest(`/admin/events?${new URLSearchParams({ q: query, page })}`, { signal: controller.signal }).then(value => { if (!controller.signal.aborted) setData(value) }).catch(e => { if (!controller.signal.aborted) setError(e.message) }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
  return () => controller.abort()
 }, [query, page, revision])
 return <div className="admin-app"><AdminHeader active="events"/><main className="admin-main">
  <div className="admin-title"><div><h2>操作日志</h2><p>追溯账号、权限和模型配置的变更。</p></div><button className="admin-secondary" disabled={loading} onClick={() => setRevision(v => v + 1)}>{loading ? '读取中…' : '刷新记录'}</button></div>
  <section className="admin-list-card"><div className="event-filters"><div className="account-search"><AdminIcon name="events"/><input aria-label="搜索操作人或对象" placeholder="搜索操作人或对象" maxLength={64} value={search} onChange={e => setSearch(e.target.value)}/></div></div>
   {error ? <div className="admin-inline-error" role="alert">{error}<button onClick={() => setRevision(v => v + 1)}>重新加载</button></div> : <table className="account-table event-table"><thead><tr>{['时间', '操作人', '操作', '对象', '结果'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{data?.records.map(event => <tr key={event.id}><td data-label="时间">{dateTime(event.created_at)}</td><td data-label="操作人"><div><strong>{event.actor_name}</strong><small>{event.actor_login}</small></div></td><td data-label="操作">{eventNames[event.action] || event.action}</td><td data-label="对象">{event.target}</td><td data-label="结果"><span className={`account-status ${event.result === 'success' ? 'enabled' : 'disabled'}`}>{event.result === 'success' ? '完成' : '未完成'}</span></td></tr>)}</tbody></table>}
   {!error && !data?.records.length && <div className="admin-empty"><AdminIcon name="events"/><h3>{loading ? '正在读取日志…' : query ? '没有匹配的记录' : '暂无操作记录'}</h3><p>{query ? '试试其他账号、姓名或操作对象。' : '新的账号和模型配置操作会自动记录。'}</p></div>}
   <div className="admin-pagination"><span>共 {data?.total ?? 0} 条记录</span><div><button aria-label="上一页" disabled={loading || !data || data.page <= 1} onClick={() => setPage(data.page - 1)}>‹</button><span>{data?.page || 1} / {data?.pages || 1}</span><button aria-label="下一页" disabled={loading || !data || data.page >= data.pages} onClick={() => setPage(data.page + 1)}>›</button></div></div>
  </section>
 </main></div>
}
