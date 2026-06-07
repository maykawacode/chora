// ── Map window manager ────────────────────────────────────────────────────────
//
// Owns the lifecycle of all map BrowserWindows. The Score Window (main window)
// is tracked here too so it can be notified when map windows close.
//
// Map window open flow:
//   1. Score Window calls IPC 'map:open' with the map ID and full session JSON.
//   2. openMapWindow() creates the BrowserWindow and stores a pending init entry.
//   3. The new window loads map.html, mounts React, and registers IPC listeners.
//   4. The renderer calls IPC 'map:ready' once all listeners are registered.
//   5. handleMapReady() looks up the pending entry and sends 'map:init'.
//
// Step 4–5 prevent a race condition where 'map:init' would arrive before the
// renderer's useEffect had a chance to register the 'map:init' listener.

import { BrowserWindow } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { getCachedPreferences } from './prefs'

// Active map windows, keyed by the map ID (UUID from MapConfig)
const mapWindows = new Map<string, BrowserWindow>()

// Map IDs that were closed programmatically (e.g. File → New) — these should
// NOT send a 'map:closed' notification back to the Score Window
const silentCloseIds = new Set<string>()

// Pending init data for windows that have shown but whose renderer is not
// yet ready to receive 'map:init'. Keyed by webContents ID (integer).
const pendingInits = new Map<number, { win: BrowserWindow; mapId: string; stateJson: string }>()

// Reference to the Score Window — set once by setScoreWindow()
let scoreWindow: BrowserWindow | null = null

/** Called by index.ts immediately after the Score Window is created. */
export function setScoreWindow(win: BrowserWindow): void {
  scoreWindow = win
}

/**
 * Opens a BrowserWindow for the given map ID.
 * If a window for this map is already open, it is focused instead.
 * stateJson is the full serialized session, used to initialize the map renderer.
 */
export function openMapWindow(mapId: string, stateJson: string): void {
  // Reuse existing window if it's still alive
  const existing = mapWindows.get(mapId)
  if (existing && !existing.isDestroyed()) {
    existing.focus()
    return
  }

  // Read stored geometry from the session JSON if the user wants positions remembered
  let x: number | undefined, y: number | undefined
  let width = 600, height = 500

  if (getCachedPreferences().rememberWindowPositions) {
    try {
      const state = JSON.parse(stateJson) as {
        maps?: Array<{
          id: string
          windowX?: number; windowY?: number
          windowWidth?: number; windowHeight?: number
        }>
      }
      const cfg = state.maps?.find(m => m.id === mapId)
      if (cfg) {
        if (cfg.windowX != null && cfg.windowY != null) { x = cfg.windowX; y = cfg.windowY }
        if (cfg.windowWidth)  width  = cfg.windowWidth
        if (cfg.windowHeight) height = cfg.windowHeight
      }
    } catch { /* leave defaults */ }
  }

  const win = new BrowserWindow({
    x, y, width, height,
    minWidth: 300,
    minHeight: 200,
    show: false,
    // 'hidden' removes the title bar entirely; we draw our own in MapPanel.tsx
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mapWindows.set(mapId, win)

  win.on('closed', () => {
    mapWindows.delete(mapId)
    // Only notify Score Window if the close was user-initiated (not programmatic)
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
    // Store the pending init — do NOT send map:init yet.
    // The renderer will call 'map:ready' when its IPC listeners are mounted.
    pendingInits.set(win.webContents.id, { win, mapId, stateJson })
  })
}

/**
 * Called when a map renderer signals it has finished mounting its IPC listeners.
 * Flushes the pending init for that window, sending 'map:init' with the full
 * session JSON so the renderer can draw its map.
 */
export function handleMapReady(webContentsId: number): void {
  const pending = pendingInits.get(webContentsId)
  if (!pending) return
  pendingInits.delete(webContentsId)
  const { win, mapId, stateJson } = pending
  if (!win.isDestroyed()) {
    win.webContents.send('map:init', mapId, stateJson)
  }
}

/**
 * Closes all open map windows without sending 'map:closed' notifications.
 * Used by File → New and File → Open so the Score Window can reset cleanly.
 */
export function closeAllMapWindowsSilent(): void {
  for (const [mapId, win] of mapWindows.entries()) {
    silentCloseIds.add(mapId)
    if (!win.isDestroyed()) win.close()
  }
  mapWindows.clear()
}

/**
 * Returns the current on-screen position and size of every open map window.
 * Used by handleSave() in App.tsx to capture geometry before serializing.
 */
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

/**
 * Sends a message to all open map windows.
 * Used by ipc.ts to relay 'state:push' broadcasts from the Score Window.
 */
export function broadcastToMaps(channel: string, ...args: unknown[]): void {
  for (const win of mapWindows.values()) {
    if (!win.isDestroyed()) win.webContents.send(channel, ...args)
  }
}

/**
 * Sends a message to all windows EXCEPT the one that originated the message.
 * Used by ipc.ts to relay fine-grained score updates without echoing back
 * to the sender, which would cause a feedback loop.
 */
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
