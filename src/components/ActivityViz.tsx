import { useState, useEffect } from 'react'
import './ActivityViz.css'

interface ActivityStats {
  sessionsPerDay: Record<string, number>
  sessionsPerHour: Record<number, number>
  sessionTypes: Record<string, number>
  tokensPerDay: Record<string, number>
}

export default function ActivityViz() {
  const [stats, setStats] = useState<ActivityStats | null>(null)

  useEffect(() => {
    const api = (window as any).lobsterAPI
    if (!api) return
    api.getActivityStats().then((d: ActivityStats) => setStats(d))
    const timer = setInterval(() => api.getActivityStats().then((d: ActivityStats) => setStats(d)), 5 * 60 * 1000)
    return () => clearInterval(timer)
  }, [])

  if (!stats) return <div className="activity-viz card"><div className="section-title">📊 活动概览</div><div className="av-loading">加载中...</div></div>

  const { sessionsPerDay, sessionsPerHour, sessionTypes, tokensPerDay } = stats
  const days = Object.keys(sessionsPerDay).sort()
  const maxDay = Math.max(...Object.values(sessionsPerDay), 1)
  const maxHour = Math.max(...Object.values(sessionsPerHour), 1)
  const totalSessions = Object.values(sessionTypes).reduce((a, b) => a + b, 0)

  // Donut chart for session types
  const donutData = [
    { label: '💬 Chat', value: sessionTypes.chat, color: '#4ECDC4' },
    { label: '⏰ Cron', value: sessionTypes.cron, color: '#F39C12' },
    { label: '⚡ Task', value: sessionTypes.task, color: '#E74C3C' },
    { label: '📋 Other', value: sessionTypes.other, color: '#8B9DC3' },
  ].filter(d => d.value > 0)

  // SVG donut
  let cumAngle = 0
  const donutPaths = donutData.map(d => {
    const pct = totalSessions > 0 ? d.value / totalSessions : 0
    const angle = pct * 360
    const startAngle = cumAngle - 90
    const endAngle = startAngle + angle
    cumAngle += angle
    const r = 32
    const cx = 40
    const cy = 40
    const startRad = (startAngle * Math.PI) / 180
    const endRad = (endAngle * Math.PI) / 180
    const x1 = cx + r * Math.cos(startRad)
    const y1 = cy + r * Math.sin(startRad)
    const x2 = cx + r * Math.cos(endRad)
    const y2 = cy + r * Math.sin(endRad)
    const largeArc = angle > 180 ? 1 : 0
    return { ...d, pct, path: `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z` }
  })

  // Weekday labels
  const weekdayNames = ['日', '一', '二', '三', '四', '五', '六']

  return (
    <div className="activity-viz card">
      <div className="section-title">📊 活动概览</div>

      {/* Row 1: Heatmap + Donut */}
      <div className="av-row1">
        {/* 14-day heatmap */}
        <div className="av-section">
          <div className="av-subtitle">过去 14 天</div>
          <div className="av-heatmap">
            {days.map((day, i) => {
              const count = sessionsPerDay[day]
              const intensity = count / maxDay
              const d = new Date(day)
              const isToday = day === new Date().toISOString().slice(0, 10)
              return (
                <div key={day} className="av-cell-wrap">
                  <div
                    className={`av-cell ${isToday ? 'av-today' : ''}`}
                    style={{ background: count === 0 ? 'rgba(255,255,255,0.03)' : `rgba(231, 76, 60, ${0.2 + intensity * 0.8})` }}
                    title={`${day}: ${count} sessions`}
                  />
                  {i % 7 === 0 && <span className="av-cell-label">{weekdayNames[d.getDay()]}</span>}
                </div>
              )
            })}
          </div>
        </div>

        {/* Donut chart */}
        <div className="av-section av-donut-section">
          <div className="av-subtitle">会话类型</div>
          <div className="av-donut-wrap">
            <svg viewBox="0 0 80 80" className="av-donut">
              {donutPaths.map((d, i) => (
                <path key={i} d={d.path} fill={d.color} opacity={0.85} />
              ))}
              <circle cx="40" cy="40" r="20" fill="#1a1b2e" />
              <text x="40" y="38" textAnchor="middle" fill="#eee" fontSize="11" fontWeight="700">{totalSessions}</text>
              <text x="40" y="50" textAnchor="middle" fill="#888" fontSize="7">sessions</text>
            </svg>
            <div className="av-donut-legend">
              {donutData.map(d => (
                <div key={d.label} className="av-legend-item">
                  <span className="av-legend-dot" style={{ background: d.color }} />
                  <span className="av-legend-label">{d.label}</span>
                  <span className="av-legend-val">{d.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Row 2: Today's hourly timeline */}
      <div className="av-section">
        <div className="av-subtitle">今日活跃时段</div>
        <div className="av-timeline">
          {Array.from({ length: 24 }, (_, h) => {
            const count = sessionsPerHour[h] || 0
            const pct = count / maxHour
            const isNow = h === new Date().getHours()
            return (
              <div key={h} className={`av-hour ${isNow ? 'av-hour-now' : ''}`} title={`${String(h).padStart(2, '0')}:00 — ${count} sessions`}>
                <div className="av-hour-bar" style={{ height: count > 0 ? `${Math.max(pct * 100, 8)}%` : '2px' }} />
                {h % 3 === 0 && <span className="av-hour-label">{h}h</span>}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
