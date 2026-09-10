// ── Main process entry point ──────────────────────────────────────────────────
//
// Electron starts here. We create one BrowserWindow (the Score Window) which
// acts as the application shell. Map windows are created on demand by
// windowManager.ts whenever the renderer requests them via IPC.

import { app, BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { registerIpcHandlers } from './ipc'
import { buildMenu, setMainWindowForMenu, setCloseWindowEnabled } from './menu'
import { setScoreWindow } from './windowManager'
import { applyWindowSecurity } from './windowSecurity'
import { loadPreferences, getCachedPreferences, savePreferences, savePreferencesSync } from './prefs'
import { fitSize, isRestorable } from './windowGeometry'

// Lock the development and packaged runtime identity before Electron resolves
// app.name and the userData directory.
app.setName('Chora')

const DEFAULT_SIZE = { width: 530, height: 800 }
const MIN_SIZE     = { width: 400, height: 500 }

let mainWindow: BrowserWindow | null = null
let quitConfirmed = false

// True once the window has actually moved or resized this session. See
// saveBounds() for why quit-time persistence is gated on it.
let mainBoundsDirty = false

export function setQuitConfirmed(): void { quitConfirmed = true }

function createWindow(): void {
  const prefs = getCachedPreferences()

  // A size remembered on a larger monitor can exceed every display attached
  // now, putting the window's own controls out of reach. Shrink it before the
  // window is built rather than after it is on screen.
  const { width, height } = fitSize(
    prefs.rememberWindowPositions
      ? { width: prefs.mainWindowWidth, height: prefs.mainWindowHeight }
      : DEFAULT_SIZE,
    screen.getPrimaryDisplay().workArea,
    MIN_SIZE
  )

  // Always open centered on launch — saved position is applied later via IPC
  // once the user selects a file or starts a new session.
  mainWindow = new BrowserWindow({
    width,
    height,
    minWidth:  MIN_SIZE.width,
    minHeight: MIN_SIZE.height,
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

  // Persist main window geometry so it can be restored on next launch.
  // Marking the geometry dirty is deliberately not conditional on the
  // preference: the flag records that the window moved, which stays true even
  // if the user turns remembering back on later in the session.
  const saveBounds = (): void => {
    mainBoundsDirty = true
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

  // Refuse navigation and new windows; hand https links to the system browser.
  // See windowSecurity.ts for why the scheme is checked before openExternal.
  applyWindowSecurity(mainWindow)

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
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send('app:cancel-modals')
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('app:quit-requested')
    }
    return
  }
  // Capture final window bounds synchronously before the process exits.
  // Async writes from moved/resized events may not have completed yet.
  if (mainWindow && !mainWindow.isDestroyed()) {
    // Only persist geometry the window actually took. When a saved position is
    // declined because its display is gone, the window stays at its centered
    // launch position and never fires a move; writing that centered position
    // here would discard the user's real one without them touching the window,
    // and reattaching the display would no longer bring it back.
    if (mainBoundsDirty && getCachedPreferences().rememberWindowPositions) {
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

/**
 * Moves the Score Window from its centered launch position to the position
 * saved on the last run. Called once a session is established.
 *
 * The saved position is applied only if it still lands on an attached display.
 * A position recorded on a monitor that is now disconnected is left unapplied
 * rather than clamped onto whatever screen remains: the window is already
 * somewhere usable, and declining to move it also leaves the stored
 * coordinates intact, so reconnecting that monitor restores the original
 * placement instead of the app having quietly overwritten it.
 */
export function restoreMainWindowBounds(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return

  const prefs = getCachedPreferences()
  if (!prefs.rememberWindowPositions) return
  if (prefs.mainWindowX == null || prefs.mainWindowY == null) return

  const saved = {
    x:      prefs.mainWindowX,
    y:      prefs.mainWindowY,
    width:  prefs.mainWindowWidth,
    height: prefs.mainWindowHeight
  }

  if (!isRestorable(saved, screen.getAllDisplays().map(d => d.workArea))) return

  const target = screen.getDisplayMatching(saved).workArea
  const { width, height } = fitSize(saved, target, MIN_SIZE)
  mainWindow.setBounds({ x: saved.x, y: saved.y, width, height }, true)  // true = animate on macOS
}

/** Returns the Score Window instance (may be null if not yet created). */
export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}
