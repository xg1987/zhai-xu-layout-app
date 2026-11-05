import { ROOM_RECORD_BODY_LIMIT, RoomRecordError, normalizeRoomRecord } from '../server/room-records-core.js'

// D1 rows have a 2 MiB limit. Keep photos outside the small metadata row, in
// bounded chunks, without introducing another service or changing the API.
export const ROOM_IMAGE_CHUNK_SIZE = 512 * 1024
export const ROOM_SCANS_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS room_scans (
    id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, name TEXT NOT NULL, room_type TEXT NOT NULL,
    object_count INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    revision INTEGER NOT NULL, record_json TEXT NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS room_scans_owner_updated ON room_scans(owner_id, updated_at DESC)',
  `CREATE TABLE IF NOT EXISTS room_scan_chunks (
    room_id TEXT NOT NULL, owner_id TEXT NOT NULL, version_token TEXT NOT NULL,
    image_index INTEGER NOT NULL, chunk_index INTEGER NOT NULL, data TEXT NOT NULL,
    PRIMARY KEY(room_id, version_token, image_index, chunk_index)
  )`,
]
const schemaReady = new WeakMap()
export async function initializeRoomRecords(db) {
  if (!schemaReady.has(db)) {
    const ready = db.batch(ROOM_SCANS_SCHEMA.map(sql => db.prepare(sql))).catch(error => { schemaReady.delete(db); throw error })
    schemaReady.set(db, ready)
  }
  await schemaReady.get(db)
}

const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers },
})
const missing = () => { throw new RoomRecordError('房间记录不存在', 404) }
const conflict = () => { throw new RoomRecordError('此房间记录已更新，请重新打开后再保存', 409) }
const readFailure = () => { throw new RoomRecordError('房间照片读取不完整，请稍后重新打开', 503) }

async function readBody(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') || '') || !request.body) throw new RoomRecordError('请求内容格式不正确')
  if (Number(request.headers.get('Content-Length')) > ROOM_RECORD_BODY_LIMIT) throw new RoomRecordError('房间记录过大，请缩小照片后重试', 413)
  const reader = request.body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true }), parts = []
  let length = 0
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > ROOM_RECORD_BODY_LIMIT) {
        await reader.cancel().catch(() => {})
        throw new RoomRecordError('房间记录过大，请缩小照片后重试', 413)
      }
      parts.push(decoder.decode(value, { stream: true }))
    }
    parts.push(decoder.decode())
    return JSON.parse(parts.join(''))
  } catch (error) {
    if (error instanceof RoomRecordError) throw error
    throw new RoomRecordError('请求内容格式不正确')
  } finally { reader.releaseLock() }
}

function chunkRecord(record) {
  const token = crypto.randomUUID(), chunks = [], imageLengths = []
  const images = record.images.map((image, imageIndex) => {
    imageLengths.push(image.dataUrl.length)
    for (let offset = 0, index = 0; offset < image.dataUrl.length; offset += ROOM_IMAGE_CHUNK_SIZE, index++) {
      chunks.push({ imageIndex, index, data: image.dataUrl.slice(offset, offset + ROOM_IMAGE_CHUNK_SIZE) })
    }
    return { id: image.id }
  })
  const stored = { storage: 'room-scan-chunks-v1', token, imageLengths, record: { ...record, images } }
  return { token, chunks, metadata: JSON.stringify(stored) }
}

function restoreRecord(row, chunks) {
  const value = JSON.parse(row.record_json)
  // Older small records may use the original Node-compatible inline JSON.
  if (value.storage !== 'room-scan-chunks-v1') return value
  if (!value.record || !Array.isArray(value.record.images) || !Array.isArray(value.imageLengths) || value.record.images.length !== value.imageLengths.length) readFailure()
  const groups = value.record.images.map(() => [])
  for (const chunk of chunks) {
    if (chunk.version_token !== value.token || !Number.isInteger(chunk.image_index) || !groups[chunk.image_index] || chunk.chunk_index !== groups[chunk.image_index].length || typeof chunk.data !== 'string') readFailure()
    groups[chunk.image_index].push(chunk.data)
  }
  const images = value.record.images.map((image, index) => {
    const dataUrl = groups[index].join('')
    if (dataUrl.length !== value.imageLengths[index]) readFailure()
    return { id: image.id, dataUrl }
  })
  return { ...value.record, images }
}

function chunkWrites(db, record, owner, stored) {
  return stored.chunks.map(chunk => db.prepare(`INSERT INTO room_scan_chunks(room_id,owner_id,version_token,image_index,chunk_index,data)
    SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM room_scans WHERE id=? AND owner_id=? AND revision=? AND json_extract(record_json,'$.token')=?)`)
    .bind(record.id, owner, stored.token, chunk.imageIndex, chunk.index, chunk.data, record.id, owner, record.revision, stored.token))
}

export async function handleRooms({ request, env, user, path = new URL(request.url).pathname }) {
  const route = path.replace(/^\/api(?=\/|$)/, '').replace(/\/$/, '')
  const match = /^\/rooms(?:\/([^/]+))?$/.exec(route)
  if (!match) return null
  if (!user || user.id === undefined || user.id === null) return json({ error: '请先登录' }, 401)
  if (!env?.DB) return json({ error: '房间记录服务尚未配置' }, 503)
  const db = env.DB, owner = String(user.id)
  let id
  try { id = match[1] ? decodeURIComponent(match[1]) : null } catch { return json({ error: '房间记录标识不正确' }, 400) }
  try {
    await initializeRoomRecords(db)
    if (!id && request.method === 'GET') {
      const result = await db.prepare(`SELECT id,name,room_type AS roomType,object_count AS objectCount,
        created_at AS createdAt,updated_at AS updatedAt,revision FROM room_scans WHERE owner_id=? ORDER BY updated_at DESC,id DESC`).bind(owner).all()
      return json({ records: result.results })
    }
    if (id && request.method === 'GET') {
      // A batch sees one consistent snapshot, including during replacement/deletion.
      const [rows, chunks] = await db.batch([
        db.prepare('SELECT record_json FROM room_scans WHERE id=? AND owner_id=?').bind(id, owner),
        db.prepare(`SELECT image_index,chunk_index,version_token,data FROM room_scan_chunks WHERE room_id=? AND owner_id=?
          AND version_token=(SELECT json_extract(record_json,'$.token') FROM room_scans WHERE id=? AND owner_id=?) ORDER BY image_index,chunk_index`).bind(id, owner, id, owner),
      ])
      if (!rows.results.length) missing()
      return json({ record: restoreRecord(rows.results[0], chunks.results) })
    }
    if (!id && request.method === 'POST') {
      const content = normalizeRoomRecord(await readBody(request)), at = new Date().toISOString()
      const record = { id: crypto.randomUUID(), ...content, createdAt: at, updatedAt: at, revision: 1 }
      const stored = chunkRecord(record)
      await db.batch([
        db.prepare(`INSERT INTO room_scans(id,owner_id,name,room_type,object_count,created_at,updated_at,revision,record_json)
          VALUES(?,?,?,?,?,?,?,?,?)`).bind(record.id, owner, record.name, record.roomType, record.objects.length, at, at, 1, stored.metadata),
        ...chunkWrites(db, record, owner, stored),
      ])
      return json({ record }, 201)
    }
    if (id && request.method === 'PUT') {
      const previous = await db.prepare('SELECT revision,created_at FROM room_scans WHERE id=? AND owner_id=?').bind(id, owner).first()
      if (!previous) missing()
      const body = await readBody(request)
      if (!Number.isSafeInteger(body?.revision) || body.revision < 1) throw new RoomRecordError('请提供当前记录版本后再保存')
      if (body.revision !== previous.revision) conflict()
      const content = normalizeRoomRecord(body)
      const record = { id, ...content, createdAt: previous.created_at, updatedAt: new Date().toISOString(), revision: previous.revision + 1 }
      const stored = chunkRecord(record)
      const [update] = await db.batch([
        db.prepare(`UPDATE room_scans SET name=?,room_type=?,object_count=?,updated_at=?,revision=?,record_json=? WHERE id=? AND owner_id=? AND revision=?`)
          .bind(record.name, record.roomType, record.objects.length, record.updatedAt, record.revision, stored.metadata, id, owner, previous.revision),
        ...chunkWrites(db, record, owner, stored),
        // The random token makes this cleanup a no-op for a losing concurrent PUT.
        db.prepare(`DELETE FROM room_scan_chunks WHERE room_id=? AND owner_id=? AND version_token<>?
          AND EXISTS(SELECT 1 FROM room_scans WHERE id=? AND owner_id=? AND json_extract(record_json,'$.token')=?)`).bind(id, owner, stored.token, id, owner, stored.token),
      ])
      if (update.meta.changes !== 1) {
        if (!await db.prepare('SELECT id FROM room_scans WHERE id=? AND owner_id=?').bind(id, owner).first()) missing()
        conflict()
      }
      return json({ record })
    }
    if (id && request.method === 'DELETE') {
      const [, result] = await db.batch([
        db.prepare(`DELETE FROM room_scan_chunks WHERE room_id=? AND owner_id=? AND EXISTS(SELECT 1 FROM room_scans WHERE id=? AND owner_id=?)`).bind(id, owner, id, owner),
        db.prepare('DELETE FROM room_scans WHERE id=? AND owner_id=?').bind(id, owner),
      ])
      if (result.meta.changes !== 1) missing()
      return json({ ok: true })
    }
    return json({ error: '请求方式不支持' }, 405, { Allow: id ? 'GET, PUT, DELETE' : 'GET, POST' })
  } catch (error) {
    return json({ error: error instanceof RoomRecordError ? error.message : '房间记录暂不可用，请稍后重试' }, error instanceof RoomRecordError ? error.status : 500)
  }
}
