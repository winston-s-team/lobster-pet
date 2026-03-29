export type LobsterState = 'idle' | 'working' | 'thinking' | 'error' | 'sleeping' | 'happy'

export type GatewayState = 'idle' | 'working' | 'thinking' | 'error' | 'sleeping'

export interface ActiveTask {
  name: string
  type: string
}

export interface OpenClawStatus {
  state: GatewayState
  description: string
  model: string
  tokensUsed: number
  tokensLimit: number
  activeTasks: ActiveTask[]
  allSessions?: SessionInfo[]
}

export interface AgentInfo {
  id: string
  name: string
  workspace: string
  model: string
}

export interface CronJob {
  id: string
  name: string
  schedule: string
  scheduleKind: string  // "cron" or "at"
  enabled: boolean
  lastRunAtMs: number | null
  lastRunStatus: string | null
  nextRunAtMs: number | null
  deleteAfterRun: boolean
  description: string
}

export interface GatewayInfo {
  version: string
  latency: number
  channels: string[]
  agents: Array<{
    id: string
    name: string
    sessionsCount: number
    lastActiveAgeMs: number | null
  }>
  gatewayReachable: boolean
}

export interface CronRunToday {
  jobId: string
  status: string
  durationMs: number
  runAtMs: number
  jobName: string
  summary?: string
}

export interface TokenUsage {
  totalTokens: number
  totalInput: number
  totalOutput: number
  totalCacheRead: number
  totalCacheWrite: number
  totalCost: number
  messageCount: number
}

export interface SessionInfo {
  key: string
  displayName?: string
  kind?: string
  channel?: string
  model?: string
  status?: string
  totalTokens?: number
  contextTokens?: number
  lastMessage?: string
  updatedAt?: number
  ageMs?: number
}
