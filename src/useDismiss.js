import { useEffect } from 'react'

// 点击弹层外部或按 Esc 时关闭；refs 内的元素视为弹层内部（含触发按钮）。
export function useDismiss(refs, active, onDismiss) {
  useEffect(() => {
    if (!active) return
    const onPointerDown = (event) => {
      const inside = refs.some((ref) => ref.current && ref.current.contains(event.target))
      if (!inside) onDismiss()
    }
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onDismiss()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])
}
