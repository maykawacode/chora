// ── MapApp.tsx — Map window renderer root ────────────────────────────────────
//
// Each map BrowserWindow gets its own renderer process running this component.
// It is a thin IPC adapter: it wires up listeners, signals readiness, then
// hands off to MapPanel for all rendering and interaction.
//
// Lifecycle:
//   1. Renderer mounts → registers all IPC listeners → calls signalReady()
//   2. Main process receives map:ready and sends map:init with full state JSON
//   3. onMapInit sets mapId (triggers the panel to render) and loads the session
//   4. Subsequent onState calls replace the session when Score Window changes
//
// This component never mutates state directly. Map-initiated mutations
// (score drags, title edits) are sent back to Score Window via IPC, which
// owns the authoritative state. The Score Window then broadcasts the update
// back to all maps via onState.

import { useEffect, useState } from 'react'
import { useAppStore } from './store/appStore'
import { usePrefsStore } from './store/prefsStore'
import { deserializeSession } from './lib/parser'
import { MapPanel } from './components/maps/MapPanel'
import type { CartesianMapConfig, SemanticMapConfig } from './lib/types'
import { decodeMapStateEnvelope, mergePreferences } from '../../shared/contracts'

export function MapApp(): React.JSX.Element {
  const [mapId, setMapId]   = useState<string | null>(null)
  const loadSession         = useAppStore(s => s.loadSession)
  const selectElements      = useAppStore(s => s.selectElements)
  const setScore            = useAppStore(s => s.setScore)
  const updateMapConfig     = useAppStore(s => s.updateMapConfig)
  const setPrefs            = usePrefsStore(s => s.setPrefs)

  // Sync OS window title to the map's title and file name
  const mapTitle = useAppStore(s => mapId ? (s.maps.find(m => m.id === mapId)?.title ?? '') : '')
  const filePath = useAppStore(s => s.filePath)

  // ── IPC listener registration ─────────────────────────────────────────────
  //
  // All listeners are registered before signalReady() so there is no window
  // between ready and init where an arriving message could be missed.

  useEffect(() => {
    // Both map:init and state:push carry the same envelope shape:
    //   { isDirty: boolean, session: string, selectedElementId: string | null }
    // This helper parses that envelope and applies it to the store.
    // It is defined inside useEffect so it captures loadSession from the
    // closure without needing to be passed as a parameter.
    const applyStatePayload = (payload: string, context: string): void => {
      try {
        const { isDirty, filePath, session, selectedElementId, selectedElementIds } = decodeMapStateEnvelope(payload)
        loadSession({
          ...deserializeSession(session),
          isDirty:           isDirty           ?? false,
          filePath:          filePath          ?? null,
          selectedElementId: selectedElementId ?? null
        })
        selectElements(selectedElementIds ?? [])
      } catch (e) {
        console.error(`${context} failed`, e)
      }
    }

    // Initial state — sets mapId (unblocks render) and loads full session
    const removeInit = window.api.onMapInit((id, payload) => {
      setMapId(id)
      applyStatePayload(payload, 'map:init')
    })

    // Full state replacement whenever Score Window mutates the session
    const removeState = window.api.onState((payload) => {
      applyStatePayload(payload, 'state:push')
    })

    // Fine-grained score update — avoids a full state broadcast for drag events
    const removeScore = window.api.onScore((elementId, dimensionId, value) => {
      setScore(elementId, dimensionId, value)
    })

    // Config change relayed from Score Window (e.g. toggle-labels from menu)
    const removeConfig = window.api.onMapConfig((mId, changes) => {
      updateMapConfig(mId, changes as Partial<CartesianMapConfig> | Partial<SemanticMapConfig>)
    })

    // Preference update pushed from the Score Window after the user saves the
    // Preferences dialog. Merging with defaults ensures any field not yet in
    // the stored prefs (newly added fields) gets a sensible fallback value.
    const removePrefs = window.api.onPrefs((raw) => {
      setPrefs(mergePreferences(raw))
    })

    // Signal readiness AFTER all listeners are attached to prevent map:init race
    window.api.signalReady()

    return () => { removeInit(); removeState(); removeScore(); removeConfig(); removePrefs() }
  }, [loadSession, selectElements, setScore, updateMapConfig])

  // ── OS window title sync ──────────────────────────────────────────────────

  useEffect(() => {
    if (mapTitle) {
      const fileName = filePath ? (filePath.split('/').pop() ?? '') : ''
      document.title = fileName ? `${mapTitle} — ${fileName}` : mapTitle
    }
  }, [mapTitle, filePath])

  // ── Render ────────────────────────────────────────────────────────────────
  //
  // Show a loading state until map:init arrives and sets mapId

  if (!mapId) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
                    height: '100vh', color: '#888', fontFamily: 'system-ui', fontSize: 13 }}>
        Loading…
      </div>
    )
  }

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <MapPanel mapId={mapId} />
    </div>
  )
}
