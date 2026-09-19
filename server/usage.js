import crypto from 'node:crypto'

const DAY = 86400000
const FX_SOURCE = 'Frankfurter / ECB'
const count = value => Number.isSafeInteger(value) && value >= 0 && value <= 100000000
export const PRICE_SOURCES = {
 gemini: 'https://ai.google.dev/gemini-api/docs/pricing',
 qwen: 'https://help.aliyun.com/zh/model-studio/model-pricing',
}

// Only store allowlisted metering fields, never provider bodies, keys or image data.
export function normalizeUsage(provider, data) {
 const u = provider === 'gemini' ? data?.usageMetadata : data?.usage
 if (!u) return null
 const input = provider === 'gemini' ? u.promptTokenCount : u.prompt_tokens
 const thinking = provider === 'gemini' ? (u.thoughtsTokenCount ?? 0) : (u.completion_tokens_details?.reasoning_tokens ?? 0)
 const completion = provider === 'gemini' ? u.candidatesTokenCount : u.completion_tokens
 const cached = provider === 'gemini' ? (u.cachedContentTokenCount ?? 0) : (u.prompt_tokens_details?.cached_tokens ?? 0)
 if (![input, completion, thinking, cached].every(count) || cached > input) return null
 const output = provider === 'gemini' ? completion + thinking : completion
 if (thinking > output || (u.toolUsePromptTokenCount ?? 0) !== 0) return null
 // This adapter uses standard, synchronous inference only.
 if (provider === 'gemini' && u.serviceTier && !['standard', 'STANDARD'].includes(u.serviceTier)) return null
 return { input, cached, output, thinking, total: input + output }
}

export function priceSnapshot(provider, at = new Date().toISOString()) {
 const common = { verifiedAt: '2026-09-17', source: PRICE_SOURCES[provider], unit: '每百万 Token', basis: '公开标准价，未扣除免费额度、账户优惠和税费' }
 if (provider === 'gemini') {
  const factor = at.slice(0, 10) < '2027-01-01' ? 1 : 2
  return { ...common, currency: 'USD', input: 0.75 * factor, cached: 0.075 * factor, output: 3.75 * factor, basis: `标准服务价格${factor === 1 ? '（含 2026 年官方优惠）' : ''}，未扣除免费额度和账户抵扣` }
 }
 if (provider === 'qwen') return { ...common, currency: 'CNY', input: 2, cached: 0.4, output: 8, longInput: 6, longCached: 1.2, longOutput: 24, threshold: 256000, basis: '北京地域公开原价，未扣除限时折扣、免费额度和账户抵扣' }
 throw new Error('Unknown pricing provider')
}

export function calculateCost(usage, price, fx) {
 if (!usage) return { nativeNano: null, cnyNano: null, price, costState: 'usage_missing' }
 const selected = price.threshold && usage.input > price.threshold ? { ...price, input: price.longInput, cached: price.longCached, output: price.longOutput } : price
 const nativeNano = Math.round(((usage.input - usage.cached) * selected.input + usage.cached * selected.cached + usage.output * selected.output) * 1000)
 const rate = selected.currency === 'CNY' ? 1 : fx?.rate
 const cnyNano = Number.isFinite(rate) && rate > 0 ? Math.round(nativeNano * rate) : null
 return { nativeNano, cnyNano, price: selected, costState: cnyNano === null ? 'fx_missing' : 'estimated' }
}

export function createUsageStore(db, { fetchImpl = fetch, now = () => new Date() } = {}) {
 db.exec(`CREATE TABLE IF NOT EXISTS vision_usage (
  id TEXT PRIMARY KEY, request_id TEXT NOT NULL, attempt INTEGER NOT NULL,
  user_id INTEGER NOT NULL, account TEXT NOT NULL, user_name TEXT NOT NULL,
  provider TEXT NOT NULL, model TEXT NOT NULL, operation TEXT NOT NULL,
  started_at TEXT NOT NULL, finished_at TEXT, status TEXT NOT NULL DEFAULT 'running',
  usage_json TEXT, price_json TEXT NOT NULL, fx_json TEXT,
  native_nano INTEGER, cny_nano INTEGER, cost_state TEXT NOT NULL DEFAULT 'usage_missing'
 );
 CREATE INDEX IF NOT EXISTS vision_usage_time ON vision_usage(started_at DESC);
 CREATE TABLE IF NOT EXISTS vision_fx (requested_date TEXT PRIMARY KEY, rate_json TEXT NOT NULL, fetched_at TEXT NOT NULL);`)
 // A process restart cannot establish whether an interrupted upstream request was billed.
 db.prepare("UPDATE vision_usage SET status='interrupted' WHERE status='running'").run()
 const flights = new Map()
 async function exchange(date) {
  const cached = db.prepare('SELECT * FROM vision_fx WHERE requested_date=?').get(date)
  if (cached && now().getTime() - Date.parse(cached.fetched_at) < 6 * 3600000) return JSON.parse(cached.rate_json)
  if (flights.has(date)) return flights.get(date)
  const work = (async () => {
   try {
    const response = await fetchImpl(`https://api.frankfurter.dev/v2/rate/USD/CNY?providers=ecb&date=${date}`, { signal: AbortSignal.timeout(4000), redirect: 'error' })
    if (!response.ok) throw new Error('FX unavailable')
    const value = await response.json()
    const age = Date.parse(date) - Date.parse(value.date)
    if (value.base !== 'USD' || value.quote !== 'CNY' || !Number.isFinite(value.rate) || value.rate <= 0 || value.rate > 100 || !Number.isFinite(age) || age < 0 || age > 7 * DAY) throw new Error('Invalid FX')
    const fx = { rate: value.rate, date: value.date, source: FX_SOURCE }
    db.prepare('INSERT INTO vision_fx VALUES(?,?,?) ON CONFLICT(requested_date) DO UPDATE SET rate_json=excluded.rate_json,fetched_at=excluded.fetched_at').run(date, JSON.stringify(fx), now().toISOString())
    return fx
   } catch { return cached ? JSON.parse(cached.rate_json) : null }
  })()
  flights.set(date, work)
  try { return await work } finally { flights.delete(date) }
 }
 const get = id => db.prepare('SELECT * FROM vision_usage WHERE id=?').get(id)
 function serialize(row) {
  return { id: row.id, requestId: row.request_id, attempt: row.attempt, account: row.account, name: row.user_name, provider: row.provider, model: row.model, operation: row.operation, startedAt: row.started_at, finishedAt: row.finished_at, status: row.status, usage: row.usage_json ? JSON.parse(row.usage_json) : null, price: JSON.parse(row.price_json), fx: row.fx_json ? JSON.parse(row.fx_json) : null, nativeAmount: row.native_nano === null ? null : row.native_nano / 1e9, cnyAmount: row.cny_nano === null ? null : row.cny_nano / 1e9, costState: row.cost_state }
 }
 function saveMeter(id, usage, fx) {
  const row = get(id), price = JSON.parse(row.price_json)
  const cost = calculateCost(usage, price, fx)
  db.prepare('UPDATE vision_usage SET usage_json=?,price_json=?,fx_json=?,native_nano=?,cny_nano=?,cost_state=? WHERE id=?').run(usage ? JSON.stringify(usage) : null, JSON.stringify(cost.price), fx ? JSON.stringify(fx) : null, cost.nativeNano, cost.cnyNano, cost.costState, id)
 }
 return {
  async begin({ requestId, attempt, user, provider, model, operation }) {
   const at = now().toISOString(), id = crypto.randomUUID(), price = priceSnapshot(provider, at)
   const fx = price.currency === 'USD' ? await exchange(at.slice(0, 10)) : null
   db.prepare('INSERT INTO vision_usage(id,request_id,attempt,user_id,account,user_name,provider,model,operation,started_at,price_json,fx_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(id, requestId, attempt, user.id, user.phone || String(user.id), user.name || '', provider, model, operation, at, JSON.stringify(price), fx ? JSON.stringify(fx) : null)
   return id
  },
  meter(id, data) { const row = get(id); saveMeter(id, normalizeUsage(row.provider, data), row.fx_json ? JSON.parse(row.fx_json) : null) },
  finish(id, status) { db.prepare('UPDATE vision_usage SET status=?,finished_at=? WHERE id=?').run(status, now().toISOString(), id) },
  async reconcile() {
   const pending = db.prepare("SELECT * FROM vision_usage WHERE cost_state='fx_missing' ORDER BY started_at DESC LIMIT 100").all()
   const dates = [...new Set(pending.map(r => r.started_at.slice(0, 10)))].slice(0, 5)
   const rates = new Map(await Promise.all(dates.map(async date => [date, await exchange(date)])))
   for (const row of pending) { const fx = rates.get(row.started_at.slice(0, 10)); if (fx) saveMeter(row.id, JSON.parse(row.usage_json), fx) }
  },
  list(query = {}) {
   const clauses = [], args = []
   if (['gemini', 'qwen'].includes(query.provider)) { clauses.push('provider=?'); args.push(query.provider) }
   const current = new Date(now().getTime() + 8 * 3600000).toISOString()
   if (query.period === 'today' || query.period === 'month') {
    clauses.push('started_at>=?')
    args.push(new Date(`${query.period === 'today' ? current.slice(0, 10) : current.slice(0, 7) + '-01'}T00:00:00+08:00`).toISOString())
   }
   if (['success', 'failed', 'interrupted', 'running'].includes(query.status)) { clauses.push('status=?'); args.push(query.status) }
   const where = clauses.length ? ' WHERE ' + clauses.join(' AND ') : ''
   const summary = db.prepare(`SELECT COUNT(*) AS calls, COALESCE(SUM(cny_nano),0) AS totalNano, COALESCE(SUM(cny_nano IS NULL),0) AS pending, COALESCE(SUM(status='success'),0) AS successful FROM vision_usage${where}`).get(...args)
   const pageSize = 20, pages = Math.max(1, Math.ceil(summary.calls / pageSize)), page = Math.min(pages, Math.max(1, Math.floor(Number(query.page) || 1)))
   const rows = db.prepare(`SELECT * FROM vision_usage${where} ORDER BY started_at DESC,rowid DESC LIMIT ? OFFSET ?`).all(...args, pageSize, (page - 1) * pageSize)
   return { records: rows.map(serialize), summary: { calls: summary.calls, cnyAmount: summary.totalNano / 1e9, pending: summary.pending, successful: summary.successful }, page, pages, pageSize }
  },
 }
}
