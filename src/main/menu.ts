// ── Application menu ──────────────────────────────────────────────────────────
//
// All menu actions are forwarded to the Score Window via IPC, regardless of
// which window has focus. This keeps all business logic in one place (App.tsx)
// and avoids duplicating handlers in the map renderer.
//
// The string sent as the IPC channel directly maps to the 'action' string
// handled by onMenuAction() in the preload and dispatched in App.tsx.

import { Menu, MenuItem, MenuItemConstructorOptions, BrowserWindow, app } from 'electron'

let _mainWindow: BrowserWindow | null = null
let _closeWindowItem: MenuItem | null = null
let _undoItem: MenuItem | null = null
let _redoItem: MenuItem | null = null

/** Called by index.ts right after the Score Window is created. */
export function setMainWindowForMenu(win: BrowserWindow): void {
  _mainWindow = win
}

/** Enable or disable the Close Window menu item based on which window has focus. */
export function setCloseWindowEnabled(enabled: boolean): void {
  if (_closeWindowItem) _closeWindowItem.enabled = enabled
}

/** Keep application Undo/Redo in sync with the authoritative Score history. */
export function setHistoryAvailability(canUndo: boolean, canRedo: boolean): void {
  if (_undoItem) _undoItem.enabled = canUndo
  if (_redoItem) _redoItem.enabled = canRedo
}

function findMenuItemByLabel(menu: Menu, label: string): MenuItem | null {
  for (const item of menu.items) {
    if (item.label === label) return item
    if (item.submenu) {
      const found = findMenuItemByLabel(item.submenu, label)
      if (found) return found
    }
  }
  return null
}

/** Sends a channel name to the Score Window renderer. */
function sendToRenderer(channel: string): void {
  if (_mainWindow && !_mainWindow.isDestroyed()) {
    _mainWindow.webContents.send(channel)
  }
}

export function buildMenu(): void {
  const isMac = process.platform === 'darwin'

  const template: MenuItemConstructorOptions[] = [
    // macOS-only app menu (shows app name, Preferences, Quit, etc.)
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' as const },
        { type: 'separator' as const },
        {
          label: 'Preferences…',
          accelerator: 'CmdOrCtrl+,',
          click: () => sendToRenderer('menu:preferences')
        },
        { type: 'separator' as const },
        { role: 'services' as const },
        { type: 'separator' as const },
        { role: 'hide' as const },
        { role: 'hideOthers' as const },
        { role: 'unhide' as const },
        { type: 'separator' as const },
        { role: 'quit' as const }
      ]
    }] : []),

    {
      label: 'File',
      submenu: [
        { label: 'New',               accelerator: 'CmdOrCtrl+N',       click: () => sendToRenderer('menu:new') },
        { label: 'Open…',             accelerator: 'CmdOrCtrl+O',       click: () => sendToRenderer('menu:open') },
        { type: 'separator' },
        { label: 'Save',              accelerator: 'CmdOrCtrl+S',       click: () => sendToRenderer('menu:save') },
        { label: 'Save As…',          accelerator: 'CmdOrCtrl+Shift+S', click: () => sendToRenderer('menu:save-as') },
        { type: 'separator' },
        { label: 'Import Spreadsheet…', accelerator: 'CmdOrCtrl+Shift+I', click: () => sendToRenderer('menu:import-spreadsheet') },
        { label: 'Export Spreadsheet…', accelerator: 'CmdOrCtrl+Shift+E', click: () => sendToRenderer('menu:export-spreadsheet') },
        ...(isMac ? [] : [
          { type: 'separator' as const },
          { role: 'quit' as const }
        ])
      ]
    },

    {
      label: 'Edit',
      submenu: [
        {
          label: 'Undo',
          accelerator: 'CmdOrCtrl+Z',
          enabled: false,
          click: () => sendToRenderer('menu:undo')
        },
        {
          label: 'Redo',
          accelerator: 'CmdOrCtrl+Shift+Z',
          enabled: false,
          click: () => sendToRenderer('menu:redo')
        },
        { type: 'separator' as const },
        { role: 'cut' as const },
        { role: 'copy' as const },
        { role: 'paste' as const },
        { role: 'selectAll' as const }
      ]
    },

    {
      label: 'Maps',
      submenu: [
        // Collection projection is no longer its own kind of map — a cartesian
        // map draws collection blobs from the Collections section of its sidebar.
        // Plain Cmd/Ctrl+M is the standard Minimize shortcut. Shift keeps the
        // map mnemonic without colliding with that Window-menu command.
        { label: 'New Map…',          accelerator: 'CmdOrCtrl+Shift+M', click: () => sendToRenderer('menu:create-cartesian') },
        { label: 'New Semantic Map…', accelerator: 'CmdOrCtrl+Shift+D', click: () => sendToRenderer('menu:create-semantic') }
      ]
    },

    {
      label: 'Window',
      submenu: [
        {
          label: 'Close Window',
          accelerator: 'CmdOrCtrl+W',
          enabled: false,
          click: (_item, focusedWindow) => {
            if (focusedWindow && focusedWindow !== _mainWindow) {
              focusedWindow.close()
            }
          }
        },
        { type: 'separator' as const },
        { role: 'minimize' as const },
        { role: 'zoom' as const },
        ...(isMac ? [
          { type: 'separator' as const },
          { role: 'front' as const }
        ] : [])
      ]
    }
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
  _undoItem = findMenuItemByLabel(menu, 'Undo')
  _redoItem = findMenuItemByLabel(menu, 'Redo')
  _closeWindowItem = findMenuItemByLabel(menu, 'Close Window')
}
