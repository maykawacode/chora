import { useAppStore } from '../src/store/appStore'
import { history } from '../src/store/history'
import { deserializeSession, serializeSession } from '../src/lib/parser'

// PARKED (owner decision 2026-10-15): restore-on-reload is switched off until
// browser storage behaviour is explored across browsers; saving to disk is the
// habit to encourage. Only installLeaveWarning and clearRecovery are in use.
//
// Temporary recovery for the browser tab. The live study is snapshotted to
// sessionStorage (debounced, flushed when the page hides) and restored on
// reload within 12 hours. sessionStorage belongs to this tab: a new tab starts
// fresh, but a browser that restores tabs may bring the copy back, so the
// wording never promises erasure. Undo history is not kept, and nothing
// browser-specific is written into the .chora session itself.

const KEY = 'chora:recovery'
const VERSION = 1
const MAX_AGE_MS = 12 * 60 * 60 * 1000
const DEBOUNCE_MS = 750

interface Envelope {
  version: number
  savedAt: number
  session: string
  filePath: string | null
  isDirty: boolean
}

function hasContent(): boolean {
  const s = useAppStore.getState()
  return s.elements.length > 0 || s.dimensions.length > 0 || s.maps.length > 0
}

function remove(): void {
  try { sessionStorage.removeItem(KEY) } catch { /* storage blocked: nothing to remove */ }
}

function write(): void {
  // An empty study (New, or everything deleted) leaves nothing to recover.
  if (!hasContent()) { remove(); return }
  const state = useAppStore.getState()
  const envelope: Envelope = {
    version: VERSION,
    savedAt: Date.now(),
    session: serializeSession(state),
    filePath: state.filePath,
    isDirty: state.isDirty
  }
  try {
    sessionStorage.setItem(KEY, JSON.stringify(envelope))
  } catch {
    // Quota, private mode, or blocked storage: keep working without recovery.
  }
}

/** Parses a stored record; null for anything missing, foreign, corrupt or expired. */
export function parseEnvelope(raw: string | null, now: number): Envelope | null {
  if (!raw) return null
  try {
    const e = JSON.parse(raw) as Partial<Envelope>
    if (e.version !== VERSION || typeof e.session !== 'string' || typeof e.savedAt !== 'number') return null
    if (now - e.savedAt > MAX_AGE_MS || e.savedAt > now) return null
    return {
      version: VERSION,
      savedAt: e.savedAt,
      session: e.session,
      filePath: typeof e.filePath === 'string' ? e.filePath : null,
      isDirty: e.isDirty === true
    }
  } catch {
    return null
  }
}

/** Startup: replaces the empty document with a recent snapshot, if one is valid. */
export function restoreRecovery(): void {
  let raw: string | null = null
  try { raw = sessionStorage.getItem(KEY) } catch { return }
  const envelope = parseEnvelope(raw, Date.now())
  if (!envelope) { if (raw) remove(); return }
  try {
    const state = deserializeSession(envelope.session)
    history.replaceDocument(() => {
      useAppStore.getState().loadSession({ ...state, filePath: envelope.filePath, isDirty: envelope.isDirty })
    })
  } catch {
    remove()
  }
}

/** Keeps the snapshot current and warns before leaving with unsaved changes. */
export function installRecovery(): void {
  let timer: ReturnType<typeof setTimeout> | null = null
  const flush = (): void => {
    if (timer) { clearTimeout(timer); timer = null }
    write()
  }
  useAppStore.subscribe(() => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(flush, DEBOUNCE_MS)
  })
  window.addEventListener('pagehide', flush)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush()
  })
  installLeaveWarning()
}

/** Removes any record an earlier build left in this tab. */
export function clearRecovery(): void {
  remove()
}

/** Warns before leaving with unsaved changes. Best effort: browsers show their own wording, and may skip it. */
export function installLeaveWarning(): void {
  window.addEventListener('beforeunload', (e) => {
    if (!useAppStore.getState().isDirty) return
    e.preventDefault()
  })
}
