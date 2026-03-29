import { useState, useEffect, useMemo } from 'react'
import type { OpenClawStatus, AgentInfo, CronJob, SessionInfo, GatewayInfo, CronRunToday, TokenUsage } from '../types'
import StatusCard from './StatusCard'
import TaskGrid from './TaskGrid'
import CronList from './CronList'
import MemoCard from './MemoCard'
import GatewayAgentsCard from './GatewayAgentsCard'
import ActivityViz from './ActivityViz'
import MiniOffice from './MiniOffice'
import './DetailPanel.css'

const api = window.lobsterAPI

export default function DetailPanel() {
  const [status, setStatus] = useState<OpenClawStatus | null>(null)
  const [agents, setAgents] = useState<AgentInfo[]>([])
  const [cronJobs, setCronJobs] = useState<CronJob[]>([])
  const [memo, setMemo] = useState<string | null>(null)
  const [totalUsage, setTotalUsage] = useState<TokenUsage | null>(null)
  const [gatewayInfo, setGatewayInfo] = useState<GatewayInfo | null>(null)
  const [cronRunsToday, setCronRunsToday] = useState<CronRunToday[]>([])

  useEffect(() => {
    if (!api) return

    // Status polling - also refresh immediately for detail panel
    api.refreshStatus().then(setStatus)
    const unsub = api.onStatusUpdate(setStatus)

    // Fetch static data
    const fetchStatic = () => {
      api.getAgents().then((list: AgentInfo[]) => setAgents(list))
      api.getCronJobs().then((jobs: CronJob[]) => setCronJobs(jobs))
      api.getYesterdayMemo().then((content: string | null) => setMemo(content))
      api.getTokenUsage().then((data: any) => setTotalUsage(data))
      api.getGatewayInfo().then((data: any) => setGatewayInfo(data))
      api.getCronRunsToday().then((data: any) => setCronRunsToday(data || []))
    }
    fetchStatic()
    // Refresh static data every 10 minutes (was 5min — cached on main process anyway)
    const staticTimer = setInterval(fetchStatic, 10 * 60 * 1000)

    // Real-time gateway info updates (agents active status)
    const unsubGateway = api.onGatewayInfoUpdate?.((data: GatewayInfo) => setGatewayInfo(data))

    return () => {
      unsub()
      unsubGateway?.()
      clearInterval(staticTimer)
    }
  }, [])

  // Sessions come from status.allSessions (full list from sessions_list)
  const sessions: SessionInfo[] = useMemo(() => {
    if (!status?.allSessions?.length) return []
    return status.allSessions
  }, [status])

  const [refreshing, setRefreshing] = useState(false)

  const handleRefresh = async () => {
    if (refreshing) return
    setRefreshing(true)
    const s = await api?.refreshStatus()
    if (s) setStatus(s)
    const a = await api?.getAgents()
    if (a) setAgents(a as AgentInfo[])
    const c = await api?.getCronJobs()
    if (c) setCronJobs(c as CronJob[])
    const m = await api?.getYesterdayMemo()
    setMemo(m ?? null)
    const u = await api?.getTokenUsage()
    setTotalUsage(u)
    const g = await api?.getGatewayInfo()
    setGatewayInfo(g)
    const cr = await api?.getCronRunsToday()
    setCronRunsToday(cr || [])
    setTimeout(() => setRefreshing(false), 300)
  }

  const handleClose = () => {
    window.close()
  }

  return (
    <div className={`office${refreshing ? ' is-loading' : ''}`}>
      {refreshing && <div className="office-loading-overlay"><div className="office-loading-spinner" /></div>}
      {/* Header */}
      <div className="office-header">
        <span className="office-title">🦞 龙虾办公室</span>
        <div className="office-header-actions">
          <button className={`office-refresh${refreshing ? ' is-spinning' : ''}`} onClick={handleRefresh} title="刷新">🔄</button>
          <button className="office-close" onClick={handleClose}>✕</button>
        </div>
      </div>

      {/* Body */}
      <div className="office-body">
        {/* Row 1: Status + Sessions + Viz (full width) */}
        <div className="office-row office-row-top">
          <StatusCard status={status} totalUsage={totalUsage} />
          <TaskGrid sessions={sessions} />
          <ActivityViz />
        </div>

        {/* Row 2: Left stack + MiniOffice */}
        <div className="office-row office-row-mid">
          <div className="office-left-stack">
            <div className="office-row office-row-data">
              <GatewayAgentsCard agents={agents} gatewayInfo={gatewayInfo} />
              <CronList jobs={cronJobs} />
            </div>
            <MemoCard content={memo} />
          </div>
          <MiniOffice status={status} />
        </div>
      </div>
    </div>
  )
}
