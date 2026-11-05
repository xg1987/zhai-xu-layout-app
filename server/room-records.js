import crypto from 'node:crypto'
import express from 'express'
import { ROOM_RECORD_BODY_LIMIT, RoomRecordError, normalizeRoomRecord } from './room-records-core.js'

export function createRoomRecordsRouter({ db, currentUser, now = Date.now }) {
  // A separate table preserves existing account and floor-plan data.
  db.exec(`CREATE TABLE IF NOT EXISTS room_scans (
    id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, name TEXT NOT NULL, room_type TEXT NOT NULL,
    object_count INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    revision INTEGER NOT NULL, record_json TEXT NOT NULL
  ); CREATE INDEX IF NOT EXISTS room_scans_owner_updated ON room_scans(owner_id, updated_at DESC);`)
  const router = express.Router()
  const auth = (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store')
    const user = currentUser(req)
    if (!user || user.id === undefined || user.id === null) return res.status(401).json({ error: '请先登录' })
    req.roomOwner = String(user.id)
    next()
  }
  const json = express.json({ limit: ROOM_RECORD_BODY_LIMIT })
  const rowFor = req => db.prepare('SELECT record_json, revision FROM room_scans WHERE id=? AND owner_id=?').get(req.params.id, req.roomOwner)
  const notFound = () => { throw new RoomRecordError('房间记录不存在', 404) }
  router.get('/rooms', auth, (req, res) => {
    const records = db.prepare(`SELECT id, name, room_type AS roomType, object_count AS objectCount,
      created_at AS createdAt, updated_at AS updatedAt, revision FROM room_scans WHERE owner_id=? ORDER BY updated_at DESC, id DESC`).all(req.roomOwner)
    res.json({ records })
  })
  router.get('/rooms/:id', auth, (req, res) => {
    const row = rowFor(req)
    if (!row) notFound()
    res.json({ record: JSON.parse(row.record_json) })
  })
  router.post('/rooms', auth, json, (req, res) => {
    const content = normalizeRoomRecord(req.body), at = new Date(now()).toISOString()
    const record = { id: crypto.randomUUID(), ...content, createdAt: at, updatedAt: at, revision: 1 }
    db.prepare(`INSERT INTO room_scans(id,owner_id,name,room_type,object_count,created_at,updated_at,revision,record_json)
      VALUES(?,?,?,?,?,?,?,?,?)`).run(record.id, req.roomOwner, record.name, record.roomType, record.objects.length, at, at, record.revision, JSON.stringify(record))
    res.status(201).json({ record })
  })
  router.put('/rooms/:id', auth, json, (req, res) => {
    const row = rowFor(req)
    if (!row) notFound()
    if (!Number.isSafeInteger(req.body?.revision) || req.body.revision < 1) throw new RoomRecordError('请提供当前记录版本后再保存')
    if (req.body.revision !== row.revision) throw new RoomRecordError('此房间记录已更新，请重新打开后再保存', 409)
    const content = normalizeRoomRecord(req.body), previous = JSON.parse(row.record_json)
    const record = { id: req.params.id, ...content, createdAt: previous.createdAt, updatedAt: new Date(now()).toISOString(), revision: row.revision + 1 }
    const update = db.prepare(`UPDATE room_scans SET name=?,room_type=?,object_count=?,updated_at=?,revision=?,record_json=?
      WHERE id=? AND owner_id=? AND revision=?`).run(record.name, record.roomType, record.objects.length, record.updatedAt, record.revision, JSON.stringify(record), record.id, req.roomOwner, row.revision)
    if (update.changes !== 1) {
      if (!rowFor(req)) notFound()
      throw new RoomRecordError('此房间记录已更新，请重新打开后再保存', 409)
    }
    res.json({ record })
  })
  router.delete('/rooms/:id', auth, (req, res) => {
    if (db.prepare('DELETE FROM room_scans WHERE id=? AND owner_id=?').run(req.params.id, req.roomOwner).changes !== 1) notFound()
    res.json({ ok: true })
  })
  router.use((error, req, res, next) => {
    if (res.headersSent) return next(error)
    const status = error.type === 'entity.too.large' ? 413 : error.type === 'entity.parse.failed' ? 400 : error instanceof RoomRecordError ? error.status : 500
    const message = error.type === 'entity.too.large' ? '房间记录过大，请缩小照片后重试' : error.type === 'entity.parse.failed' ? '请求内容格式不正确' : error instanceof RoomRecordError ? error.message : '房间记录暂不可用，请稍后重试'
    res.status(status).json({ error: message })
  })
  return router
}
