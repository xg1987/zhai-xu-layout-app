import { useEffect, useState } from 'react'
import AdminHeader, { AdminIcon } from './AdminHeader.jsx'
import { adminRequest, dateTime, eventNames } from './api.js'
import './admin.css'
import './overview.css'
import './invitations.css'
const statusNames = { empty: '未配置', untested: '待测试', ok: '连接正常', error: '连接异常' }
export default function AdminOverview() {
 const [data, setData] = useState(null), [error, setError] = useState(''), [revision, setRevision] = useState(0), [loading, setLoading] = useState(true)
 useEffect(() => {
  const controller = new AbortController(); setError(''); setLoading(true)
  adminRequest('/admin/overview', { signal: controller.signal }).then(value => { if (!controller.signal.aborted) setData(value) }).catch(e => { if (!controller.signal.aborted) setError(e.message) }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
  return () => controller.abort()
 }, [revision])
 const metrics = [ ['系统账号', data?.users.total, 'accounts', `${data?.users.enabled ?? '—'} 个启用中`, '/admin'], ['今日模型调用', data?.usage.calls, 'models', `${data?.usage.successful ?? '—'} 次成功`, '/admin/usage'], ['今日费用', data ? `¥${data.usage.cnyAmount.toFixed(data.usage.cnyAmount ? 6 : 2)}` : '—', 'usage', data?.usage.pending ? `${data.usage.pending} 笔费用待核对` : '人民币 · 估算', '/admin/usage'] ]
 return <div className="admin-app"><AdminHeader active="overview"/><main className="admin-main">
  <div className="admin-title"><div><h2>概览</h2><p>查看账号、识别服务与今天的使用情况。</p></div><button className="admin-secondary" disabled={loading} onClick={() => setRevision(v => v + 1)}>{loading ? '读取中…' : '刷新数据'}</button></div>
  {error && <div className="admin-inline-error" role="alert">{error}<button onClick={() => setRevision(v => v + 1)}>重试</button></div>}
  {data?.users.pending > 0 && <div className="overview-review-alert"><span>{data.users.pending} 个注册申请等待审核</span><a href="/admin?approval=pending">去审核 →</a></div>}
  <section className="overview-metrics" aria-label="系统数据">{metrics.map(([label, value, icon, caption, href]) => <a href={href} className="overview-metric" key={label}><div><span>{label}</span><AdminIcon name={icon}/></div><strong>{value ?? '—'}</strong><p>{caption}<span>↗</span></p></a>)}</section>
  <div className="overview-columns"><section className="overview-card"><div className="overview-card-title"><h3>识别服务</h3><a href="/admin/models">管理配置 →</a></div><div className="overview-providers">{data?.providers.map(provider => <div key={provider.id}><span className="provider-initial">{provider.id === 'gemini' ? 'G' : 'Q'}</span><div><strong>{provider.name}</strong><small>{provider.priority}</small></div><span className={`provider-state ${provider.checkState}`}>{statusNames[provider.checkState]}</span></div>)}</div>{data && !data.providers.some(p => p.configured) && <div className="overview-service-note"><p>配置识别模型后，即可使用图片识别。</p><a href="/admin/models">添加 API Key <span>→</span></a></div>}</section>
   <section className="overview-card"><div className="overview-card-title"><h3>最近操作</h3><a href="/admin/events">查看全部 →</a></div>{data?.events.length ? <ol className="overview-events">{data.events.map(event => <li key={event.id}><i/><div><strong>{eventNames[event.action] || event.action}<span>{event.result === 'failed' ? ' · 未完成' : ''}</span></strong><p>{event.actor_name} · {event.target}</p><time>{dateTime(event.created_at)}</time></div></li>)}</ol> : <div className="admin-empty"><AdminIcon name="events"/><h3>{loading ? '正在读取…' : '暂无操作记录'}</h3><p>账号和模型配置的操作将记录在这里。</p></div>}</section>
  </div>
 </main></div>
}
