// ── Main process entry point ──────────────────────────────────────────────────
//
// Electron starts here. We create one BrowserWindow (the Score Window) which
// acts as the application shell. Map windows are created on demand by
// windowManager.ts whenever the renderer requests them via IPC.

import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { registerIpcHandlers } from './ipc'
import { buildMenu, setMainWindowForMenu } from './menu'
import { setScoreWindow } from './windowManager'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 430,
    height: 700,
    minWidth: 300,
    minHeight: 500,
    show: false,
    // hiddenInset keeps the standard macOS traffic-light buttons visible
    // while letting us style the rest of the title bar ourselves
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  // Register with windowManager so it can find and focus this window
  setScoreWindow(mainWindow)
  // Register with menu.ts so menu actions can be sent to this window
  setMainWindowForMenu(mainWindow)

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
  })

  // Intercept any attempt to open a new browser window and redirect to
  // the system browser — we never want Electron to spawn extra windows itself
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  registerIpcHandlers()
  buildMenu()
  createWindow()

  // macOS: re-create the window if the dock icon is clicked while no windows are open
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit on all windows closed except on macOS (standard platform behavior)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

/** Returns the Score Window instance (may be null if not yet created). */
export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}
