import { ipcMain, dialog } from 'electron'
import { readFile, writeFile } from 'fs/promises'
import { getMainWindow } from './index'
import {
  openMapWindow,
  closeAllMapWindowsSilent,
  handleMapReady,
  getMapWindowPositions,
  broadcastToMaps,
  broadcastToAllExcept
} from './windowManager'
import { loadPreferences, savePreferences } from './prefs'

export function registerIpcHandlers(): void {

  // ── File dialogs ─────────────────────────────────────────────────────────────

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

  // Renderer signals it has mounted IPC listeners — now safe to send map:init
  ipcMain.on('map:ready', (event) => {
    handleMapReady(event.sender.id)
  })

  // Bring Score Window to front when a modal opens (avoids map windows covering it)
  ipcMain.on('modal:open', (_event, open: boolean) => {
    if (!open) return
    const win = getMainWindow()
    if (win && !win.isDestroyed()) { win.focus(); win.moveTop() }
  })

  // ── Preferences ───────────────────────────────────────────────────────────────

  ipcMain.handle('prefs:load', () => loadPreferences())

  ipcMain.on('prefs:save', (_event, prefs: unknown) => {
    savePreferences(prefs as Parameters<typeof savePreferences>[0])
  })

  // ── Window positions ──────────────────────────────────────────────────────────

  ipcMain.handle('maps:getPositions', () => getMapWindowPositions())

  // ── State relay ───────────────────────────────────────────────────────────────

  // Fine-grained score update — forward to all other windows
  ipcMain.on('score:update', (event, elementId: string, dimensionId: string, value: number) => {
    broadcastToAllExcept(event.sender.id, 'score:update', elementId, dimensionId, value)
  })

  // Full state push from Score Window — forward to all map windows
  ipcMain.on('state:push', (_event, stateJson: string) => {
    broadcastToMaps('state:push', stateJson)
  })

  // Map config change from a map window — forward to Score Window only
  // Score Window applies it and broadcasts full state:push to all maps
  ipcMain.on('mapConfig:update', (event, mapId: string, changes: unknown) => {
    const scoreWin = getMainWindow()
    if (scoreWin && !scoreWin.isDestroyed() && scoreWin.webContents.id !== event.sender.id) {
      scoreWin.webContents.send('mapConfig:update', mapId, changes)
    }
  })
}
