import type { OpenClawStatus, GatewayState } from '../types'
import './StatusCard.css'

interface StatusCardProps {
  status: OpenClawStatus | null
  totalUsage?: { totalTokens: number; totalCost: number; messageCount: number; totalInput: number; totalOutput: number } | null
}

const STATE_CONFIG: Record<GatewayState, { label: string; color: string }> = {
  idle: { label: '待命中', color: '#8B9DC3' },
  working: { label: '工作中', color: '#4ECDC4' },
  thinking: { label: '思考中', color: '#F7DC6F' },
  error: { label: '异常', color: '#E74C3C' },
  sleeping: { label: '休眠', color: '#BB8FCE' },
}

function formatTokens(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K'
  return String(n)
}

export default function StatusCard({ status, totalUsage }: StatusCardProps) {
  const stateInfo = status ? (STATE_CONFIG[status.state] || STATE_CONFIG.idle) : null

  return (
    <div className="status-card card">
      {/* State */}
      <div className="sc-row sc-state">
        <span className="sc-dot" style={{
          background: stateInfo ? stateInfo.color : '#8B9DC3',
          boxShadow: `0 0 8px ${stateInfo ? stateInfo.color : '#8B9DC3'}60`,
        }} />
        <span className="sc-state-text" style={{ color: stateInfo ? stateInfo.color : '#8B9DC3' }}>
          {stateInfo ? stateInfo.label : 'None'}
        </span>
      </div>

      {/* Description */}
      {status?.description && status.description !== '待命中' && (
        <p className="sc-desc">{status.description}</p>
      )}

      {/* Active tasks */}
      {status && status.activeTasks.length > 0 && (
        <div className="sc-section">
          <div className="sc-label">活跃任务 ({status.activeTasks.length})</div>
          <div className="card-scroll sc-task-list">
            {status.activeTasks.slice(0, 5).map((task, i) => (
              <div key={i} className="sc-task-item">
                <span className="sc-task-name">{task.name}</span>
                <span className="sc-task-type">{task.type}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Model + Context */}
      <div className="sc-row sc-model">
        <span className="sc-label">模型</span>
        <span className="sc-model-name">{status?.model || 'None'}</span>
      </div>

      {/* Cumulative token usage */}
      {totalUsage && (
        <div className="sc-section sc-usage-section">
          <div className="sc-label">累计消耗</div>
          <div className="sc-usage-grid">
            <div className="sc-usage-main">
              <span className="sc-usage-tokens">{formatTokens(totalUsage.totalTokens)}</span>
              <span className="sc-usage-unit">tokens</span>
            </div>
          </div>
          <div className="sc-usage-meta">
            <span>{totalUsage.messageCount} 次调用</span>
            {totalUsage.totalCost > 0 && <span className="sc-usage-cost">💰 ${totalUsage.totalCost.toFixed(2)}</span>}
          </div>
        </div>
      )}
    </div>
  )
}
