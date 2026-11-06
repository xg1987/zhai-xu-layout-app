import test from 'node:test'
import assert from 'node:assert/strict'
import { prepareRoomVideo, sampleRoomVideoTimes, validateRoomVideoFile } from './video-client.js'

const file = changes => ({ name: 'room.mov', type: 'video/quicktime', size: 1024, ...changes })

function browserFixture(options = {}) {
  const originals = { document: Object.getOwnPropertyDescriptor(globalThis, 'document'), createURL: URL.createObjectURL, revokeURL: URL.revokeObjectURL, setTimeout, clearTimeout }
  const videos = [], canvases = [], createdURLs = [], revokedURLs = [], draws = [], qualities = [], timers = new Map()
  let nextTimer = 0
  class Video extends EventTarget {
    constructor() {
      super(); this.duration = options.duration ?? 8; this.videoWidth = options.width ?? 1920; this.videoHeight = options.height ?? 1080
      this.src = ''; this.readyState = 0; this.seeking = false; this.time = 0; this.seeks = []; this.listeners = new Map(); this.pauseCalls = 0; this.loadCalls = 0
    }
    addEventListener(type, callback, config) {
      if (!this.listeners.has(type)) this.listeners.set(type, new Set())
      this.listeners.get(type).add(callback); super.addEventListener(type, callback, config)
    }
    removeEventListener(type, callback, config) { this.listeners.get(type)?.delete(callback); super.removeEventListener(type, callback, config) }
    load() {
      this.loadCalls++
      if (!this.src || options.metadata === 'stall') return
      queueMicrotask(() => {
        if (options.metadata === 'error') this.dispatchEvent(new Event('error'))
        else { this.readyState = 1; this.dispatchEvent(new Event('loadedmetadata')) }
      })
    }
    get currentTime() { return this.time }
    set currentTime(value) {
      this.time = value; this.seeks.push(value); this.seeking = true
      const count = this.seeks.length
      if (options.stallAt === count) return
      queueMicrotask(() => {
        if (options.errorAt === count) { this.dispatchEvent(new Event('error')); return }
        options.onSeek?.(count)
        if (!this.src) return
        this.seeking = false; this.readyState = options.delayedData ? 1 : 2; this.dispatchEvent(new Event('seeked'))
        if (options.delayedData) queueMicrotask(() => { this.readyState = 2; this.dispatchEvent(new Event('loadeddata')) })
      })
    }
    pause() { this.pauseCalls++ }
    removeAttribute(name) { if (name === 'src') this.src = '' }
  }
  class Canvas {
    constructor() { this.width = 0; this.height = 0; this.frameQualityCount = 0 }
    getContext() {
      if (options.noContext) return null
      return {
        fillRect() {},
        drawImage: (video, x, y, width, height) => {
          assert.equal(video.seeking, false, 'must wait for seek completion before drawing')
          assert.ok(video.readyState >= 2, 'must wait for current frame data before drawing')
          if (options.drawError) throw new Error('模拟画布解码错误')
          this.time = video.currentTime; this.frameQualityCount = 0; draws.push({ time: this.time, width, height })
        },
      }
    }
    toDataURL(type, quality) {
      qualities.push(quality); this.frameQualityCount++
      if (options.alwaysLarge || this.frameQualityCount <= (options.largeQualities ?? 0)) return 'data:image/jpeg;base64,' + 'A'.repeat(3 * 1024 * 1024)
      return 'data:image/jpeg;base64,' + Buffer.concat([Buffer.from([255, 216, 255]), Buffer.from('frame@' + this.time)]).toString('base64')
    }
  }
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement(type) {
    if (type === 'video') { const element = new Video(); videos.push(element); return element }
    if (type === 'canvas') { const element = new Canvas(); canvases.push(element); return element }
    throw new Error('unexpected DOM element')
  } } })
  URL.createObjectURL = input => { const url = 'blob:test-' + createdURLs.length; createdURLs.push({ input, url }); return url }
  URL.revokeObjectURL = url => revokedURLs.push(url)
  globalThis.setTimeout = (callback, delay) => { const id = ++nextTimer; timers.set(id, { callback, delay }); return id }
  globalThis.clearTimeout = id => timers.delete(id)
  return {
    videos, canvases, createdURLs, draws, qualities,
    nextTimer() { const [id, timer] = timers.entries().next().value || []; assert.ok(timer, 'a timeout must be pending'); timers.delete(id); timer.callback(); return timer.delay },
    assertReleased() {
      assert.deepEqual(revokedURLs, createdURLs.map(item => item.url))
      assert.equal(timers.size, 0)
      for (const video of videos) {
        assert.equal(video.src, ''); assert.equal(video.pauseCalls, 1)
        assert.ok([...video.listeners.values()].every(listeners => listeners.size === 0), 'media listeners must be removed')
      }
      for (const canvas of canvases) { assert.equal(canvas.width, 0); assert.equal(canvas.height, 0) }
    },
    restore() {
      if (originals.document) Object.defineProperty(globalThis, 'document', originals.document)
      else delete globalThis.document
      URL.createObjectURL = originals.createURL; URL.revokeObjectURL = originals.revokeURL
      globalThis.setTimeout = originals.setTimeout; globalThis.clearTimeout = originals.clearTimeout
    },
  }
}

test('视频采样覆盖四等分中心，2至60秒边界有效且未知时长不编造', () => {
  assert.deepEqual(sampleRoomVideoTimes(8), [1, 3, 5, 7])
  assert.deepEqual(sampleRoomVideoTimes(2), [0.25, 0.75, 1.25, 1.75])
  assert.deepEqual(sampleRoomVideoTimes(60), [7.5, 22.5, 37.5, 52.5])
  for (const duration of [NaN, Infinity, undefined]) assert.throws(() => sampleRoomVideoTimes(duration), /无法确定视频时长/)
  for (const duration of [0, 1.99, 60.01, -10]) assert.throws(() => sampleRoomVideoTimes(duration), /2–60 秒/)
})

test('接受手机视频及空MIME的常见MOV，拒绝空文件、超80MB和伪视频扩展', () => {
  for (const video of [file(), file({ type: 'video/mp4' }), file({ type: '', name: 'ROOM.MOV' }), file({ type: '', name: 'room.mp4' }), file({ size: 80 * 1024 * 1024 })]) assert.doesNotThrow(() => validateRoomVideoFile(video))
  for (const video of [null, file({ type: 'image/jpeg', name: 'fake.mov' }), file({ type: 'video/' }), file({ type: '', name: 'photo.jpg' }), file({ type: '', name: 'unknown' })]) assert.throws(() => validateRoomVideoFile(video), /请选择视频文件/)
  for (const size of [0, -1, 0.5, NaN, Infinity, 80 * 1024 * 1024 + 1]) assert.throws(() => validateRoomVideoFile(file({ size })), /80 MB/)
})

test('顺序解码4个不同时间帧，一次canvas缩放压缩，进度与现有图片契约兼容且释放资源', async () => {
  const browser = browserFixture({ largeQualities: 2, delayedData: true }), progress = []
  try {
    const images = await prepareRoomVideo(file(), { onProgress: value => progress.push(value) })
    assert.equal(browser.videos.length, 1); assert.equal(browser.canvases.length, 1)
    assert.deepEqual(browser.videos[0].seeks, [1, 3, 5, 7])
    assert.deepEqual(browser.draws, [1, 3, 5, 7].map(time => ({ time, width: 1600, height: 900 })))
    assert.deepEqual(progress, [1, 2, 3, 4].map(completed => ({ completed, total: 4 })))
    assert.equal(new Set(images.map(image => image.id)).size, 4)
    assert.deepEqual(images.map(image => Object.keys(image).sort()), Array(4).fill(['dataUrl', 'id']))
    assert.deepEqual(images.map(image => Buffer.from(image.dataUrl.split(',')[1], 'base64').subarray(3).toString()), ['frame@1', 'frame@3', 'frame@5', 'frame@7'])
    assert.deepEqual(browser.qualities, Array.from({ length: 4 }, () => [0.85, 0.72, 0.6]).flat())
    browser.assertReleased()
  } finally { browser.restore() }
})

test('取消支持预先取消、取帧中和进度回调后取消，均不返回不完整图片且清理监听器', async () => {
  const early = new AbortController(); early.abort()
  await assert.rejects(prepareRoomVideo(file(), { signal: early.signal }), error => error.name === 'AbortError')
  const loading = new AbortController(), stalled = browserFixture({ metadata: 'stall' })
  try {
    const rejected = assert.rejects(prepareRoomVideo(file(), { signal: loading.signal }), error => error.name === 'AbortError')
    loading.abort(); await rejected
    stalled.assertReleased()
  } finally { stalled.restore() }
  for (const stage of ['seek', 'progress']) {
    const controller = new AbortController()
    const browser = browserFixture({ onSeek: () => { if (stage === 'seek') controller.abort() } })
    try {
      await assert.rejects(prepareRoomVideo(file(), { signal: controller.signal, onProgress: () => { if (stage === 'progress') controller.abort() } }), error => error.name === 'AbortError')
      assert.equal(browser.draws.length, stage === 'seek' ? 0 : 1)
      browser.assertReleased()
    } finally { browser.restore() }
  }
})

test('元数据未知、过短过长或分辨率异常时不采样，释放video与objectURL', async () => {
  for (const options of [{ duration: NaN }, { duration: Infinity }, { duration: 1 }, { duration: 61 }, { width: 0 }, { width: 32 }, { width: 20000 }, { width: 12000, height: 10000 }]) {
    const browser = browserFixture(options)
    try {
      await assert.rejects(prepareRoomVideo(file()), /时长|2–60|分辨率/)
      assert.equal(browser.draws.length, 0)
      browser.assertReleased()
    } finally { browser.restore() }
  }
})

test('解码、取帧、画布或压缩失败不返回半成品，全部释放媒体资源', async () => {
  for (const options of [{ metadata: 'error' }, { errorAt: 2 }, { noContext: true }, { drawError: true }, { alwaysLarge: true }]) {
    const browser = browserFixture(options)
    try {
      await assert.rejects(prepareRoomVideo(file()), /解码|提取|压缩后仍过大/)
      browser.assertReleased()
    } finally { browser.restore() }
  }
})

test('元数据和seek均有超时，超时后释放资源并移除所有定时器', async () => {
  for (const [options, delay] of [[{ metadata: 'stall' }, 20000], [{ stallAt: 1 }, 15000]]) {
    const browser = browserFixture(options)
    try {
      const result = assert.rejects(prepareRoomVideo(file()), /超时/)
      // Let the metadata event and promise continuation reach the first seek.
      for (let i = 0; i < 4; i++) await Promise.resolve()
      assert.equal(browser.nextTimer(), delay)
      await result
      browser.assertReleased()
    } finally { browser.restore() }
  }
})
