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
import { history } from './store/history'
import { ScoreWindow } from './components/ScoreWindow/ScoreWindow'
import { ChooseDimensions, CreateSemanticMap } from './components/maps/ChooseDimensions'
import { StarterListPicker } from './components/ScoreWindow/StarterListPicker'
import { ImportPreview } from './components/ImportPreview'
import { PreferencesDialog } from './components/PreferencesDialog'
import { WelcomeDialog } from './components/WelcomeDialog'
import { serializeSession, deserializeSession } from './lib/parser'
import { parseSpreadsheet } from './lib/importer'
import type { ImportResult } from './lib/importer'
import { exportSpreadsheet } from './lib/exporter'
import type { CartesianMapConfig, SemanticMapConfig, Element } from './lib/types'
import type { Preferences } from './lib/preferences'
import styles from './App.module.css'

type StoreState = ReturnType<typeof useAppStore.getState>

/** One canonical payload shape for every Score Window → map state push. */
function encodeStateEnvelope(state: StoreState): string {
  return JSON.stringify({
    isDirty: state.isDirty,
    filePath: state.filePath,
    session: serializeSession(state),
    selectedElementId: state.selectedElementId,
    selectedElementIds: state.selectedElementIds
  })
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** An error must remain visible even if its bring-to-front request also fails. */
async function focusMainSafely(): Promise<void> {
  try { await window.api.focusMainWindow() } catch { /* alert in the caller */ }
}

export function App(): React.JSX.Element {
  const filePath      = useAppStore(s => s.filePath)
  const isDirty       = useAppStore(s => s.isDirty)
  const loadSession   = useAppStore(s => s.loadSession)
  const resetToEmpty  = useAppStore(s => s.resetToEmpty)
  const selectElement  = useAppStore(s => s.selectElement)
  const selectElements = useAppStore(s => s.selectElements)

  // ── Modal visibility state ────────────────────────────────────────────────────

  // Show the welcome dialog on startup unless a file will be auto-reopened.
  // Prefs are pre-loaded before React mounts so this initial value is stable.
  const [showWelcome, setShowWelcome] = useState(() => {
    const { prefs } = usePrefsStore.getState()
    return !(prefs.reopenLastFile && !!prefs.lastFilePath)
  })

  const [showQuitConfirm,      setShowQuitConfirm]      = useState(false)
  const [showChooseDimensions,    setShowChooseDimensions]    = useState(false)
  const [showCreateSemantic,      setShowCreateSemantic]      = useState(false)
  const [showStarterPicker,    setShowStarterPicker]    = useState(false)
  const [showPreferences,      setShowPreferences]      = useState(false)
  const [importPreview,        setImportPreview]        = useState<{ fileName: string; result: ImportResult } | null>(null)

  // True while any modal is open — used to bring the Score Window to the front
  // so it is not obscured by map BrowserWindows
  const isModalOpen = showWelcome || showChooseDimensions || showCreateSemantic ||
                      showStarterPicker || showPreferences || showQuitConfirm || importPreview !== null

  // ── suppressBroadcast ref ─────────────────────────────────────────────────────
  //
  // When a map window sends back a score update via IPC, App.tsx calls
  // setScore() on the store. The Zustand subscriber in the useEffect below
  // would then immediately broadcast the full state back to all maps — creating
  // a feedback loop. Setting this ref to true before the setScore call and back
  // to false after prevents the broadcast from firing.

  const suppressBroadcast = useRef(false)
  // A second Save must never race an older temp-file rename. Callers share the
  // one in-flight result; after it settles, a later request can capture a fresh
  // frame if changes remain.
  const saveInFlight = useRef<Promise<boolean> | null>(null)

  /** Fine-grained map updates must not echo a full state payload to their sender. */
  function withoutStateBroadcast<T>(fn: () => T): T {
    suppressBroadcast.current = true
    try {
      return fn()
    } finally {
      suppressBroadcast.current = false
    }
  }

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
          history.replaceDocument(() => {
            loadSession({ ...state, filePath: prefs.lastFilePath!, isDirty: false })
            selectElements([])
          })
          window.api.restoreMainWindowBounds()
        })
        .catch(async (error: unknown) => {
          // Auto-reopen initially suppresses Welcome, so a failed read or parse
          // must restore a recovery path instead of leaving an unexplained
          // empty window.
          await focusMainSafely()
          alert(`Could not reopen the last file:\n${errorMessage(error)}`)
          setShowWelcome(true)
        })
    }
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── State broadcast to map windows ───────────────────────────────────────────
  //
  // Subscribes to the Zustand store directly (not via a hook) so the callback
  // runs outside of React's render cycle — necessary for fine-grained IPC.

  useEffect(() => {
    return useAppStore.subscribe((_state, prevState) => {
      // A history no-op can correct isDirty in a nested store update. Always
      // encode the live store so this listener never broadcasts the stale outer
      // notification after that correction.
      const liveState = useAppStore.getState()

      // Open a new BrowserWindow for any map that just appeared in the session
      const prevIds = new Set(prevState.maps.map(m => m.id))
      for (const map of liveState.maps) {
        if (!prevIds.has(map.id)) {
          window.api.openMap(map.id, encodeStateEnvelope(liveState))
        }
      }

      // Close a BrowserWindow for any map removed by Undo, Redo, Import, or
      // another state replacement. User-initiated closes are already gone, so
      // closeMap is intentionally a harmless no-op in that case.
      const nextIds = new Set(liveState.maps.map(m => m.id))
      for (const map of prevState.maps) {
        if (!nextIds.has(map.id)) window.api.closeMap(map.id)
      }

      // Broadcast full state to all open map windows (unless we're mid-IPC-receive)
      if (!suppressBroadcast.current) {
        window.api.broadcastState(encodeStateEnvelope(liveState))
      }
    })
  }, [])

  // ── IPC listeners from map windows ───────────────────────────────────────────

  useEffect(() => {
    const removeHistoryTransaction = window.api.onHistoryTransaction((ownerId, phase) => {
      if (phase === 'begin') history.begin(ownerId)
      else history.end(ownerId)
    })

    // Fine-grained score from a map window drag — apply without re-broadcasting
    const removeScore = window.api.onScore((elementId, dimensionId, value) => {
      const state = useAppStore.getState()
      if (!state.elements.some(element => element.id === elementId)) return
      if (!state.dimensions.some(dimension => dimension.id === dimensionId)) return
      withoutStateBroadcast(() => state.setScore(elementId, dimensionId, value))
    })

    // Map config change (axis swap, flip, title rename) from a map window
    const removeConfig = window.api.onMapConfig((mapId, changes) => {
      const state = useAppStore.getState()
      if (!state.maps.some(map => map.id === mapId)) return
      state.updateMapConfig(
        mapId,
        changes as Partial<CartesianMapConfig> | Partial<SemanticMapConfig>
      )
    })

    // Map window closed by the user — remove its config from the session
    const removeMapClosed = window.api.onMapClosed((mapId) => {
      const state = useAppStore.getState()
      if (state.maps.some(map => map.id === mapId)) state.removeMap(mapId)
    })

    // Element property change from a map window's right-click modal.
    // Suppress the Zustand subscription during the update so the subscription
    // doesn't broadcast, then explicitly push the fresh state to all map windows.
    const removeElementUpdate = window.api.onElementUpdate((elementId, changes) => {
      const before = useAppStore.getState()
      if (!before.elements.some(element => element.id === elementId)) return
      withoutStateBroadcast(() => before.updateElement(elementId, changes as Partial<Element>))
      const s = useAppStore.getState()
      window.api.broadcastState(encodeStateEnvelope(s))
    })

    // New collection created inline from a map window modal. It persists at the
    // moment the user clicks Add, so broadcast it immediately even if the modal
    // is later cancelled and no element update follows.
    const removeCollectionAdd = window.api.onCollectionAdd((id, name) => {
      const before = useAppStore.getState()
      if (before.collections.some(collection => collection.id === id)) return
      withoutStateBroadcast(() => before.addCollection(name, id))
      window.api.broadcastState(encodeStateEnvelope(useAppStore.getState()))
    })

    // Quit requested — show confirm dialog if dirty, otherwise let it proceed
    const removeQuitRequested = window.api.onQuitRequested(() => {
      if (useAppStore.getState().isDirty) {
        setShowQuitConfirm(true)
      } else {
        window.api.confirmQuit()
      }
    })

    return () => {
      removeHistoryTransaction()
      removeScore()
      removeConfig()
      removeMapClosed()
      removeElementUpdate()
      removeCollectionAdd()
      removeQuitRequested()
    }
  }, [])

  // Keep native menu availability synchronized with the authoritative history.
  useEffect(() => history.onAvailability(({ canUndo, canRedo }) => {
    window.api.setHistoryAvailability(canUndo, canRedo)
  }), [])

  // ── Selection sync ────────────────────────────────────────────────────────────
  //
  // Map windows drive selection: clicking a dot sends selection:update to main,
  // which relays it here. We apply it and the Zustand subscriber broadcasts it
  // back to all maps via selectedElementId in the state envelope.
  //
  // Losing focus to a map window clears selection so the red ring disappears
  // until the user explicitly clicks a dot.

  useEffect(() => {
    const removeSelection = window.api.onSelection((elementId) => {
      selectElement(elementId)
    })

    const removeMultiSelection = window.api.onMultiSelection((ids) => {
      selectElements(ids)
    })

    const handleBlur = (): void => { selectElement(null) }
    window.addEventListener('blur', handleBlur)

    return () => { removeSelection(); removeMultiSelection(); window.removeEventListener('blur', handleBlur) }
  }, [selectElement, selectElements])

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
    document.title = name
  }, [filePath])

  // ── Menu action dispatcher ────────────────────────────────────────────────────

  useEffect(() => {
    return window.api.onMenuAction(async (action) => {
      switch (action) {
        case 'undo':               history.undo();               break
        case 'redo':               history.redo();               break
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
    history.replaceDocument(() => resetToEmpty())
    window.api.restoreMainWindowBounds()
  }

  async function handleOpen(): Promise<boolean> {
    if (isDirty && !await confirmDiscard()) return false
    const path = await window.api.openFile()
    if (!path) return false
    try {
      const json  = await window.api.readFile(path)
      const state = deserializeSession(json)
      history.replaceDocument(() => {
        loadSession({ ...state, filePath: path, isDirty: false })
        selectElements([])
      })
      window.api.restoreMainWindowBounds()
      // The Zustand subscriber above detects new maps and opens a window for each
      return true
    } catch (e) {
      await focusMainSafely()
      alert(`Could not open file:\n${errorMessage(e)}`)
      return false
    }
  }

  async function handleSave(forceDialog: boolean): Promise<boolean> {
    const pending = saveInFlight.current
    if (pending) return pending

    const operation = saveOnce(forceDialog)
    saveInFlight.current = operation
    try {
      return await operation
    } finally {
      if (saveInFlight.current === operation) saveInFlight.current = null
    }
  }

  async function saveOnce(forceDialog: boolean): Promise<boolean> {
    // Dialog and geometry IPC happen before captureSave() can issue its guarded
    // token. Remember which document initiated the operation so New, Open, or
    // Import cannot make this Save write their replacement to the old path.
    const startingGeneration = history.generation
    let path = useAppStore.getState().filePath
    try {
      if (!path || forceDialog) {
        path = await window.api.showSaveDialog()
        if (!path) return false
        if (history.generation !== startingGeneration) return false
      }

      const currentPrefs = usePrefsStore.getState().prefs

      // Capture current map window positions before serializing, so geometry
      // is saved to the file and can be restored on next open.
      if (currentPrefs.rememberWindowPositions) {
        const positions = await window.api.getMapWindowPositions()
        if (history.generation !== startingGeneration) return false
        history.suspend(() => withoutStateBroadcast(() => {
          for (const [mapId, pos] of Object.entries(positions)) {
            useAppStore.getState().updateMapConfig(mapId, {
              windowX: pos.x, windowY: pos.y,
              windowWidth: pos.width, windowHeight: pos.height
            })
          }
        }))
      }

      if (history.generation !== startingGeneration) return false
      const saveToken = history.captureSave()
      await window.api.writeFile(path, saveToken.frame.session)

      // New/Open/Import may replace the document while the asynchronous write is
      // in flight. The old snapshot reached disk, but it must not clean or rename
      // the replacement document.
      if (!history.markSaved(saveToken, path)) {
        await focusMainSafely()
        alert('The session changed before the save completed. Please save again.')
        return false
      }

      // Record this as the last-used file path for the auto-reopen preference.
      const newPrefs: Preferences = { ...currentPrefs, lastFilePath: path }
      usePrefsStore.getState().setPrefs(newPrefs)
      window.api.savePreferences(newPrefs as unknown as Record<string, unknown>)

      // Fine-grained map edits can arrive while the write is in flight. The file
      // is valid, but those newer changes remain dirty and Save & Quit must wait
      // for another save rather than discarding them.
      if (useAppStore.getState().isDirty) {
        await focusMainSafely()
        alert('The session changed while it was being saved. Recent changes are still unsaved.')
        return false
      }

      return true
    } catch (e) {
      // markSaved() is deliberately after the awaited write, so this path leaves
      // the document unclean and does not adopt a proposed Save As path.
      await focusMainSafely()
      alert(`Could not save file:\n${errorMessage(e)}`)
      return false
    }
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
      await focusMainSafely()
      alert(`Could not parse file:\n${errorMessage(e)}`)
    }
  }

  async function handleExport(): Promise<void> {
    const path = await window.api.showCsvSaveDialog()
    if (!path) return
    try {
      const tsv = exportSpreadsheet(useAppStore.getState())
      await window.api.writeFile(path, tsv)
    } catch (e) {
      await focusMainSafely()
      alert(`Could not export file:\n${errorMessage(e)}`)
    }
  }

  async function confirmDiscard(): Promise<boolean> {
    await window.api.focusMainWindow()
    return window.confirm('You have unsaved changes. Discard them?')
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className={styles.root}>
      <ScoreWindow onOpenStarterPicker={() => setShowStarterPicker(true)} />

      {importPreview && (
        <ImportPreview
          fileName={importPreview.fileName}
          result={importPreview.result}
          onCancel={() => setImportPreview(null)}
          onConfirm={() => {
            const { sessionMeta, elements, collections, dimensions, scores } = importPreview.result
            history.replaceUndoable(() => {
              loadSession({
                filePath: null, isDirty: true,
                sessionMeta, elements, collections, dimensions, scores, maps: [],
                // Selection defaults to none — consistent with the rest of the app.
                // Previously auto-selected the first element/dimension, which
                // contradicted the "selection is driven by map dot clicks" model.
                selectedElementId:   null,
                selectedDimensionId: null,
                selectedCollectionId: null,
                activeTab: 'elements'
              })
              selectElements([])
            })
            setImportPreview(null)
          }}
        />
      )}

      {showStarterPicker      && <StarterListPicker       onClose={() => setShowStarterPicker(false)} />}
      {showChooseDimensions   && <ChooseDimensions        onClose={() => setShowChooseDimensions(false)} />}
      {showCreateSemantic     && <CreateSemanticMap       onClose={() => setShowCreateSemantic(false)} />}
      {showPreferences      && <PreferencesDialog    onClose={() => setShowPreferences(false)} />}

      {showQuitConfirm && (
        <div className={styles.quitOverlay}>
          <div className={styles.quitBox}>
            <p><strong>Unsaved Changes</strong><br />
              If you quit now, your changes will be lost.</p>
            <div className={styles.quitButtons}>
              <button className={styles.quitCancel} onClick={() => setShowQuitConfirm(false)}>Cancel</button>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className={styles.quitSave} onClick={async () => {
                  if (await handleSave(false)) window.api.confirmQuit()
                }}>Save & Quit</button>
                <button className={styles.quitConfirm} onClick={() => window.api.confirmQuit()}>Quit Without Saving</button>
              </div>
            </div>
          </div>
        </div>
      )}

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
