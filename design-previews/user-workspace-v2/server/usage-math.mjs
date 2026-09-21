const DAY = 86400000
const FX_SOURCE = 'Frankfurter / ECB'
const count = value => Number.isSafeInteger(value) && value >= 0 && value <= 100000000
export const PRICE_SOURCES = {
 gemini: 'https://ai.google.dev/gemini-api/docs/pricing',
 qwen: 'https://help.aliyun.com/zh/model-studio/qwen3-8-max',
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
 if (provider === 'qwen') return { ...common, verifiedAt: '2026-09-21', currency: 'CNY', input: 12, cached: 1.5, output: 36, basis: '北京地域公开原价，未扣除限时折扣、免费额度和账户抵扣' }
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

