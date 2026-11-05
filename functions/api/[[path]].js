import packageInfo from '../../package.json'
import { auditEvent, currentUser, handleAccounts } from '../../cloudflare/accounts.js'
import { handleRooms } from '../../cloudflare/rooms.js'
import { handleVision, getVisionOverview } from '../../cloudflare/vision.js'

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
})

// Enforce the same body budgets for chunked requests and Content-Length requests.
async function limitedRequest(request, maximum) {
  if (!request.body) return request
  if (Number(request.headers.get('Content-Length')) > maximum) throw Object.assign(new Error(), { status: 413 })
  const reader = request.body.getReader(), chunks = []
  let length = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    length += value.byteLength
    if (length > maximum) {
      await reader.cancel()
      throw Object.assign(new Error(), { status: 413 })
    }
    chunks.push(value)
  }
  const body = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength }
  return new Request(request, { body })
}

export const onRequest = async ({ request: original, env }) => {
  const url = new URL(original.url), path = url.pathname.replace(/^\/api/, '')
  const method = original.method.toUpperCase()
  if (path === '/version' && method === 'GET') return json({ version: packageInfo.version })
  if (!env.DB) return json({ error: '数据库尚未绑定' }, 503)
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const origin = original.headers.get('Origin')
    if ((origin && origin !== url.origin) || original.headers.get('Sec-Fetch-Site') === 'cross-site') return json({ error: '不允许的请求来源' }, 403)
  }
  try {
    const user = await currentUser(original, env)
    const large = /^\/(rooms(?:\/[^/]+)?|vision\/(recognize|room))$/.test(path)
    const request = ['POST', 'PUT', 'PATCH'].includes(method) ? await limitedRequest(original, large ? 17 * 1024 * 1024 : 16 * 1024) : original
    let overview = {}
    if (path === '/admin/overview' && method === 'GET' && user?.role === 'admin') overview = await getVisionOverview(env)
    const response = await handleVision({ request, env, user, path })
      || await handleRooms({ request, env, user, path })
      || await handleAccounts({ request, env, user, path, version: packageInfo.version, ...overview })
      || json({ error: '接口不存在' }, 404)
    const modelAction = /^\/admin\/vision\/(gemini|qwen)(\/test)?$/.exec(path)
    if (modelAction && user?.role === 'admin' && ['POST', 'DELETE'].includes(method)) {
      await auditEvent(env, user, modelAction[2] ? 'model.test' : method === 'DELETE' ? 'model.remove' : 'model.save', modelAction[1], response.status < 400 ? 'success' : 'failed')
    }
    const secured = new Response(response.body, response)
    secured.headers.set('Cache-Control', 'no-store')
    secured.headers.set('X-Content-Type-Options', 'nosniff')
    return secured
  } catch (error) {
    return json({ error: error?.status === 413 ? '请求内容过大' : '服务暂时不可用，请稍后重试' }, error?.status === 413 ? 413 : 500)
  }
}
