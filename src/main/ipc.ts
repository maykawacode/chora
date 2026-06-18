// ── IPC handler registration ──────────────────────────────────────────────────
//
// All communication between the renderer processes and the main process goes
// through this file. Called once from index.ts before the window is created.
//
// Channel naming convention:
//   'noun:verb'  — e.g. 'dialog:open', 'file:read', 'map:open'
//
// ipcMain.handle() — renderer uses invoke() and awaits a return value
// ipcMain.on()     — renderer uses send(), fire-and-forget

import { ipcMain, dialog, app } from 'electron'
import { readFile, writeFile } from 'fs/promises'
import { getMainWindow, setQuitConfirmed } from './index'
import {
  openMapWindow,
  closeAllMapWindowsSilent,
  handleMapReady,
  getMapWindowPositions,
  broadcastToMaps,
  broadcastToAllExcept
} from './windowManager'
import { loadPreferences, savePreferences, getCachedPreferences } from './prefs'

export function registerIpcHandlers(): void {

  // ── File dialogs ──────────────────────────────────────────────────────────────

  ipcMain.handle('dialog:open', async () => {
    const win = getMainWindow()
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      filters: [{ name: 'MapTool Session', extensions: ['mtda'] }],
      properties: ['openFile']
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('dialog:save', async () => {
    const win = getMainWindow()
    if (!win) return null
    const result = await dialog.showSaveDialog(win, {
      filters: [{ name: 'MapTool Session', extensions: ['mtda'] }],
      defaultPath: 'Untitled.mtda'
    })
    return result.canceled ? null : result.filePath
  })

  ipcMain.handle('dialog:openCsv', async () => {
    const win = getMainWindow()
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      filters: [{ name: 'Spreadsheet', extensions: ['tsv', 'csv', 'txt'] }],
      properties: ['openFile']
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('dialog:saveCsv', async () => {
    const win = getMainWindow()
    if (!win) return null
    const result = await dialog.showSaveDialog(win, {
      filters: [{ name: 'Tab-separated values', extensions: ['tsv'] }],
      defaultPath: 'maptool-export.tsv'
    })
    return result.canceled ? null : result.filePath
  })

  // ── File I/O ──────────────────────────────────────────────────────────────────

  ipcMain.handle('file:read', async (_event, filePath: string) => {
    return readFile(filePath, 'utf-8')
  })

  ipcMain.handle('file:write', async (_event, filePath: string, data: string) => {
    await writeFile(filePath, data, 'utf-8')
  })

  // ── Map window lifecycle ──────────────────────────────────────────────────────

  ipcMain.on('map:open', (_event, mapId: string, stateJson: string) => {
    openMapWindow(mapId, stateJson)
  })

  ipcMain.on('map:closeAll', () => {
    closeAllMapWindowsSilent()
  })

  // A map renderer sends this once it has finished mounting all IPC listeners.
  // Only after this signal do we send 'map:init' — this prevents a race where
  // the init message arrives before the React useEffect has run.
  ipcMain.on('map:ready', (event) => {
    handleMapReady(event.sender.id)
  })

  // Score Window tells us a modal is opening — bring it to the front so map
  // BrowserWindows don't cover the modal. We use focus()+moveTop() rather than
  // setAlwaysOnTop() to avoid permanently changing the window's z-level.
  ipcMain.on('modal:open', (_event, open: boolean) => {
    if (!open) return
    const win = getMainWindow()
    if (win && !win.isDestroyed()) { win.focus(); win.moveTop() }
  })

  // Awaitable focus — renderer calls this before showing a native dialog
  // (window.confirm / alert) so the window is on top before the dialog fires.
  ipcMain.handle('window:focus-main', () => {
    const win = getMainWindow()
    if (win && !win.isDestroyed()) { win.focus(); win.moveTop() }
  })

  // ── Preferences ───────────────────────────────────────────────────────────────

  ipcMain.handle('prefs:load', () => loadPreferences())

  // Synchronous read of the cached preferences — used by the preload to give
  // the renderer instant access to prefs before any async IPC roundtrip
  ipcMain.on('prefs:get-sync', (event) => {
    event.returnValue = getCachedPreferences()
  })

  ipcMain.on('prefs:save', (_event, prefs: unknown) => {
    // Preserve mainWindow bounds — the renderer never receives updates to these
    // fields after startup, so its copy is always stale. Always take them from
    // the main-process cache, which is kept current by the moved/resized handlers.
    const current = getCachedPreferences()
    const incoming = prefs as Parameters<typeof savePreferences>[0]
    savePreferences({
      ...incoming,
      mainWindowX:      current.mainWindowX,
      mainWindowY:      current.mainWindowY,
      mainWindowWidth:  current.mainWindowWidth,
      mainWindowHeight: current.mainWindowHeight
    })
  })

  // ── Window geometry ───────────────────────────────────────────────────────────

  // Score Window calls this just before serializing the session to disk so
  // it can embed each map window's current position into the saved file
  ipcMain.handle('maps:getPositions', () => getMapWindowPositions())

  // ── State relay ───────────────────────────────────────────────────────────────
  //
  // The Score Window owns the authoritative app state (Zustand store).
  // Map windows receive state via broadcasts and send back only fine-grained
  // score updates or map config changes to avoid expensive full-state diffs.

  // Fine-grained score from a drag gesture — relay to all other windows
  ipcMain.on('score:update', (event, elementId: string, dimensionId: string, value: number) => {
    broadcastToAllExcept(event.sender.id, 'score:update', elementId, dimensionId, value)
  })

  // Full state snapshot from Score Window after a bulk change — send to all maps
  ipcMain.on('state:push', (_event, stateJson: string) => {
    broadcastToMaps('state:push', stateJson)
  })

  // Preference update from Score Window (user saved Preferences dialog) —
  // relay to all map windows so their prefsStore stays in sync.
  ipcMain.on('prefs:push', (_event, prefs: unknown) => {
    broadcastToMaps('prefs:push', prefs)
  })

  // Map config change (e.g. axis swap, flip) from a map window — relay to
  // Score Window only. Score Window applies the change and re-broadcasts the
  // full state so all other map windows stay in sync.
  ipcMain.on('mapConfig:update', (event, mapId: string, changes: unknown) => {
    const scoreWin = getMainWindow()
    if (scoreWin && !scoreWin.isDestroyed() && scoreWin.webContents.id !== event.sender.id) {
      scoreWin.webContents.send('mapConfig:update', mapId, changes)
    }
  })

  // Selection change from a map window dot click — relay to Score Window only.
  // Score Window calls selectElement() and its Zustand subscriber broadcasts
  // the updated selectedElementId back to all map windows via state:push.
  ipcMain.on('selection:update', (event, elementId: string | null) => {
    const scoreWin = getMainWindow()
    if (scoreWin && !scoreWin.isDestroyed() && scoreWin.webContents.id !== event.sender.id) {
      scoreWin.webContents.send('selection:update', elementId)
    }
  })

  // Multi-selection change from a map window shift-click or lasso — relay to
  // Score Window only. Score Window calls selectElements() and its Zustand
  // subscriber broadcasts the updated selectedElementIds to all map windows.
  ipcMain.on('multiSelection:update', (event, ids: string[]) => {
    const scoreWin = getMainWindow()
    if (scoreWin && !scoreWin.isDestroyed() && scoreWin.webContents.id !== event.sender.id) {
      scoreWin.webContents.send('multiSelection:update', ids)
    }
  })

  // Element property change from a map window's right-click modal — relay to
  // Score Window. Score Window applies the update; its Zustand subscription
  // auto-broadcasts full state to all map windows.
  ipcMain.on('element:update', (event, elementId: string, changes: unknown) => {
    const scoreWin = getMainWindow()
    if (scoreWin && !scoreWin.isDestroyed() && scoreWin.webContents.id !== event.sender.id) {
      scoreWin.webContents.send('element:update', elementId, changes)
    }
  })

  // Renderer has confirmed it is safe to quit — mark confirmed then re-trigger quit
  ipcMain.on('app:confirm-quit', () => {
    setQuitConfirmed()
    app.quit()
  })
}
