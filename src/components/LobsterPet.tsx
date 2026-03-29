import { useRef, useCallback, useEffect, useState, useMemo } from 'react'
import type { LobsterState } from '../types'
import { useDraggable } from '../hooks/useDraggable'
import { useMouseProximity } from '../hooks/useMouseProximity'
import './LobsterPet.css'

import idleImg from '../assets/idle-removebg-preview.png'
import workingImg from '../assets/working-removebg-preview.png'
import thinkingImg from '../assets/thinking-removebg-preview.png'
import sleepingImg from '../assets/sleeping-removebg-preview.png'
import errorImg from '../assets/error-removebg-preview.png'
import happyImg from '../assets/happy-removebg-preview.png'

const stateImage: Record<LobsterState, string> = {
  idle: idleImg,
  working: workingImg,
  thinking: thinkingImg,
  sleeping: sleepingImg,
  error: errorImg,
  happy: happyImg,
}

// === Random idle actions ===
type RandomAction = 'spin' | 'bounce' | 'wiggle' | 'talk' | 'look-around' | 'stretch' | null

const IDLE_CHATTER = [
  '好无聊啊…',
  '有人理我吗？',
  'Gateway 还活着呢',
  '你在忙什么呀？',
  '摸鱼时间到！',
  '我好像听到 bug 了',
  '今天天气不错~',
  '该喝水了 💧',
  '代码写完了吗？',
  '小龙虾永不加班！',
  '哼，又不理我',
  '我走了一万步了',
  'CPU 在偷偷摸鱼',
  '磁盘空间快满了哦',
  '要不要来杯咖啡？',
  '我比瑞星小狮子可爱',
  'Don\'t touch me!',
  '人在工位，心在放假',
]

const WORKING_CHATTER = [
  '火太大了！',
  '颠勺中…',
  '别催了别催了！',
  '忙死了忙死了~',
  '加把劲！',
  '差点烧焦…',
]

const THINKING_CHATTER = [
  '让我想想…',
  '这个 bug 挺棘手的',
  '🤔🤔🤔',
  '灵光一闪！',
  '快想出来了…',
]

const ERROR_CHATTER = [
  '出事了出事了！',
  '冒烟了冒烟了！',
  '救命——',
  '好像…炸了',
]

interface LobsterPetProps {
  state: LobsterState
  onClick: () => void
  onDoubleClick: () => void
  onContextMenu: () => void
  onDragEnd: (x: number, y: number) => void
  children?: React.ReactNode
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

export default function LobsterPet({
  state,
  onClick,
  onDoubleClick,
  onContextMenu,
  onDragEnd,
  children,
}: LobsterPetProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clickCountRef = useRef(0)

  // Random idle action system
  const [randomAction, setRandomAction] = useState<RandomAction>(null)
  const [randomChatter, setRandomChatter] = useState<string | null>(null)
  const actionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const chatterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Chatter pool based on current state
  const chatterPool = useMemo(() => {
    switch (state) {
      case 'working': return WORKING_CHATTER
      case 'thinking': return THINKING_CHATTER
      case 'error': return ERROR_CHATTER
      case 'sleeping': return [] // Don't disturb sleeping
      default: return IDLE_CHATTER
    }
  }, [state])

  // Random action scheduler — fires every 15-40s
  useEffect(() => {
    const scheduleNext = () => {
      const delay = 15000 + Math.random() * 25000 // 15-40s
      actionTimerRef.current = setTimeout(() => {
        if (state === 'sleeping') {
          // Don't do actions while sleeping
          scheduleNext()
          return
        }

        const actions: RandomAction[] = ['spin', 'bounce', 'wiggle', 'talk', 'look-around', 'stretch']
        // 'talk' should be less frequent
        const weighted = [...actions, 'bounce', 'wiggle', 'look-around', 'look-around'] // 40% look/bounce/wiggle, 20% spin/stretch/talk
        const action = pickRandom(weighted)

        setRandomAction(action)

        // If 'talk', also show speech bubble
        if (action === 'talk' && chatterPool.length > 0) {
          setRandomChatter(pickRandom(chatterPool))
          chatterTimerRef.current = setTimeout(() => setRandomChatter(null), 4000)
        }

        // Clear action after animation — durations increased for visibility
        const duration = action === 'spin' ? 1500 : action === 'bounce' ? 1800 : action === 'stretch' ? 2000 : action === 'wiggle' ? 1000 : 800
        setTimeout(() => setRandomAction(null), duration)

        scheduleNext()
      }, delay)
    }

    scheduleNext()
    return () => {
      if (actionTimerRef.current) clearTimeout(actionTimerRef.current)
      if (chatterTimerRef.current) clearTimeout(chatterTimerRef.current)
    }
  }, [state, chatterPool])

  const mouseInfo = useMouseProximity(containerRef)

  const { handleMouseDown, handleMouseMove: onDragMove, handleMouseUp } = useDraggable(
    containerRef,
    onDragEnd,
  )

  // Mouse penetration: lobster area captures mouse, outside passes through
  useEffect(() => {
    const api = window.lobsterAPI
    if (!api) return

    const el = containerRef.current
    if (!el) return

    const handleEnter = () => api?.setIgnoreMouse(false)
    const handleLeave = () => api?.setIgnoreMouse(true)

    el.addEventListener('mouseenter', handleEnter)
    el.addEventListener('mouseleave', handleLeave)
    return () => {
      el.removeEventListener('mouseenter', handleEnter)
      el.removeEventListener('mouseleave', handleLeave)
    }
  }, [])

  // Single click vs double click — skip if just dragged
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const draggable = (containerRef.current as any)?.__draggable
    if (draggable?.didMove) return
    clickCountRef.current++
    if (clickCountRef.current === 1) {
      clickTimerRef.current = setTimeout(() => {
        if (clickCountRef.current === 1) onClick()
        clickCountRef.current = 0
      }, 250)
    } else if (clickCountRef.current === 2) {
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current)
      clickCountRef.current = 0
      onDoubleClick()
    }
  }, [onClick, onDoubleClick])

  const handleContextMenuEvent = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    onContextMenu()
  }, [onContextMenu])

  // Global mouse up for drag
  useEffect(() => {
    const up = () => handleMouseUp()
    window.addEventListener('mouseup', up)
    return () => window.removeEventListener('mouseup', up)
  }, [handleMouseUp])

  // Build animation class
  const actionClass = randomAction ? `lobster-${randomAction}` : ''

  return (
    <div
      ref={containerRef}
      className={`lobster-pet lobster-${state} ${actionClass}`}
      onMouseDown={handleMouseDown}
      onMouseMove={onDragMove}
      onClick={handleClick}
      onContextMenu={handleContextMenuEvent}
    >
      {children}
      <div className="lobster-glow" />

      {/* State effects */}
      {state === 'working' && (
        <div className="effect-container">
          <div className="flame f1" />
          <div className="flame f2" />
          <div className="flame f3" />
          <div className="flame f4" />
          <div className="flame f5" />
          <div className="steam-bubble s1" />
          <div className="steam-bubble s2" />
        </div>
      )}
      {state === 'error' && (
        <div className="effect-container">
          <div className="smoke-bubble sm1" />
          <div className="smoke-bubble sm2" />
          <div className="smoke-bubble sm3" />
          <div className="smoke-bubble sm4" />
        </div>
      )}
      {state === 'thinking' && (
        <div className="effect-container">
          <div className="thinking-dots">
            <span className="dot d1">.</span>
            <span className="dot d2">.</span>
            <span className="dot d3">.</span>
          </div>
          <span className="lightbulb">💡</span>
        </div>
      )}
      {state === 'sleeping' && (
        <div className="effect-container">
          <span className="zzz z1">Z</span>
          <span className="zzz z2">z</span>
          <span className="zzz z3">z</span>
          <div className="sleep-bubble b1" />
          <div className="sleep-bubble b2" />
          <div className="sleep-bubble b3" />
        </div>
      )}
      {state === 'happy' && (
        <div className="effect-container">
          <span className="star st1">✦</span>
          <span className="star st2">✦</span>
          <span className="star st3">✦</span>
          <span className="star st4">✦</span>
          <span className="star st5">✦</span>
        </div>
      )}

      {/* Random action effects */}
      {randomAction === 'spin' && (
        <div className="effect-container">
          <span className="action-icon spin-icon">🔄</span>
        </div>
      )}
      {randomAction === 'stretch' && (
        <div className="effect-container">
          <span className="action-icon stretch-icon">💪</span>
        </div>
      )}

      {/* Random chatter bubble */}
      {randomChatter && (
        <div className="random-chatter-bubble">
          <span>{randomChatter}</span>
          <div className="chatter-arrow" />
        </div>
      )}

      <div className="lobster-image-container">
        <img src={stateImage[state]} alt="lobster pet" className="lobster-img" />
      </div>
    </div>
  )
}
