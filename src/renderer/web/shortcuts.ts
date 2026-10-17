import { history } from '@renderer/store/history'
import { overlayOpen } from '@renderer/lib/overlayStack'
import { dispatchMenuAction } from './browserApi'
import { historyLocked } from './interaction'
import { inPlaceSaving } from './fileAccess'

// Keyboard shortcuts the browser leaves to the page. On the desktop these are
// menu accelerators, which take the key even inside text fields so every edit
// goes through Score history; the browser keeps that convention. Ctrl+Y is the
// extra Redo outside Apple systems. Desktop shortcuts the browser reserves or
// commonly claims (New, Close, Import's Ctrl+Shift+I, map creation, Settings)
// are left to the browser; their commands are in the strip (StripCommands.tsx).
// Everything here is refused while a dialog or menu is open over the page.

export const isApple = /Mac|iPhone|iPad/.test(navigator.platform)

export function installShortcuts(): void {
  window.addEventListener('keydown', (e) => {
    const mod = isApple ? e.metaKey : e.ctrlKey
    if (!mod || e.altKey) return
    const key = e.key.toLowerCase()
    const undo = key === 'z' && !e.shiftKey
    const redo = (key === 'z' && e.shiftKey) || (!isApple && key === 'y' && !e.shiftKey)
    const open = key === 'o' && !e.shiftKey
    const save = key === 's'
    if (!undo && !redo && !open && !save) return
    e.preventDefault()
    if (overlayOpen()) return
    if (open) dispatchMenuAction('open')
    else if (save) dispatchMenuAction(e.shiftKey && inPlaceSaving ? 'save-as' : 'save')
    else if (historyLocked()) return
    else if (undo) history.undo()
    else history.redo()
  }, { capture: true })
}
