import test from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { handleRooms, initializeRoomRecords, ROOM_IMAGE_CHUNK_SIZE } from './rooms.js'

const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6i8AAAAASUVORK5CYII='
const content = () => ({
  name: '客厅扫描', images: [{ id: 'photo-1', dataUrl: image }], roomType: '客厅',
  objects: [{ id: 'sofa-1', label: '沙发', category: 'furniture', sourceImageIndex: 0, bbox: [100, 100, 300, 400], planPosition: null, confidence: 'medium', note: '第一行\n第二行', confirmed: false }],
  observations: ['可见窗户'], limitations: ['尺寸未经测量'], northAngle: null,
})

// Real SQLite plus the asynchronous D1 prepared-statement/batch interface.
// Every statement batch executes in a transaction, including injected failures.
// Bound TEXT values above D1's per-row limit are rejected to exercise chunking.
function fixture() {
  const sqlite = new Database(':memory:')
  sqlite.exec("CREATE TABLE existing_data(value TEXT); INSERT INTO existing_data VALUES('preserve');")
  let failChunks = false, gate = null
  const execute = statement => {
    if (failChunks && statement.sql.includes('INSERT INTO room_scan_chunks')) throw new Error('simulated write failure with private implementation detail')
    const prepared = sqlite.prepare(statement.sql)
    if (prepared.reader) return { success: true, results: prepared.all(...statement.values), meta: { changes: 0 } }
    const result = prepared.run(...statement.values)
    return { success: true, results: [], meta: { changes: result.changes } }
  }
  const db = {
    prepare(sql) {
      return {
        sql, values: [],
        bind(...values) {
          for (const value of values) if (typeof value === 'string' && Buffer.byteLength(value) > 2 * 1024 * 1024) throw new Error('D1 row too large')
          return { ...this, values }
        },
        async first(column) { const value = execute(this).results[0] ?? null; return column && value ? value[column] : value },
        async all() { return execute(this) },
        async run() { return execute(this) },
      }
    },
    async batch(statements) {
      if (gate && statements[0].sql.startsWith('UPDATE room_scans')) await gate()
      return sqlite.transaction(() => statements.map(execute))()
    },
  }
  const request = (path, method = 'GET', body, user = { id: 1, role: 'user' }, extra = {}) => {
    const headers = { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...extra.headers }
    return handleRooms({ request: new Request('https://example.test/api' + path, { method, headers, ...(body !== undefined ? { body: extra.raw ? body : JSON.stringify(body) } : {}) }), env: { DB: db }, user, path: '/api' + path })
  }
  return {
    db, sqlite, request,
    failChunks: value => { failChunks = value },
    synchronizeUpdates() {
      let arrivals = 0, release
      const waiting = new Promise(resolve => { release = resolve })
      gate = () => { if (++arrivals === 2) release(); return waiting }
    },
    close() { assert.equal(sqlite.prepare('SELECT value FROM existing_data').get().value, 'preserve'); sqlite.close() },
  }
}

test('D1房间CRUD保持Node契约、未知北向与多行说明；列表不读照片', async () => {
  const f = fixture()
  try {
    assert.deepEqual(await (await f.request('/rooms')).json(), { records: [] })
    const response = await f.request('/rooms', 'POST', content())
    assert.equal(response.status, 201)
    assert.equal(response.headers.get('Cache-Control'), 'no-store')
    const { record } = await response.json()
    assert.equal(record.revision, 1)
    assert.equal(record.northAngle, null)
    assert.equal(record.objects[0].note, '第一行\n第二行')
    assert.deepEqual(await (await f.request('/rooms/' + record.id)).json(), { record })
    const summary = (await (await f.request('/rooms')).json()).records[0]
    assert.deepEqual(Object.keys(summary).sort(), ['id', 'name', 'roomType', 'objectCount', 'createdAt', 'updatedAt', 'revision'].sort())
    assert.equal(summary.objectCount, 1)
    assert.equal(JSON.stringify(summary).includes('data:image'), false)
    const next = { ...record, name: '核对后客厅', northAngle: 270, objects: [{ ...record.objects[0], planPosition: [150, 875], confirmed: true }] }
    const updated = await f.request('/rooms/' + record.id, 'PUT', next)
    assert.equal(updated.status, 200)
    const saved = (await updated.json()).record
    assert.equal(saved.createdAt, record.createdAt)
    assert.equal(saved.revision, 2)
    assert.equal(saved.northAngle, 270)
    assert.deepEqual(saved.objects[0].planPosition, [150, 875])
    assert.deepEqual(await (await f.request('/rooms/' + record.id)).json(), { record: saved })
    assert.deepEqual(await (await f.request('/rooms/' + record.id, 'DELETE')).json(), { ok: true })
    assert.equal((await f.request('/rooms/' + record.id)).status, 404)
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM room_scan_chunks').get().n, 0)
  } finally { f.close() }
})

test('D1权限隔离包括管理员，owner伪造拒绝，其他路由不被接管', async () => {
  const f = fixture()
  try {
    for (const [path, method, body] of [['/rooms', 'GET'], ['/rooms', 'POST', content()], ['/rooms/id', 'GET'], ['/rooms/id', 'PUT', content()], ['/rooms/id', 'DELETE']]) {
      assert.equal((await f.request(path, method, body, null)).status, 401)
    }
    const { record } = await (await f.request('/rooms', 'POST', content())).json()
    const other = { id: 2, role: 'admin' }
    assert.deepEqual(await (await f.request('/rooms', 'GET', undefined, other)).json(), { records: [] })
    for (const method of ['GET', 'PUT', 'DELETE']) assert.equal((await f.request('/rooms/' + record.id, method, method === 'PUT' ? record : undefined, other)).status, 404)
    for (const key of ['owner', 'ownerId', 'owner_id', 'userId']) assert.equal((await f.request('/rooms', 'POST', { ...content(), [key]: 2 })).status, 400)
    assert.equal((await f.request('/rooms/' + record.id, 'PUT', { ...record, owner_id: 2 })).status, 400)
    assert.equal(f.sqlite.prepare('SELECT owner_id FROM room_scans').get().owner_id, '1')
    assert.equal(await f.request('/other'), null)
    assert.equal((await f.request('/rooms/%')).status, 400)
    assert.equal((await f.request('/rooms', 'DELETE')).status, 405)
    assert.equal((await handleRooms({ request: new Request('https://example.test/api/rooms'), env: {}, user: { id: 1 } })).status, 503)
  } finally { f.close() }
})

test('D1拒绝错误字段/照片/坐标/越界大小与非法JSON，未写记录', async () => {
  const f = fixture()
  try {
    const object = content().objects[0]
    for (const body of [null, {}, { ...content(), name: 'x'.repeat(61) }, { ...content(), images: [] }, { ...content(), images: Array(5).fill(content().images[0]) },
      { ...content(), images: [{ id: 'photo-1', dataUrl: 'https://example.com/private' }] }, { ...content(), images: [{ id: 'photo-1', dataUrl: 'data:image/png;base64,aGVsbG8=' }] },
      { ...content(), images: [content().images[0], content().images[0]] }, { ...content(), northAngle: 360 }, { ...content(), objects: [object, object] },
      ...[{ sourceImageIndex: 1 }, { bbox: [900, 0, 200, 100] }, { planPosition: [-1, 0] }, { confirmed: 'yes' }, { note: 'a\u0000b' }, { note: 'x'.repeat(301) }].map(change => ({ ...content(), objects: [{ ...object, ...change }] })),
    ]) assert.equal((await f.request('/rooms', 'POST', body)).status, 400)
    assert.equal((await f.request('/rooms', 'POST', '{bad', undefined, { raw: true })).status, 400)
    assert.equal((await f.request('/rooms', 'POST', '{"name":"' + 'x'.repeat(17 * 1024 * 1024) + '"}', undefined, { raw: true })).status, 413)
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM room_scans').get().n, 0)
  } finally { f.close() }
})

test('大于D1单行限制的照片分块原样恢复，更新和删除清理旧分块', async () => {
  const f = fixture()
  try {
    const bytes = Buffer.alloc(3 * 1024 * 1024)
    Buffer.from('89504e470d0a1a0a', 'hex').copy(bytes)
    const dataUrl = 'data:image/png;base64,' + bytes.toString('base64')
    const body = { ...content(), images: [{ id: 'photo-1', dataUrl }, { id: 'photo-2', dataUrl: image }] }
    const created = await f.request('/rooms', 'POST', body)
    assert.equal(created.status, 201)
    const { record } = await created.json()
    const stored = f.sqlite.prepare('SELECT record_json FROM room_scans').get().record_json
    assert.ok(Buffer.byteLength(stored) < 2 * 1024 * 1024)
    assert.equal(stored.includes('data:image'), false)
    const chunks = f.sqlite.prepare('SELECT data FROM room_scan_chunks').all()
    assert.ok(chunks.length > 2)
    assert.ok(chunks.every(chunk => Buffer.byteLength(chunk.data) <= ROOM_IMAGE_CHUNK_SIZE))
    assert.deepEqual((await (await f.request('/rooms/' + record.id)).json()).record.images, body.images)
    const oldToken = JSON.parse(stored).token
    const updated = await f.request('/rooms/' + record.id, 'PUT', { ...record, name: '新名称', images: [{ id: 'photo-1', dataUrl: image }] })
    assert.equal(updated.status, 200)
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM room_scan_chunks WHERE version_token=?').get(oldToken).n, 0)
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM room_scan_chunks').get().n, 1)
    assert.deepEqual((await (await f.request('/rooms/' + record.id)).json()).record.images, [{ id: 'photo-1', dataUrl: image }])
    assert.equal((await f.request('/rooms/' + record.id, 'DELETE')).status, 200)
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM room_scan_chunks').get().n, 0)
  } finally { f.close() }
})

test('并发D1更新仅一个成功，冲突不会删掉获胜照片或留下孤立块', async () => {
  const f = fixture()
  try {
    const { record } = await (await f.request('/rooms', 'POST', content())).json()
    f.synchronizeUpdates()
    const results = await Promise.all(['A', 'B'].map(name => f.request('/rooms/' + record.id, 'PUT', { ...record, name })))
    assert.deepEqual(results.map(response => response.status).sort(), [200, 409])
    const latest = (await (await f.request('/rooms/' + record.id)).json()).record
    assert.equal(latest.revision, 2)
    assert.deepEqual(latest.images, record.images)
    assert.equal(f.sqlite.prepare('SELECT COUNT(DISTINCT version_token) n FROM room_scan_chunks').get().n, 1)
    assert.equal((await f.request('/rooms/' + record.id, 'PUT', record)).status, 409)
    assert.equal((await f.request('/rooms/missing', 'PUT', record)).status, 404)
    assert.equal((await f.request('/rooms/missing', 'DELETE')).status, 404)
  } finally { f.close() }
})

test('分块写入失败整批回滚，不返回内部错误，不破坏先前记录', async () => {
  const f = fixture()
  try {
    const { record } = await (await f.request('/rooms', 'POST', content())).json()
    f.failChunks(true)
    const response = await f.request('/rooms/' + record.id, 'PUT', { ...record, name: '不应生效' })
    assert.equal(response.status, 500)
    assert.deepEqual(await response.json(), { error: '房间记录暂不可用，请稍后重试' })
    assert.deepEqual((await (await f.request('/rooms/' + record.id)).json()).record, record)
    assert.equal(f.sqlite.prepare('SELECT COUNT(DISTINCT version_token) n FROM room_scan_chunks').get().n, 1)
    const newResponse = await f.request('/rooms', 'POST', content())
    assert.equal(newResponse.status, 500)
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM room_scans').get().n, 1)
  } finally { f.close() }
})

test('兼容读取旧inline记录并可无损更新为分块存储，缺失照片块报错而不返回残缺数据', async () => {
  const f = fixture()
  try {
    await initializeRoomRecords(f.db)
    const record = { id: 'legacy-record', ...content(), createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z', revision: 4 }
    f.sqlite.prepare('INSERT INTO room_scans VALUES(?,?,?,?,?,?,?,?,?)').run(record.id, '1', record.name, record.roomType, 1, record.createdAt, record.updatedAt, record.revision, JSON.stringify(record))
    assert.deepEqual((await (await f.request('/rooms/' + record.id)).json()).record, record)
    const response = await f.request('/rooms/' + record.id, 'PUT', record)
    assert.equal(response.status, 200)
    assert.deepEqual((await (await f.request('/rooms/' + record.id)).json()).record.images, record.images)
    f.sqlite.prepare('DELETE FROM room_scan_chunks WHERE room_id=?').run(record.id)
    assert.equal((await f.request('/rooms/' + record.id)).status, 503)
  } finally { f.close() }
})
