import test from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import express from 'express'
import { callVision, createVisionRouter, PROVIDERS, validateImage, validateRoomImages, VisionError } from './vision.js'
import { parseRoomRecognition, RoomRecognitionError, ROOM_PROMPT } from './room-recognition.js'
import { createUsageStore } from './usage.js'

const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6i8AAAAASUVORK5CYII='
const object = { id: 'object-1', label: '沙发', category: 'furniture', sourceImageIndex: 0, bbox: [100, 200, 400, 500], planPosition: null, confidence: 'high', note: '照片中可见' }
const fixture = { isRoom: true, roomType: '客厅', objects: [object], observations: ['可见沙发和窗'], limitations: ['遮挡处无法确认'] }
const encode = value => JSON.stringify(value)

test('照片输入限制：1–4张、真实格式头、规范Base64、单张5MB与总计12MB', () => {
  assert.equal(validateRoomImages([image, image]).length, 2)
  for (const value of [null, image, [], Array(5).fill(image), ['https://example.com/private'], ['data:image/png;base64,aGVsbG8='], [image.replace(/=$/, '')]]) assert.throws(() => validateRoomImages(value), VisionError)
  const largeImage = length => {
    const bytes = Buffer.alloc(length)
    Buffer.from('89504e470d0a1a0a', 'hex').copy(bytes)
    return `data:image/png;base64,${bytes.toString('base64')}`
  }
  const single = largeImage(5 * 1024 * 1024)
  assert.equal(validateRoomImages([single]).length, 1)
  assert.throws(() => validateRoomImages([largeImage(5 * 1024 * 1024 + 1)]), /5 MB/)
  const fourMiB = largeImage(4 * 1024 * 1024)
  assert.equal(validateRoomImages([fourMiB, fourMiB, fourMiB]).length, 3)
  assert.throws(() => validateRoomImages([fourMiB, fourMiB, fourMiB, image]), /12 MB/)
})

test('房间结构解析：固定字段、默认unknown/null、照片索引与相对估计说明', () => {
  assert.deepEqual(parseRoomRecognition(encode(fixture), 1), fixture)
  assert.deepEqual(parseRoomRecognition('```json\n' + encode(fixture) + '\n```', 1), fixture)
  const missing = { ...object, category: undefined, bbox: undefined, planPosition: undefined, note: undefined }
  const parsed = parseRoomRecognition(encode({ ...fixture, roomType: undefined, objects: [missing] }), 1)
  assert.equal(parsed.roomType, 'unknown')
  assert.equal(parsed.objects[0].category, 'unknown')
  assert.equal(parsed.objects[0].bbox, null)
  assert.equal(parsed.objects[0].planPosition, null)
  assert.equal(parsed.objects[0].note, '')
  const estimated = parseRoomRecognition(encode({ ...fixture, objects: [{ ...object, planPosition: [0, 1000] }] }), 1)
  assert.deepEqual(estimated.objects[0].planPosition, [0, 1000])
  assert.match(estimated.limitations[0], /相对布局.*未经测量/)
  const unrelated = parseRoomRecognition(encode({ ...fixture, isRoom: false }), 1)
  assert.deepEqual(unrelated.objects, [])
  assert.equal(unrelated.roomType, 'unknown')
  // A shared category/name is insufficient evidence for cross-photo deduplication.
  assert.equal(parseRoomRecognition(encode({ ...fixture, objects: [object, { ...object, id: 'object-2', sourceImageIndex: 1 }] }), 2).objects.length, 2)
})

test('恶意与边界模型输出被拒绝，不透传额外字段、越界框或虚构照片索引', () => {
  const badObjects = [
    { ...object, id: '__proto__', northAngle: 0 }, { ...object, id: 'x'.repeat(49) }, { ...object, id: '<script>' },
    { ...object, label: '' }, { ...object, label: 'x'.repeat(81) }, { ...object, label: '\u202e隐藏文字' },
    { ...object, category: 'x'.repeat(49) }, { ...object, category: {} }, { ...object, note: 'x'.repeat(301) },
    { ...object, note: 'a\u0000b' }, { ...object, confidence: 'certain' }, { ...object, confidence: null },
    { ...object, sourceImageIndex: 1 }, { ...object, sourceImageIndex: -1 }, { ...object, sourceImageIndex: 0.5 }, { ...object, sourceImageIndex: '0' },
    { ...object, bbox: [0, 0, 1001, 10] }, { ...object, bbox: [500, 0, 501, 10] }, { ...object, bbox: [0, 995, 10, 10] },
    { ...object, bbox: [0, 0, 0, 10] }, { ...object, bbox: [0, 0, -10, 10] }, { ...object, bbox: [0, 0, 10] },
    { ...object, bbox: [0, 0, '10', 10] }, { ...object, bbox: [0, 0, null, 10] },
    { ...object, planPosition: [-1, 0] }, { ...object, planPosition: [0, 1001] }, { ...object, planPosition: [0] }, { ...object, planPosition: { x: 5, y: 5 } },
  ]
  for (const item of badObjects) assert.throws(() => parseRoomRecognition(encode({ ...fixture, objects: [item] }), 1), RoomRecognitionError)
  const badResults = [null, [], true, { ...fixture, isRoom: 'true' }, { ...fixture, roomType: 'x'.repeat(49) }, { ...fixture, northAngleDeg: 0 },
    { ...fixture, objects: Array.from({ length: 31 }, (_, i) => ({ ...object, id: `object-${i}` })) },
    { ...fixture, objects: [object, object] }, { ...fixture, observations: {} }, { ...fixture, observations: ['x'.repeat(301)] },
    { ...fixture, limitations: Array(11).fill('待核对') }, { ...fixture, limitations: [null] }]
  for (const value of badResults) assert.throws(() => parseRoomRecognition(encode(value), 1), RoomRecognitionError)
  for (const text of ['not json', `{"isRoom":true,"objects":[],"__proto__":{},"observations":[],"limitations":[]}`, ' '.repeat(65537)]) assert.throws(() => parseRoomRecognition(text, 1), RoomRecognitionError)
  assert.throws(() => parseRoomRecognition(encode(fixture), 0), RoomRecognitionError)
  assert.match(ROOM_PROMPT, /不.*推断真实北向/)
  assert.match(ROOM_PROMPT, /不要按名称自动去重/)
})

test('Gemini与Qwen多图适配，保持图片顺序，只把密钥放请求头', async () => {
  for (const id of ['gemini', 'qwen']) {
    const secret = 'stub-only-api-key-never-a-real-secret', metering = []
    const stub = async (url, options) => {
      const body = JSON.parse(options.body)
      assert.equal(options.body.includes(secret), false)
      assert.equal(url.includes(secret), false)
      assert.equal(options.redirect, 'error')
      if (id === 'gemini') {
        assert.equal(options.headers['x-goog-api-key'], secret)
        assert.equal(body.contents[0].parts.length, 3)
        assert.match(body.contents[0].parts[0].text, /本次上传共2张照片/)
        assert.deepEqual(body.contents[0].parts[1].inlineData, validateImage(image))
        return Response.json({ candidates: [{ content: { parts: [{ thought: true, text: 'not output' }, { text: encode(fixture) }] } }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20 } })
      }
      assert.equal(options.headers.Authorization, `Bearer ${secret}`)
      assert.equal(body.messages[0].content.length, 3)
      assert.equal(body.messages[0].content[1].image_url.url, image)
      assert.equal(body.max_tokens, 8192)
      return Response.json({ choices: [{ message: { content: encode(fixture) } }], usage: { prompt_tokens: 10, completion_tokens: 20 } })
    }
    assert.deepEqual(await callVision(id, secret, { task: 'room', images: validateRoomImages([image, image]), onUsage: value => metering.push(value) }, stub), fixture)
    assert.equal(metering.length, 1)
    await assert.rejects(callVision(id, secret, { task: 'room', images: validateRoomImages([image]) }, async () => Response.json({ error: secret, content: image }, { status: 429 })), error => error instanceof VisionError && error.retryable && !error.message.includes(secret) && !error.message.includes(image))
    await assert.rejects(callVision(id, secret, { task: 'room', images: validateRoomImages([image]) }, async () => Response.json(id === 'gemini' ? { candidates: [{ content: { parts: [{ text: '{"isRoom":true,"objects":null}' }] } }] } : { choices: [{ message: { content: '{"isRoom":true,"objects":null}' } }] })), error => error instanceof VisionError && error.retryable && error.status === 502)
  }
})

async function api({ invoke, configured = ['gemini', 'qwen'], usageStore }) {
  const store = { list: () => Object.values(PROVIDERS).map(item => ({ ...item, configured: configured.includes(item.id) })), read: () => ({ key: 'stub-key-never-a-real-secret' }), checked() {} }
  const app = express()
  app.use('/api', createVisionRouter({ store, usageStore, currentUser: req => req.headers['x-test-user'] ? { id: Number(req.headers['x-test-user']), phone: 'test-account', name: '测试账号', role: 'user' } : null, invoke }))
  const server = app.listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  return {
    request: (route, payload, user = 1) => fetch(`http://127.0.0.1:${server.address().port}/api${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(user ? { 'x-test-user': String(user) } : {}) }, body: encode(payload) }),
    close: async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) },
  }
}

test('房间接口认证、输入校验、备用切换和用量记录；不存照片、密钥或模型原文', async () => {
  const db = new Database(':memory:')
  const usageStore = createUsageStore(db, { fetchImpl: async () => Response.json({ date: new Date().toISOString().slice(0, 10), base: 'USD', quote: 'CNY', rate: 7 }) })
  const calls = []
  const service = await api({ usageStore, invoke: async (id, key, options) => {
    calls.push({ id, task: options.task, images: options.images.length })
    options.onUsage(id === 'gemini' ? { usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20 }, secret: key, photo: image, content: 'sensitive-model-response' } : { usage: { prompt_tokens: 100, completion_tokens: 20 }, photo: image })
    if (id === 'gemini') throw new VisionError('模拟超时', 502, true)
    return fixture
  } })
  try {
    assert.equal((await service.request('/vision/room', { images: [image] }, null)).status, 401)
    for (const payload of [{}, { images: [] }, { images: Array(5).fill(image) }, { images: [42] }]) assert.equal((await service.request('/vision/room', payload)).status, 400)
    assert.equal(calls.length, 0)
    const response = await service.request('/vision/room', { images: [image, image] })
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { provider: PROVIDERS.qwen.name, model: PROVIDERS.qwen.model, usedFallback: true, result: fixture })
    assert.deepEqual(calls, [{ id: 'gemini', task: 'room', images: 2 }, { id: 'qwen', task: 'room', images: 2 }])
    const records = usageStore.list().records
    assert.equal(records.length, 2)
    assert.equal(records[0].requestId, records[1].requestId)
    assert.deepEqual(new Set(records.map(row => row.attempt)), new Set([1, 2]))
    assert.deepEqual(new Set(records.map(row => row.status)), new Set(['success', 'failed']))
    assert.ok(records.every(row => row.operation === 'room' && row.usage.input === 100))
    const stored = encode(db.prepare('SELECT * FROM vision_usage').all())
    for (const sensitive of [image, 'stub-key-never-a-real-secret', 'sensitive-model-response']) assert.equal(stored.includes(sensitive), false)
  } finally { await service.close(); db.close() }
  const empty = await api({ configured: [], invoke: async () => { assert.fail('不可调用模型') } })
  try { assert.equal((await empty.request('/vision/room', { images: [image] })).status, 503) } finally { await empty.close() }
})

test('房间识别与户型识别共用每用户并发锁，完成或失败后释放', async () => {
  let finish, started
  const ready = new Promise(resolve => { started = resolve })
  const service = await api({ configured: ['qwen'], invoke: async () => { started(); return new Promise(resolve => { finish = resolve }) } })
  try {
    const pending = service.request('/vision/room', { images: [image] })
    await ready
    assert.equal((await service.request('/vision/recognize', { image })).status, 429)
    assert.equal((await service.request('/vision/room', { images: [image] })).status, 429)
    finish(fixture)
    assert.equal((await pending).status, 200)
    assert.equal((await service.request('/vision/room', { images: [] })).status, 400)
    assert.equal((await service.request('/vision/room', { images: [] })).status, 400)
  } finally { await service.close() }
})
