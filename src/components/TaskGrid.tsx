import type { SessionInfo } from '../types'
import './TaskGrid.css'

interface Props {
  sessions: SessionInfo[]
}

const KIND_ICONS: Record<string, string> = {
  cron: '⏰', chat: '💬', task: '⚡', tool: '🔧',
  twitter: '🐦', zhihu: '📝', default: '📋',
}

function getIcon(kind?: string, channel?: string): string {
  const k = ((kind || channel) || '').toLowerCase()
  for (const [key, icon] of Object.entries(KIND_ICONS)) {
    if (k.includes(key)) return icon
  }
  return KIND_ICONS.default
}

function formatAge(ms?: number): string {
  if (ms == null || ms <= 0) return ''
  if (ms < 60000) return '刚刚'
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m`
  if (ms < 86400000) return `${Math.floor(ms / 3600000)}h`
  return `${Math.floor(ms / 86400000)}d`
}

function formatTokens(n?: number): string {
  if (n == null || n === 0) return ''
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
  return String(n)
}

export default function TaskGrid({ sessions }: Props) {
  const sorted = [...sessions].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
  const displayed = sorted.slice(0, 6)

  return (
    <div className="task-grid card">
      <div className="section-title">
        📋 最近会话
        <span className="tg-count">{sorted.length}</span>
      </div>
      {sorted.length === 0 ? (
        <div className="task-empty">🎉 暂无会话记录</div>
      ) : (
        <div className="card-scroll">
          <div className="task-cards">
            {displayed.map((s, i) => (
              <div key={s.key + i} className="task-card">
                <div className="task-card-top">
                  <span className="task-card-icon">{getIcon(s.kind, s.channel)}</span>
                  <span className="task-card-name" title={s.key}>
                    {s.displayName || s.key}
                  </span>
                  {s.status === 'running' && <span className="task-card-running">●</span>}
                </div>
                <div className="task-card-bottom">
                  {s.channel && <span className="task-card-channel">{s.channel}</span>}
                  <span className="task-card-age">{formatAge(s.ageMs)}</span>
                  {s.totalTokens != null && s.totalTokens > 0 && (
                    <span className="task-card-tokens">{formatTokens(s.totalTokens)}t</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
