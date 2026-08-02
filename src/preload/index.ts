// ── Preload script ────────────────────────────────────────────────────────────
//
// Runs in a privileged context that has access to both Node.js APIs and the
// browser DOM. contextBridge.exposeInMainWorld() copies exactly the functions
// listed here onto window.api — nothing else crosses the boundary.
//
// Each function is a thin wrapper that delegates to ipcRenderer. All the
// actual business logic lives in the renderer (App.tsx / MapApp.tsx) or in
// the main process (ipc.ts). This file is intentionally free of logic.
//
// Listener functions follow the pattern:
//   onXxx(callback) → returns a cleanup function
// The cleanup removes the listener when the React component unmounts.

import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'

contextBridge.exposeInMainWorld('api', {

  // ── File I/O ──────────────────────────────────────────────────────────────────

  openFile:          (): Promise<string | null>          => ipcRenderer.invoke('dialog:open'),
  showSaveDialog:    (): Promise<string | null>          => ipcRenderer.invoke('dialog:save'),
  openCsvFile:       (): Promise<string | null>          => ipcRenderer.invoke('dialog:openCsv'),
  showCsvSaveDialog: (): Promise<string | null>          => ipcRenderer.invoke('dialog:saveCsv'),
  readFile:          (path: string): Promise<string>     => ipcRenderer.invoke('file:read', path),
  writeFile:         (path: string, data: string): Promise<void> => ipcRenderer.invoke('file:write', path, data),

  // ── Menu actions (Score Window only) ─────────────────────────────────────────
  //
  // Registers listeners for all known menu channels at once. Returns a single
  // cleanup function that removes them all. Each channel is stripped of its
  // 'menu:' prefix before being passed to the callback, so the caller receives
  // plain action strings like 'save', 'open', etc.

  onMenuAction: (cb: (action: string) => void): (() => void) => {
    const actions = [
      'menu:undo', 'menu:redo',
      'menu:new', 'menu:open', 'menu:save', 'menu:save-as',
      'menu:import-spreadsheet', 'menu:export-spreadsheet',
      'menu:create-cartesian', 'menu:create-semantic',
      'menu:preferences'
    ]
    const handlers = actions.map(channel => {
      const handler = (): void => cb(channel.replace('menu:', ''))
      ipcRenderer.on(channel, handler)
      return { channel, handler }
    })
    return () => handlers.forEach(({ channel, handler }) => ipcRenderer.removeListener(channel, handler))
  },

  // ── Map window management ─────────────────────────────────────────────────────

  openMap:      (mapId: string, stateJson: string): void => ipcRenderer.send('map:open', mapId, stateJson),
  closeMap:     (mapId: string): void                    => ipcRenderer.send('map:close', mapId),
  closeAllMaps: (): void                                  => ipcRenderer.send('map:closeAll'),
  // Signal to main that this renderer has mounted its IPC listeners and is
  // ready to receive 'map:init'. See windowManager.ts for why this is needed.
  signalReady:  (): void                                  => ipcRenderer.send('map:ready'),
  // Notify main that a modal is open so it can bring the Score Window to front
  setModalOpen: (open: boolean): void                     => ipcRenderer.send('modal:open', open),
  // Awaitable — bring the Score Window to front before showing a native dialog
  focusMainWindow: (): Promise<void>                      => ipcRenderer.invoke('window:focus-main'),

  // ── Application history ───────────────────────────────────────────────────────

  // Map renderers bracket continuous/compound edits; main injects the owning
  // webContents ID before relaying each boundary to the authoritative Score.
  historyBegin: (): void => ipcRenderer.send('history:transaction', 'begin'),
  historyEnd:   (): void => ipcRenderer.send('history:transaction', 'end'),
  onHistoryTransaction: (
    cb: (ownerId: number, phase: 'begin' | 'end') => void
  ): (() => void) => {
    const handler = (_: IpcRendererEvent, ownerId: number, phase: 'begin' | 'end'): void =>
      cb(ownerId, phase)
    ipcRenderer.on('history:transaction', handler)
    return () => ipcRenderer.removeListener('history:transaction', handler)
  },
  setHistoryAvailability: (canUndo: boolean, canRedo: boolean): void =>
    ipcRenderer.send('history:availability', canUndo, canRedo),

  // ── Preferences ───────────────────────────────────────────────────────────────

  // Synchronous read — returns the cached prefs without an async roundtrip.
  // The cache is guaranteed to be warm because main process loads prefs before
  // creating the window. Use this for initialization; use loadPreferences for
  // the full async flow with reopenLastFile support.
  getPrefsSync:    (): Record<string, unknown>           => ipcRenderer.sendSync('prefs:get-sync'),
  loadPreferences: (): Promise<Record<string, unknown>>  => ipcRenderer.invoke('prefs:load'),
  savePreferences: (prefs: Record<string, unknown>): void => ipcRenderer.send('prefs:save', prefs),

  // ── Window geometry ───────────────────────────────────────────────────────────

  getMapWindowPositions: (): Promise<Record<string, { x: number; y: number; width: number; height: number }>> =>
    ipcRenderer.invoke('maps:getPositions'),
  // Move + resize the main window to its saved prefs position after session start
  restoreMainWindowBounds: (): void => ipcRenderer.send('window:restore-main-bounds'),

  // ── Outbound state broadcasts (Score Window → main → maps) ───────────────────

  // Full session state after any bulk change (new element, load file, etc.)
  broadcastState:     (stateJson: string): void => ipcRenderer.send('state:push', stateJson),
  // Preference changes — sent whenever the user saves the Preferences dialog
  // so that map BrowserWindows (separate renderer processes with their own
  // prefsStore instances) stay in sync without needing a full app restart.
  broadcastPrefs: (prefs: Record<string, unknown>): void => ipcRenderer.send('prefs:push', prefs),
  // Single score update from a drag — cheaper than a full state broadcast
  broadcastScore:     (elementId: string, dimensionId: string, value: number): void =>
                        ipcRenderer.send('score:update', elementId, dimensionId, value),
  // Map config change (axis swap, flip, etc.) initiated in a map window
  broadcastMapConfig: (mapId: string, changes: Record<string, unknown>): void =>
                        ipcRenderer.send('mapConfig:update', mapId, changes),
  // Element property change from the right-click detail modal in a map window
  broadcastElement: (elementId: string, changes: Record<string, unknown>): void =>
                      ipcRenderer.send('element:update', elementId, changes),
  // New collection created inline from a map window modal
  broadcastNewCollection: (id: string, name: string): void =>
                            ipcRenderer.send('collection:add', id, name),
  // Selection change from a map window dot click (or deselect on empty click)
  broadcastSelection: (elementId: string | null): void =>
                        ipcRenderer.send('selection:update', elementId),
  // Multi-selection change from a map window shift-click or lasso
  broadcastMultiSelection: (ids: string[]): void =>
                             ipcRenderer.send('multiSelection:update', ids),

  // ── Inbound listeners (used by map windows) ───────────────────────────────────

  // Preferences pushed from the Score Window after the user saves the dialog
  onPrefs: (cb: (prefs: Record<string, unknown>) => void): (() => void) => {
    const handler = (_: IpcRendererEvent, prefs: Record<string, unknown>): void => cb(prefs)
    ipcRenderer.on('prefs:push', handler)
    return () => ipcRenderer.removeListener('prefs:push', handler)
  },

  // Initial payload sent once after the renderer signals readiness
  onMapInit: (cb: (mapId: string, stateJson: string) => void): (() => void) => {
    const handler = (_: IpcRendererEvent, mapId: string, stateJson: string): void => cb(mapId, stateJson)
    ipcRenderer.on('map:init', handler)
    return () => ipcRenderer.removeListener('map:init', handler)
  },

  // Full state replacement broadcast from the Score Window
  onState: (cb: (stateJson: string) => void): (() => void) => {
    const handler = (_: IpcRendererEvent, stateJson: string): void => cb(stateJson)
    ipcRenderer.on('state:push', handler)
    return () => ipcRenderer.removeListener('state:push', handler)
  },

  // Fine-grained score update — applies to a single element/dimension pair
  onScore: (cb: (elementId: string, dimensionId: string, value: number) => void): (() => void) => {
    const handler = (_: IpcRendererEvent, elementId: string, dimensionId: string, value: number): void =>
      cb(elementId, dimensionId, value)
    ipcRenderer.on('score:update', handler)
    return () => ipcRenderer.removeListener('score:update', handler)
  },

  // ── Inbound listeners (used by Score Window) ──────────────────────────────────

  // Map config change relayed back from a map window
  onMapConfig: (cb: (mapId: string, changes: Record<string, unknown>) => void): (() => void) => {
    const handler = (_: IpcRendererEvent, mapId: string, changes: Record<string, unknown>): void =>
      cb(mapId, changes)
    ipcRenderer.on('mapConfig:update', handler)
    return () => ipcRenderer.removeListener('mapConfig:update', handler)
  },

  // Element property update relayed from a map window's right-click modal
  onElementUpdate: (cb: (elementId: string, changes: Record<string, unknown>) => void): (() => void) => {
    const handler = (_: IpcRendererEvent, elementId: string, changes: Record<string, unknown>): void =>
      cb(elementId, changes)
    ipcRenderer.on('element:update', handler)
    return () => ipcRenderer.removeListener('element:update', handler)
  },

  // New collection created inline from a map window modal
  onCollectionAdd: (cb: (id: string, name: string) => void): (() => void) => {
    const handler = (_: IpcRendererEvent, id: string, name: string): void => cb(id, name)
    ipcRenderer.on('collection:add', handler)
    return () => ipcRenderer.removeListener('collection:add', handler)
  },

  // Selection change relayed from a map window — Score Window listens for this
  onSelection: (cb: (elementId: string | null) => void): (() => void) => {
    const handler = (_: IpcRendererEvent, elementId: string | null): void => cb(elementId)
    ipcRenderer.on('selection:update', handler)
    return () => ipcRenderer.removeListener('selection:update', handler)
  },

  // Multi-selection change relayed from a map window — Score Window listens for this
  onMultiSelection: (cb: (ids: string[]) => void): (() => void) => {
    const handler = (_: IpcRendererEvent, ids: string[]): void => cb(ids)
    ipcRenderer.on('multiSelection:update', handler)
    return () => ipcRenderer.removeListener('multiSelection:update', handler)
  },

  // Fired when a map window is closed by the user (not programmatically)
  onMapClosed: (cb: (mapId: string) => void): (() => void) => {
    const handler = (_: IpcRendererEvent, mapId: string): void => cb(mapId)
    ipcRenderer.on('map:closed', handler)
    return () => ipcRenderer.removeListener('map:closed', handler)
  },

  // ── Quit confirmation ─────────────────────────────────────────────────────────

  // Main process fires this before quitting so the renderer can save or cancel
  onQuitRequested: (cb: () => void): (() => void) => {
    const handler = (): void => cb()
    ipcRenderer.on('app:quit-requested', handler)
    return () => ipcRenderer.removeListener('app:quit-requested', handler)
  },

  // Renderer calls this to tell main it may proceed with the quit
  confirmQuit: (): void => ipcRenderer.send('app:confirm-quit')
})
