import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  ipcMain,
  nativeImage,
  screen,
} from 'electron'
import path from 'path'
import fs from 'fs'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let pollTimer: ReturnType<typeof setTimeout> | null = null

// === Types ===
type GatewayState = 'idle' | 'working' | 'thinking' | 'error' | 'sleeping'

interface ActiveTask {
  name: string
  type: string
}

interface OpenClawStatus {
  state: GatewayState
  description: string
  model: string
  tokensUsed: number
  tokensLimit: number
  activeTasks: ActiveTask[]
  allSessions?: any[]
}

// === Constants ===
const DEFAULT_GATEWAY_PORT = 18789
const POLL_INTERVAL = 60_000
const MAX_BACKOFF = 5 * 60_000

// === i18n strings ===
const STR = {
  offline: 'Gateway Offline',
  idle: 'Idle',
  chatFeishu: 'Feishu Chat',
  chatDiscord: 'Discord Chat',
  chatTelegram: 'Telegram Chat',
  chatDefault: 'Chat',
  cronTask: 'Cron Task',
  subagentTask: 'Sub-task',
  webConsole: 'Web Console',
  agentTask: 'Agent Task',
  menuShowDetails: '📋 Dashboard',
  menuQuit: '❌ Quit',
  trayShow: 'Show Window',
  trayQuit: 'Quit',
  tooltip: 'Lobster Pet',
}

// === OpenClaw config ===
let cachedGatewayBase: string | null = null
function getOpenClawConfig(): any {
  return configCache.get(() => {
    try {
      const cfgPath = path.join(app.getPath('home'), '.openclaw', 'openclaw.json')
      return JSON.parse(fs.readFileSync(cfgPath, 'utf-8'))
    } catch {
      return {}
    }
  })
}

function getGatewayBase(): string {
  if (cachedGatewayBase) return cachedGatewayBase
  try {
    const cfg = getOpenClawConfig()
    const port = cfg?.gateway?.port || DEFAULT_GATEWAY_PORT
    const bind = cfg?.gateway?.bind || 'localhost'
    cachedGatewayBase = `http://${bind === '0.0.0.0' ? 'localhost' : bind}:${port}`
  } catch {
    cachedGatewayBase = `http://localhost:${DEFAULT_GATEWAY_PORT}`
  }
  return cachedGatewayBase
}

// === File Cache ===
interface CacheEntry<T> {
  data: T
  ts: number
}
function createCache<T>(ttlMs: number) {
  let entry: CacheEntry<T> | null = null
  return {
    get(fetcher: () => T): T {
      if (entry && Date.now() - entry.ts < ttlMs) return entry.data
      entry = { data: fetcher(), ts: Date.now() }
      return entry.data
    },
    invalidate() { entry = null },
  }
}

// Cache expensive file reads for 10 minutes
const tokenUsageCache = createCache<any>(10 * 60_000)
const activityStatsCache = createCache<any>(10 * 60_000)
const gatewayInfoCache2 = createCache<any>(5 * 60_000)
const configCache = createCache<any>(2 * 60_000)

const OFFLINE_STATUS: OpenClawStatus = {
  state: 'error',
  description: STR.offline,
  model: '—',
  tokensUsed: 0,
  tokensLimit: 0,
  activeTasks: [],
}

let consecutiveErrors = 0

// === Window State ===
const windowStatePath = path.join(app.getPath('userData'), 'window-state.json')

interface WindowState {
  x?: number
  y?: number
}

function loadWindowState(): WindowState {
  try {
    return JSON.parse(fs.readFileSync(windowStatePath, 'utf-8'))
  } catch {
    return {}
  }
}

function saveWindowState(state: WindowState) {
  try {
    fs.writeFileSync(windowStatePath, JSON.stringify(state))
  } catch {}
}

function getDefaultPosition() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize
  return {
    x: width - 150 - 50,
    y: height - 150 - 50,
  }
}

// === Gateway ===
function getGatewayToken(): string | null {
  try {
    const cfgPath = path.join(app.getPath('home'), '.openclaw', 'openclaw.json')
    const raw = fs.readFileSync(cfgPath, 'utf-8')
    const cfg = JSON.parse(raw)
    if (cfg?.gateway?.auth?.token) return cfg.gateway.auth.token
  } catch {}
  return process.env.OPENCLAW_GATEWAY_TOKEN || null
}

async function invokeTool(body: Record<string, unknown>): Promise<any> {
  const token = getGatewayToken()
  if (!token) {
    console.warn('[lobster-pet] No gateway token found')
    return { ok: false, error: { type: 'auth', message: 'No token' } }
  }
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    }
    const res = await fetch(`${getGatewayBase()}/tools/invoke`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (!res.ok) {
      console.warn(`[lobster-pet] Tool invoke failed: ${res.status}`, data)
      return data
    }
    return data
  } catch (err) {
    console.error('[lobster-pet] Network error:', err)
    return { ok: false, error: { type: 'network', message: 'Gateway unreachable' } }
  }
}

async function sendAgentMessage(message: string): Promise<any> {
  const token = getGatewayToken()
  if (!token) {
    console.warn('[lobster-pet] No gateway token found for chat')
    return { ok: false, error: { type: 'auth', message: 'No token' } }
  }
  try {
    const res = await fetch(`${getGatewayBase()}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        model: 'openclaw',
        messages: [{ role: 'user', content: message }],
        stream: false,
      }),
    })
    const data = await res.json()
    if (!res.ok) {
      console.warn(`[lobster-pet] Chat completions failed: ${res.status}`, data)
      return data
    }
    return data
  } catch (err) {
    console.error('[lobster-pet] Chat network error:', err)
    return { ok: false, error: { type: 'network', message: 'Gateway unreachable' } }
  }
}

async function fetchStatus(): Promise<OpenClawStatus> {
  const [statusRes, sessionsRes] = await Promise.allSettled([
    invokeTool({ tool: 'session_status', args: {}, sessionKey: 'main' }),
    invokeTool({ tool: 'sessions_list', args: { activeMinutes: 1440, limit: 20, messageLimit: 1 } }),
  ])

  let state: GatewayState = 'idle'
  let description = STR.idle
  let model = '—'
  let tokensUsed = 0
  let tokensLimit = 0
  const activeTasks: ActiveTask[] = []

  if (statusRes.status === 'fulfilled') {
    const d = statusRes.value
    if (d?.ok) {
      const details = d.result?.details

      // Use structured fields directly instead of regex on statusText
      if (details?.model) model = details.model
      if (details?.contextUsed != null) tokensUsed = details.contextUsed
      if (details?.contextLimit != null) tokensLimit = details.contextLimit
      if (details?.statusText) {
        description = details.statusText.split('\n')[0] || description
      }

      // Infer state from structured fields
      if (details?.status) {
        const raw = String(details.status).toLowerCase()
        if (raw.includes('think') || raw.includes('process')) state = 'thinking'
        else if (raw.includes('work') || raw.includes('busy') || raw.includes('active')) state = 'working'
        else if (raw.includes('error') || raw.includes('fail')) state = 'error'
        else if (raw.includes('sleep') || raw.includes('wait')) state = 'sleeping'
      }
      // Fallback: check queue state
      if (state === 'idle' && details?.queue) {
        state = details.queue === 'collect' ? 'idle' : 'working'
      }
    }
  }

  // Read sessions from sessions.json file directly (more complete than sessions_list)
  let allSessions: Array<{
    key: string
    displayName: string
    kind: string
    channel: string
    model: string
    status: string
    totalTokens: number
    contextTokens: number
    lastMessage: string
    updatedAt: number
    ageMs: number
  }> = []

  try {
    const now = Date.now()
    const dayMs = 86400000
    const agentsDir = path.join(app.getPath('home'), '.openclaw', 'agents')

    // Read sessions from ALL agents, not just main
    if (fs.existsSync(agentsDir)) {
      const agentDirs = fs.readdirSync(agentsDir).filter(f => {
        return fs.statSync(path.join(agentsDir, f)).isDirectory()
      })

      for (const agentDir of agentDirs) {
        const sessionsPath = path.join(agentsDir, agentDir, 'sessions', 'sessions.json')
        if (!fs.existsSync(sessionsPath)) continue
        const sessionsData = JSON.parse(fs.readFileSync(sessionsPath, 'utf-8'))

        for (const [key, s] of Object.entries(sessionsData) as [string, any][]) {
      const updatedAt = s.updatedAt || 0
      const ageMs = now - updatedAt
      // Only show sessions active in last 3 days
      if (ageMs > 3 * dayMs) continue

      // Parse key to determine kind/channel
      const fullKey = key.includes(':') ? key : `agent:${agentDir}:${key}`
      // Format: agent:main:feishu:direct:ou_xxx | agent:browser-agent:subagent:uuid | agent:main:cron:jobid
      let kind = 'other'
      let channel = agentDir === 'main' ? 'unknown' : agentDir
      let displayName = fullKey.replace(`agent:${agentDir}:`, '')

      if (fullKey.includes(':feishu:')) {
        kind = 'chat'
        channel = 'feishu'
        displayName = STR.chatFeishu
      } else if (fullKey.includes(':discord:')) {
        kind = 'chat'
        channel = 'discord'
        displayName = STR.chatDiscord
      } else if (fullKey.includes(':telegram:')) {
        kind = 'chat'
        channel = 'telegram'
        displayName = STR.chatTelegram
      } else if (fullKey.includes(':cron:')) {
        kind = 'cron'
        channel = 'cron'
        displayName = STR.cronTask
      } else if (fullKey.includes(':subagent:')) {
        kind = 'task'
        channel = agentDir
        displayName = `${agentDir} ${STR.subagentTask}`
      } else if (fullKey.includes(':webchat') || fullKey === 'agent:main:main') {
        kind = 'other'
        channel = 'webchat'
        displayName = STR.webConsole
      } else if (fullKey.includes(':direct:') || fullKey.includes(':group:')) {
        // Generic channel chat (works for any configured channel)
        kind = 'chat'
        channel = agentDir === 'main' ? 'unknown' : agentDir
        displayName = STR.chatDefault
      } else if (agentDir !== 'main') {
        kind = 'task'
        displayName = `${agentDir} ${STR.agentTask}`
      }

      // Try to resolve cron job name from jobs.json
      if (kind === 'cron') {
        const jobId = key.split(':').slice(-1)[0]?.split(':run:')[0]
        if (jobId) {
          try {
            const jobsData = JSON.parse(fs.readFileSync(
              path.join(app.getPath('home'), '.openclaw', 'cron', 'jobs.json'), 'utf-8'
            ))
            const job = (jobsData.jobs || []).find((j: any) => j.id === jobId)
            if (job?.name) displayName = job.name
          } catch { /* ignore */ }
        }
      }

      allSessions.push({
        key,
        displayName,
        kind,
        channel,
        model: s.model || '',
        status: s.status || '',
        totalTokens: s.totalTokens || 0,
        contextTokens: s.contextTokens || 0,
        lastMessage: '',
        updatedAt,
        ageMs,
      })
      }
      }
    }

    // Sort by updatedAt descending
    allSessions.sort((a, b) => b.updatedAt - a.updatedAt)
    allSessions = allSessions.slice(0, 20)
  } catch {
    // Fall back to sessions_list result
  }

  // Also still use sessions_list for activeTasks (real-time status)
  if (sessionsRes.status === 'fulfilled') {
    const d = sessionsRes.value
    if (d?.ok) {
      const sessions = d.result?.details?.sessions
      if (Array.isArray(sessions)) {
        for (const s of sessions) {
          if (model === '—' && s.model) model = s.model
          if (tokensLimit === 0 && s.contextTokens) tokensLimit = s.contextTokens
          if (tokensUsed === 0 && s.totalTokens) tokensUsed = s.totalTokens
          if (state === 'idle') {
            const kind = (s.kind ?? '').toLowerCase()
            if (kind.includes('task') || kind.includes('tool')) state = 'working'
          }
        }
        if (sessions.length > 0 && state === 'idle') state = 'working'
      }
    }
  }

  // Determine if this was a successful poll
  const hadError =
    (statusRes.status === 'rejected' || (statusRes.status === 'fulfilled' && !statusRes.value?.ok)) &&
    (sessionsRes.status === 'rejected' || (sessionsRes.status === 'fulfilled' && !sessionsRes.value?.ok))

  if (hadError && activeTasks.length === 0 && model === '—') {
    consecutiveErrors++
    return { ...OFFLINE_STATUS }
  }

  consecutiveErrors = 0
  return { state, description, model, tokensUsed, tokensLimit, activeTasks, allSessions }
}

function getNextInterval(): number {
  if (consecutiveErrors === 0) return POLL_INTERVAL
  return Math.min(POLL_INTERVAL * Math.pow(2, consecutiveErrors), MAX_BACKOFF)
}

// Gateway latency measurement via async fetch
let cachedLatency = 0
let lastLatencyCheck = 0
async function measureLatency(): Promise<number> {
  if (Date.now() - lastLatencyCheck < 30000) return cachedLatency // Cache 30s
  try {
    const token = getGatewayToken()
    if (!token) return 0
    const start = Date.now()
    const res = await fetch(getGatewayBase() + '/health', {
      headers: { 'Authorization': `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    })
    cachedLatency = res.ok ? Date.now() - start : 0
  } catch {
    cachedLatency = 0
  }
  lastLatencyCheck = Date.now()
  return cachedLatency
}

// === IPC ===
let cachedStatus: OpenClawStatus = { ...OFFLINE_STATUS }

ipcMain.handle('get-status', () => cachedStatus)

ipcMain.handle('refresh-status', async () => {
  cachedStatus = await fetchStatus()
  pushStatus()
  return cachedStatus
})

ipcMain.handle('trigger-task', async (_event, taskType: string) => {
  return sendAgentMessage(taskType)
})

ipcMain.handle('send-message', async (_event, message: string) => {
  return sendAgentMessage(message)
})

// Move the pet window
ipcMain.handle('move-window', (_event, x: number, y: number) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setPosition(Math.round(x), Math.round(y))
  }
})

// Get screen work area bounds for walk limits
ipcMain.handle('get-screen-bounds', () => {
  return screen.getPrimaryDisplay().workAreaSize
})

// Set ignore mouse events (for click-through outside lobster)
ipcMain.handle('set-ignore-mouse', (_event, ignore: boolean) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setIgnoreMouseEvents(ignore, { forward: true })
  }
})

// Right-click context menu
ipcMain.handle('show-context-menu', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const menu = Menu.buildFromTemplate([
    { label: STR.menuShowDetails, click: () => openDetailPanel() },
    { type: 'separator' },
    { label: STR.menuQuit, click: () => app.quit() },
  ])
  menu.popup({ window: mainWindow })
})

// Agent list from openclaw.json
// Structure: { agents: { defaults: {...}, list: [{id, name, workspace, model, agentDir}, ...] } }
ipcMain.handle('get-agents', () => {
  try {
    const cfgPath = path.join(app.getPath('home'), '.openclaw', 'openclaw.json')
    const raw = fs.readFileSync(cfgPath, 'utf-8')
    const cfg = JSON.parse(raw)
    const agents = cfg.agents || {}
    // agents.list is an array of agent objects
    const list = (agents.list || []).map((a: any) => ({
      id: a.id || a.name || '?',
      name: a.name || a.id || '?',
      workspace: a.workspace || '',
      model: a.model || '',
    }))
    return list
  } catch {
    return []
  }
})

// Cron jobs from ~/.openclaw/cron/jobs.json
// Structure: { version: 1, jobs: [{id, name, schedule:{kind,expr,at}, enabled, state, payload}, ...] }
ipcMain.handle('get-cron-jobs', () => {
  try {
    const jobsPath = path.join(app.getPath('home'), '.openclaw', 'cron', 'jobs.json')
    const raw = fs.readFileSync(jobsPath, 'utf-8')
    const data = JSON.parse(raw)
    const jobs = data.jobs || []
    return jobs.map((j: any) => {
      const schedule = j.schedule || {}
      // kind can be "cron" (recurring) or "at" (one-shot)
      const expr = schedule.expr || schedule.at || ''
      const kind = schedule.kind || ''
      return {
        id: j.id || '',
        name: j.name || j.id || '',
        schedule: expr,
        scheduleKind: kind,
        enabled: j.enabled !== false,
        lastRunAtMs: j.state?.lastRunAtMs || null,
        lastRunStatus: j.state?.lastRunStatus || null,
        nextRunAtMs: j.state?.nextRunAtMs || null,
        deleteAfterRun: j.deleteAfterRun || false,
        description: j.description || '',
      }
    })
  } catch {
    return []
  }
})

// Cumulative token usage from all session logs (CACHED 10min)
ipcMain.handle('get-token-usage', () => {
  return tokenUsageCache.get(() => {
    try {
      const agentsDir = path.join(app.getPath('home'), '.openclaw', 'agents')
      let totalInput = 0
      let totalOutput = 0
      let totalCost = 0
      let messageCount = 0

      const agentDirs = fs.readdirSync(agentsDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name)

      for (const agentId of agentDirs) {
        const sessionsDir = path.join(agentsDir, agentId, 'sessions')
        if (!fs.existsSync(sessionsDir)) continue

        const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.jsonl'))
        for (const file of files) {
          const filePath = path.join(sessionsDir, file)
          try {
            const lines = fs.readFileSync(filePath, 'utf-8').split('\n').filter(Boolean)
            for (const line of lines) {
              try {
                const entry = JSON.parse(line)
                const usage = entry?.message?.usage
                if (usage) {
                  totalInput += usage.input || 0
                  totalOutput += usage.output || 0
                  totalCost += usage.cost?.total || 0
                  messageCount++
                }
              } catch { /* skip bad lines */ }
            }
          } catch { /* skip unreadable files */ }
        }
      }

      // Also scan cron runs
      const cronRunsDir = path.join(app.getPath('home'), '.openclaw', 'cron', 'runs')
      if (fs.existsSync(cronRunsDir)) {
        const cronFiles = fs.readdirSync(cronRunsDir).filter(f => f.endsWith('.jsonl'))
        for (const file of cronFiles) {
          try {
            const lines = fs.readFileSync(path.join(cronRunsDir, file), 'utf-8').split('\n').filter(Boolean)
            for (const line of lines) {
              try {
                const entry = JSON.parse(line)
                const usage = entry?.message?.usage
                if (usage) {
                  totalInput += usage.input || 0
                  totalOutput += usage.output || 0
                  totalCost += usage.cost?.total || 0
                  messageCount++
                }
              } catch { /* skip */ }
            }
          } catch { /* skip */ }
        }
      }

      return {
        totalInput,
        totalOutput,
        totalTokens: totalInput + totalOutput,
        totalCost,
        messageCount,
      }
    } catch {
      return null
    }
  })
})

// Gateway info (CACHED 5min)
ipcMain.handle('get-gateway-info', async () => {
  const latency = await measureLatency()
  return gatewayInfoCache2.get(() => {
    try {
      const cfg = getOpenClawConfig()
      const version = cfg._version || 'unknown'

      // Channels from channels config (primary) + plugins.entries (fallback)
      const channels: string[] = []
      const channelsCfg = cfg.channels || {}
      for (const [name, data] of Object.entries(channelsCfg)) {
        if ((data as any).enabled !== false) channels.push(name)
      }
      const plugins = cfg.plugins || {}
      const entries = plugins.entries || plugins.allow || {}
      for (const [name, data] of Object.entries(entries)) {
        if ((data as any).enabled !== false && !channels.includes(name)) {
          channels.push(name)
        }
      }

      const agentsDir = path.join(app.getPath('home'), '.openclaw', 'agents')
      const agentInfo: Array<{ id: string; name: string; sessionsCount: number; lastActiveAgeMs: number | null }> = []
      const agentList = cfg.agents?.list || []
      for (const a of agentList) {
        const sessionsPath = path.join(agentsDir, a.id, 'sessions', 'sessions.json')
        let sessionsCount = 0
        let lastActiveAgeMs: number | null = null
        try {
          const sessionsData = JSON.parse(fs.readFileSync(sessionsPath, 'utf-8'))
          sessionsCount = Object.keys(sessionsData).length
          let maxTs = 0
          for (const s of Object.values(sessionsData) as any[]) {
            if (s.updatedAt && s.updatedAt > maxTs) maxTs = s.updatedAt
          }
          if (maxTs > 0) lastActiveAgeMs = Date.now() - maxTs
        } catch { /* ignore */ }
        agentInfo.push({
          id: a.id,
          name: a.name || a.id,
          sessionsCount,
          lastActiveAgeMs,
        })
      }

      const token = getGatewayToken()
      return {
        version,
        latency,
        channels,
        agents: agentInfo,
        gatewayReachable: !!token,
      }
    } catch {
      return null
    }
  })
})

// Today's cron run history
ipcMain.handle('get-cron-runs-today', () => {
  try {
    const runsDir = path.join(app.getPath('home'), '.openclaw', 'cron', 'runs')
    if (!fs.existsSync(runsDir)) return []

    // Today's start timestamp in local time (Asia/Shanghai)
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    // Adjust for timezone: local midnight
    const offset = now.getTimezoneOffset() * 60000
    const localMidnight = todayStart - offset
    const todayStr = new Date(localMidnight).toISOString().slice(0, 10) // "2026-03-28"

    // Build job name lookup from jobs.json
    let jobNames: Record<string, string> = {}
    try {
      const jobsPath = path.join(app.getPath('home'), '.openclaw', 'cron', 'jobs.json')
      const jobsData = JSON.parse(fs.readFileSync(jobsPath, 'utf-8'))
      const jobs = jobsData.jobs || []
      for (const j of jobs) {
        jobNames[j.id] = j.name || j.id
      }
    } catch { /* ignore */ }

    const files = fs.readdirSync(runsDir).filter(f => f.endsWith('.jsonl'))
    const runs: Array<{
      jobId: string
      status: string
      durationMs: number
      runAtMs: number
      jobName: string
      summary: string
    }> = []

    for (const file of files) {
      const filePath = path.join(runsDir, file)
      try {
        const lines = fs.readFileSync(filePath, 'utf-8').split('\n').filter(Boolean)
        for (const line of lines) {
          try {
            const entry = JSON.parse(line)

            // Check if this run happened today
            const runAtMs = entry.ts || entry.runAtMs || entry.timestamp
            if (!runAtMs) continue
            if (runAtMs < localMidnight) continue

            // Only count "finished" actions
            if (entry.action !== 'finished') continue

            const jobId = entry.jobId || file.replace('.jsonl', '')
            runs.push({
              jobId,
              status: entry.status === 'ok' ? 'ok' : (entry.status === 'error' ? 'error' : 'unknown'),
              durationMs: entry.durationMs || 0,
              runAtMs,
              jobName: jobNames[jobId] || jobId.slice(0, 8) + '...',
              summary: (entry.summary || '').slice(0, 100),
            })
          } catch { /* skip */ }
        }
      } catch { /* skip */ }
    }

    // Sort by runAtMs descending
    runs.sort((a, b) => b.runAtMs - a.runAtMs)
    return runs.slice(0, 20)
  } catch {
    return []
  }
})

// Activity stats for visualization (CACHED 10min)
ipcMain.handle('get-activity-stats', () => {
  return activityStatsCache.get(() => {
    try {
      const agentsDir = path.join(app.getPath('home'), '.openclaw', 'agents')
      const now = Date.now()
      const dayMs = 86400000

      const sessionsPerDay: Record<string, number> = {}
      const sessionsPerHour: Record<number, number> = {}
      const sessionTypes: Record<string, number> = { chat: 0, cron: 0, task: 0, other: 0 }
      const tokensPerDay: Record<string, number> = {}

      for (let d = 13; d >= 0; d--) {
        const date = new Date(now - d * dayMs)
        const key = date.toISOString().slice(0, 10)
        sessionsPerDay[key] = 0
        tokensPerDay[key] = 0
      }

      for (let h = 0; h < 24; h++) sessionsPerHour[h] = 0

      if (fs.existsSync(agentsDir)) {
        const agentDirs = fs.readdirSync(agentsDir).filter(f =>
          fs.statSync(path.join(agentsDir, f)).isDirectory()
        )

        for (const agentDir of agentDirs) {
          const sessionsPath = path.join(agentsDir, agentDir, 'sessions', 'sessions.json')
          if (!fs.existsSync(sessionsPath)) continue
          const data = JSON.parse(fs.readFileSync(sessionsPath, 'utf-8'))

          for (const [key, s] of Object.entries(data) as [string, any][]) {
            const updatedAt = s.updatedAt || 0
            if (!updatedAt) continue

            const date = new Date(updatedAt).toISOString().slice(0, 10)
            const hour = new Date(updatedAt).getHours()

            if (sessionsPerDay[date] !== undefined) sessionsPerDay[date]++
            if (date === new Date().toISOString().slice(0, 10)) {
              if (sessionsPerHour[hour] !== undefined) sessionsPerHour[hour]++
            }
            const fullKey = key.includes(':') ? key : `agent:${agentDir}:${key}`
            if (fullKey.includes(':feishu:') || fullKey.includes(':direct:')) sessionTypes.chat++
            else if (fullKey.includes(':cron:')) sessionTypes.cron++
            else if (fullKey.includes(':subagent:')) sessionTypes.task++
            else sessionTypes.other++
            if (tokensPerDay[date] !== undefined) {
              tokensPerDay[date] += s.totalTokens || 0
            }
          }
        }
      }

      return { sessionsPerDay, sessionsPerHour, sessionTypes, tokensPerDay }
    } catch {
      return null
    }
  })
})

// Office name from agent workspace IDENTITY.md
ipcMain.handle('get-office-name', () => {
  try {
    const cfg = getOpenClawConfig()
    const mainAgent = (cfg.agents?.list || []).find((a: any) => a.id === 'main') || (cfg.agents?.list || [])[0]
    const workspace = mainAgent?.workspace || path.join(app.getPath('home'), '.openclaw', 'workspace')

    // Try IDENTITY.md first, then SOUL.md
    for (const file of ['IDENTITY.md', 'SOUL.md']) {
      const filePath = path.join(workspace, file)
      if (!fs.existsSync(filePath)) continue
      const content = fs.readFileSync(filePath, 'utf-8')
      // Match "Name: xxx" or "名字：xxx"
      const match = content.match(/Name:\s*\*{0,2}(.+?)(?:\s*\*{0,2})?$/im) || content.match(/名字[：:]\s*(.+)/)
      if (match) {
        let name = match[1].trim().replace(/\*+/g, '').trim()
        return `${name}'s Office`
      }
    }
    return `${mainAgent?.id || '?'}'s Office`
  } catch {
    return "? 's Office"
  }
})

// Memory memo (today's)
ipcMain.handle('get-yesterday-memo', () => {
  try {
    const workspace = path.join(app.getPath('home'), '.openclaw', 'workspace')
    const dateStr = new Date().toISOString().slice(0, 10) // today
    const memoDir = path.join(workspace, 'memory')

    // Find files starting with yesterday's date
    if (!fs.existsSync(memoDir)) return null
    const files = fs.readdirSync(memoDir)
      .filter(f => f.startsWith(dateStr) && f.endsWith('.md'))
      .sort()

    if (files.length === 0) return null

    // Read the main file (exact date match) or first matching file, or concatenate all
    const mainFile = files.find(f => f === `${dateStr}.md`)
    if (mainFile) return fs.readFileSync(path.join(memoDir, mainFile), 'utf-8')
    // If multiple files, concatenate their content
    if (files.length > 0) {
      return files.map(f => {
        const content = fs.readFileSync(path.join(memoDir, f), 'utf-8')
        const name = f.replace('.md', '').replace(dateStr, '').replace(/^[-_]+/, '')
        return name ? `## ${name}\n${content}` : content
      }).join('\n\n---\n\n')
    }
    return null
  } catch {
    return null
  }
})

function pushStatus() {
  const data = cachedStatus
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('status-update', data)
  }
  if (detailWindow && !detailWindow.isDestroyed()) {
    detailWindow.webContents.send('status-update', data)
  }
}

// Push gateway info update to detail panel (uses cached data)
function pushGatewayInfoUpdate() {
  if (!detailWindow || detailWindow.isDestroyed()) return
  // Invalidate cache so next fetch gets fresh data
  gatewayInfoCache2.invalidate()
  const info = gatewayInfoCache2.get(() => null)
  if (info) {
    detailWindow.webContents.send('gateway-info-update', info)
  }
}

// === Polling ===
function scheduleNextPoll() {
  pollTimer = setTimeout(async () => {
    cachedStatus = await fetchStatus()
    pushStatus()
    pushGatewayInfoUpdate()
    scheduleNextPoll()
  }, getNextInterval())
}

function startPolling() {
  fetchStatus().then((s) => {
    cachedStatus = s
    pushStatus()
  })
  scheduleNextPoll()
}

// === Tray ===
function createTrayIcon() {
  const svg = `<svg width="16" height="16" xmlns="http://www.w3.org/2000/svg">
    <circle cx="8" cy="8" r="7" fill="#E74C3C" stroke="#C0392B" stroke-width="1"/>
  </svg>`
  return nativeImage.createFromBuffer(Buffer.from(svg))
}

function createTray() {
  const icon = createTrayIcon()
  tray = new Tray(icon)
  const menu = Menu.buildFromTemplate([
    { label: STR.trayShow, click: () => { mainWindow?.show(); mainWindow?.focus() } },
    { type: 'separator' },
    { label: STR.trayQuit, click: () => app.quit() },
  ])
  tray.setToolTip(STR.tooltip)
  tray.setContextMenu(menu)
  tray.on('click', () => {
    if (!mainWindow) return
    mainWindow.isVisible() ? mainWindow.hide() : (mainWindow.show(), mainWindow.focus())
  })
}

// === Detail Panel ===
let detailWindow: BrowserWindow | null = null

function openDetailPanel() {
  if (detailWindow && !detailWindow.isDestroyed()) {
    detailWindow.show()
    detailWindow.focus()
    return
  }
  const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize
  detailWindow = new BrowserWindow({
    width: Math.round(screenW * 0.8),
    height: Math.round(screenH * 0.8),
    x: Math.round(screenW * 0.1),
    y: Math.round(screenH * 0.1),
    transparent: false,
    frame: false,
    hasShadow: true,
    alwaysOnTop: true,
    resizable: true,
    skipTaskbar: false,
    show: false,
    backgroundColor: '#1a1b2e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // avoid spawning extra utility process
    },
  })
  detailWindow.once('ready-to-show', () => {
    detailWindow?.show()
  })
  if (!app.isPackaged) {
    detailWindow.loadURL('http://localhost:5173?mode=detail')
  } else {
    detailWindow.loadFile(path.join(__dirname, '../dist/index.html'), { query: { mode: 'detail' } })
  }
  // Destroy on close to free ~250MB renderer memory
  detailWindow.on('closed', () => {
    detailWindow = null
  })
}

// === Window ===
function createWindow() {
  const saved = loadWindowState()
  const def = getDefaultPosition()

  mainWindow = new BrowserWindow({
    width: 150,
    height: 150,
    x: saved.x ?? def.x,
    y: saved.y ?? def.y,
    title: '',
    transparent: true,
    frame: false,
    hasShadow: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    show: false, // 先不显示，避免白闪
    backgroundColor: '#00000000', // Windows 透明关键
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // 窗口渲染完成后再显示，避免白闪和边框闪烁
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  if (!app.isPackaged) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('moved', () => {
    if (mainWindow) {
      const [x, y] = mainWindow.getPosition()
      saveWindowState({ x, y })
    }
  })

  mainWindow.on('closed', () => { mainWindow = null })
}

// === Single Instance Lock ===
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    // Someone tried to run a second instance, focus our window instead
    if (mainWindow) {
      if (!mainWindow.isVisible()) mainWindow.show()
      mainWindow.focus()
    }
  })
}

// Transparent window + memory optimization flags
app.disableHardwareAcceleration()

app.commandLine.appendSwitch('disable-gpu')
app.commandLine.appendSwitch('disable-software-rasterizer')
app.commandLine.appendSwitch('disable-gpu-compositing')
app.commandLine.appendSwitch('disable-features', 'PaintHolding,WidgetLayering,WindowsScrollingPersonality')
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=128')
app.commandLine.appendSwitch('disable-background-networking')
app.commandLine.appendSwitch('disable-sync')
app.commandLine.appendSwitch('disable-translate')
app.commandLine.appendSwitch('disable-ipc-flooding-protection')
app.commandLine.appendSwitch('enable-low-res-tiling')

// no-sandbox only on Windows (macOS Electron doesn't sandbox by default)
if (process.platform === 'win32') {
  app.commandLine.appendSwitch('no-sandbox')
}

// === App Lifecycle ===
app.whenReady().then(() => {
  createWindow()
  createTray()
  startPolling()
  app.setLoginItemSettings({ openAtLogin: true, path: app.getPath('exe') })
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {})

// Force kill all child processes on quit
app.on('before-quit', () => {
  tray?.destroy()
  // Destroy windows explicitly to release renderers
  if (detailWindow && !detailWindow.isDestroyed()) {
    detailWindow.destroy()
    detailWindow = null
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.destroy()
    mainWindow = null
  }
})

app.on('will-quit', () => {
  if (pollTimer) clearTimeout(pollTimer)
})
