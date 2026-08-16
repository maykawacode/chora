// ── App.tsx — Score Window root ───────────────────────────────────────────────
//
// This is the top-level component of the Score Window (main window). It owns:
//
//   • The Zustand app state and document-workflow coordination
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
import { ConfirmationDisc } from './components/ConfirmationDisc'
import { OrientationDialog } from './components/OrientationDialog'
import { CANCEL_MODAL_EVENT, ModalShell } from './components/ModalShell'
import { serializeSession } from './lib/parser'
import {
  chooseSpreadsheetImport,
  exportDocument,
  openBundledExample,
  openDocument,
  openOrientationDocument,
  reopenLastDocument,
  saveDocument,
  type ImportPreviewData
} from './lib/documentWorkflows'
import type { CartesianMapConfig, SemanticMapConfig, Element } from './lib/types'
import styles from './App.module.css'
import { encodeMapStateEnvelope } from '../../shared/contracts'

type StoreState = ReturnType<typeof useAppStore.getState>

const REPOSITORY_URL = 'https://github.com/maykawacode/chora'

function AboutDialog({ version, onClose }: { version: string; onClose: () => void }): React.JSX.Element {
  return (
    <ModalShell
      overlayClassName={styles.aboutOverlay}
      dialogClassName={styles.aboutDialog}
      onClose={onClose}
      labelledBy="about-dialog-title"
    >
      <h1 className={styles.aboutTitle} id="about-dialog-title">Chora</h1>
      <p className={styles.aboutTagline}>Spatial reasoning for qualitative data</p>
      <p className={styles.aboutVersion}>Version {version}</p>
      <p className={styles.aboutCopyright}>Copyright © 2026 Matt Mayfield</p>
      <a className={styles.aboutLink} href={REPOSITORY_URL} target="_blank" rel="noreferrer">
        github.com/maykawacode/chora
      </a>
    </ModalShell>
  )
}

/** One canonical payload shape for every Score Window → map state push. */
function encodeStateEnvelope(state: StoreState): string {
  return encodeMapStateEnvelope({
    isDirty: state.isDirty,
    filePath: state.filePath,
    session: serializeSession(state),
    selectedElementId: state.selectedElementId,
    selectedElementIds: state.selectedElementIds
  })
}

export function App(): React.JSX.Element {
  const [appVersion] = useState(() => window.api.getAppVersion())
  const filePath      = useAppStore(s => s.filePath)
  const isDirty       = useAppStore(s => s.isDirty)
  const loadSession   = useAppStore(s => s.loadSession)
  const resetToEmpty  = useAppStore(s => s.resetToEmpty)
  const selectElement  = useAppStore(s => s.selectElement)
  const selectDimension = useAppStore(s => s.selectDimension)
  const selectElements = useAppStore(s => s.selectElements)
  const hasDocumentContent = useAppStore(s =>
    s.elements.length > 0 || s.collections.length > 0 || s.dimensions.length > 0 || s.maps.length > 0
  )

  // ── Modal visibility state ────────────────────────────────────────────────────

  // Show the welcome dialog on startup unless a file will be auto-reopened.
  // Prefs are pre-loaded before React mounts so this initial value is stable.
  const [showWelcome, setShowWelcome] = useState(() => {
    const { prefs } = usePrefsStore.getState()
    return !(prefs.reopenLastFile && !!prefs.lastFilePath)
  })

  const [showQuitConfirm,       setShowQuitConfirm]       = useState(false)
  const [showDiscardConfirm,    setShowDiscardConfirm]    = useState(false)
  const [showImportReplaceConfirm, setShowImportReplaceConfirm] = useState(false)
  const [showChooseDimensions,    setShowChooseDimensions]    = useState(false)
  const [showCreateSemantic,      setShowCreateSemantic]      = useState(false)
  const [showStarterPicker,    setShowStarterPicker]    = useState(false)
  const [showPreferences,      setShowPreferences]      = useState(false)
  const [showAbout,            setShowAbout]            = useState(false)
  const [orientationMarkdown, setOrientationMarkdown] = useState<string | null>(null)
  const [importPreview,        setImportPreview]        = useState<ImportPreviewData | null>(null)

  // True while any modal is open — used to bring the Score Window to the front
  // so it is not obscured by map BrowserWindows
  const isModalOpen = showWelcome || showChooseDimensions || showCreateSemantic ||
                      showStarterPicker || showPreferences || showAbout || showQuitConfirm || showDiscardConfirm ||
                      showImportReplaceConfirm || orientationMarkdown !== null || importPreview !== null

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
  // New/Open await the user's decision without falling back to a native dialog.
  const discardConfirmationResolver = useRef<((confirmed: boolean) => void) | null>(null)

  useEffect(() => () => {
    discardConfirmationResolver.current?.(false)
    discardConfirmationResolver.current = null
  }, [])

  /** Abandons every transient modal draft before the application evaluates quit. */
  function cancelOpenModalViews(): void {
    window.dispatchEvent(new Event(CANCEL_MODAL_EVENT))
    setShowWelcome(false)
    setShowQuitConfirm(false)
    setShowDiscardConfirm(false)
    setShowImportReplaceConfirm(false)
    setShowChooseDimensions(false)
    setShowCreateSemantic(false)
    setShowStarterPicker(false)
    setShowPreferences(false)
    setShowAbout(false)
    setOrientationMarkdown(null)
    setImportPreview(null)

    const resolveDiscard = discardConfirmationResolver.current
    discardConfirmationResolver.current = null
    resolveDiscard?.(false)
  }

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
      reopenLastDocument(prefs.lastFilePath).then(loaded => {
        // Auto-reopen initially suppresses Welcome, so failure restores a
        // recovery path instead of leaving an unexplained empty window.
        if (!loaded) setShowWelcome(true)
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

    const removeCancelModals = window.api.onCancelModals(cancelOpenModalViews)

    // Quit requested — show confirm dialog if dirty, otherwise let it proceed
    const removeQuitRequested = window.api.onQuitRequested(() => {
      cancelOpenModalViews()
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
      removeCancelModals()
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
    const removeSelection = window.api.onSelection((elementId, clearDimension) => {
      selectElement(elementId)
      if (clearDimension) selectDimension(null)
    })

    const removeMultiSelection = window.api.onMultiSelection((ids) => {
      selectElements(ids)
    })

    const handleBlur = (): void => { selectElement(null) }
    window.addEventListener('blur', handleBlur)

    return () => { removeSelection(); removeMultiSelection(); window.removeEventListener('blur', handleBlur) }
  }, [selectElement, selectDimension, selectElements])

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
        case 'open-example':
          if (await handleOpenExample()) setShowWelcome(false)
          break
        case 'save':               await handleSave(false);       break
        case 'save-as':            await handleSave(true);        break
        case 'import-spreadsheet': await handleImport();          break
        case 'export-spreadsheet': await handleExport();          break
        case 'create-cartesian':   setShowChooseDimensions(true); break
        case 'create-semantic':    setShowCreateSemantic(true);   break
        case 'preferences':        setShowPreferences(true);      break
        case 'about':              setShowAbout(true);            break
        case 'orientation':
          setOrientationMarkdown(await openOrientationDocument())
          break
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
    return openDocument()
  }

  async function handleOpenExample(): Promise<boolean> {
    if (isDirty && !await confirmDiscard()) return false
    return openBundledExample()
  }

  async function handleSave(forceDialog: boolean): Promise<boolean> {
    const pending = saveInFlight.current
    if (pending) return pending

    const operation = saveDocument(forceDialog, withoutStateBroadcast)
    saveInFlight.current = operation
    try {
      return await operation
    } finally {
      if (saveInFlight.current === operation) saveInFlight.current = null
    }
  }

  async function handleImport(): Promise<void> {
    const preview = await chooseSpreadsheetImport()
    if (preview) setImportPreview(preview)
  }

  async function handleExport(): Promise<void> {
    await exportDocument()
  }

  async function confirmDiscard(): Promise<boolean> {
    await window.api.focusMainWindow()
    discardConfirmationResolver.current?.(false)
    setShowDiscardConfirm(true)
    return new Promise(resolve => {
      discardConfirmationResolver.current = resolve
    })
  }

  function resolveDiscardConfirmation(confirmed: boolean): void {
    setShowDiscardConfirm(false)
    const resolve = discardConfirmationResolver.current
    discardConfirmationResolver.current = null
    resolve?.(confirmed)
  }

  function applyImportPreview(): void {
    if (!importPreview) return
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
    setShowImportReplaceConfirm(false)
    setImportPreview(null)
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
            if (hasDocumentContent) setShowImportReplaceConfirm(true)
            else applyImportPreview()
          }}
        />
      )}

      {showStarterPicker      && <StarterListPicker       onClose={() => setShowStarterPicker(false)} />}
      {showChooseDimensions   && <ChooseDimensions        onClose={() => setShowChooseDimensions(false)} />}
      {showCreateSemantic     && <CreateSemanticMap       onClose={() => setShowCreateSemantic(false)} />}
      {showPreferences      && <PreferencesDialog    onClose={() => setShowPreferences(false)} />}

      {orientationMarkdown !== null && (
        <OrientationDialog markdown={orientationMarkdown} onClose={() => setOrientationMarkdown(null)} />
      )}

      {showAbout && <AboutDialog version={appVersion} onClose={() => setShowAbout(false)} />}

      {showQuitConfirm && (
        <ConfirmationDisc
          fixed
          title="Quit without saving?"
          detail={<>Unsaved changes<br />will be lost.</>}
          actionLabel="Yes, quit"
          onCancel={() => setShowQuitConfirm(false)}
          onAction={() => window.api.confirmQuit()}
        />
      )}

      {showDiscardConfirm && (
        <ConfirmationDisc
          fixed
          title="Discard unsaved changes?"
          detail={<>Unsaved changes<br />will be lost.</>}
          actionLabel="Discard changes"
          onCancel={() => resolveDiscardConfirmation(false)}
          onAction={() => resolveDiscardConfirmation(true)}
        />
      )}

      {showImportReplaceConfirm && (
        <ConfirmationDisc
          fixed
          title="Replace current session?"
          detail={<>Existing data<br />will be replaced.</>}
          actionLabel="Replace session"
          onCancel={() => setShowImportReplaceConfirm(false)}
          onAction={applyImportPreview}
        />
      )}

      {showWelcome && (
        <WelcomeDialog
          onExample={async () => {
            const loaded = await handleOpenExample()
            if (loaded) setShowWelcome(false)
          }}
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
