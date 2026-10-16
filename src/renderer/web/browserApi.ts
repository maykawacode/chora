import type { ChoraApi, HistoryPhase, Preferences } from '../../shared/contracts'
import { mergePreferences } from '../../shared/contracts'
import sampleDataset from '../../../resources/examples/sample-dataset.chora?raw'
import orientationHelp from '../../../resources/help/orientation.md?raw'

// Browser implementation of the desktop preload bridge.
//
// On the desktop each map is a separate renderer holding a mirror store, kept
// in step over IPC. In the browser every map tile renders from the Score
// Window's own store, so the broadcast/receive pairs have nothing to carry and
// are no-ops here. History transactions are the exception: map tiles still
// open and close them, and they must reach the shared history controller,
// which App subscribes to through onHistoryTransaction.

const PREFS_KEY = 'chora:preferences'
const BROWSER_OWNER = -1   // History owner for map tiles; per-surface owners arrive in step 1d

const BUNDLED_EXAMPLES: Record<string, string> = { 'sample-dataset.chora': sampleDataset }
const HELP_DOCUMENTS: Record<string, string> = { 'orientation.md': orientationHelp }

type HistoryListener = (ownerId: number, phase: HistoryPhase) => void
const historyListeners = new Set<HistoryListener>()

function listen<T>(set: Set<T>, cb: T): () => void {
  set.add(cb)
  return () => { set.delete(cb) }
}

const noop = (): void => {}
const noSubscription = (): (() => void) => noop

function readStoredPreferences(): Preferences {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    return mergePreferences(raw ? JSON.parse(raw) : {})
  } catch {
    return mergePreferences()
  }
}

function bundled(table: Record<string, string>, fileName: string): Promise<string> {
  const text = table[fileName]
  return text === undefined
    ? Promise.reject(new Error(`No bundled file named ${fileName}`))
    : Promise.resolve(text)
}

function emitHistory(phase: HistoryPhase): void {
  for (const cb of historyListeners) cb(BROWSER_OWNER, phase)
}

export const browserApi: ChoraApi = {
  // Files: pickers and writes arrive in phase 2. Null is the desktop "cancelled" result.
  openFile:           () => Promise.resolve(null),
  showSaveDialog:     () => Promise.resolve(null),
  openCsvFile:        () => Promise.resolve(null),
  showCsvSaveDialog:  () => Promise.resolve(null),
  readFile:           () => Promise.reject(new Error('File access is not available in the browser yet')),
  writeFile:          () => Promise.reject(new Error('File access is not available in the browser yet')),
  readBundledExample: (fileName) => bundled(BUNDLED_EXAMPLES, fileName),
  readHelpDocument:   (fileName) => bundled(HELP_DOCUMENTS, fileName),

  getAppVersion:   () => __CHORA_VERSION__,
  getUpdateNotice: () => Promise.resolve(null),
  onMenuAction:    noSubscription,

  // Map windows: tiled layout arrives in step 1c.
  openMap:          noop,
  closeMap:         noop,
  controlMapWindow: noop,
  signalReady:      noop,
  setModalOpen:     noop,
  focusMainWindow:  () => Promise.resolve(),

  historyBegin:          () => emitHistory('begin'),
  historyEnd:            () => emitHistory('end'),
  setHistoryModalOpen:   noop,
  onHistoryTransaction:  (cb) => listen(historyListeners, cb),
  setHistoryAvailability: noop,

  getPrefsSync:    readStoredPreferences,
  loadPreferences: () => Promise.resolve(readStoredPreferences()),
  savePreferences: (prefs) => {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)) } catch { /* storage unavailable */ }
  },
  getMapWindowPositions:   () => Promise.resolve({}),
  restoreMainWindowBounds: noop,

  // One shared store: nothing to mirror.
  broadcastState:         noop,
  broadcastScore:         noop,
  broadcastMapConfig:     noop,
  broadcastElement:       noop,
  broadcastDimension:     noop,
  broadcastNewCollection: noop,
  broadcastSelection:     noop,
  broadcastMultiSelection: noop,
  broadcastPrefs:         noop,
  onPrefs:           noSubscription,
  onMapInit:         noSubscription,
  onState:           noSubscription,
  onScore:           noSubscription,
  onMapConfig:       noSubscription,
  onMapClosed:       noSubscription,
  onElementUpdate:   noSubscription,
  onDimensionUpdate: noSubscription,
  onCollectionAdd:   noSubscription,
  onSelection:       noSubscription,
  onMultiSelection:  noSubscription,
  onCancelModals:    noSubscription,
  onQuitRequested:   noSubscription,
  confirmQuit:       noop
}
