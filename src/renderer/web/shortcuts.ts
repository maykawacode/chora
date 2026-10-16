import { history } from '@renderer/store/history'
import { overlayOpen } from '@renderer/lib/overlayStack'
import { historyLocked } from './interaction'

// Undo/Redo keys. On the desktop these are menu accelerators, which take the
// key even inside text fields so every edit goes through Score history; the
// browser keeps that convention. Ctrl+Y is the extra Redo outside Apple systems.
// Refused while a map modal holds its lock or any dialog is open over the page.

const isApple = /Mac|iPhone|iPad/.test(navigator.platform)

export function installShortcuts(): void {
  window.addEventListener('keydown', (e) => {
    const mod = isApple ? e.metaKey : e.ctrlKey
    if (!mod || e.altKey) return
    const key = e.key.toLowerCase()
    const undo = key === 'z' && !e.shiftKey
    const redo = (key === 'z' && e.shiftKey) || (!isApple && key === 'y' && !e.shiftKey)
    if (!undo && !redo) return
    e.preventDefault()
    if (historyLocked() || overlayOpen()) return
    if (undo) history.undo()
    else history.redo()
  }, { capture: true })
}
