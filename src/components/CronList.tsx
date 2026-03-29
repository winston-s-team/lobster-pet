import { useState, useMemo } from 'react'
import type { CronJob } from '../types'
import './CronList.css'

interface CronListProps {
  jobs: CronJob[]
}

const TASK_EMOJIS: Record<string, string> = {
  twitter: '🐦',
  zhihu: '📝',
  hot: '🔥',
  sync: '🔄',
  memory: '🧠',
  default: '⏰',
}

function getTaskEmoji(name: string): string {
  const n = name.toLowerCase()
  for (const [key, emoji] of Object.entries(TASK_EMOJIS)) {
    if (n.includes(key)) return emoji
  }
  return TASK_EMOJIS.default
}

function formatSchedule(job: CronJob): string {
  if (!job.schedule) return ''
  if (job.scheduleKind === 'at') {
    try {
      const d = new Date(job.schedule)
      return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
    } catch {
      return job.schedule
    }
  }
  // Cron: "0 8 * * *" → "08:00"
  const parts = job.schedule.trim().split(/\s+/)
  if (parts.length >= 5) {
    const minute = parts[0]
    const hour = parts[1]
    if (minute !== '*' && hour !== '*') {
      return `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`
    }
  }
  return job.schedule
}

/** Relative time from now: "2h后", "30m后", "已过期" */
function relativeTime(atMs: number | null): string {
  if (atMs == null) return ''
  const diff = atMs - Date.now()
  if (diff <= 0) return '已过期'
  if (diff < 60000) return '即将'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m后`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h后`
  return `${Math.floor(diff / 86400000)}d后`
}

function formatLastRun(job: CronJob): string {
  if (!job.lastRunAtMs) return ''
  const d = new Date(job.lastRunAtMs)
  const time = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
  const statusIcon = job.lastRunStatus === 'ok' ? '✅' : job.lastRunStatus === 'error' ? '❌' : '⏳'
  return `${statusIcon} ${time}`
}

function isExpiredOneShot(job: CronJob): boolean {
  if (job.scheduleKind !== 'at' || !job.schedule) return false
  try {
    const at = new Date(job.schedule).getTime()
    return Date.now() > at
  } catch {
    return false
  }
}

/** Get next run timestamp from state or schedule */
function getNextRunMs(job: CronJob): number | null {
  if (job.state?.nextRunAtMs) return job.state.nextRunAtMs
  if (job.scheduleKind === 'at' && job.schedule) {
    try { return new Date(job.schedule).getTime() } catch { /* ignore */ }
  }
  return null
}

export default function CronList({ jobs }: CronListProps) {
  const [showExpired, setShowExpired] = useState(false)

  const categorized = useMemo(() => {
    const recurring = jobs.filter(j => j.scheduleKind === 'cron' && j.enabled)
    const oneshotPending = jobs.filter(j => j.scheduleKind === 'at' && j.enabled && !isExpiredOneShot(j))
      .sort((a, b) => {
        const ta = getNextRunMs(a) ?? Infinity
        const tb = getNextRunMs(b) ?? Infinity
        return ta - tb
      })
    const expired = jobs.filter(j => !j.enabled || isExpiredOneShot(j))
    return { recurring, oneshotPending, expired }
  }, [jobs])

  const activeCount = categorized.recurring.length + categorized.oneshotPending.length

  if (jobs.length === 0) {
    return (
      <div className="cron-list card">
        <div className="section-title">⏰ 定时任务</div>
        <div className="cron-empty">暂无定时任务</div>
      </div>
    )
  }

  return (
    <div className="cron-list card">
      <div className="section-title">
        ⏰ 定时任务 ({activeCount})
      </div>
      <div className="card-scroll">
        {/* Recurring */}
        {categorized.recurring.map((job) => (
          <div key={job.id} className="cron-item">
            <span className="cron-time">{formatSchedule(job)}</span>
            <span className="cron-emoji">{getTaskEmoji(job.name)}</span>
            <span className="cron-name">{job.name}</span>
            <span className="cron-last-run">{formatLastRun(job)}</span>
          </div>
        ))}

        {/* One-shot pending */}
        {categorized.oneshotPending.map((job) => {
          const nextMs = getNextRunMs(job)
          const rel = nextMs ? relativeTime(nextMs) : ''
          return (
            <div key={job.id} className="cron-item cron-oneshot">
              <span className="cron-time">{formatSchedule(job)}</span>
              <span className="cron-emoji">{getTaskEmoji(job.name)}</span>
              <span className="cron-name">{job.description || job.name}</span>
              {rel && <span className={`cron-countdown${rel === '已过期' ? ' cron-expired' : ''}`}>{rel}</span>}
            </div>
          )
        })}

        {/* Expired toggle */}
        {categorized.expired.length > 0 && (
          <div className="cron-expired-toggle" onClick={() => setShowExpired(!showExpired)}>
            <span>{showExpired ? '▾' : '▸'} {categorized.expired.length} 个已过期/禁用</span>
          </div>
        )}

        {/* Expired list */}
        {showExpired && categorized.expired.map((job) => (
          <div key={job.id} className="cron-item cron-disabled">
            <span className="cron-time">{formatSchedule(job)}</span>
            <span className="cron-emoji">{getTaskEmoji(job.name)}</span>
            <span className="cron-name">{job.name}</span>
            <span className="cron-off-badge">OFF</span>
          </div>
        ))}
      </div>
    </div>
  )
}
