const MAX_ORIGINAL_BYTES = 20 * 1024 * 1024
const MAX_PREPARED_BYTES = 2 * 1024 * 1024
const TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])

export function throwIfAborted(signal) {
  if (signal?.aborted) throw new DOMException('操作已取消', 'AbortError')
}

export async function roomRequest(path, { body, ...options } = {}) {
  const response = await fetch(`/api${path}`, { ...options, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...options.headers }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) })
  const result = await response.json().catch(() => { throw new Error('本机服务暂不可用，请稍后重试') })
  if (response.status === 401) {
    window.location.replace('/login')
    throw new Error('登录已失效，请重新登录')
  }
  if (!response.ok) {
    const error = new Error(response.status === 409 ? '记录已在其他页面更新，请重新打开该房间后再保存。当前草稿仍保留。' : result.error || '操作未完成，请重试')
    error.status = response.status
    throw error
  }
  return result
}

function decodePhoto(file, signal) {
  return new Promise((resolve, reject) => {
    throwIfAborted(signal)
    const image = new Image(), url = URL.createObjectURL(file)
    function cleanup() { image.onload = null; image.onerror = null; signal?.removeEventListener('abort', abort); URL.revokeObjectURL(url) }
    function abort() { cleanup(); image.src = ''; reject(new DOMException('操作已取消', 'AbortError')) }
    image.onload = () => { cleanup(); resolve(image) }
    image.onerror = () => { cleanup(); reject(new Error('照片无法读取，请重新选择 PNG、JPG 或 WebP 图片')) }
    signal?.addEventListener('abort', abort, { once: true })
    image.decoding = 'async'
    image.src = url
  })
}

function dataBytes(dataUrl) {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  return base64.length * 3 / 4 - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0)
}

export async function prepareRoomPhotos(files, { existingCount = 0, signal } = {}) {
  const batch = Array.from(files || [])
  if (!batch.length) return []
  if (existingCount + batch.length > 4) throw new Error('一个房间最多添加 4 张照片，请减少所选照片')
  for (const file of batch) {
    if (!TYPES.has(file.type)) throw new Error('仅支持 PNG、JPG 或 WebP 照片')
    if (!file.size || file.size > MAX_ORIGINAL_BYTES) throw new Error('单张原始照片不能超过 20 MB')
  }
  const prepared = []
  // Decode sequentially to bound memory; only return once the complete batch is ready.
  for (const file of batch) {
    throwIfAborted(signal)
    const image = await decodePhoto(file, signal)
    throwIfAborted(signal)
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 100000000) throw new Error('照片尺寸过大或无法读取，请换一张较小的图片')
    const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    try {
      const context = canvas.getContext('2d')
      if (!context) throw new Error('当前浏览器无法处理照片，请换一个浏览器重试')
      context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      let dataUrl
      for (const quality of [0.85, 0.72, 0.6, 0.48, 0.36]) {
        throwIfAborted(signal)
        dataUrl = canvas.toDataURL('image/jpeg', quality)
        if (dataBytes(dataUrl) <= MAX_PREPARED_BYTES) break
      }
      if (!dataUrl.startsWith('data:image/jpeg;base64,') || dataBytes(dataUrl) > MAX_PREPARED_BYTES) throw new Error('照片压缩后仍过大，请换一张较小的图片')
      prepared.push({ id: crypto.randomUUID(), dataUrl })
    } finally { canvas.width = 0; canvas.height = 0; image.src = '' }
  }
  throwIfAborted(signal)
  return prepared
}

export const emptyRoomDraft = () => ({ name: '未命名房间', images: [], roomType: 'unknown', objects: [], observations: [], limitations: [], northAngle: null })

// Keep ownership, raw provider responses and read-only timestamps out of writes.
export function roomPayload(draft) {
  return {
    name: draft.name.trim(), images: draft.images.map(({ id, dataUrl }) => ({ id, dataUrl })), roomType: draft.roomType.trim() || 'unknown',
    objects: draft.objects.map(item => ({ id: item.id, label: item.label.trim(), category: item.category.trim() || 'unknown', sourceImageIndex: item.sourceImageIndex, bbox: item.bbox ? [...item.bbox] : null, planPosition: item.planPosition ? [...item.planPosition] : null, confidence: item.confidence, note: item.note.trim(), confirmed: !!item.confirmed })),
    observations: [...draft.observations], limitations: [...draft.limitations], northAngle: draft.northAngle,
    ...(draft.id && Number.isSafeInteger(draft.revision) ? { revision: draft.revision } : {}),
  }
}

export function draftFromRecord(record) {
  return { ...emptyRoomDraft(), ...roomPayload(record), id: record.id, revision: record.revision }
}
