import { BrowserWindow } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { getCachedPreferences } from './prefs'

const mapWindows     = new Map<string, BrowserWindow>()
const silentCloseIds = new Set<string>()
const pendingInits   = new Map<number, { win: BrowserWindow; mapId: string; stateJson: string }>()
let   scoreWindow: BrowserWindow | null = null

export function setScoreWindow(win: BrowserWindow): void {
  scoreWindow = win
}

export function openMapWindow(mapId: string, stateJson: string): void {
  const existing = mapWindows.get(mapId)
  if (existing && !existing.isDestroyed()) {
    existing.focus()
    return
  }

  // Read stored window geometry if rememberWindowPositions is on
  let x: number | undefined, y: number | undefined
  let width = 600, height = 500
  if (getCachedPreferences().rememberWindowPositions) {
    try {
      const state = JSON.parse(stateJson) as { maps?: Array<{ id: string; windowX?: number; windowY?: number; windowWidth?: number; windowHeight?: number }> }
      const cfg = state.maps?.find(m => m.id === mapId)
      if (cfg) {
        if (cfg.windowX != null && cfg.windowY != null) { x = cfg.windowX; y = cfg.windowY }
        if (cfg.windowWidth)  width  = cfg.windowWidth
        if (cfg.windowHeight) height = cfg.windowHeight
      }
    } catch { /* use defaults */ }
  }

  const win = new BrowserWindow({
    x, y, width, height,
    minWidth: 300,
    minHeight: 200,
    show: false,
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mapWindows.set(mapId, win)

  win.on('closed', () => {
    mapWindows.delete(mapId)
    if (!silentCloseIds.has(mapId)) {
      scoreWindow?.webContents.send('map:closed', mapId)
    }
    silentCloseIds.delete(mapId)
  })

  const mapUrl = is.dev && process.env['ELECTRON_RENDERER_URL']
    ? `${process.env['ELECTRON_RENDERER_URL']}/map.html`
    : `file://${join(__dirname, '../renderer/map.html')}`

  win.loadURL(mapUrl)

  win.once('ready-to-show', () => {
    win.show()
    // Don't send map:init yet — wait for renderer to call signalReady() after
    // mounting its IPC listeners. Sending here races with React's useEffect.
    pendingInits.set(win.webContents.id, { win, mapId, stateJson })
  })
}

export function handleMapReady(webContentsId: number): void {
  const pending = pendingInits.get(webContentsId)
  if (!pending) return
  pendingInits.delete(webContentsId)
  const { win, mapId, stateJson } = pending
  if (!win.isDestroyed()) {
    win.webContents.send('map:init', mapId, stateJson)
  }
}

export function closeAllMapWindowsSilent(): void {
  for (const [mapId, win] of mapWindows.entries()) {
    silentCloseIds.add(mapId)
    if (!win.isDestroyed()) win.close()
  }
  mapWindows.clear()
}

export function getMapWindowPositions(): Record<string, { x: number; y: number; width: number; height: number }> {
  const result: Record<string, { x: number; y: number; width: number; height: number }> = {}
  for (const [mapId, win] of mapWindows.entries()) {
    if (!win.isDestroyed()) {
      const [x, y] = win.getPosition()
      const [w, h] = win.getSize()
      result[mapId] = { x, y, width: w, height: h }
    }
  }
  return result
}

export function broadcastToMaps(channel: string, ...args: unknown[]): void {
  for (const win of mapWindows.values()) {
    if (!win.isDestroyed()) win.webContents.send(channel, ...args)
  }
}

export function broadcastToAllExcept(senderId: number, channel: string, ...args: unknown[]): void {
  if (scoreWindow && !scoreWindow.isDestroyed() && scoreWindow.webContents.id !== senderId) {
    scoreWindow.webContents.send(channel, ...args)
  }
  for (const win of mapWindows.values()) {
    if (!win.isDestroyed() && win.webContents.id !== senderId) {
      win.webContents.send(channel, ...args)
    }
  }
}
