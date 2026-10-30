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
// The cleanup removes the listener when the React component unmounts. Most are
// made by on(), which passes a channel's arguments through without the event.

import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import {
  MENU_ACTIONS,
  type ChoraApi,
  type HistoryPhase,
  type MapWindowAction,
  type MenuAction,
  type Preferences
} from '../shared/contracts'
import type { UpdateNotice } from '../shared/updateNotice'

/** A listener for one channel: calls back with the message's arguments and returns its cleanup. */
function on<Args extends unknown[]>(channel: string): (cb: (...args: Args) => void) => () => void {
  return cb => {
    const handler = (_: IpcRendererEvent, ...args: Args): void => cb(...args)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  }
}

const api = {

  // ── File I/O ──────────────────────────────────────────────────────────────────

  openFile:          (): Promise<string | null>          => ipcRenderer.invoke('dialog:open'),
  showSaveDialog:    (): Promise<string | null>          => ipcRenderer.invoke('dialog:save'),
  openCsvFile:       (): Promise<string | null>          => ipcRenderer.invoke('dialog:openCsv'),
  showCsvSaveDialog: (): Promise<string | null>          => ipcRenderer.invoke('dialog:saveCsv'),
  readFile:          (path: string): Promise<string>     => ipcRenderer.invoke('file:read', path),
  writeFile:         (path: string, data: string): Promise<void> => ipcRenderer.invoke('file:write', path, data),

  // ── Bundled application resources ────────────────────────────────────────────

  readBundledExample: (fileName: string): Promise<string> =>
    ipcRenderer.invoke('resource:read-example', fileName),
  getAppVersion: (): string => ipcRenderer.sendSync('app:get-version'),
  getUpdateNotice: (): Promise<UpdateNotice | null> => ipcRenderer.invoke('update:get-notice'),

  // ── Menu actions (Score Window only) ─────────────────────────────────────────
  //
  // Registers listeners for all known menu channels at once. Returns a single
  // cleanup function that removes them all. Each channel is stripped of its
  // 'menu:' prefix before being passed to the callback, so the caller receives
  // plain action strings like 'save', 'open', etc.

  onMenuAction: (cb: (action: MenuAction) => void): (() => void) => {
    const handlers = MENU_ACTIONS.map(action => {
      const channel = `menu:${action}`
      const handler = (): void => cb(action)
      ipcRenderer.on(channel, handler)
      return { channel, handler }
    })
    return () => handlers.forEach(({ channel, handler }) => ipcRenderer.removeListener(channel, handler))
  },

  // ── Map window management ─────────────────────────────────────────────────────

  openMap:      (mapId: string, stateJson: string): void => ipcRenderer.send('map:open', mapId, stateJson),
  closeMap:     (mapId: string): void                    => ipcRenderer.send('map:close', mapId),
  controlMapWindow: (action: MapWindowAction): void =>
    ipcRenderer.send('map:window-control', action),
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
  setHistoryModalOpen: (open: boolean): void => ipcRenderer.send('history:modal', open),
  onHistoryTransaction: on<[ownerId: number, phase: HistoryPhase]>('history:transaction'),
  setHistoryAvailability: (canUndo: boolean, canRedo: boolean): void =>
    ipcRenderer.send('history:availability', canUndo, canRedo),

  // ── Preferences ───────────────────────────────────────────────────────────────

  loadPreferences: (): Promise<Preferences> => ipcRenderer.invoke('prefs:load'),
  savePreferences: (prefs: Preferences): void => ipcRenderer.send('prefs:save', prefs),

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
  broadcastPrefs: (prefs: Preferences): void => ipcRenderer.send('prefs:push', prefs),
  // Single score update from a drag — cheaper than a full state broadcast
  broadcastScore:     (elementId: string, dimensionId: string, value: number): void =>
                        ipcRenderer.send('score:update', elementId, dimensionId, value),
  // Map config change (axis swap, flip, etc.) initiated in a map window
  broadcastMapConfig: (mapId: string, changes: Record<string, unknown>): void =>
                        ipcRenderer.send('mapConfig:update', mapId, changes),
  // Element property change from the right-click detail modal in a map window
  broadcastElement: (elementId: string, changes: Record<string, unknown>): void =>
                      ipcRenderer.send('element:update', elementId, changes),
  // Dimension property change from the right-click axis modal in a map window
  broadcastDimension: (dimensionId: string, changes: Record<string, unknown>): void =>
                        ipcRenderer.send('dimension:update', dimensionId, changes),
  // New collection created inline from a map window modal
  broadcastNewCollection: (id: string, name: string): void =>
                            ipcRenderer.send('collection:add', id, name),
  // Selection change from a map window dot click. Explicit clears also clear
  // the paired Assess dimension; transient drag/focus clears do not.
  broadcastSelection: (elementId: string | null, clearDimension = false): void =>
                        ipcRenderer.send('selection:update', elementId, clearDimension),
  // Multi-selection change from a map window shift-click or lasso
  broadcastMultiSelection: (ids: string[]): void =>
                             ipcRenderer.send('multiSelection:update', ids),

  // ── Inbound listeners (used by map windows) ───────────────────────────────────

  // Preferences pushed from the Score Window after the user saves the dialog
  onPrefs: on<[prefs: Preferences]>('prefs:push'),

  // Initial payload sent once after the renderer signals readiness
  onMapInit: on<[mapId: string, stateJson: string]>('map:init'),

  // Full state replacement broadcast from the Score Window
  onState: on<[stateJson: string]>('state:push'),

  // Fine-grained score update — applies to a single element/dimension pair
  onScore: on<[elementId: string, dimensionId: string, value: number]>('score:update'),

  // ── Inbound listeners (used by Score Window) ──────────────────────────────────

  // Map config change relayed back from a map window
  onMapConfig: on<[mapId: string, changes: Record<string, unknown>]>('mapConfig:update'),

  // Element property update relayed from a map window's right-click modal
  onElementUpdate: on<[elementId: string, changes: Record<string, unknown>]>('element:update'),

  // Dimension property update relayed from a map window's right-click modal
  onDimensionUpdate: on<[dimensionId: string, changes: Record<string, unknown>]>('dimension:update'),

  // New collection created inline from a map window modal
  onCollectionAdd: on<[id: string, name: string]>('collection:add'),

  // Selection change relayed from a map window — Score Window listens for this
  onSelection: (cb: (elementId: string | null, clearDimension: boolean) => void): (() => void) => {
    const handler = (_: IpcRendererEvent, elementId: string | null, clearDimension = false): void =>
      cb(elementId, clearDimension)
    ipcRenderer.on('selection:update', handler)
    return () => ipcRenderer.removeListener('selection:update', handler)
  },

  // Multi-selection change relayed from a map window — Score Window listens for this
  onMultiSelection: on<[ids: string[]]>('multiSelection:update'),

  // Fired when a map window is closed by the user (not programmatically)
  onMapClosed: on<[mapId: string]>('map:closed'),

  // ── Quit confirmation ─────────────────────────────────────────────────────────

  onCancelModals: on<[]>('app:cancel-modals'),

  // Main process fires this before quitting so the renderer can save or cancel
  onQuitRequested: on<[]>('app:quit-requested'),

  // Renderer calls this to tell main it may proceed with the quit
  confirmQuit: (): void => ipcRenderer.send('app:confirm-quit')
} satisfies ChoraApi

contextBridge.exposeInMainWorld('api', api)
