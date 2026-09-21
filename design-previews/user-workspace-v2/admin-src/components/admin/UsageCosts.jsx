import { useEffect, useRef, useState } from 'react'
import AdminHeader from './AdminHeader.jsx'
import './admin.css'
import './models.css'
import './usage.css'

const modelName = record => ({ 'gemini-3.8-flash': 'Gemini 3.8 Flash', 'qwen3.7-plus': 'Qwen3.7-Plus', 'qwen3.8-max': 'Qwen3.8-Max' }[record.model] || record.model || record.provider)
const statusNames = { success: '成功', failed: '失败', interrupted: '已中断', running: '进行中' }
const number = value => value?.toLocaleString('zh-CN') ?? '—'
const money = value => value === null ? '待核对' : value > 0 && value < 0.000001 ? '< ¥0.000001' : `¥${value.toLocaleString('zh-CN', { minimumFractionDigits: value === 0 ? 2 : 6, maximumFractionDigits: 6 })}`
const time = value => new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })

function CostDetails({ record, onClose }) {
 const dialog = useRef(null)
 useEffect(() => { dialog.current.showModal() }, [])
 const { usage, price, fx } = record
 return <dialog ref={dialog} className="admin-drawer usage-drawer" onCancel={onClose} onClick={e => { if (e.target === e.currentTarget) onClose() }}><div className="drawer-inner">
  <div className="drawer-heading"><h2>调用明细</h2><button className="drawer-close" aria-label="关闭明细" onClick={onClose}>×</button></div>
  <div className="usage-detail-amount"><small>人民币费用 · 估算</small><strong>{money(record.cnyAmount)}</strong></div>
  <dl className="account-details">
   <div><dt>模型</dt><dd>{modelName(record)}</dd></div>
   <div><dt>调用账号</dt><dd>{record.account}</dd></div>
   <div><dt>时间</dt><dd>{time(record.startedAt)}</dd></div>
   <div><dt>用途 / 结果</dt><dd>{record.operation === 'test' ? '连接测试' : '图片识别'} / {statusNames[record.status]}</dd></div>
   <div><dt>输入 Token</dt><dd>{number(usage?.input)}</dd></div>
   <div><dt>其中缓存命中</dt><dd>{number(usage?.cached)}</dd></div>
   <div><dt>输出 Token</dt><dd>{number(usage?.output)}</dd></div>
   <div><dt>其中思考 Token</dt><dd>{number(usage?.thinking)}</dd></div>
   <div><dt>单价 / 百万 Token</dt><dd>{price.currency}<br/>输入 {price.input} · 缓存 {price.cached}<br/>输出 {price.output}</dd></div>
   {fx && <div><dt>美元兑换人民币</dt><dd>{fx.rate}<br/>{fx.date} · {fx.source}</dd></div>}
   {record.nativeAmount !== null && <div><dt>原币费用</dt><dd>{record.nativeAmount.toFixed(9)} {price.currency}</dd></div>}
  </dl>
  <div className="usage-basis"><p>{price.basis}。实际扣费以服务商账单为准。</p>{record.costState === 'usage_missing' && <p>服务商未返回完整用量，费用待核对。</p>}{record.costState === 'fx_missing' && <p>用量已保存，汇率恢复后自动换算。</p>}<a href={price.source} target="_blank" rel="noreferrer">官方计价依据 ↗</a><small>单价核对日期 {price.verifiedAt}</small></div>
  <div className="usage-request-id">请求 {record.requestId}<br/>第 {record.attempt} 次调用{record.attempt > 1 ? ' · 备用接替' : ''}</div>
 </div></dialog>
}

export default function UsageCosts() {
 const [provider, setProvider] = useState(''), [period, setPeriod] = useState('all'), [status, setStatus] = useState(''), [page, setPage] = useState(1)
 const [revision, setRevision] = useState(0), [data, setData] = useState(null), [error, setError] = useState(''), [loading, setLoading] = useState(true), [selected, setSelected] = useState(null)
 useEffect(() => {
  const controller = new AbortController()
  setLoading(true); setError('')
  const query = new URLSearchParams({ provider, period, status, page: String(page) })
  fetch(`/api/admin/vision/usage?${query}`, { signal: controller.signal }).then(async response => {
   const result = await response.json()
   if (!response.ok) throw new Error(result.error || '费用记录读取失败')
   if (!controller.signal.aborted) setData(result)
  }).catch(e => { if (!controller.signal.aborted) setError(e.message) }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
  return () => controller.abort()
 }, [provider, period, status, page, revision])
 const filter = setter => e => { setter(e.target.value); setPage(1) }
 const summary = data?.summary
 return <div className="admin-app usage-app"><AdminHeader active="usage"/><main className="admin-main usage-main">
  <div className="admin-title"><div><div className="models-eyebrow">识别服务</div><h2>用量费用</h2></div><button className="admin-secondary usage-refresh" disabled={loading} onClick={() => setRevision(v => v + 1)}>{loading ? '读取中…' : '刷新记录'}</button></div>
  <section className={`usage-summary ${loading ? 'loading' : ''}`} aria-label="费用汇总">
   <div><span>人民币费用 <small>估算</small></span><strong>{summary ? money(summary.cnyAmount) : '—'}</strong><p>当前筛选范围 · 已计费用{summary?.pending > 0 ? ` · ${summary.pending} 笔待核对` : ''}</p></div>
   <div><span>模型调用</span><strong>{number(summary?.calls)}<em>次</em></strong><p>包含连接测试与备用调用</p></div>
   <div><span>调用成功</span><strong>{number(summary?.successful)}<em>次</em></strong><p>按服务商每次请求记录</p></div>
  </section>
  <div className="usage-toolbar"><h3>调用记录</h3><div className="usage-filters"><select aria-label="时间范围" value={period} onChange={filter(setPeriod)}><option value="all">全部时间</option><option value="today">今天</option><option value="month">本月</option></select><select aria-label="模型筛选" value={provider} onChange={filter(setProvider)}><option value="">全部模型</option><option value="gemini">Gemini</option><option value="qwen">千问</option></select><select aria-label="调用结果" value={status} onChange={filter(setStatus)}><option value="">全部结果</option><option value="success">成功</option><option value="failed">失败</option><option value="interrupted">已中断</option><option value="running">进行中</option></select></div></div>
  {error ? <p className="model-feedback error" role="alert">{error}<button onClick={() => setRevision(v => v + 1)}>重试</button></p> : <section className="usage-records" aria-busy={loading}>
   {data?.records.length ? <table className="usage-table"><thead><tr><th>时间 / 账号</th><th>模型 / 用途</th><th>输入 / 输出 Token</th><th>费用（元）· 估算</th><th>结果</th><th><span className="usage-sr-only">明细</span></th></tr></thead><tbody>{data.records.map(record => <tr key={record.id}>
    <td data-label="时间 / 账号"><div>{time(record.startedAt)}<small>{record.name ? `${record.name} · ` : ''}{record.account}</small></div></td>
    <td data-label="模型 / 用途"><div>{modelName(record)}<small>{record.operation === 'test' ? '连接测试' : '图片识别'}{record.attempt > 1 ? ' · 备用接替' : ''}</small></div></td>
    <td data-label="输入 / 输出"><div>{number(record.usage?.input)} / {number(record.usage?.output)}{record.usage?.cached > 0 && <small>缓存 {number(record.usage.cached)}</small>}</div></td>
    <td data-label="费用（元）" className="usage-cost">{money(record.cnyAmount)}</td><td data-label="结果"><span className={`usage-status ${record.status}`}>{statusNames[record.status]}</span></td><td><button className="usage-link" onClick={() => setSelected(record)} aria-label={`查看 ${record.account} ${time(record.startedAt)} 的调用明细`}>明细 ↗</button></td>
   </tr>)}</tbody></table> : <div className="usage-empty"><svg viewBox="0 0 40 40" aria-hidden="true"><rect x="9" y="5" width="22" height="30" rx="3"/><path d="M15 14h10M15 20h10M15 26h5"/></svg><h3>{loading ? '正在读取记录…' : '暂无调用记录'}</h3>{!loading && <p>模型调用后，费用明细将在这里显示。</p>}</div>}
   {data?.summary.calls > 0 && <div className="usage-pagination"><span>共 {data.summary.calls} 次调用{data.summary.pending > 0 ? ` · ${data.summary.pending} 笔费用待核对` : ''}</span><div><button aria-label="上一页" disabled={loading || data.page <= 1} onClick={() => setPage(data.page - 1)}>←</button><span>{data.page} / {data.pages}</span><button aria-label="下一页" disabled={loading || data.page >= data.pages} onClick={() => setPage(data.page + 1)}>→</button></div></div>}
  </section>}
 </main>{selected && <CostDetails record={selected} onClose={() => setSelected(null)}/>}</div>
}
