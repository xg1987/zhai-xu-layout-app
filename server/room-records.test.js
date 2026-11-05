import test from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import express from 'express'
import { createRoomRecordsRouter } from './room-records.js'

const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6i8AAAAASUVORK5CYII='
const content = () => ({
  name: '  客厅扫描  ', images: [{ id: 'photo-1', dataUrl: image }], roomType: '客厅',
  objects: [{ id: 'sofa-1', label: '沙发', category: 'furniture', sourceImageIndex: 0, bbox: [100, 100, 300, 400], planPosition: null, confidence: 'medium', note: '靠墙可见', confirmed: false }],
  observations: ['可见一扇窗'], limitations: ['未测量尺寸'],
})

async function fixture() {
  const db = new Database(':memory:')
  db.exec("CREATE TABLE existing_data(value TEXT); INSERT INTO existing_data VALUES('keep');")
  let at = Date.parse('2026-11-04T08:00:00.000Z')
  const app = express()
  // A header stands in for an already verified session, never for request body ownership.
  const currentUser = req => ['1', '2'].includes(req.headers['x-test-user']) ? { id: Number(req.headers['x-test-user']), role: req.headers['x-test-user'] === '1' ? 'user' : 'admin' } : null
  app.use('/api', createRoomRecordsRouter({ db, currentUser, now: () => at }))
  const server = app.listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  const request = (url, method = 'GET', body, user = '1', raw = false) => fetch(`http://127.0.0.1:${server.address().port}/api${url}`, {
    method, headers: { 'Content-Type': 'application/json', ...(user ? { 'x-test-user': user } : {}) },
    ...(body !== undefined ? { body: raw ? body : JSON.stringify(body) } : {}),
  })
  return { db, request, tick: () => { at += 1000 }, close: async () => {
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
    assert.equal(db.prepare('SELECT value FROM existing_data').get().value, 'keep')
    db.close()
  } }
}

test('房间记录从空列表创建、读取、修改、刷新读取和删除；北向保持未知', async () => {
  const f = await fixture()
  try {
    assert.deepEqual(await (await f.request('/rooms')).json(), { records: [] })
    const created = await f.request('/rooms', 'POST', { ...content(), id: 'client-id', createdAt: 'fake', updatedAt: 'fake', revision: 900 })
    assert.equal(created.status, 201)
    assert.equal(created.headers.get('cache-control'), 'no-store')
    const { record } = await created.json()
    assert.match(record.id, /^[a-f0-9-]{36}$/)
    assert.equal(record.name, '客厅扫描')
    assert.equal(record.northAngle, null)
    assert.equal(record.revision, 1)
    assert.equal(record.createdAt, '2026-11-04T08:00:00.000Z')
    assert.deepEqual(await (await f.request('/rooms/' + record.id)).json(), { record })
    const summary = (await (await f.request('/rooms')).json()).records[0]
    assert.deepEqual(summary, { id: record.id, name: record.name, roomType: '客厅', objectCount: 1, createdAt: record.createdAt, updatedAt: record.updatedAt, revision: 1 })
    assert.equal(JSON.stringify(summary).includes('data:image'), false)
    assert.equal('owner_id' in record, false)
    f.tick()
    const updated = await (await f.request('/rooms/' + record.id, 'PUT', { ...record, name: '核对后客厅', northAngle: 123.5, objects: [{ ...record.objects[0], planPosition: [250, 750], confirmed: true }] })).json()
    assert.equal(updated.record.revision, 2)
    assert.equal(updated.record.createdAt, record.createdAt)
    assert.equal(updated.record.updatedAt, '2026-11-04T08:00:01.000Z')
    assert.equal(updated.record.northAngle, 123.5)
    assert.deepEqual(updated.record.objects[0].planPosition, [250, 750])
    assert.equal(updated.record.objects[0].confirmed, true)
    assert.deepEqual(await (await f.request('/rooms/' + record.id)).json(), updated)
    assert.deepEqual(await (await f.request('/rooms/' + record.id, 'DELETE')).json(), { ok: true })
    assert.equal((await f.request('/rooms/' + record.id)).status, 404)
    assert.deepEqual(await (await f.request('/rooms')).json(), { records: [] })
  } finally { await f.close() }
})

test('所有操作要求会话；普通与管理员账号互不可见、读写删除越权统一返回404', async () => {
  const f = await fixture()
  try {
    for (const [url, method, body] of [['/rooms', 'GET'], ['/rooms', 'POST', content()], ['/rooms/id', 'GET'], ['/rooms/id', 'PUT', content()], ['/rooms/id', 'DELETE']]) {
      assert.equal((await f.request(url, method, body, null)).status, 401)
    }
    const { record } = await (await f.request('/rooms', 'POST', content())).json()
    assert.deepEqual(await (await f.request('/rooms', 'GET', undefined, '2')).json(), { records: [] })
    for (const method of ['GET', 'PUT', 'DELETE']) {
      const other = await f.request('/rooms/' + record.id, method, method === 'PUT' ? { ...record, name: 'hijack' } : undefined, '2')
      assert.equal(other.status, 404)
      assert.deepEqual(await other.json(), { error: '房间记录不存在' })
    }
    for (const key of ['owner', 'ownerId', 'owner_id', 'userId']) assert.equal((await f.request('/rooms', 'POST', { ...content(), [key]: '2' })).status, 400)
    assert.equal(f.db.prepare('SELECT owner_id FROM room_scans WHERE id=?').get(record.id).owner_id, '1')
    assert.equal((await f.request('/rooms/' + record.id, 'PUT', { ...record, owner_id: '2' })).status, 400)
    assert.equal((await (await f.request('/rooms/' + record.id)).json()).record.name, '客厅扫描')
  } finally { await f.close() }
})

test('物品说明正常换行可保存和恢复，其他控制字符与名称换行仍拒绝', async () => {
  const f = await fixture()
  try {
    const body = content(), note = '第一行可见说明\n第二行待核对\r\n第三行补充'
    body.objects[0].note = note
    const created = await f.request('/rooms', 'POST', body)
    assert.equal(created.status, 201)
    const { record } = await created.json()
    assert.equal(record.objects[0].note, note)
    assert.equal((await (await f.request('/rooms/' + record.id)).json()).record.objects[0].note, note)
    const updatedNote = '更新后的第一行\n更新后的第二行'
    const updated = await f.request('/rooms/' + record.id, 'PUT', { ...record, objects: [{ ...record.objects[0], note: updatedNote }] })
    assert.equal(updated.status, 200)
    assert.equal((await (await f.request('/rooms/' + record.id)).json()).record.objects[0].note, updatedNote)
    for (const invalid of ['a\u0000b', 'a\u202eb', 'a\u2066b', 'a\u000bb', 'a\tb', 'x'.repeat(301)]) {
      assert.equal((await f.request('/rooms', 'POST', { ...body, objects: [{ ...body.objects[0], note: invalid }] })).status, 400)
    }
    for (const key of ['name', 'roomType']) assert.equal((await f.request('/rooms', 'POST', { ...body, [key]: '第一行\n第二行' })).status, 400)
    assert.equal((await f.request('/rooms', 'POST', { ...body, objects: [{ ...body.objects[0], label: '第一行\n第二行' }] })).status, 400)
  } finally { await f.close() }
})

test('字段白名单、图片/坐标/确认状态/长度约束拒绝非法数据且不写入', async () => {
  const f = await fixture()
  try {
    const object = content().objects[0]
    const bad = [
      {}, null, [], { ...content(), name: '' }, { ...content(), name: 'x'.repeat(61) }, { ...content(), name: '客\n厅' },
      { ...content(), images: [] }, { ...content(), images: Array.from({ length: 5 }, (_, i) => ({ id: 'photo-' + i, dataUrl: image })) },
      { ...content(), images: [{ id: 'photo-1', dataUrl: 'https://example.com/private-photo' }] },
      { ...content(), images: [{ id: 'photo-1', dataUrl: 'data:image/png;base64,aGVsbG8=' }] },
      { ...content(), images: [content().images[0], content().images[0]] },
      { ...content(), images: [{ ...content().images[0], path: '/private/file' }] },
      { ...content(), roomType: 'x'.repeat(49) }, { ...content(), observations: ['x'.repeat(301)] },
      { ...content(), limitations: Array(11).fill('待核对') }, { ...content(), northAngle: 360 }, { ...content(), northAngle: '90' },
      { ...content(), objects: Array(31).fill(object) }, { ...content(), objects: [object, object] },
      ...[
        { sourceImageIndex: 1 }, { sourceImageIndex: -1 }, { bbox: [900, 0, 101, 100] }, { bbox: [0, 0, 0, 100] },
        { bbox: [0, 0, '100', 100] }, { planPosition: [1001, 0] }, { confidence: 'certain' }, { confirmed: 'true' },
        { label: 'x'.repeat(81) }, { note: 'x'.repeat(301) }, { secret: 'not-allowed' },
      ].map(changes => ({ ...content(), objects: [{ ...object, ...changes }] })),
    ]
    for (const body of bad) {
      const response = await f.request('/rooms', 'POST', body)
      assert.equal(response.status, 400, JSON.stringify({ ...body, images: '[omitted]' }).slice(0, 300))
      assert.equal(typeof (await response.json()).error, 'string')
    }
    assert.equal((await f.request('/rooms', 'POST', '{bad', '1', true)).status, 400)
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM room_scans').get().n, 0)
    // Minimal confirmed defaults are explicit; no orientation or position is invented.
    const minimal = content()
    delete minimal.objects[0].confirmed
    delete minimal.objects[0].bbox
    const { record } = await (await f.request('/rooms', 'POST', minimal)).json()
    assert.equal(record.objects[0].confirmed, false)
    assert.equal(record.objects[0].bbox, null)
    assert.equal(record.objects[0].planPosition, null)
    assert.equal(record.northAngle, null)
  } finally { await f.close() }
})

test('保存要求当前revision，重复或并发旧版本不覆盖已保存记录', async () => {
  const f = await fixture()
  try {
    const { record } = await (await f.request('/rooms', 'POST', content())).json()
    for (const revision of [undefined, '1', 0, 1.5]) assert.equal((await f.request('/rooms/' + record.id, 'PUT', { ...record, revision })).status, 400)
    const results = await Promise.all(['第一份核对', '另一份核对'].map(name => f.request('/rooms/' + record.id, 'PUT', { ...record, name })))
    assert.deepEqual(results.map(response => response.status).sort(), [200, 409])
    const latest = (await (await f.request('/rooms/' + record.id)).json()).record
    assert.equal(latest.revision, 2)
    assert.equal((await f.request('/rooms/' + record.id, 'PUT', { ...record, name: '旧记录覆盖' })).status, 409)
    assert.equal((await (await f.request('/rooms/' + record.id)).json()).record.name, latest.name)
    assert.equal((await f.request('/rooms/missing', 'PUT', record)).status, 404)
    assert.equal((await f.request('/rooms/missing', 'DELETE')).status, 404)
  } finally { await f.close() }
})

test('总照片大小和请求上限生效，大图拒绝时仍不写记录', async () => {
  const f = await fixture()
  try {
    const bytes = Buffer.alloc(Math.floor(4.1 * 1024 * 1024))
    Buffer.from('89504e470d0a1a0a', 'hex').copy(bytes)
    const dataUrl = 'data:image/png;base64,' + bytes.toString('base64')
    const oversized = { ...content(), images: Array.from({ length: 3 }, (_, i) => ({ id: 'photo-' + i, dataUrl })) }
    const response = await f.request('/rooms', 'POST', oversized)
    assert.equal(response.status, 400)
    assert.match((await response.json()).error, /12 MB/)
    assert.equal((await f.request('/rooms', 'POST', '{"name":"' + 'x'.repeat(17 * 1024 * 1024) + '"}', '1', true)).status, 413)
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM room_scans').get().n, 0)
  } finally { await f.close() }
})
