import { useEffect, useId, useRef } from 'react'
import { dragPlanPosition, isPlanPosition, nudgePlanPosition, positionToBoardPercent } from './room-geometry.js'

export default function RoomLayout({ objects = [], selectedId, onSelect, onMove, disabled = false }) {
  const board = useRef(null), drag = useRef(null), titleId = useId(), noteId = useId()
  const positioned = objects.filter(item => isPlanPosition(item.planPosition))
  const unpositionedCount = objects.length - positioned.length

  function releaseDrag(event) {
    const current = drag.current
    if (!current || (event && event.pointerId !== current.pointerId)) return
    drag.current = null
    if (current.target.hasPointerCapture(current.pointerId)) current.target.releasePointerCapture(current.pointerId)
  }

  useEffect(() => {
    if (disabled) releaseDrag()
    return () => releaseDrag()
  }, [disabled])

  function startDrag(event, item) {
    if (disabled || !event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0) || !board.current) return
    const rect = board.current.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    event.preventDefault()
    event.currentTarget.focus({ preventScroll: true })
    onSelect?.(item.id)
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { id: item.id, pointerId: event.pointerId, target: event.currentTarget, start: [event.clientX, event.clientY], position: [...item.planPosition], last: [...item.planPosition], rect }
  }

  function moveDrag(event) {
    const current = drag.current
    if (disabled || !current || current.pointerId !== event.pointerId) return
    const next = dragPlanPosition(current.position, [event.clientX - current.start[0], event.clientY - current.start[1]], current.rect)
    if (next && (next[0] !== current.last[0] || next[1] !== current.last[1])) {
      current.last = next
      onMove?.(current.id, next)
    }
  }

  function endDrag(event) {
    moveDrag(event)
    releaseDrag(event)
  }

  function keyMove(event, item) {
    if (disabled) return
    const next = nudgePlanPosition(item.planPosition, event.key, event.shiftKey)
    if (!next) return
    event.preventDefault()
    onSelect?.(item.id)
    if (next[0] !== item.planPosition[0] || next[1] !== item.planPosition[1]) onMove?.(item.id, next)
  }

  return <section className="scan-layout" aria-labelledby={titleId}>
    <h3 id={titleId}>布局草图 · 非测量结果</h3>
    <div ref={board} className="scan-layout-board" role="group" aria-labelledby={titleId} aria-describedby={noteId} style={{ position: 'relative', width: '100%', aspectRatio: '1 / 1' }}>
      <svg viewBox="0 0 1000 1000" aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
        <rect x="80" y="80" width="840" height="840" rx="12" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="12 10"/>
        <g fill="currentColor" fontSize="36" textAnchor="middle" dominantBaseline="middle">
          <text x="500" y="28">上</text><text x="500" y="972">下</text><text x="28" y="500">左</text><text x="972" y="500">右</text>
        </g>
      </svg>
      {positioned.map(item => {
        const [left, top] = positionToBoardPercent(item.planPosition)
        return <button key={item.id} type="button" className={`scan-layout-object${selectedId === item.id ? ' is-selected' : ''}`} disabled={disabled} aria-pressed={selectedId === item.id} aria-label={`${item.label}，相对位置横向 ${item.planPosition[0]}、纵向 ${item.planPosition[1]}`} aria-describedby={noteId} style={{ position: 'absolute', left: `${left}%`, top: `${top}%`, transform: 'translate(-50%, -50%)', touchAction: 'none', minWidth: 44, minHeight: 44, maxWidth: '26%' }} onClick={() => onSelect?.(item.id)} onPointerDown={event => startDrag(event, item)} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={releaseDrag} onLostPointerCapture={releaseDrag} onKeyDown={event => keyMove(event, item)}>
          <span>{item.label}</span>
        </button>
      })}
    </div>
    <p className="scan-layout-note" id={noteId}>虚线仅为参考区域，不表示实测外墙。{unpositionedCount > 0 ? `有 ${unpositionedCount} 件物品尚未定位，未在草图中放置。` : positioned.length ? '点位仅表示待核对的相对位置。' : '暂无可定位的物品。'}{positioned.length > 0 && !disabled ? '可拖动点位；键盘方向键微调 10，按住 Shift 微调 50。' : ''}</p>
  </section>
}
