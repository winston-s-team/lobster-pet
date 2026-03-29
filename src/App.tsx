import { useState, useEffect, useRef, useCallback } from 'react'
import type { LobsterState, OpenClawStatus, AgentInfo, CronJob } from './types'
import LobsterPet from './components/LobsterPet'
import TokenBar from './components/TokenBar'
import SpeechBubble from './components/SpeechBubble'
import StatusBubble from './components/StatusBubble'
import './App.css'

declare global {
  interface Window {
    lobsterAPI?: {
      getStatus: () => Promise<OpenClawStatus>
      onStatusUpdate: (callback: (data: OpenClawStatus) => void) => () => void
      refreshStatus: () => Promise<OpenClawStatus>
      triggerTask: (taskType: string) => Promise<unknown>
      sendMessage: (message: string) => Promise<unknown>
      moveWindow: (x: number, y: number) => Promise<void>
      getScreenBounds: () => Promise<{ width: number; height: number }>
      setIgnoreMouse: (ignore: boolean) => Promise<void>
      showContextMenu: () => Promise<void>
      getAgents: () => Promise<AgentInfo[]>
      getCronJobs: () => Promise<CronJob[]>
      getYesterdayMemo: () => Promise<string | null>
      getTokenUsage: () => Promise<any>
      getGatewayInfo: () => Promise<any>
      onGatewayInfoUpdate: (callback: (data: any) => void) => (() => void) | undefined
      getCronRunsToday: () => Promise<any>
      getActivityStats: () => Promise<any>
    }
  }
}

const api = window.lobsterAPI

export default function App() {
  const [status, setStatus] = useState<OpenClawStatus | null>(null)
  const [lobsterState, setLobsterState] = useState<LobsterState>('thinking')
  const [speechVisible, setSpeechVisible] = useState(false)
  const [statusVisible, setStatusVisible] = useState(false)

  const lastActivity = useRef<number | null>(null)
  const hasReceivedFirstUpdate = useRef(false)

  const deriveLobsterState = useCallback((s: OpenClawStatus | null): LobsterState => {
    if (!s || s.state === 'error') return s?.state ?? 'idle'
    if (s.state === 'idle' && lastActivity.current != null) {
      const idle = Date.now() - lastActivity.current
      return idle > 30000 ? 'sleeping' : 'idle'
    }
    return s.state
  }, [])

  useEffect(() => {
    if (!api) return
    api.getStatus().then((s) => {
      setStatus(s)
      setLobsterState(deriveLobsterState(s))
      hasReceivedFirstUpdate.current = true
      lastActivity.current = Date.now()
    })
    const unsub = api.onStatusUpdate((s) => {
      hasReceivedFirstUpdate.current = true
      lastActivity.current = Date.now()
      setStatus(s)
      setLobsterState(deriveLobsterState(s))
    })
    return unsub
  }, [deriveLobsterState])

  // Sleeping timer
  useEffect(() => {
    const timer = setInterval(() => {
      if (!hasReceivedFirstUpdate.current) return
      if (status?.state === 'idle' || !status) {
        if (lastActivity.current != null) {
          const idle = Date.now() - lastActivity.current
          if (idle > 30000) setLobsterState('sleeping')
        }
      }
    }, 5000)
    return () => clearInterval(timer)
  }, [status])

  const handleSingleClick = useCallback(() => {
    setSpeechVisible(true)
    setLobsterState('happy')
    setTimeout(() => {
      setLobsterState(deriveLobsterState(status))
    }, 1500)
  }, [status, deriveLobsterState])

  const handleDoubleClick = useCallback(() => {
    setStatusVisible(true)
  }, [])

  const handleContextMenu = useCallback(() => {
    api?.showContextMenu()
  }, [])

  const handleDragEnd = useCallback((_x: number, _y: number) => {
    // Position saved by main process 'moved' event
  }, [])

  const handleSpeechHide = useCallback(() => setSpeechVisible(false), [])
  const handleStatusHide = useCallback(() => setStatusVisible(false), [])

  // If window is near top of screen, show bubbles below the lobster
  const bubblePosition = window.screenY < 80 ? 'below' : 'above'

  return (
    <LobsterPet
      state={lobsterState}
      onClick={handleSingleClick}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
      onDragEnd={handleDragEnd}
    >
      <SpeechBubble
        visible={speechVisible}
        gatewayState={status?.state ?? 'idle'}
        onHide={handleSpeechHide}
        position={bubblePosition === 'below' ? 'below' : 'above'}
      />
      <StatusBubble
        visible={statusVisible}
        status={status}
        onHide={handleStatusHide}
        position={bubblePosition === 'below' ? 'below' : 'above'}
      />
        <TokenBar />
    </LobsterPet>
  )
}
