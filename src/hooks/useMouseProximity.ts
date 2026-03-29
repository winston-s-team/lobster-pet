import { useState, useEffect, useCallback } from 'react'

interface MouseInfo {
  x: number
  y: number
  isNear: boolean // within 200px
  isOver: boolean // directly over the lobster element
}

export function useMouseProximity(elementRef: React.RefObject<HTMLElement | null>, nearThreshold = 200) {
  const [mouseInfo, setMouseInfo] = useState<MouseInfo>({
    x: 0, y: 0, isNear: false, isOver: false,
  })

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!elementRef.current) return
    const rect = elementRef.current.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    const dx = e.clientX - cx
    const dy = e.clientY - cy
    const dist = Math.sqrt(dx * dx + dy * dy)
    const isOver = (
      e.clientX >= rect.left && e.clientX <= rect.right &&
      e.clientY >= rect.top && e.clientY <= rect.bottom
    )

    setMouseInfo({
      x: e.clientX,
      y: e.clientY,
      isNear: dist < nearThreshold,
      isOver,
    })
  }, [elementRef, nearThreshold])

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [handleMouseMove])

  return mouseInfo
}
