// ── App.tsx — Score Window root ───────────────────────────────────────────────
//
// This is the top-level component of the Score Window (main window). It owns:
//
//   • The Zustand app state and all file I/O
//   • All modal dialog visibility state
//   • IPC listeners for map window events (score updates, map closes, config changes)
//   • The suppressBroadcast ref that prevents IPC feedback loops
//   • Preferences loading on startup
//
// Architecture: Score Window is the single source of truth. Map windows are
// read-only displays — they send back only fine-grained score drags and config
// changes. Every other mutation flows through this component.

import { useEffect, useRef, useState } from 'react'
import { useAppStore } from './store/appStore'
import { usePrefsStore } from './store/prefsStore'
import { ScoreWindow } from './components/ScoreWindow/ScoreWindow'
import { ChooseDimensions, CreateSemanticMap } from './components/maps/ChooseDimensions'
import { AdvancedTransform } from './components/maps/AdvancedTransform'
import type { TransformMode } from './components/maps/AdvancedTransform'
import { StarterListPicker } from './components/ScoreWindow/StarterListPicker'
import { ImportPreview } from './components/ImportPreview'
import { PreferencesDialog } from './components/PreferencesDialog'
import { WelcomeDialog } from './components/WelcomeDialog'
import { serializeSession, deserializeSession } from './lib/parser'
import { parseSpreadsheet } from './lib/importer'
import type { ImportResult } from './lib/importer'
import { exportSpreadsheet } from './lib/exporter'
import type { CartesianMapConfig, SemanticMapConfig } from './lib/types'
import type { Preferences } from './lib/preferences'
import styles from './App.module.css'

export function App(): React.JSX.Element {
  const filePath     = useAppStore(s => s.filePath)
  const isDirty      = useAppStore(s => s.isDirty)
  const loadSession  = useAppStore(s => s.loadSession)
  const markClean    = useAppStore(s => s.markClean)
  const resetToEmpty = useAppStore(s => s.resetToEmpty)

  // ── Modal visibility state ────────────────────────────────────────────────────

  // Show the welcome dialog on startup unless a file will be auto-reopened.
  // Prefs are pre-loaded before React mounts so this initial value is stable.
  const [showWelcome, setShowWelcome] = useState(() => {
    const { prefs } = usePrefsStore.getState()
    return !(prefs.reopenLastFile && !!prefs.lastFilePath)
  })

  const [showChooseDimensions, setShowChooseDimensions] = useState(false)
  const [showCreateSemantic,   setShowCreateSemantic]   = useState(false)
  const [showStarterPicker,    setShowStarterPicker]    = useState(false)
  const [showPreferences,      setShowPreferences]      = useState(false)
  const [activeTransform,      setActiveTransform]      = useState<TransformMode | null>(null)
  const [importPreview,        setImportPreview]        = useState<{ fileName: string; result: ImportResult } | null>(null)

  // True while any modal is open — used to bring the Score Window to the front
  // so it is not obscured by map BrowserWindows
  const isModalOpen = showWelcome || showChooseDimensions || showCreateSemantic || showStarterPicker ||
                      showPreferences || activeTransform !== null || importPreview !== null

  // ── suppressBroadcast ref ─────────────────────────────────────────────────────
  //
  // When a map window sends back a score update via IPC, App.tsx calls
  // setScore() on the store. The Zustand subscriber in the useEffect below
  // would then immediately broadcast the full state back to all maps — creating
  // a feedback loop. Setting this ref to true before the setScore call and back
  // to false after prevents the broadcast from firing.

  const suppressBroadcast = useRef(false)

  // ── Auto-reopen last file ─────────────────────────────────────────────────────
  //
  // Preferences are already loaded into the store before React mounts (see
  // main.tsx). This effect just handles the file-reopen side effect.

  useEffect(() => {
    const { prefs } = usePrefsStore.getState()
    if (prefs.reopenLastFile && prefs.lastFilePath) {
      window.api.readFile(prefs.lastFilePath)
        .then(json => {
          const state = deserializeSession(json)
          loadSession({ ...state, filePath: prefs.lastFilePath! })
          markClean(prefs.lastFilePath!)
        })
        .catch(() => { /* file has moved or been deleted — silently ignore */ })
    }
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── State broadcast to map windows ───────────────────────────────────────────
  //
  // Subscribes to the Zustand store directly (not via a hook) so the callback
  // runs outside of React's render cycle — necessary for fine-grained IPC.

  useEffect(() => {
    return useAppStore.subscribe((state, prevState) => {
      // Open a new BrowserWindow for any map that just appeared in the session
      const prevIds = new Set(prevState.maps.map(m => m.id))
      for (const map of state.maps) {
        if (!prevIds.has(map.id)) {
          window.api.openMap(map.id, serializeSession(state))
        }
      }

      // Broadcast full state to all open map windows (unless we're mid-IPC-receive)
      if (!suppressBroadcast.current) {
        window.api.broadcastState(serializeSession(state))
      }
    })
  }, [])

  // ── IPC listeners from map windows ───────────────────────────────────────────

  useEffect(() => {
    // Fine-grained score from a map window drag — apply without re-broadcasting
    const removeScore = window.api.onScore((elementId, dimensionId, value) => {
      suppressBroadcast.current = true
      useAppStore.getState().setScore(elementId, dimensionId, value)
      suppressBroadcast.current = false
    })

    // Map config change (axis swap, flip, title rename) from a map window
    const removeConfig = window.api.onMapConfig((mapId, changes) => {
      useAppStore.getState().updateMapConfig(
        mapId,
        changes as Partial<CartesianMapConfig> | Partial<SemanticMapConfig>
      )
    })

    // Map window closed by the user — remove its config from the session
    const removeMapClosed = window.api.onMapClosed((mapId) => {
      suppressBroadcast.current = true
      useAppStore.getState().removeMap(mapId)
      suppressBroadcast.current = false
    })

    return () => { removeScore(); removeConfig(); removeMapClosed() }
  }, [])

  // ── Modal z-order ─────────────────────────────────────────────────────────────
  //
  // Notifies the main process when any modal opens so it can call
  // focus()+moveTop() on the Score Window, preventing map BrowserWindows from
  // covering the modal. Uses optional chaining on both window.api AND the method
  // because the preload may not have been rebuilt yet in development.

  useEffect(() => {
    window.api?.setModalOpen?.(isModalOpen)
  }, [isModalOpen])

  // ── Title bar ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    const name = filePath ? filePath.split('/').pop() ?? filePath : 'Untitled'
    document.title = isDirty ? `${name} •` : name
  }, [filePath, isDirty])

  // ── Menu action dispatcher ────────────────────────────────────────────────────

  useEffect(() => {
    return window.api.onMenuAction(async (action) => {
      switch (action) {
        case 'new':                await handleNew();             break
        case 'open':               await handleOpen();            break
        case 'save':               await handleSave(false);       break
        case 'save-as':            await handleSave(true);        break
        case 'import-spreadsheet': await handleImport();          break
        case 'export-spreadsheet': await handleExport();          break
        case 'create-cartesian':   setShowChooseDimensions(true); break
        case 'create-semantic':    setShowCreateSemantic(true);   break
        case 'preferences':        setShowPreferences(true);      break
      }
    })
  }, [filePath, isDirty])   // eslint-disable-line react-hooks/exhaustive-deps

  // ── File handlers ─────────────────────────────────────────────────────────────

  async function handleNew(): Promise<void> {
    if (isDirty && !await confirmDiscard()) return
    window.api.closeAllMaps()
    resetToEmpty()
  }

  async function handleOpen(): Promise<boolean> {
    if (isDirty && !await confirmDiscard()) return false
    const path = await window.api.openFile()
    if (!path) return false
    try {
      const json  = await window.api.readFile(path)
      const state = deserializeSession(json)
      window.api.closeAllMaps()
      loadSession({ ...state, filePath: path })
      markClean(path)
      // The Zustand subscriber above detects new maps and opens a window for each
      return true
    } catch (e) {
      alert(`Could not open file:\n${(e as Error).message}`)
      return false
    }
  }

  async function handleSave(forceDialog: boolean): Promise<void> {
    let path = useAppStore.getState().filePath
    if (!path || forceDialog) {
      path = await window.api.showSaveDialog()
      if (!path) return
    }

    const currentPrefs = usePrefsStore.getState().prefs

    // Capture current map window positions before serializing, so geometry
    // is saved to the file and can be restored on next open
    if (currentPrefs.rememberWindowPositions) {
      const positions = await window.api.getMapWindowPositions()
      suppressBroadcast.current = true
      for (const [mapId, pos] of Object.entries(positions)) {
        useAppStore.getState().updateMapConfig(mapId, {
          windowX: pos.x, windowY: pos.y,
          windowWidth: pos.width, windowHeight: pos.height
        })
      }
      suppressBroadcast.current = false
    }

    const json = serializeSession(useAppStore.getState())
    await window.api.writeFile(path, json)
    markClean(path)

    // Record this as the last-used file path for the auto-reopen preference
    const newPrefs: Preferences = { ...currentPrefs, lastFilePath: path }
    usePrefsStore.getState().setPrefs(newPrefs)
    window.api.savePreferences(newPrefs as unknown as Record<string, unknown>)
  }

  async function handleImport(): Promise<void> {
    const path = await window.api.openCsvFile()
    if (!path) return
    try {
      const text     = await window.api.readFile(path)
      const result   = parseSpreadsheet(text)
      const fileName = path.split('/').pop() ?? path
      setImportPreview({ fileName, result })
    } catch (e) {
      alert(`Could not parse file:\n${(e as Error).message}`)
    }
  }

  async function handleExport(): Promise<void> {
    const path = await window.api.showCsvSaveDialog()
    if (!path) return
    try {
      const tsv = exportSpreadsheet(useAppStore.getState())
      await window.api.writeFile(path, tsv)
    } catch (e) {
      alert(`Could not export file:\n${(e as Error).message}`)
    }
  }

  function confirmDiscard(): Promise<boolean> {
    return Promise.resolve(window.confirm('You have unsaved changes. Discard them?'))
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className={styles.root}>
      <ScoreWindow onOpenStarterPicker={() => setShowStarterPicker(true)} onOpenTransform={setActiveTransform} />

      {importPreview && (
        <ImportPreview
          fileName={importPreview.fileName}
          result={importPreview.result}
          onCancel={() => setImportPreview(null)}
          onConfirm={() => {
            const { elements, dimensions, scores } = importPreview.result
            loadSession({
              filePath: null, isDirty: true,
              elements, dimensions, scores, maps: [],
              selectedElementId:   elements[0]?.id   ?? null,
              selectedDimensionId: dimensions[0]?.id ?? null,
              activeTab: 'elements'
            })
            setImportPreview(null)
          }}
        />
      )}

      {showStarterPicker    && <StarterListPicker    onClose={() => setShowStarterPicker(false)} />}
      {showChooseDimensions && <ChooseDimensions     onClose={() => setShowChooseDimensions(false)} />}
      {showCreateSemantic   && <CreateSemanticMap    onClose={() => setShowCreateSemantic(false)} />}
      {activeTransform      && <AdvancedTransform    mode={activeTransform} onClose={() => setActiveTransform(null)} />}
      {showPreferences      && <PreferencesDialog    onClose={() => setShowPreferences(false)} />}

      {showWelcome && (
        <WelcomeDialog
          onNew={async () => {
            await handleNew()
            setShowWelcome(false)
          }}
          onOpen={async () => {
            const loaded = await handleOpen()
            if (loaded) setShowWelcome(false)
          }}
        />
      )}
    </div>
  )
}
