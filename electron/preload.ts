import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('lobsterAPI', {
  getStatus: () => ipcRenderer.invoke('get-status'),
  onStatusUpdate: (callback: (data: any) => void) => {
    const handler = (_event: any, data: any) => callback(data)
    ipcRenderer.on('status-update', handler)
    return () => { ipcRenderer.removeListener('status-update', handler) }
  },
  refreshStatus: () => ipcRenderer.invoke('refresh-status'),
  triggerTask: (taskType: string) => ipcRenderer.invoke('trigger-task', taskType),
  sendMessage: (message: string) => ipcRenderer.invoke('send-message', message),
  // Desktop pet APIs
  moveWindow: (x: number, y: number) => ipcRenderer.invoke('move-window', x, y),
  getScreenBounds: () => ipcRenderer.invoke('get-screen-bounds'),
  setIgnoreMouse: (ignore: boolean) => ipcRenderer.invoke('set-ignore-mouse', ignore),
  showContextMenu: () => ipcRenderer.invoke('show-context-menu'),
  getAgents: () => ipcRenderer.invoke('get-agents'),
  getCronJobs: () => ipcRenderer.invoke('get-cron-jobs'),
  getYesterdayMemo: () => ipcRenderer.invoke('get-yesterday-memo'),
  getTokenUsage: () => ipcRenderer.invoke('get-token-usage'),
  getGatewayInfo: () => ipcRenderer.invoke('get-gateway-info'),
  onGatewayInfoUpdate: (callback: (data: any) => void) => {
    const handler = (_event: any, data: any) => callback(data)
    ipcRenderer.on('gateway-info-update', handler)
    return () => { ipcRenderer.removeListener('gateway-info-update', handler) }
  },
  getCronRunsToday: () => ipcRenderer.invoke('get-cron-runs-today'),
  getActivityStats: () => ipcRenderer.invoke('get-activity-stats'),
  getOfficeName: () => ipcRenderer.invoke('get-office-name'),
})
