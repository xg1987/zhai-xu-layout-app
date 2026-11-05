import { PROVIDERS, VisionError, callProvider, normalizeUsage, readJson, validateImage, validateRoomImages } from './vision-core.js'
import { createD1UsageStore } from './vision-usage.js'

export { listVisionUsage } from './vision-usage.js'
const encode = value => new TextEncoder().encode(value)
const json = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } })
const b64 = bytes => btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''))
const unb64 = value => Uint8Array.from(atob(value), character => character.charCodeAt(0))

async function masterKey(env) {
  try {
    if (typeof env.VISION_MASTER_KEY !== 'string') throw new Error('Missing master')
    const value = env.VISION_MASTER_KEY.trim()
    const bytes = /^[a-f0-9]{64}$/i.test(value) ? Uint8Array.from(value.match(/../g), pair => parseInt(pair, 16)) : unb64(value)
    if (bytes.length !== 32) throw new Error('Invalid master')
    return await crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
  } catch { throw new VisionError('识别密钥加密服务尚未配置，请联系管理员', 503) }
}

export async function listVisionProviders(env) {
  if (!env.DB) throw new VisionError('数据库尚未绑定', 503)
  const rows = (await env.DB.prepare('SELECT provider,checked_at,check_state FROM vision_settings').all()).results
  return Object.values(PROVIDERS).map(provider => {
    const row = rows.find(item => item.provider === provider.id)
    return { ...provider, configured: !!row, checkedAt: row?.checked_at || null, checkState: row?.check_state || 'empty' }
  })
}

export async function getVisionOverview(env, options = {}) {
  const [providers, data] = await Promise.all([listVisionProviders(env), createD1UsageStore(env.DB, options).list({ period: 'today' })])
  return { providers, usage: data.summary }
}

async function saveKey(env, id, key) {
  const master = await masterKey(env), iv = crypto.getRandomValues(new Uint8Array(12))
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encode(`zhai-xu-vision:${id}`) }, master, encode(key)))
  const sealed = new Uint8Array(iv.length + cipher.length); sealed.set(iv); sealed.set(cipher, iv.length)
  await env.DB.prepare(`INSERT INTO vision_settings(provider,encrypted_key,revision) VALUES(?,?,?)
    ON CONFLICT(provider) DO UPDATE SET encrypted_key=excluded.encrypted_key,revision=excluded.revision,checked_at=NULL,check_state='untested'`).bind(id, `v1:${b64(sealed)}`, crypto.randomUUID()).run()
}

async function readKey(env, id) {
  const row = await env.DB.prepare('SELECT encrypted_key,revision FROM vision_settings WHERE provider=?').bind(id).first()
  if (!row) return null
  const master = await masterKey(env)
  try {
    if (!row.encrypted_key.startsWith('v1:')) throw new Error('Unsupported encryption')
    const sealed = unb64(row.encrypted_key.slice(3))
    if (sealed.length < 29) throw new Error('Invalid ciphertext')
    const bytes = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: sealed.slice(0, 12), additionalData: encode(`zhai-xu-vision:${id}`) }, master, sealed.slice(12))
    return { key: new TextDecoder('utf-8', { fatal: true }).decode(bytes), revision: row.revision }
  } catch { throw new VisionError('识别模型密钥无法读取，请管理员重新保存 API Key', 503) }
}

async function checked(env, id, revision, ok, now) {
  await env.DB.prepare('UPDATE vision_settings SET checked_at=?,check_state=? WHERE provider=? AND revision=?').bind(new Date(now()).toISOString(), ok ? 'ok' : 'error', id, revision).run()
}

async function exclusive(env, user, now, run) {
  const token = crypto.randomUUID(), at = now(), id = String(user.id)
  // D1 uniqueness makes this lock effective across worker isolates and deployments.
  const result = await env.DB.prepare(`INSERT INTO vision_locks(user_id,token,expires_at) VALUES(?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET token=excluded.token,expires_at=excluded.expires_at WHERE vision_locks.expires_at<=?`).bind(id, token, at + 150000, at).run()
  if (result.meta.changes !== 1) throw new VisionError('已有识别或测试正在进行，请稍候', 429)
  try { return await run() }
  finally { await env.DB.prepare('DELETE FROM vision_locks WHERE user_id=? AND token=?').bind(id, token).run() }
}

export async function handleVision({ request, env, user, path, fetchImpl = fetch, now = Date.now }) {
  const url = new URL(request.url), pathname = (path || url.pathname).replace(/^\/api(?=\/|$)/, '')
  if (!/^\/(?:admin\/vision(?:\/|$)|vision\/(?:status|recognize|room)$)/.test(pathname)) return null
  try {
    if (!user || user.id === undefined || user.id === null) throw new VisionError('请先登录', 401)
    const admin = pathname.startsWith('/admin/')
    if (admin && user.role !== 'admin') throw new VisionError('仅管理员可管理模型配置', 403)
    if (!env.DB) throw new VisionError('数据库尚未绑定', 503)
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      const origin = request.headers.get('Origin')
      if (origin && origin !== url.origin) throw new VisionError('不允许的请求来源', 403)
    }
    const usageStore = createD1UsageStore(env.DB, { fetchImpl, now })
    const providers = () => listVisionProviders(env)
    if (pathname === '/admin/vision' && request.method === 'GET') return json({ providers: await providers() })
    if (['/vision/status', '/admin/vision/status'].includes(pathname) && request.method === 'GET') {
      const list = await providers()
      return json({ ready: list.some(provider => provider.configured), ...(admin ? { providers: list } : {}) })
    }
    if (pathname === '/admin/vision/usage' && request.method === 'GET') {
      await usageStore.reconcile()
      return json(await usageStore.list(Object.fromEntries(url.searchParams)))
    }
    const providerMatch = /^\/admin\/vision\/([^/]+)(\/test)?$/.exec(pathname)
    if (providerMatch) {
      const id = providerMatch[1]
      if (!Object.hasOwn(PROVIDERS, id)) throw new VisionError('模型不存在', 404)
      if (!providerMatch[2] && request.method === 'POST') {
        const body = await readJson(request, 16 * 1024), key = body?.apiKey
        if (typeof key !== 'string' || key.trim().length < 16 || key.length > 512 || /\s/.test(key.trim()) || /[^\x21-\x7e]/.test(key.trim())) throw new VisionError('请输入完整有效的 API Key')
        await saveKey(env, id, key.trim())
        return json({ providers: await providers() })
      }
      if (!providerMatch[2] && request.method === 'DELETE') {
        await env.DB.prepare('DELETE FROM vision_settings WHERE provider=?').bind(id).run()
        return json({ providers: await providers() })
      }
      if (providerMatch[2] && request.method === 'POST') return await exclusive(env, user, now, async () => {
        const saved = await readKey(env, id)
        if (!saved) throw new VisionError('请先保存此模型的 API Key')
        try { await metered(id, saved.key, { test: true }); await checked(env, id, saved.revision, true, now) }
        catch (error) { await checked(env, id, saved.revision, false, now); throw error }
        return json({ ok: true, providers: await providers(), message: '连接成功，模型可调用' })
      })
    }
    if (['/vision/recognize', '/vision/room'].includes(pathname) && request.method === 'POST') {
      const room = pathname === '/vision/room', body = await readJson(request, (room ? 17 : 8) * 1024 * 1024)
      const options = room ? { task: 'room', images: validateRoomImages(body?.images) } : { image: validateImage(body?.image) }
      return await exclusive(env, user, now, async () => {
        const configured = (await providers()).filter(provider => provider.configured)
        if (!configured.length) throw new VisionError('管理员尚未配置图片识别模型', 503)
        const requestId = crypto.randomUUID()
        let last, attempt = 0
        for (const provider of configured) {
          const saved = await readKey(env, provider.id)
          if (!saved) { last = new VisionError('模型配置已更新，请重试', 503, true); continue }
          try {
            const result = await metered(provider.id, saved.key, options, requestId, ++attempt)
            return json({ provider: provider.name, model: provider.model, usedFallback: attempt > 1, result })
          } catch (error) { last = error; if (!error.retryable) throw error }
        }
        throw last || new VisionError('模型服务暂不可用，请稍后重试', 503)
      })
    }
    return json({ error: '请求方法或模型接口不存在' }, providerMatch || ['/admin/vision', '/admin/vision/usage', '/vision/status', '/admin/vision/status', '/vision/recognize', '/vision/room'].includes(pathname) ? 405 : 404)

    async function metered(id, key, options, requestId = crypto.randomUUID(), attempt = 1) {
      const record = await usageStore.begin({ requestId, attempt, user, provider: id, model: PROVIDERS[id].model, operation: options.test ? 'test' : options.task === 'room' ? 'room' : 'recognize' })
      let usage = null, status = 'failed'
      try {
        const result = await callProvider(id, key, { ...options, onUsage: data => { usage = normalizeUsage(id, data) } }, fetchImpl)
        status = 'success'; return result
      } finally { await usageStore.finishNormalized(record, usage, status) }
    }
  } catch (error) {
    return json({ error: error instanceof VisionError ? error.message : '识别服务暂不可用，请稍后重试' }, error instanceof VisionError ? error.status : 500)
  }
}
