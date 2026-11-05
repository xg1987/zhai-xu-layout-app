import test from 'node:test'
import assert from 'node:assert/strict'
import { draftFromRecord, emptyRoomDraft, prepareRoomPhotos, roomPayload } from './room-client.js'

const object = { id: 'object-1', label: ' 沙发 ', category: 'furniture', sourceImageIndex: 0, bbox: [10, 20, 100, 200], planPosition: [200, 400], confidence: 'medium', note: ' 待核对 ', confirmed: false }
const photo = { id: 'photo-1', dataUrl: 'data:image/jpeg;base64,/9j/', filename: 'excluded.jpg', ownerId: 'excluded' }
const record = { ...emptyRoomDraft(), id: 'room-1', revision: 3, name: ' 客厅 ', images: [photo], roomType: ' 客厅 ', objects: [{ ...object, rawResponse: 'excluded' }], observations: ['可见沙发'], limitations: ['尺寸未经测量'], northAngle: 10.5, ownerId: 'excluded', createdAt: 'excluded', updatedAt: 'excluded', isRoom: true, provider: 'excluded', apiKey: 'excluded' }

test('保存只传房间白名单及更新revision，排除身份/模型内容/图片额外字段', () => {
  const payload = roomPayload(record)
  assert.deepEqual(Object.keys(payload).sort(), ['name', 'images', 'roomType', 'objects', 'observations', 'limitations', 'northAngle', 'revision'].sort())
  assert.deepEqual(payload.images, [{ id: photo.id, dataUrl: photo.dataUrl }])
  assert.deepEqual(Object.keys(payload.objects[0]).sort(), ['id', 'label', 'category', 'sourceImageIndex', 'bbox', 'planPosition', 'confidence', 'note', 'confirmed'].sort())
  assert.equal(payload.name, '客厅')
  assert.equal(payload.roomType, '客厅')
  assert.equal(payload.objects[0].label, '沙发')
  assert.equal(payload.objects[0].note, '待核对')
  assert.equal(payload.revision, 3)
  assert.equal(JSON.stringify(payload).includes('excluded'), false)
  assert.equal(Object.hasOwn(roomPayload(emptyRoomDraft()), 'revision'), false)
})

test('恢复草稿保留记录身份/版本/照片/位置，未知值不编造，修改草稿不污染输入', () => {
  const restored = draftFromRecord(record)
  assert.equal(restored.id, record.id)
  assert.equal(restored.revision, record.revision)
  assert.deepEqual(restored.objects[0].planPosition, [200, 400])
  assert.deepEqual(restored.objects[0].bbox, [10, 20, 100, 200])
  assert.equal(restored.objects[0].confirmed, false)
  assert.equal(restored.northAngle, 10.5)
  assert.equal(restored.ownerId, undefined)
  assert.equal(restored.isRoom, undefined)
  assert.equal(restored.createdAt, undefined)
  restored.images[0].dataUrl = 'changed'
  restored.objects[0].bbox[0] = 999
  restored.objects[0].planPosition[0] = 999
  restored.observations.push('changed')
  assert.equal(record.images[0].dataUrl, photo.dataUrl)
  assert.deepEqual(record.objects[0].bbox, [10, 20, 100, 200])
  assert.deepEqual(record.objects[0].planPosition, [200, 400])
  assert.equal(record.observations.length, 1)
  const unknown = roomPayload({ ...emptyRoomDraft(), roomType: ' ', objects: [{ ...object, category: ' ', bbox: undefined, planPosition: undefined, confirmed: undefined }] })
  assert.equal(unknown.roomType, 'unknown')
  assert.equal(unknown.objects[0].category, 'unknown')
  assert.equal(unknown.objects[0].bbox, null)
  assert.equal(unknown.objects[0].planPosition, null)
  assert.equal(unknown.objects[0].confirmed, false)
})

test('空选择可取消，超过4张或累加超额在解码前整批拒绝', async () => {
  assert.deepEqual(await prepareRoomPhotos([]), [])
  assert.deepEqual(await prepareRoomPhotos(null), [])
  const valid = { type: 'image/png', size: 100 }
  await assert.rejects(prepareRoomPhotos(Array(5).fill(valid)), /最多添加 4 张/)
  await assert.rejects(prepareRoomPhotos([valid, valid], { existingCount: 3 }), /最多添加 4 张/)
  await assert.rejects(prepareRoomPhotos([valid], { existingCount: 4 }), /最多添加 4 张/)
})

test('不支持类型、空文件、超过20MB或混合错误批次在解码前全部拒绝', async () => {
  const valid = { type: 'image/jpeg', size: 1024 }
  await assert.rejects(prepareRoomPhotos([{ type: 'image/heic', size: 100 }]), /仅支持 PNG、JPG 或 WebP/)
  await assert.rejects(prepareRoomPhotos([{ type: 'image/png', size: 0 }]), /20 MB/)
  await assert.rejects(prepareRoomPhotos([{ type: 'image/webp', size: 20 * 1024 * 1024 + 1 }]), /20 MB/)
  // A valid first file must not start decoding when a later file invalidates the batch.
  // This test has no Image/document implementation and never contacts a service.
  await assert.rejects(prepareRoomPhotos([valid, { type: 'image/gif', size: 200 }]), /仅支持 PNG、JPG 或 WebP/)
  await assert.rejects(prepareRoomPhotos([valid, { type: 'image/png', size: 21 * 1024 * 1024 }]), /20 MB/)
})
