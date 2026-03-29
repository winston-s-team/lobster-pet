import { useEffect } from 'react'
import type { OpenClawStatus } from '../types'
import './StatusBubble.css'

const STATE_EMOJI: Record<string, string> = {
  idle: '💤',
  working: '⚡',
  thinking: '🤔',
  error: '❌',
  sleeping: '😴',
}

const STATE_LABEL: Record<string, string> = {
  idle: '待命中',
  working: '工作中',
  thinking: '思考中',
  error: '异常',
  sleeping: '休眠',
}

interface StatusBubbleProps {
  visible: boolean
  status: OpenClawStatus | null
  onHide: () => void
  position?: 'above' | 'below'
}

export default function StatusBubble({ visible, status, onHide, position = 'above' }: StatusBubbleProps) {
  useEffect(() => {
    if (!visible) return
    const timer = setTimeout(onHide, 5000)
    return () => clearTimeout(timer)
  }, [visible, onHide])

  if (!visible || !status) return null

  const taskNames = status.activeTasks.map(t => t.name).filter(Boolean)
  const tokenPct = status.tokensLimit > 0
    ? Math.round((status.tokensUsed / status.tokensLimit) * 100)
    : 0

  return (
    <div className={`status-bubble ${position === 'below' ? 'below' : ''}`}>
      <div className="status-bubble-arrow" />
      <div className="sb-row">
        <span className="sb-emoji">{STATE_EMOJI[status.state]}</span>
        <span className="sb-label">{STATE_LABEL[status.state] || status.state}</span>
      </div>
      {status.model !== '—' && (
        <div className="sb-row sb-secondary">
          <span>🧠 {status.model}</span>
        </div>
      )}
      {status.tokensLimit > 0 && (
        <div className="sb-row sb-secondary">
          <span>📊 {formatTokens(status.tokensUsed)}/{formatTokens(status.tokensLimit)} ({tokenPct}%)</span>
        </div>
      )}
      {taskNames.length > 0 && (
        <div className="sb-row sb-secondary">
          <span>📝 {taskNames.join(', ')}</span>
        </div>
      )}
    </div>
  )
}

function formatTokens(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M'
  if (n >= 1000) return (n / 1000).toFixed(0) + 'k'
  return String(n)
}
