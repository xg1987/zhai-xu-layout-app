import { calculateCost, normalizeUsage, priceSnapshot, VisionError } from './vision-core.js'

const DAY = 86400000
const parse = value => value ? JSON.parse(value) : null

export function createD1UsageStore(db, { fetchImpl = fetch, now = Date.now } = {}) {
  async function exchange(date) {
    const cached = await db.prepare('SELECT * FROM vision_fx WHERE requested_date=?').bind(date).first()
    if (cached && now() - Date.parse(cached.fetched_at) < 6 * 3600000) return parse(cached.rate_json)
    try {
      const response = await fetchImpl(`https://api.frankfurter.dev/v2/rate/USD/CNY?providers=ecb&date=${date}`, { signal: AbortSignal.timeout(4000), redirect: 'manual' })
      if (response.status >= 300 && response.status < 400) throw new Error('FX redirect blocked')
      if (!response.ok) throw new Error('FX unavailable')
      const value = await response.json()
      const age = Date.parse(date) - Date.parse(value.date)
      if (value.base !== 'USD' || value.quote !== 'CNY' || !Number.isFinite(value.rate) || value.rate <= 0 || value.rate > 100 || !Number.isFinite(age) || age < 0 || age > 7 * DAY) throw new Error('Invalid FX')
      const fx = { rate: value.rate, date: value.date, source: 'Frankfurter / ECB' }
      await db.prepare('INSERT INTO vision_fx(requested_date,rate_json,fetched_at) VALUES(?,?,?) ON CONFLICT(requested_date) DO UPDATE SET rate_json=excluded.rate_json,fetched_at=excluded.fetched_at').bind(date, JSON.stringify(fx), new Date(now()).toISOString()).run()
      return fx
    } catch { return cached ? parse(cached.rate_json) : null }
  }

  function serialize(row) {
    return { id: row.id, requestId: row.request_id, attempt: row.attempt, account: row.account, name: row.user_name, provider: row.provider, model: row.model, operation: row.operation, startedAt: row.started_at, finishedAt: row.finished_at, status: row.status, usage: parse(row.usage_json), price: parse(row.price_json), fx: parse(row.fx_json), nativeAmount: row.native_nano === null ? null : row.native_nano / 1e9, cnyAmount: row.cny_nano === null ? null : row.cny_nano / 1e9, costState: row.cost_state }
  }

  async function saveCost(row, usage, fx, status) {
    const cost = calculateCost(usage, parse(row.price_json), fx)
    const values = [usage ? JSON.stringify(usage) : null, JSON.stringify(cost.price), fx ? JSON.stringify(fx) : null, cost.nativeNano, cost.cnyNano, cost.costState]
    if (status) await db.prepare('UPDATE vision_usage SET usage_json=?,price_json=?,fx_json=?,native_nano=?,cny_nano=?,cost_state=?,status=?,finished_at=? WHERE id=?').bind(...values, status, new Date(now()).toISOString(), row.id).run()
    else await db.prepare('UPDATE vision_usage SET usage_json=?,price_json=?,fx_json=?,native_nano=?,cny_nano=?,cost_state=? WHERE id=?').bind(...values, row.id).run()
  }

  return {
    async begin({ requestId, attempt, user, provider, model, operation }) {
      const at = new Date(now()).toISOString(), id = crypto.randomUUID(), price = priceSnapshot(provider, at)
      const fx = price.currency === 'USD' ? await exchange(at.slice(0, 10)) : null
      await db.prepare('INSERT INTO vision_usage(id,request_id,attempt,user_id,account,user_name,provider,model,operation,started_at,price_json,fx_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind(id, requestId, attempt, user.id, user.phone || String(user.id), user.name || '', provider, model, operation, at, JSON.stringify(price), fx ? JSON.stringify(fx) : null).run()
      return { id, price_json: JSON.stringify(price), fx_json: fx ? JSON.stringify(fx) : null }
    },
    async finish(record, provider, data, status) {
      await saveCost(record, normalizeUsage(provider, data), parse(record.fx_json), status)
    },
    async finishNormalized(record, usage, status) {
      await saveCost(record, usage, parse(record.fx_json), status)
    },
    async reconcile() {
      const at = new Date(now()).toISOString()
      await db.prepare("UPDATE vision_usage SET status='interrupted',finished_at=? WHERE status='running' AND started_at<?").bind(at, new Date(now() - 5 * 60000).toISOString()).run()
      const pending = (await db.prepare("SELECT * FROM vision_usage WHERE cost_state='fx_missing' ORDER BY started_at DESC LIMIT 100").all()).results
      const dates = [...new Set(pending.map(row => row.started_at.slice(0, 10)))].slice(0, 5)
      const rates = new Map(await Promise.all(dates.map(async date => [date, await exchange(date)])))
      for (const row of pending) { const fx = rates.get(row.started_at.slice(0, 10)); if (fx) await saveCost(row, parse(row.usage_json), fx) }
    },
    async list(query = {}) {
      const clauses = [], args = []
      if (['gemini', 'qwen'].includes(query.provider)) { clauses.push('provider=?'); args.push(query.provider) }
      const current = new Date(now() + 8 * 3600000).toISOString()
      if (query.period === 'today' || query.period === 'month') {
        clauses.push('started_at>=?')
        args.push(new Date(`${query.period === 'today' ? current.slice(0, 10) : current.slice(0, 7) + '-01'}T00:00:00+08:00`).toISOString())
      }
      if (['success', 'failed', 'interrupted', 'running'].includes(query.status)) { clauses.push('status=?'); args.push(query.status) }
      const where = clauses.length ? ' WHERE ' + clauses.join(' AND ') : ''
      const summary = await db.prepare(`SELECT COUNT(*) AS calls, COALESCE(SUM(cny_nano),0) AS totalNano, COALESCE(SUM(cny_nano IS NULL),0) AS pending, COALESCE(SUM(status='success'),0) AS successful FROM vision_usage${where}`).bind(...args).first()
      const pageSize = 20, pages = Math.max(1, Math.ceil(summary.calls / pageSize)), requestedPage = Math.floor(Number(query.page) || 1), page = Math.min(pages, Math.max(1, Number.isFinite(requestedPage) ? requestedPage : 1))
      const rows = (await db.prepare(`SELECT * FROM vision_usage${where} ORDER BY started_at DESC,rowid DESC LIMIT ? OFFSET ?`).bind(...args, pageSize, (page - 1) * pageSize).all()).results
      return { records: rows.map(serialize), summary: { calls: summary.calls, cnyAmount: summary.totalNano / 1e9, pending: summary.pending, successful: summary.successful }, page, pages, pageSize }
    },
  }
}

export async function listVisionUsage(env, query = {}, options = {}) {
  if (!env.DB) throw new VisionError('数据库尚未绑定', 503)
  return createD1UsageStore(env.DB, options).list(query)
}
