import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import Database from 'better-sqlite3'
import { handleVision, getVisionOverview } from './vision.js'
import { callProvider, calculateCost, normalizeUsage, parseRecognition, priceSnapshot, readJson, validateImage, validateRoomImages, VisionError } from './vision-core.js'
import { createD1UsageStore } from './vision-usage.js'
import { calculateCost as nodeCost, normalizeUsage as nodeUsage, priceSnapshot as nodePrice } from '../server/usage.js'

const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6i8AAAAASUVORK5CYII='
const floor = { isFloorPlan: true, northAngleDeg: null, outline: [[0, 0], [1000, 0], [1000, 1000]], rooms: ['客厅'], notes: ['方向待核对'] }
const room = { isRoom: true, roomType: '客厅', objects: [{ id: 'sofa-1', label: '沙发', category: 'furniture', sourceImageIndex: 0, bbox: [100, 200, 200, 300], planPosition: null, confidence: 'medium', note: '可见沙发' }], observations: [], limitations: ['尺寸待实测'] }
const geminiUsage = { usageMetadata: { promptTokenCount: 2000, cachedContentTokenCount: 1000, candidatesTokenCount: 500, thoughtsTokenCount: 200 } }
const qwenUsage = { usage: { prompt_tokens: 2000, prompt_tokens_details: { cached_tokens: 1000 }, completion_tokens: 700, completion_tokens_details: { reasoning_tokens: 200 } } }
const secret = 'stub-only-key-not-a-real-provider-account'
const now = () => Date.parse('2026-11-05T08:00:00Z')
const fx = { rate: 7, date: '2026-11-05', base: 'USD', quote: 'CNY' }
const admin = { id: 1, phone: 'admin-test', name: '管理员测试', role: 'admin' }
const user = { id: 2, phone: 'user-test', name: '用户测试', role: 'user' }

function d1() {
  const sqlite = new Database(':memory:')
  sqlite.exec(fs.readFileSync(new URL('./vision-schema.sql', import.meta.url), 'utf8'))
  return {
    sqlite,
    prepare(sql) {
      let args = []
      const statement = sqlite.prepare(sql)
      return {
        bind(...values) { args = values; return this },
        async first() { return statement.get(...args) || null },
        async all() { return { success: true, results: statement.all(...args) } },
        async run() { const result = statement.run(...args); return { success: true, meta: { changes: result.changes, last_row_id: Number(result.lastInsertRowid) } } },
      }
    },
  }
}

function setup() {
  const DB = d1(), env = { DB, VISION_MASTER_KEY: btoa('0123456789abcdef0123456789abcdef') }
  async function request(path, { method = 'GET', body, actor = admin, fetchImpl = async () => { assert.fail('未预期的网络调用') }, origin = 'https://layout.test', headers = {} } = {}) {
    return handleVision({ env, user: actor, now, fetchImpl, path, request: new Request(`https://layout.test${path.startsWith('/api') ? path : '/api' + path}`, { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(origin ? { Origin: origin } : {}), ...headers }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }) })
  }
  return { env, db: DB.sqlite, request }
}

test('D1模型配置按角色隔离；AES-GCM加密/替换/删除，不回显Key或加密主密钥', async () => {
  const { db, env, request } = setup()
  try {
    assert.equal(await request('/other'), null)
    assert.equal((await request('/admin/vision', { actor: null })).status, 401)
    for (const path of ['/admin/vision', '/admin/vision/usage', '/admin/vision/qwen', '/admin/vision/qwen/test']) assert.equal((await request(path, { actor: user })).status, 403)
    assert.equal((await request('/admin/vision/qwen', { method: 'POST', body: { apiKey: secret }, origin: 'https://evil.test' })).status, 403)
    assert.equal((await request('/admin/vision/evil', { method: 'POST', body: { apiKey: secret } })).status, 404)
    assert.equal((await request('/admin/vision/qwen', { method: 'POST', body: { apiKey: '' } })).status, 400)
    assert.equal((await request('/admin/vision/qwen', { method: 'POST', body: { apiKey: secret } })).status, 200)
    const row = db.prepare('SELECT * FROM vision_settings').get()
    assert.ok(row.encrypted_key.startsWith('v1:'))
    assert.equal(row.encrypted_key.includes(secret), false)
    const catalog = await (await request('/api/admin/vision')).json()
    assert.equal(catalog.providers[1].configured, true)
    assert.equal(JSON.stringify(catalog).includes(secret), false)
    assert.equal(JSON.stringify(catalog).includes(env.VISION_MASTER_KEY), false)
    const tested = await request('/admin/vision/qwen/test', { method: 'POST', fetchImpl: async (url, options) => {
      assert.equal(url, 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions')
      assert.equal(options.headers.Authorization, `Bearer ${secret}`)
      assert.equal(options.body.includes(secret), false)
      return Response.json({ ...qwenUsage, choices: [{ message: { content: '{"ok":true}' } }] })
    } })
    assert.equal(tested.status, 200)
    assert.equal(db.prepare('SELECT check_state FROM vision_settings').get().check_state, 'ok')
    await request('/admin/vision/qwen', { method: 'POST', body: { apiKey: secret + '-new' } })
    const replacement = db.prepare('SELECT * FROM vision_settings').get()
    assert.notEqual(replacement.revision, row.revision)
    assert.equal(replacement.check_state, 'untested')
    assert.equal(replacement.checked_at, null)
    env.VISION_MASTER_KEY = btoa('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
    const unreadable = await request('/admin/vision/qwen/test', { method: 'POST' })
    assert.equal(unreadable.status, 503)
    assert.equal((await unreadable.text()).includes(secret), false)
    await request('/admin/vision/qwen', { method: 'DELETE' })
    assert.equal((await (await request('/vision/status', { actor: user })).json()).ready, false)
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM vision_locks').get().n, 0)
  } finally { db.close() }
})

test('多图主备切换、严格房间解析、每笔用量/费用及失败用量保留，原始敏感内容不入D1', async () => {
  const { db, env, request } = setup()
  try {
    for (const id of ['gemini', 'qwen']) await request(`/admin/vision/${id}`, { method: 'POST', body: { apiKey: secret } })
    const calls = []
    const fetchImpl = async (url, options) => {
      if (url.startsWith('https://api.frankfurter.dev/')) return Response.json(fx)
      const body = JSON.parse(options.body)
      calls.push(url)
      assert.equal(url.includes(secret), false)
      assert.equal(options.body.includes(secret), false)
      assert.equal(options.redirect, 'error')
      if (url.includes('googleapis')) {
        assert.match(url, /gemini-3\.8-flash:generateContent$/)
        assert.equal(options.headers['x-goog-api-key'], secret)
        assert.equal(body.contents[0].parts.length, 3)
        assert.equal(body.contents[0].parts[1].inlineData.data, validateImage(image).data)
        return Response.json({ ...geminiUsage, candidates: [{ content: { parts: [{ text: 'invalid-sensitive-response' }] } }], private: secret, photo: image })
      }
      assert.equal(body.messages[0].content.length, 3)
      assert.equal(body.messages[0].content[1].image_url.url, image)
      assert.match(body.messages[0].content[0].text, /共2张照片/)
      return Response.json({ ...qwenUsage, choices: [{ message: { content: JSON.stringify(room) } }] })
    }
    const response = await request('/vision/room', { method: 'POST', actor: user, body: { images: [image, image] }, fetchImpl })
    assert.equal(response.status, 200)
    const value = await response.json()
    assert.equal(value.model, 'qwen3.7-plus')
    assert.equal(value.usedFallback, true)
    assert.deepEqual(value.result, room)
    assert.equal(calls.length, 2)
    const usageResponse = await request('/admin/vision/usage', { fetchImpl })
    const usage = await usageResponse.json()
    assert.equal(usage.summary.calls, 2)
    assert.equal(usage.summary.pending, 0)
    assert.equal(usage.summary.cnyAmount, 0.03215)
    assert.deepEqual(new Set(usage.records.map(row => row.status)), new Set(['failed', 'success']))
    assert.ok(usage.records.every(row => row.operation === 'room'))
    assert.equal(usage.records[0].requestId, usage.records[1].requestId)
    const stored = JSON.stringify(db.prepare('SELECT * FROM vision_usage').all())
    for (const privateValue of [image, secret, 'invalid-sensitive-response']) assert.equal(stored.includes(privateValue), false)
    const overview = await getVisionOverview(env, { now, fetchImpl })
    assert.equal(overview.usage.calls, 2)
    assert.equal(overview.providers[0].configured, true)
    assert.equal((await request('/admin/vision/usage', { actor: user })).status, 403)
  } finally { db.close() }
})

test('户型接口保持原契约；无配置、非法图片、非法JSON、大小限制不调用模型', async () => {
  const { db, request } = setup()
  try {
    assert.equal((await request('/vision/recognize', { actor: null, method: 'POST', body: { image } })).status, 401)
    assert.equal((await request('/vision/recognize', { actor: user, method: 'POST', body: { image } })).status, 503)
    for (const body of [{}, { images: [] }, { images: Array(5).fill(image) }, { images: ['https://evil.test/a.png'] }]) assert.equal((await request('/vision/room', { actor: user, method: 'POST', body })).status, 400)
    assert.equal((await request('/vision/room', { actor: user, method: 'POST', body: {}, headers: { 'Content-Length': String(18 * 1024 * 1024) } })).status, 413)
    assert.equal((await request('/vision/status', { method: 'POST' })).status, 405)
    await request('/admin/vision/qwen', { method: 'POST', body: { apiKey: secret } })
    const response = await request('/api/vision/recognize', { actor: user, method: 'POST', body: { image }, fetchImpl: async (url, options) => {
      const body = JSON.parse(options.body)
      assert.equal(body.messages[0].content.length, 2)
      return Response.json({ ...qwenUsage, choices: [{ message: { content: JSON.stringify(floor) } }] })
    } })
    assert.equal(response.status, 200)
    assert.deepEqual((await response.json()).result, floor)
    assert.equal(db.prepare('SELECT operation FROM vision_usage').get().operation, 'recognize')
    await assert.rejects(readJson(new Request('https://test.invalid', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{broken' }), 100), VisionError)
    await assert.rejects(readJson(new Request('https://test.invalid', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: 'x'.repeat(200) }) }), 100), error => error.status === 413)
  } finally { db.close() }
})

test('D1用户锁跨请求生效，过期可恢复，不同请求不能释放他人的锁', async () => {
  const { db, request } = setup()
  let signalStarted, complete
  const started = new Promise(resolve => { signalStarted = resolve })
  try {
    await request('/admin/vision/qwen', { method: 'POST', body: { apiKey: secret } })
    const pending = request('/vision/room', { actor: user, method: 'POST', body: { images: [image] }, fetchImpl: async () => { signalStarted(); return new Promise(resolve => { complete = () => resolve(Response.json({ ...qwenUsage, choices: [{ message: { content: JSON.stringify(room) } }] })) }) } })
    await started
    assert.equal((await request('/vision/recognize', { actor: user, method: 'POST', body: { image } })).status, 429)
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM vision_locks').get().n, 1)
    complete()
    assert.equal((await pending).status, 200)
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM vision_locks').get().n, 0)
    db.prepare('INSERT INTO vision_locks VALUES(?,?,?)').run(String(user.id), 'old-token', now() - 1)
    const response = await request('/vision/recognize', { actor: user, method: 'POST', body: { image }, fetchImpl: async () => Response.json({ ...qwenUsage, choices: [{ message: { content: JSON.stringify(floor) } }] }) })
    assert.equal(response.status, 200)
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM vision_locks').get().n, 0)
  } finally { db.close() }
})

test('费用算法与Node既有算法一致；D1缺失汇率恢复、分页、用途和旧记录不被改写', async () => {
  for (const id of ['gemini', 'qwen']) {
    const data = id === 'gemini' ? geminiUsage : qwenUsage
    assert.deepEqual(normalizeUsage(id, data), nodeUsage(id, data))
    for (const date of ['2026-11-05', '2027-01-01']) {
      assert.deepEqual(priceSnapshot(id, date), nodePrice(id, date))
      assert.deepEqual(calculateCost(normalizeUsage(id, data), priceSnapshot(id, date), fx), nodeCost(nodeUsage(id, data), nodePrice(id, date), fx))
    }
  }
  const { env, db } = setup()
  let offline = true
  const usage = createD1UsageStore(env.DB, { now, fetchImpl: async () => { if (offline) throw new Error('offline'); return Response.json(fx) } })
  try {
    const record = await usage.begin({ requestId: 'same-request', attempt: 1, user, provider: 'gemini', model: 'gemini-3.8-flash', operation: 'room' })
    await usage.finish(record, 'gemini', geminiUsage, 'failed')
    assert.equal((await usage.list()).summary.pending, 1)
    offline = false; await usage.reconcile()
    assert.equal((await usage.list()).records[0].cnyAmount, 0.02415)
    const original = db.prepare('SELECT * FROM vision_usage WHERE id=?').get(record.id)
    for (let index = 0; index < 22; index++) {
      const created = await usage.begin({ requestId: `qwen-${index}`, attempt: 1, user, provider: 'qwen', model: 'qwen3.7-plus', operation: 'test' })
      await usage.finish(created, 'qwen', qwenUsage, 'success')
    }
    const page = await usage.list({ provider: 'qwen', page: 2 })
    assert.equal(page.page, 2); assert.equal(page.records.length, 2); assert.equal(page.summary.calls, 22)
    assert.deepEqual(db.prepare('SELECT * FROM vision_usage WHERE id=?').get(record.id), original)
    assert.equal((await usage.list({ period: 'today' })).summary.calls, 23)
  } finally { db.close() }
})

test('Web适配器拒绝不规范图片/模型坐标与恶意响应，不泄漏上游body', async () => {
  assert.equal(validateImage(image).mimeType, 'image/png')
  for (const value of ['https://example.test/private', image.replace(/=$/, ''), 'data:image/png;base64,aGVsbG8=']) assert.throws(() => validateImage(value), VisionError)
  assert.throws(() => validateRoomImages([]), VisionError)
  assert.throws(() => parseRecognition(JSON.stringify({ ...floor, northAngleDeg: 360 })), VisionError)
  assert.throws(() => parseRecognition(JSON.stringify({ ...floor, outline: [[0, 0], [1, 1], [1001, 5]] })), VisionError)
  for (const id of ['gemini', 'qwen']) {
    await assert.rejects(callProvider(id, secret, { task: 'room', images: [validateImage(image)] }, async () => Response.json({ error: secret, image }, { status: 401 })), error => error.retryable && !error.message.includes(secret) && !error.message.includes(image))
    const invalid = JSON.stringify({ ...room, objects: [{ ...room.objects[0], sourceImageIndex: 1 }] })
    await assert.rejects(callProvider(id, secret, { task: 'room', images: [validateImage(image)] }, async () => Response.json(id === 'gemini' ? { candidates: [{ content: { parts: [{ text: invalid }] } }] } : { choices: [{ message: { content: invalid } }] })), error => error.status === 502 && error.retryable)
  }
})
