import { useCallback, useRef } from 'react'

interface DragState {
  isDragging: boolean
  startX: number
  startY: number
  winStartX: number
  winStartY: number
  didMove: boolean
}

export function useDraggable(
  elementRef: React.RefObject<HTMLElement | null>,
  onDragEnd?: (x: number, y: number) => void,
) {
  const dragRef = useRef<DragState>({
    isDragging: false, startX: 0, startY: 0, winStartX: 0, winStartY: 0, didMove: false,
  })

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    const el = elementRef.current
    if (!el) return

    dragRef.current = {
      isDragging: true,
      startX: e.screenX,
      startY: e.screenY,
      winStartX: window.screenX,
      winStartY: window.screenY,
      didMove: false,
    }
    e.preventDefault()
  }, [elementRef])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const d = dragRef.current
    if (!d.isDragging) return
    const dx = e.screenX - d.startX
    const dy = e.screenY - d.startY
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) d.didMove = true
    window.moveTo(d.winStartX + dx, d.winStartY + dy)
  }, [])

  const handleMouseUp = useCallback(() => {
    const d = dragRef.current
    if (!d.isDragging) return
    d.isDragging = false
    if (d.didMove) {
      onDragEnd?.(window.screenX, window.screenY)
    }
    // If didn't move, let the click handler deal with it
  }, [onDragEnd])

  return {
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    get didMove() { return dragRef.current.didMove },
  }
}
