import type { AgentInfo, GatewayInfo } from '../types'
import './GatewayAgentsCard.css'

interface Props {
  agents: AgentInfo[]
  gatewayInfo: GatewayInfo | null
}

function formatAge(ms: number | null): string {
  if (ms == null) return '—'
  if (ms < 60000) return '刚刚'
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m`
  if (ms < 86400000) return `${Math.floor(ms / 3600000)}h`
  return `${Math.floor(ms / 86400000)}d`
}

export default function GatewayAgentsCard({ agents, gatewayInfo }: Props) {
  const agentActivity: Record<string, number | null> = {}
  if (gatewayInfo?.agents) {
    for (const a of gatewayInfo.agents) agentActivity[a.id] = a.lastActiveAgeMs
  }

  return (
    <div className="ga-card card">
      <div className="section-title">🖥️ Gateway & Agents</div>

      {/* Gateway stats */}
      {gatewayInfo && (
        <div className="ga-stats">
          <div className="ga-stat">
            <span className={`ga-dot ${gatewayInfo.gatewayReachable ? '' : 'ga-offline'}`} />
            <span className="ga-stat-val">{gatewayInfo.latency}ms</span>
            <span className="ga-stat-label">延迟</span>
          </div>
          <div className="ga-stat">
            <span className="ga-stat-val">{gatewayInfo.channels.length}</span>
            <span className="ga-stat-label">渠道</span>
          </div>
          {gatewayInfo.channels.map(ch => (
            <span key={ch} className="ga-chip">{ch}</span>
          ))}
        </div>
      )}

      {/* Agent list */}
      <div className="card-scroll">
        <div className="ga-agents">
          {agents.map(a => {
            const isActive = a.id === 'main' || (agentActivity[a.id] != null && agentActivity[a.id]! < 300000)
            const sessions = gatewayInfo?.agents?.find(g => g.id === a.id)?.sessionsCount
            return (
              <div key={a.id} className={`ga-agent ${isActive ? 'ga-active' : ''}`}>
                <span className={`ga-dot ${isActive ? '' : 'ga-idle'}`} />
                <div className="ga-agent-info">
                  <span className="ga-agent-name">{a.name || a.id}</span>
                  <span className="ga-agent-meta">
                    {sessions != null && `${sessions}s · `}{formatAge(agentActivity[a.id])}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
