// Portable validation shared by Node and Cloudflare; no database or account access.
export const ROOM_RECORD_BODY_LIMIT = 17 * 1024 * 1024
const MAX_IMAGE_BYTES = 12 * 1024 * 1024
const invalidText = /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/
// Notes can contain line breaks, while other controls and directional overrides remain invalid.
const invalidMultilineText = /[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/
const plainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const coordinate = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1000

export class RoomRecordError extends Error {
  constructor(message, status = 400) { super(message); this.status = status }
}

function onlyKeys(value, keys, message = '记录包含不支持的字段') {
  if (!plainObject(value) || Object.keys(value).some(key => !keys.includes(key))) throw new RoomRecordError(message)
}

function text(value, maximum, label, fallback, multiline = false) {
  if (value === undefined && fallback !== undefined) return fallback
  if (typeof value !== 'string' || value.length > maximum || (multiline ? invalidMultilineText : invalidText).test(value)) throw new RoomRecordError(`${label}格式不正确`)
  const result = value.trim()
  if (!result && fallback === undefined) throw new RoomRecordError(`请输入${label}`)
  return result || fallback
}

function identifier(value, label) {
  const id = text(value, 64, label)
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new RoomRecordError(`${label}格式不正确`)
  return id
}

export function validateRoomRecordImage(image) {
  if (typeof image !== 'string' || image.length > 7 * 1024 * 1024) throw new RoomRecordError('图片过大，请使用较小的户型图片')
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(image)
  if (!match) throw new RoomRecordError('仅支持 PNG、JPG 或 WebP 图片')
  let bytes
  try { bytes = atob(match[2]) } catch { throw new RoomRecordError('图片编码不正确，请重新选择图片') }
  if (btoa(bytes) !== match[2]) throw new RoomRecordError('图片编码不正确，请重新选择图片')
  const valid = match[1] === 'png' ? bytes.slice(0, 8) === '\x89PNG\r\n\x1a\n' : match[1] === 'jpeg' ? bytes.slice(0, 3) === '\xff\xd8\xff' : bytes.slice(0, 4) === 'RIFF' && bytes.slice(8, 12) === 'WEBP'
  if (!valid || bytes.length > 5 * 1024 * 1024) throw new RoomRecordError('图片格式不正确或超过 5 MB')
  return { byteLength: bytes.length }
}

export function normalizeRoomRecord(body) {
  // These read-only fields may be returned by a client editing a fetched record.
  // Ownership is deliberately absent: it is always derived from the session.
  onlyKeys(body, ['id', 'name', 'images', 'roomType', 'objects', 'observations', 'limitations', 'northAngle', 'createdAt', 'updatedAt', 'revision'])
  if (new TextEncoder().encode(JSON.stringify(body)).byteLength > ROOM_RECORD_BODY_LIMIT) throw new RoomRecordError('房间记录过大，请缩小照片后重试', 413)
  const name = text(body.name, 60, '记录名称')
  if (!Array.isArray(body.images) || body.images.length < 1 || body.images.length > 4) throw new RoomRecordError('请选择 1–4 张房间照片')
  const imageIds = new Set()
  let imageBytes = 0
  const images = body.images.map(image => {
    onlyKeys(image, ['id', 'dataUrl'], '照片格式不正确')
    const id = identifier(image.id, '照片标识')
    if (imageIds.has(id)) throw new RoomRecordError('照片标识不能重复')
    imageIds.add(id)
    const validated = validateRoomRecordImage(image.dataUrl)
    imageBytes += validated.byteLength
    return { id, dataUrl: image.dataUrl }
  })
  if (imageBytes > MAX_IMAGE_BYTES) throw new RoomRecordError('房间照片总大小不能超过 12 MB，请缩小后重试')
  const roomType = text(body.roomType, 48, '房间类型', 'unknown')
  if (!Array.isArray(body.objects) || body.objects.length > 30) throw new RoomRecordError('主要物品最多保存 30 项')
  const objectIds = new Set()
  const objects = body.objects.map(item => {
    onlyKeys(item, ['id', 'label', 'category', 'sourceImageIndex', 'bbox', 'planPosition', 'confidence', 'note', 'confirmed'], '物品格式不正确')
    const id = identifier(item.id, '物品标识')
    if (objectIds.has(id)) throw new RoomRecordError('物品标识不能重复')
    objectIds.add(id)
    if (!Number.isInteger(item.sourceImageIndex) || item.sourceImageIndex < 0 || item.sourceImageIndex >= images.length) throw new RoomRecordError('物品对应照片不正确')
    const bbox = item.bbox ?? null, planPosition = item.planPosition ?? null
    if (bbox !== null && (!Array.isArray(bbox) || bbox.length !== 4 || !bbox.every(coordinate) || bbox[2] <= 0 || bbox[3] <= 0 || bbox[0] + bbox[2] > 1000 || bbox[1] + bbox[3] > 1000)) throw new RoomRecordError('物品照片坐标不正确')
    if (planPosition !== null && (!Array.isArray(planPosition) || planPosition.length !== 2 || !planPosition.every(coordinate))) throw new RoomRecordError('物品布局坐标不正确')
    if (!['high', 'medium', 'low'].includes(item.confidence)) throw new RoomRecordError('物品识别把握格式不正确')
    if (item.confirmed !== undefined && typeof item.confirmed !== 'boolean') throw new RoomRecordError('物品确认状态不正确')
    return {
      id, label: text(item.label, 80, '物品名称'), category: text(item.category, 48, '物品类别', 'unknown'),
      sourceImageIndex: item.sourceImageIndex, bbox, planPosition, confidence: item.confidence,
      note: text(item.note, 300, '物品说明', '', true), confirmed: item.confirmed ?? false,
    }
  })
  const messages = (values, label) => {
    if (values === undefined) return []
    if (!Array.isArray(values) || values.length > 10) throw new RoomRecordError(`${label}最多保存 10 项`)
    return values.map(item => text(item, 300, label))
  }
  const northAngle = body.northAngle ?? null
  if (northAngle !== null && (typeof northAngle !== 'number' || !Number.isFinite(northAngle) || northAngle < 0 || northAngle >= 360)) throw new RoomRecordError('北向角度应为 0 至小于 360 的数值，未校准时请留空')
  return { name, images, roomType, objects, observations: messages(body.observations, '可见信息'), limitations: messages(body.limitations, '待核对说明'), northAngle }
}

