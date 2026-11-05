export const PLAN_SIZE = 1000
export const BOARD_PADDING = 80
const BOARD_SPAN = PLAN_SIZE - 2 * BOARD_PADDING
const finitePair = value => Array.isArray(value) && value.length === 2 && value.every(Number.isFinite)

export function isPlanPosition(value) {
  return finitePair(value) && value.every(number => number >= 0 && number <= PLAN_SIZE)
}

export function clampPlanPosition(value) {
  if (!finitePair(value)) return null
  return value.map(number => Math.round(Math.min(PLAN_SIZE, Math.max(0, number)) * 10) / 10)
}

// Inset keeps handles at the edges reachable without changing stored coordinates.
export function positionToBoardPercent(position) {
  if (!isPlanPosition(position)) return null
  return position.map(number => (BOARD_PADDING + number * BOARD_SPAN / PLAN_SIZE) / 10)
}

export function dragPlanPosition(position, clientDelta, boardRect) {
  if (!isPlanPosition(position) || !finitePair(clientDelta) || !boardRect || !Number.isFinite(boardRect.width) || !Number.isFinite(boardRect.height) || boardRect.width <= 0 || boardRect.height <= 0) return null
  const x = position[0] + clientDelta[0] / boardRect.width * PLAN_SIZE * PLAN_SIZE / BOARD_SPAN
  const y = position[1] + clientDelta[1] / boardRect.height * PLAN_SIZE * PLAN_SIZE / BOARD_SPAN
  return clampPlanPosition([x, y])
}

export function nudgePlanPosition(position, key, shiftKey = false) {
  if (!isPlanPosition(position)) return null
  const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[key]
  if (!delta) return null
  const amount = shiftKey ? 50 : 10
  return clampPlanPosition([position[0] + delta[0] * amount, position[1] + delta[1] * amount])
}
