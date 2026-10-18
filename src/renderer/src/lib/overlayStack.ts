import { useEffect, useRef, useState, type RefObject } from 'react'

// Stack of open overlays (dialogs, confirmations) in this renderer.
//
// One capture-phase Escape listener serves the whole stack, so one Escape
// dismisses only the topmost overlay and never reaches page-level handlers
// beneath it (map deselect, picker close). While any overlay is open,
// background keyboard shortcuts stand down; scoreOwnsKeys() is their check.
// Closing an overlay returns focus to whatever had it when the overlay opened.

interface Entry { onEscape: (() => void) | null }

const stack: Entry[] = []
let listening = false
let scoreSurfaceActive: () => boolean = () => true

function onKeyDown(event: KeyboardEvent): void {
  const top = stack[stack.length - 1]
  if (event.key !== 'Escape' || !top) return
  event.preventDefault()
  event.stopImmediatePropagation()
  top.onEscape?.()
}

export function overlayOpen(): boolean {
  return stack.length > 0
}

/** Hosts with several surfaces (the browser) report whether Score is the active one. */
export function setScoreSurfaceProbe(probe: () => boolean): void {
  scoreSurfaceActive = probe
}

/** Whether Score-level shortcuts (score arrows, Duplicate) may act on this key. */
export function scoreOwnsKeys(): boolean {
  return stack.length === 0 && scoreSurfaceActive()
}

/**
 * Registers an overlay for its mounted lifetime. `onEscape` null swallows
 * Escape without closing. When given, `focusTarget` is focused on open unless
 * focus is already inside it — a container, never a destructive button.
 */
export function useOverlay(onEscape: (() => void) | null, focusTarget?: RefObject<HTMLElement | null>): void {
  // Captured during the first render, before child effects can move focus.
  const [opener] = useState(() => document.activeElement)
  const escapeRef = useRef(onEscape)
  escapeRef.current = onEscape

  useEffect(() => {
    const entry: Entry = { onEscape: () => escapeRef.current?.() }
    if (escapeRef.current === null) entry.onEscape = null
    stack.push(entry)
    if (!listening) {
      window.addEventListener('keydown', onKeyDown, true)
      listening = true
    }
    const target = focusTarget?.current
    if (target && !target.contains(document.activeElement)) target.focus()

    return () => {
      const index = stack.indexOf(entry)
      if (index >= 0) stack.splice(index, 1)
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus()
    }
    // Registered once per mount; the latest onEscape is read through the ref.
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
}
