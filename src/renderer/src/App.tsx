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

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useAppStore } from './store/appStore'
import { usePrefsStore } from './store/prefsStore'
import { history } from './store/history'
import { ScoreWindow, type ScorePanesLayout } from './components/ScoreWindow/ScoreWindow'
import { CreateMapDialog } from './components/maps/CreateMap'
import { StarterListPicker } from './components/ScoreWindow/StarterListPicker'
import { ImportPreview } from './components/ImportPreview'
import { PreferencesDialog } from './components/PreferencesDialog'
import { showStatusNotice } from './components/ScoreWindow/statusLine'
import { WelcomeDialog, type StartHandlers } from './components/WelcomeDialog'
import { ConfirmationDisc } from './components/ConfirmationDisc'
import { UpdateNoticeDialog } from './components/UpdateNoticeDialog'
import { CANCEL_MODAL_EVENT, ModalShell } from './components/ModalShell'
import { serializeSession } from './lib/parser'
import {
  chooseSpreadsheetImport,
  exportDocument,
  openBundledExample,
  openDocument,
  download,
  saveDocument,
  type ImportPreviewData
} from './lib/documentWorkflows'
import type { CartesianMapConfig, SemanticMapConfig, Element, Dimension, MapType } from './lib/types'
import { hostCapabilities } from './lib/host'
import { CHORA_COPYRIGHT, CHORA_LICENSE, CHORA_NAME, CHORA_PRONUNCIATION, CHORA_TAGLINE } from './lib/identity'
import styles from './App.module.css'
import { encodeMapStateEnvelope } from '../../shared/contracts'
import type { UpdateNotice } from '../../shared/updateNotice'

type StoreState = ReturnType<typeof useAppStore.getState>


function AboutDialog({ version, onClose }: { version: string; onClose: () => void }): React.JSX.Element {
  return (
    <ModalShell
      overlayClassName={styles.aboutOverlay}
      dialogClassName={styles.aboutDialog}
      onClose={onClose}
      labelledBy="about-dialog-title"
    >
      <h1 className={styles.aboutTitle} id="about-dialog-title">
        {CHORA_NAME}
        <span className={styles.aboutSay} aria-label={CHORA_PRONUNCIATION.label}>{CHORA_PRONUNCIATION.text}</span>
      </h1>
      <p className={styles.aboutTagline}>{CHORA_TAGLINE}</p>
      <p className={styles.aboutVersion}>
        Version {version}{hostCapabilities().kind === 'browser' ? ' (web)' : ''}
      </p>
      <p className={styles.aboutCopyright}>
        {CHORA_COPYRIGHT} · <a className={styles.aboutLink} href={CHORA_LICENSE.href} target="_blank" rel="noreferrer">{CHORA_LICENSE.label}</a>
      </p>
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

/**
 * The one dialog in front of the Score Window. Welcome, an import preview and
 * an update notice are separate layers beneath it: a confirmation can open
 * over each of them.
 */
type Dialog =
  | { kind: 'quit' | 'discard' | 'replace-on-import' | 'starters' | 'settings' | 'about' }
  | { kind: 'create-map'; type: MapType }

type Confirmation = Extract<Dialog['kind'], 'quit' | 'discard' | 'replace-on-import'>

const CONFIRMATIONS: Record<Confirmation, { title: string; detail: ReactNode; actionLabel: string }> = {
  'quit':              { title: 'Quit without saving?',     detail: <>Unsaved changes<br />will be lost.</>, actionLabel: 'Yes, quit' },
  'discard':           { title: 'Discard unsaved changes?', detail: <>Unsaved changes<br />will be lost.</>, actionLabel: 'Discard changes' },
  'replace-on-import': { title: 'Replace current session?', detail: <>Existing data<br />will be replaced.</>, actionLabel: 'Replace session' }
}

const isConfirmation = (dialog: Dialog | null): dialog is { kind: Confirmation } =>
  dialog !== null && dialog.kind in CONFIRMATIONS

interface AppProps {
  /** Host-supplied surface beside the Score Window (the browser's map tiles). */
  workspace?: ReactNode
  /** Host wrapper around the Score Window (the browser's collapsible dock). */
  scoreFrame?: (score: ReactNode) => ReactNode
  /** Host layout showing several Score views side by side (the browser). */
  scorePanes?: ScorePanesLayout
  /** Host a start page in place of the Welcome disc (the browser's), which can also be closed. */
  startPage?: (start: StartHandlers & { onClose: () => void }) => ReactNode
}

export function App({ workspace, scoreFrame, scorePanes, startPage }: AppProps = {}): React.JSX.Element {
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

  const [dialog,        setDialog]        = useState<Dialog | null>(null)
  const [importPreview, setImportPreview] = useState<ImportPreviewData | null>(null)
  const [updateNotice,  setUpdateNotice]  = useState<UpdateNotice | null>(null)
  const closeDialog = (): void => setDialog(null)

  // True while any modal is open — used to bring the Score Window to the front
  // so it is not obscured by map BrowserWindows
  const isModalOpen = showWelcome || dialog !== null || importPreview !== null || updateNotice !== null

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

  // Modal state read from inside the update-notice callback, which resolves
  // long after the render that scheduled it. Seeded with the first render's
  // values so it is correct even if the answer arrives immediately.
  const modalSnapshot = useRef({ showWelcome, isModalOpen })
  const welcomeAtLaunch = useRef(showWelcome)

  useEffect(() => () => {
    discardConfirmationResolver.current?.(false)
    discardConfirmationResolver.current = null
  }, [])

  /** Abandons every transient modal draft before the application evaluates quit. */
  function cancelOpenModalViews(): void {
    window.dispatchEvent(new Event(CANCEL_MODAL_EVENT))
    setShowWelcome(false)
    setDialog(null)
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
      openDocument(prefs.lastFilePath).then(loaded => {
        // Auto-reopen initially suppresses Welcome, so failure restores a
        // recovery path instead of leaving an unexplained empty window.
        if (!loaded) setShowWelcome(true)
      })
    }
  }, [])

  // ── Update notice ────────────────────────────────────────────────────────────
  //
  // The check runs in the main process from app.whenReady(), so asking for it
  // here usually costs nothing. The Welcome dialog is never held waiting on it:
  // a notice that arrives late simply layers above whatever is already there.

  useEffect(() => {
    let cancelled = false

    void window.api.getUpdateNotice().then(notice => {
      if (cancelled || !notice) return
      if (notice.id === usePrefsStore.getState().prefs.dismissedNoticeId) return

      // Only interrupt a launch that is still sitting where it started. If the
      // user has already picked a file, opened Settings, or begun an import,
      // the moment for a notice has passed and it waits for the next launch.
      const { showWelcome: welcomeOpen, isModalOpen: anyModalOpen } = modalSnapshot.current
      if (anyModalOpen && !welcomeOpen) return
      if (welcomeAtLaunch.current && !welcomeOpen) return

      setUpdateNotice(notice)
    })

    return () => { cancelled = true }
  }, [])

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

    // Dimension property change from a map window's right-click modal, applied
    // the same way as element updates.
    const removeDimensionUpdate = window.api.onDimensionUpdate((dimensionId, changes) => {
      const before = useAppStore.getState()
      if (!before.dimensions.some(dimension => dimension.id === dimensionId)) return
      withoutStateBroadcast(() => before.updateDimension(dimensionId, changes as Partial<Dimension>))
      window.api.broadcastState(encodeStateEnvelope(useAppStore.getState()))
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
        setDialog({ kind: 'quit' })
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
      removeDimensionUpdate()
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

  useEffect(() => {
    modalSnapshot.current = { showWelcome, isModalOpen }
  }, [showWelcome, isModalOpen])

  // ── Title bar ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    const name = filePath ? filePath.split('/').pop() ?? filePath : 'Untitled'
    // The browser tab shows the name as the page banner does, without the
    // .chora/.mtda extension; the desktop window title keeps it.
    document.title = hostCapabilities().kind === 'browser'
      ? name.replace(/\.(chora|mtda)$/i, '') || 'Untitled'
      : name
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
        case 'download-copy':      notifyDownload('copy'); break
        case 'import-spreadsheet': await handleImport();          break
        case 'export-spreadsheet': await handleExport();          break
        case 'create-cartesian':   setDialog({ kind: 'create-map', type: 'cartesian' }); break
        case 'create-semantic':    setDialog({ kind: 'create-map', type: 'semantic' });  break
        case 'preferences':        setDialog({ kind: 'settings' }); break
        case 'about':              setDialog({ kind: 'about' });    break
        case 'start-page':         setShowWelcome(true);          break
      }
    })
  }, [filePath, isDirty])   // eslint-disable-line react-hooks/exhaustive-deps

  // ── File handlers ─────────────────────────────────────────────────────────────

  /**
   * Records the notice as seen and closes it.
   *
   * Following the link counts as seeing it too: someone who has already opened
   * the releases page does not need telling again on the next launch.
   */
  function dismissUpdateNotice(notice: UpdateNotice): void {
    const updated = { ...usePrefsStore.getState().prefs, dismissedNoticeId: notice.id }
    usePrefsStore.getState().setPrefs(updated)
    window.api.savePreferences(updated)
    window.api.broadcastPrefs(updated)
    setUpdateNotice(null)
  }

  function notifyDownload(kind: Parameters<typeof download>[0]): void {
    showStatusNotice(`Download started: ${download(kind)}`)
  }

  /** Whether unsaved changes may go: none, or the user agreed to discard them. */
  async function mayReplaceDocument(): Promise<boolean> {
    return !isDirty || await confirmDiscard()
  }

  async function handleNew(): Promise<void> {
    if (!await mayReplaceDocument()) return
    history.replaceDocument(() => resetToEmpty())
    window.api.restoreMainWindowBounds()
  }

  async function handleOpen(): Promise<boolean> {
    return await mayReplaceDocument() && openDocument()
  }

  async function handleOpenExample(): Promise<boolean> {
    return await mayReplaceDocument() && openBundledExample()
  }

  async function handleSave(forceDialog: boolean): Promise<boolean> {
    // The browser saves by downloading; the download counts as the save.
    const host = hostCapabilities()
    if (host.documentSave === 'download') {
      // The first download of an untitled study asks for its name.
      if (host.nameUntitledDocument && !await host.nameUntitledDocument()) return false
      notifyDownload('save')
      return true
    }
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
    if (hostCapabilities().exportByDownload) {
      notifyDownload('spreadsheet')
      return
    }
    await exportDocument()
  }

  async function confirmDiscard(): Promise<boolean> {
    await window.api.focusMainWindow()
    discardConfirmationResolver.current?.(false)
    setDialog({ kind: 'discard' })
    return new Promise(resolve => {
      discardConfirmationResolver.current = resolve
    })
  }

  function resolveDiscardConfirmation(confirmed: boolean): void {
    setDialog(null)
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
    setDialog(null)
    setImportPreview(null)
  }

  /** What a confirmation disc's arrow and dismissal do. */
  function confirmationAnswers(kind: Confirmation): { onAction: () => void; onCancel: () => void } {
    switch (kind) {
      case 'quit':              return { onAction: () => window.api.confirmQuit(), onCancel: closeDialog }
      case 'discard':           return { onAction: () => resolveDiscardConfirmation(true), onCancel: () => resolveDiscardConfirmation(false) }
      case 'replace-on-import': return { onAction: applyImportPreview, onCancel: closeDialog }
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className={styles.root}>
      {(scoreFrame ?? (score => score))(
        <ScoreWindow onOpenStarterPicker={() => setDialog({ kind: 'starters' })} panes={scorePanes} />
      )}
      {workspace}

      {importPreview && (
        <ImportPreview
          fileName={importPreview.fileName}
          result={importPreview.result}
          onCancel={() => setImportPreview(null)}
          onConfirm={() => {
            if (hasDocumentContent) setDialog({ kind: 'replace-on-import' })
            else applyImportPreview()
          }}
        />
      )}

      {dialog?.kind === 'starters'    && <StarterListPicker onClose={closeDialog} />}
      {dialog?.kind === 'create-map'  && <CreateMapDialog type={dialog.type} onClose={closeDialog} />}
      {dialog?.kind === 'settings'    && <PreferencesDialog onClose={closeDialog} />}
      {dialog?.kind === 'about'       && <AboutDialog version={appVersion} onClose={closeDialog} />}

      {isConfirmation(dialog) && (
        <ConfirmationDisc fixed {...CONFIRMATIONS[dialog.kind]} {...confirmationAnswers(dialog.kind)} />
      )}

      {showWelcome && (() => {
        const start: StartHandlers = {
          onExample: async () => {
            const loaded = await handleOpenExample()
            if (loaded) setShowWelcome(false)
          },
          onNew: async () => {
            await handleNew()
            setShowWelcome(false)
          },
          onOpen: async () => {
            const loaded = await handleOpen()
            if (loaded) setShowWelcome(false)
          }
        }
        return startPage
          ? startPage({ ...start, onClose: () => setShowWelcome(false) })
          : <WelcomeDialog {...start} />
      })()}

      {updateNotice && (
        <UpdateNoticeDialog
          notice={updateNotice}
          onOpen={() => {
            // window.open is refused by windowSecurity.ts and handed to the
            // system browser, which re-checks the https scheme the notice
            // parser already required.
            window.open(updateNotice.url, '_blank')
            dismissUpdateNotice(updateNotice)
          }}
          onDismiss={() => dismissUpdateNotice(updateNotice)}
        />
      )}
    </div>
  )
}
