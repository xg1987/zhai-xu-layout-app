import test from 'node:test'
import assert from 'node:assert/strict'
import { BOARD_PADDING, PLAN_SIZE, clampPlanPosition, dragPlanPosition, isPlanPosition, nudgePlanPosition, positionToBoardPercent } from './room-geometry.js'

test('未定位或异常坐标不自动编造位置，合法坐标与边缘可表示', () => {
  for (const value of [null, undefined, {}, [], [1], [1, 2, 3], ['1', 2], [NaN, 2], [Infinity, 0], [-1, 0], [0, 1001]]) assert.equal(isPlanPosition(value), false)
  for (const value of [[0, 0], [1000, 1000], [500, 10.5]]) assert.equal(isPlanPosition(value), true)
  assert.equal(clampPlanPosition(null), null)
  assert.equal(clampPlanPosition([0, Infinity]), null)
  assert.deepEqual(clampPlanPosition([-150, 1300]), [0, 1000])
  assert.deepEqual(clampPlanPosition([13.333, 44.444]), [13.3, 44.4])
})

test('数据0–1000映射至参考框，中心和四边保留手柄可点击空间', () => {
  assert.equal(PLAN_SIZE, 1000)
  assert.equal(BOARD_PADDING, 80)
  assert.deepEqual(positionToBoardPercent([0, 0]), [8, 8])
  assert.deepEqual(positionToBoardPercent([500, 500]), [50, 50])
  assert.deepEqual(positionToBoardPercent([1000, 1000]), [92, 92])
  assert.equal(positionToBoardPercent(null), null)
  assert.equal(positionToBoardPercent([1001, 0]), null)
})

test('鼠标或触摸拖动保持抓取偏移，按实际画布尺寸缩放并限制边界', () => {
  assert.deepEqual(dragPlanPosition([250, 300], [0, 0], { width: 500, height: 500 }), [250, 300])
  assert.deepEqual(dragPlanPosition([250, 300], [42, -84], { width: 500, height: 500 }), [350, 100])
  assert.deepEqual(dragPlanPosition([250, 300], [84, -42], { width: 1000, height: 250 }), [350, 100])
  assert.deepEqual(dragPlanPosition([500, 500], [1000, -1000], { width: 320, height: 320 }), [1000, 0])
  for (const rect of [null, {}, { width: 0, height: 400 }, { width: 300, height: NaN }, { width: -50, height: 100 }]) assert.equal(dragPlanPosition([500, 500], [5, 5], rect), null)
  assert.equal(dragPlanPosition(null, [1, 1], { width: 400, height: 400 }), null)
  assert.equal(dragPlanPosition([500, 500], [Infinity, 0], { width: 400, height: 400 }), null)
})

test('键盘只用上下左右，普通10/Shift50并限制边缘，不定义真实方位', () => {
  assert.deepEqual(nudgePlanPosition([500, 500], 'ArrowUp'), [500, 490])
  assert.deepEqual(nudgePlanPosition([500, 500], 'ArrowDown'), [500, 510])
  assert.deepEqual(nudgePlanPosition([500, 500], 'ArrowLeft', true), [450, 500])
  assert.deepEqual(nudgePlanPosition([500, 500], 'ArrowRight', true), [550, 500])
  assert.deepEqual(nudgePlanPosition([0, 1000], 'ArrowLeft'), [0, 1000])
  assert.deepEqual(nudgePlanPosition([0, 1000], 'ArrowDown', true), [0, 1000])
  assert.equal(nudgePlanPosition([500, 500], 'Enter'), null)
  assert.equal(nudgePlanPosition(null, 'ArrowLeft'), null)
})
