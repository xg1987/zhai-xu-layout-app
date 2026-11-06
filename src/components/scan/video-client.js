import { throwIfAborted } from './room-client.js'

const MAX_VIDEO_BYTES = 80 * 1024 * 1024
const MAX_FRAME_BYTES = 2 * 1024 * 1024
const METADATA_TIMEOUT = 20000
const FRAME_TIMEOUT = 15000
const FRAME_COUNT = 4
const EMPTY_MIME_EXTENSIONS = /\.(?:mov|mp4|m4v|webm|ogv|ogg)$/i

export function validateRoomVideoFile(file) {
  const type = typeof file?.type === 'string' ? file.type.trim().toLowerCase() : ''
  if (!file || (!/^video\/[a-z0-9][a-z0-9.+-]*$/.test(type) && !(type === '' && EMPTY_MIME_EXTENSIONS.test(file.name || '')))) throw new Error('请选择视频文件，支持手机录像、MP4、MOV 或 WebM')
  if (!Number.isSafeInteger(file.size) || file.size <= 0 || file.size > MAX_VIDEO_BYTES) throw new Error('视频不能为空，单个视频最多 80 MB')
}

export function sampleRoomVideoTimes(duration) {
  if (!Number.isFinite(duration)) throw new Error('无法确定视频时长，请选择完整的本地视频')
  if (duration < 2 || duration > 60) throw new Error('请选择 2–60 秒的房间视频')
  // Sample the center of each quarter, covering the scan without using endpoints.
  return Array.from({ length: FRAME_COUNT }, (_, index) => duration * (index + 0.5) / FRAME_COUNT)
}

function waitForVideo(video, events, { signal, timeout, timeoutMessage, ready = () => true, action }) {
  return new Promise((resolve, reject) => {
    let timer, finished = false
    const cleanup = () => {
      for (const name of events) video.removeEventListener(name, loaded)
      video.removeEventListener('error', failed)
      signal?.removeEventListener('abort', aborted)
      if (timer !== undefined) clearTimeout(timer)
    }
    const settle = error => {
      if (finished) return
      finished = true; cleanup()
      if (error) reject(error)
      else resolve()
    }
    function loaded(event) {
      try { if (ready(event.type)) settle() } catch (error) { settle(error) }
    }
    function failed() { settle(new Error('视频无法解码，请换用手机常用的 MP4、MOV 或 WebM 视频')) }
    function aborted() { settle(new DOMException('操作已取消', 'AbortError')) }
    for (const name of events) video.addEventListener(name, loaded)
    video.addEventListener('error', failed)
    signal?.addEventListener('abort', aborted, { once: true })
    timer = setTimeout(() => settle(new Error(timeoutMessage)), timeout)
    if (signal?.aborted) { aborted(); return }
    try { action() } catch (error) { settle(error) }
  })
}

function jpegBytes(dataUrl) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/jpeg;base64,')) return Infinity
  const encoded = dataUrl.slice(dataUrl.indexOf(',') + 1)
  if (!encoded.length) return Infinity
  return encoded.length * 3 / 4 - (encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0)
}

export async function prepareRoomVideo(file, { signal, onProgress } = {}) {
  throwIfAborted(signal)
  validateRoomVideoFile(file)
  let video, canvas, url
  try {
    video = document.createElement('video')
    video.preload = 'auto'; video.muted = true; video.playsInline = true
    url = URL.createObjectURL(file)
    await waitForVideo(video, ['loadedmetadata'], {
      signal, timeout: METADATA_TIMEOUT, timeoutMessage: '视频加载超时，请重新选择较小的视频',
      action: () => { video.src = url; video.load() },
    })
    throwIfAborted(signal)
    const times = sampleRoomVideoTimes(video.duration)
    const width = video.videoWidth, height = video.videoHeight
    if (!Number.isInteger(width) || !Number.isInteger(height) || Math.min(width, height) < 64 || Math.max(width, height) > 16384 || width * height > 100000000) throw new Error('视频分辨率过低或过大，请使用清晰的普通手机视频')
    const scale = Math.min(1, 1600 / Math.max(width, height))
    canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('当前浏览器无法提取视频画面，请换一个浏览器重试')
    const images = []
    for (const time of times) {
      throwIfAborted(signal)
      let seeked = false
      await waitForVideo(video, ['seeked', 'loadeddata', 'canplay'], {
        signal, timeout: FRAME_TIMEOUT, timeoutMessage: '视频取帧超时，请换用较短或较小的视频',
        ready: event => {
          if (event === 'seeked') seeked = true
          return seeked && !video.seeking && video.readyState >= 2 && Math.abs(video.currentTime - time) <= 0.1
        },
        action: () => { video.currentTime = time },
      })
      throwIfAborted(signal)
      context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(video, 0, 0, canvas.width, canvas.height)
      let dataUrl
      for (const quality of [0.85, 0.72, 0.6, 0.48, 0.36]) {
        throwIfAborted(signal)
        dataUrl = canvas.toDataURL('image/jpeg', quality)
        if (jpegBytes(dataUrl) <= MAX_FRAME_BYTES) break
      }
      if (jpegBytes(dataUrl) > MAX_FRAME_BYTES) throw new Error('视频画面压缩后仍过大，请换用较小分辨率的视频')
      images.push({ id: crypto.randomUUID(), dataUrl })
      onProgress?.({ completed: images.length, total: FRAME_COUNT })
    }
    throwIfAborted(signal)
    return images
  } finally {
    if (canvas) { canvas.width = 0; canvas.height = 0 }
    if (video) {
      try { video.pause() } catch {}
      try { video.removeAttribute('src'); video.load() } catch {}
    }
    if (url !== undefined) URL.revokeObjectURL(url)
  }
}
