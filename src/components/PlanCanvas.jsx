import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icons.jsx'
import { useDismiss } from '../useDismiss.js'

function DirectionGrid({ angle = 0 }) {
  return (
    <svg className="direction-grid" style={{ transform: `rotate(${angle}deg)` }} viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="43" />
      <circle cx="50" cy="50" r="15" />
      <path d="M50 7v86M7 50h86M19.6 19.6l60.8 60.8M80.4 19.6 19.6 80.4" />
      <circle className="grid-center" cx="50" cy="50" r="2.3" />
    </svg>
  )
}

function Compass() {
  return (
    <div className="compass" aria-label="正北方向">
      <span>N</span>
      <svg viewBox="0 0 40 40" aria-hidden="true">
        <circle cx="20" cy="20" r="17.5" />
        <path d="m20 5 5 17-5-3-5 3Z" className="compass-needle" />
        <path d="m20 35-4-14 4 3 4-3Z" className="compass-tail" />
      </svg>
    </div>
  )
}

export function PlanCanvas({ recommendations, selectedId, onSelect, variant = 'mobile', showFloorControl = false, gridAngle = 0, confirmedIds = [] }) {
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [floor, setFloor] = useState('1F')
  const [floorOpen, setFloorOpen] = useState(false)
  const drag = useRef(null)
  const pointers = useRef(new Map())
  const pinch = useRef(null)
  const stageRef = useRef(null)
  const floorPickerRef = useRef(null)

  useDismiss([floorPickerRef], floorOpen, () => setFloorOpen(false))

  useEffect(() => {
    const point = recommendations.find((item) => item.id === selectedId)
    if (!point || scale === 1) return
    setOffset({
      x: (50 - point.x) * 0.8,
      y: (48 - point.y) * 0.55,
    })
  }, [selectedId, recommendations, scale])

  const clampScale = (value) => Math.min(1.8, Math.max(0.9, value))

  // React 17+ 在根节点以 passive 方式注册 onWheel，preventDefault 会被忽略，
  // 因此滚轮缩放必须用非 passive 的原生监听。
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const onWheel = (event) => {
      event.preventDefault()
      setScale((current) => clampScale(current + (event.deltaY > 0 ? -0.08 : 0.08)))
    }
    stage.addEventListener('wheel', onWheel, { passive: false })
    return () => stage.removeEventListener('wheel', onWheel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const resetView = () => {
    setScale(1)
    setOffset({ x: 0, y: 0 })
  }

  const startDrag = (event) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      pinch.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), scale }
      drag.current = null
    } else if (scale > 1) {
      drag.current = {
        x: event.clientX,
        y: event.clientY,
        originX: offset.x,
        originY: offset.y,
      }
    }
  }

  const moveDrag = (event) => {
    const point = pointers.current.get(event.pointerId)
    if (point) {
      point.x = event.clientX
      point.y = event.clientY
    }
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      const distance = Math.hypot(a.x - b.x, a.y - b.y)
      if (distance > 0) setScale(clampScale(pinch.current.scale * (distance / pinch.current.distance)))
      return
    }
    if (!drag.current) return
    setOffset({
      x: drag.current.originX + event.clientX - drag.current.x,
      y: drag.current.originY + event.clientY - drag.current.y,
    })
  }

  const endDrag = (event) => {
    pointers.current.delete(event.pointerId)
    if (pointers.current.size < 2) pinch.current = null
    drag.current = null
  }

  return (
    <section className={`plan-canvas plan-canvas--${variant}`} aria-label="户型平面图">
      <Compass />

      {showFloorControl && (
        <div className="floor-picker" ref={floorPickerRef}>
          <button
            aria-expanded={floorOpen}
            className="floor-control"
            type="button"
            aria-label="选择楼层"
            onClick={() => setFloorOpen((value) => !value)}
          >
            <span>{floor}</span>
            <Icon name="chevronDown" size={17} />
          </button>
          {floorOpen && (
            <div className="floor-menu" role="menu">
              {['1F', '2F'].map((option) => (
                <button
                  className={floor === option ? 'is-active' : ''}
                  key={option}
                  onClick={() => {
                    setFloor(option)
                    setFloorOpen(false)
                  }}
                  role="menuitem"
                  type="button"
                >
                  {option}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div
        className="plan-stage"
        ref={stageRef}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div
          className="plan-transform"
          style={{ transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})` }}
        >
          <img src="/assets/demo-floor-plan.png" alt="罗莉住宅户型平面图" draggable="false" />
          <DirectionGrid angle={gridAngle} />
          <span className="artboard-label artboard-north">北</span>
          <span className="artboard-label artboard-west">西</span>
          <span className="artboard-label artboard-east">东</span>
          <span className="artboard-label artboard-south">南</span>
          {recommendations.map((point) => (
            <button
              aria-label={`${point.id} ${point.sector}${point.place}，${point.short}`}
              className={`map-marker ${selectedId === point.id ? 'is-selected' : ''} ${confirmedIds.includes(point.id) ? 'is-confirmed' : ''}`}
              data-label={point.id}
              key={point.id}
              onClick={(event) => {
                event.stopPropagation()
                onSelect(point.id)
              }}
              style={{ left: `${point.x}%`, top: `${point.y}%` }}
              type="button"
            />
          ))}
        </div>
      </div>

      <div className="map-tools" aria-label="地图缩放工具">
        <button type="button" aria-label="放大" onClick={() => setScale((current) => clampScale(current + 0.15))}>
          <Icon name="plus" size={18} />
        </button>
        <button type="button" aria-label="缩小" onClick={() => setScale((current) => clampScale(current - 0.15))}>
          <Icon name="minus" size={18} />
        </button>
        <button type="button" aria-label="复位" onClick={resetView}>
          <Icon name="locate" size={17} />
        </button>
      </div>
    </section>
  )
}
