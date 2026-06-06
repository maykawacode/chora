import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'

contextBridge.exposeInMainWorld('api', {

  // ── File I/O ────────────────────────────────────────────────────────────────
  openFile:          (): Promise<string | null>          => ipcRenderer.invoke('dialog:open'),
  showSaveDialog:    (): Promise<string | null>          => ipcRenderer.invoke('dialog:save'),
  openCsvFile:       (): Promise<string | null>          => ipcRenderer.invoke('dialog:openCsv'),
  showCsvSaveDialog: (): Promise<string | null>          => ipcRenderer.invoke('dialog:saveCsv'),
  readFile:          (path: string): Promise<string>     => ipcRenderer.invoke('file:read', path),
  writeFile:         (path: string, data: string): Promise<void> => ipcRenderer.invoke('file:write', path, data),

  // ── Menu actions (Score Window only) ────────────────────────────────────────
  onMenuAction: (cb: (action: string) => void): (() => void) => {
    const actions = ['menu:new', 'menu:open', 'menu:save', 'menu:save-as',
                     'menu:import-spreadsheet', 'menu:export-spreadsheet',
                     'menu:create-cartesian', 'menu:create-semantic',
                     'menu:dim-to-weight', 'menu:weight-to-dim', 'menu:dim-to-gray', 'menu:randomize-scores',
                     'menu:toggle-labels', 'menu:update-maps']
    const handlers = actions.map(channel => {
      const handler = (): void => cb(channel.replace('menu:', ''))
      ipcRenderer.on(channel, handler)
      return { channel, handler }
    })
    return () => handlers.forEach(({ channel, handler }) => ipcRenderer.removeListener(channel, handler))
  },

  // ── Map window management ────────────────────────────────────────────────────
  openMap:      (mapId: string, stateJson: string): void => ipcRenderer.send('map:open', mapId, stateJson),
  closeAllMaps: (): void => ipcRenderer.send('map:closeAll'),
  signalReady:  (): void => ipcRenderer.send('map:ready'),

  // ── State broadcast (Score Window → maps) ───────────────────────────────────
  broadcastState:     (stateJson: string): void  => ipcRenderer.send('state:push', stateJson),
  broadcastScore:     (elementId: string, dimensionId: string, value: number): void =>
                        ipcRenderer.send('score:update', elementId, dimensionId, value),
  broadcastMapConfig: (mapId: string, changes: Record<string, unknown>): void =>
                        ipcRenderer.send('mapConfig:update', mapId, changes),

  // ── Listeners (map windows) ──────────────────────────────────────────────────
  onMapInit: (cb: (mapId: string, stateJson: string) => void): (() => void) => {
    const handler = (_: IpcRendererEvent, mapId: string, stateJson: string): void => cb(mapId, stateJson)
    ipcRenderer.on('map:init', handler)
    return () => ipcRenderer.removeListener('map:init', handler)
  },

  onState: (cb: (stateJson: string) => void): (() => void) => {
    const handler = (_: IpcRendererEvent, stateJson: string): void => cb(stateJson)
    ipcRenderer.on('state:push', handler)
    return () => ipcRenderer.removeListener('state:push', handler)
  },

  onScore: (cb: (elementId: string, dimensionId: string, value: number) => void): (() => void) => {
    const handler = (_: IpcRendererEvent, elementId: string, dimensionId: string, value: number): void =>
      cb(elementId, dimensionId, value)
    ipcRenderer.on('score:update', handler)
    return () => ipcRenderer.removeListener('score:update', handler)
  },

  // ── Listeners (Score Window) ─────────────────────────────────────────────────
  onMapConfig: (cb: (mapId: string, changes: Record<string, unknown>) => void): (() => void) => {
    const handler = (_: IpcRendererEvent, mapId: string, changes: Record<string, unknown>): void =>
      cb(mapId, changes)
    ipcRenderer.on('mapConfig:update', handler)
    return () => ipcRenderer.removeListener('mapConfig:update', handler)
  },

  onMapClosed: (cb: (mapId: string) => void): (() => void) => {
    const handler = (_: IpcRendererEvent, mapId: string): void => cb(mapId)
    ipcRenderer.on('map:closed', handler)
    return () => ipcRenderer.removeListener('map:closed', handler)
  }
})
