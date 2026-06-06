import { BrowserWindow } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'

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

  const win = new BrowserWindow({
    width: 600,
    height: 500,
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
