import { useEffect, useRef, useState, useCallback } from 'react'
import type { OpenClawStatus } from '../types'
import './MiniOffice.css'

interface Props {
  status: OpenClawStatus | null
}

function mapState(s: OpenClawStatus | null): string {
  if (!s) return 'idle'
  const raw = String(s.state || 'idle').toLowerCase()
  if (raw === 'sleeping' || raw === 'sleep') return 'idle'
  if (raw === 'happy') return 'idle'
  if (raw === 'error') return 'error'
  if (raw === 'thinking') return 'researching'
  if (raw === 'working' || raw === 'busy') return 'writing'
  return 'idle'
}

function getDescription(s: OpenClawStatus | null): string {
  if (!s) return '待命中'
  return s.description || '待命中'
}

export default function MiniOffice({ status }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const prevStateRef = useRef<string>('')
  const prevDescRef = useRef<string>('')
  const [officeName, setOfficeName] = useState<string>('My Office')
  const [isFullscreen, setIsFullscreen] = useState(false)

  // Fetch office name once
  useEffect(() => {
    const api = (window as any).lobsterAPI
    if (api?.getOfficeName) {
      api.getOfficeName().then((name: string) => {
        if (name) setOfficeName(name)
      }).catch(() => {})
    }
  }, [])

  // Push state to iframe via postMessage
  useEffect(() => {
    const state = mapState(status)
    const desc = getDescription(status)
    if (state === prevStateRef.current && desc === prevDescRef.current) return
    prevStateRef.current = state
    prevDescRef.current = desc

    const iframe = iframeRef.current
    if (!iframe?.contentWindow) return
    const send = () => {
      iframe.contentWindow?.postMessage(
        { type: 'lobster-state', state, detail: desc, officeName },
        '*'
      )
    }
    if (iframe.contentDocument?.readyState === 'complete') {
      send()
    } else {
      iframe.addEventListener('load', send, { once: true })
    }
  }, [status, officeName])

  const handleFullscreen = useCallback(() => {
    const wrap = document.querySelector('.mo-iframe-wrap') as HTMLElement
    if (!wrap) return
    if (!document.fullscreenElement) {
      wrap.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {})
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {})
    }
  }, [])

  // Track fullscreen change (user may press Esc)
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  return (
    <div className="mini-office card">
      <div className="mo-header">
        <span className="section-title">🦞 迷你办公室</span>
        <button
          className={`mo-fullscreen-btn${isFullscreen ? ' is-active' : ''}`}
          onClick={handleFullscreen}
          title={isFullscreen ? '退出全屏' : '全屏显示'}
        >
          {isFullscreen ? '✕' : '⛶'}
        </button>
      </div>
      <div className="mo-iframe-wrap">
        <iframe
          ref={iframeRef}
          src="./office/index.html"
          className="mo-iframe"
          allow="autoplay"
        />
      </div>
    </div>
  )
}
