// ── Application menu ──────────────────────────────────────────────────────────
//
// All menu actions are forwarded to the Score Window via IPC, regardless of
// which window has focus. This keeps all business logic in one place (App.tsx)
// and avoids duplicating handlers in the map renderer.
//
// The string sent as the IPC channel directly maps to the 'action' string
// handled by onMenuAction() in the preload and dispatched in App.tsx.

import { Menu, MenuItemConstructorOptions, BrowserWindow, app } from 'electron'

let _mainWindow: BrowserWindow | null = null

/** Called by index.ts right after the Score Window is created. */
export function setMainWindowForMenu(win: BrowserWindow): void {
  _mainWindow = win
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
        { type: 'separator' },
        isMac ? { role: 'close' as const } : { role: 'quit' as const }
      ]
    },

    {
      label: 'Edit',
      submenu: [
        { role: 'undo' as const },
        { role: 'redo' as const },
        { type: 'separator' as const },
        { role: 'cut' as const },
        { role: 'copy' as const },
        { role: 'paste' as const },
        { role: 'selectAll' as const }
      ]
    },

    {
      label: 'Create',
      submenu: [
        { label: 'Cartesian Map…', accelerator: 'CmdOrCtrl+D',       click: () => sendToRenderer('menu:create-cartesian') },
        { label: 'Semantic Map…',  accelerator: 'CmdOrCtrl+Shift+D', click: () => sendToRenderer('menu:create-semantic') }
      ]
    },

    {
      label: 'Advanced',
      submenu: [
        { label: 'Dimension → Weight…', click: () => sendToRenderer('menu:dim-to-weight') },
        { label: 'Weight → Dimension…', click: () => sendToRenderer('menu:weight-to-dim') },
        { label: 'Dimension → Gray…',   click: () => sendToRenderer('menu:dim-to-gray') },
        { type: 'separator' },
        { label: 'Randomize Scores…',   click: () => sendToRenderer('menu:randomize-scores') }
      ]
    },

    {
      label: 'Map',
      submenu: [
        { label: 'Show/Hide Labels', accelerator: 'CmdOrCtrl+E', click: () => sendToRenderer('menu:toggle-labels') },
        { label: 'Update All Maps',                               click: () => sendToRenderer('menu:update-maps') }
      ]
    },

    {
      label: 'Window',
      submenu: [
        { role: 'minimize' as const },
        { role: 'zoom' as const },
        ...(isMac ? [
          { type: 'separator' as const },
          { role: 'front' as const }
        ] : [])
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
