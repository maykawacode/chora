// ── Main process entry point ──────────────────────────────────────────────────
//
// Electron starts here. We create one BrowserWindow (the Score Window) which
// acts as the application shell. Map windows are created on demand by
// windowManager.ts whenever the renderer requests them via IPC.

import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { registerIpcHandlers } from './ipc'
import { buildMenu, setMainWindowForMenu, setCloseWindowEnabled } from './menu'
import { setScoreWindow } from './windowManager'
import { loadPreferences, getCachedPreferences, savePreferences, savePreferencesSync } from './prefs'

// Lock the development and packaged runtime identity before Electron resolves
// app.name and the userData directory.
app.setName('Chora')

let mainWindow: BrowserWindow | null = null
let quitConfirmed = false

export function setQuitConfirmed(): void { quitConfirmed = true }

function createWindow(): void {
  const prefs = getCachedPreferences()

  // Always open centered on launch — saved position is applied later via IPC
  // once the user selects a file or starts a new session.
  mainWindow = new BrowserWindow({
    width:  prefs.rememberWindowPositions ? prefs.mainWindowWidth  : 530,
    height: prefs.rememberWindowPositions ? prefs.mainWindowHeight : 800,
    minWidth: 400,
    minHeight: 500,
    show: false,
    closable: false,
    // The renderer owns the complete title surface; frameless mode guarantees
    // that native window controls are not drawn behind it.
    frame: false,
    roundedCorners: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  // Register with windowManager so it can find and focus this window
  setScoreWindow(mainWindow)
  // Register with menu.ts so menu actions can be sent to this window
  setMainWindowForMenu(mainWindow)

  // Center first, then register handlers — center() fires a 'moved' event on
  // macOS which would otherwise overwrite the user's saved position immediately.
  mainWindow.center()

  // Persist main window geometry so it can be restored on next launch
  const saveBounds = (): void => {
    if (!getCachedPreferences().rememberWindowPositions) return
    const [x, y] = mainWindow!.getPosition()
    const [w, h] = mainWindow!.getSize()
    savePreferences({ ...getCachedPreferences(), mainWindowX: x, mainWindowY: y, mainWindowWidth: w, mainWindowHeight: h })
  }
  mainWindow.on('moved',   saveBounds)
  mainWindow.on('resized', saveBounds)

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
  })

  // Intercept any attempt to open a new browser window and redirect to
  // the system browser — we never want Electron to spawn extra windows itself
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  // Warm the prefs cache before the window opens so the renderer can read
  // preferences synchronously via the prefs:get-sync IPC channel
  await loadPreferences()

  registerIpcHandlers()
  buildMenu()
  createWindow()

  // macOS: re-create the window if the dock icon is clicked while no windows are open
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

  // Enable Close Window only when a map window (not the Score Window) has focus
  app.on('browser-window-focus', (_, win) => {
    setCloseWindowEnabled(win !== mainWindow)
  })
})

// Ask the renderer to confirm before quitting if there are unsaved changes.
// The renderer calls app:confirm-quit to proceed; until then we hold the quit.
app.on('before-quit', (e) => {
  if (!quitConfirmed) {
    e.preventDefault()
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('app:quit-requested')
    }
    return
  }
  // Capture final window bounds synchronously before the process exits.
  // Async writes from moved/resized events may not have completed yet.
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (getCachedPreferences().rememberWindowPositions) {
      const [x, y] = mainWindow.getPosition()
      const [w, h] = mainWindow.getSize()
      savePreferencesSync({ ...getCachedPreferences(), mainWindowX: x, mainWindowY: y, mainWindowWidth: w, mainWindowHeight: h })
    }
    mainWindow.setClosable(true)
  }
})

// Quit on all windows closed except on macOS (standard platform behavior)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

/** Returns the Score Window instance (may be null if not yet created). */
export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}
