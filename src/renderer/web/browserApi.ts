import type { ChoraApi, HistoryPhase, MenuAction, Preferences } from '../../shared/contracts'
import { mergePreferences } from '../../shared/contracts'
import sampleDataset from '../../../resources/examples/sample-dataset.chora?raw'
import orientationHelp from '../../../resources/help/orientation.md?raw'
import { pickFile, readHeldFile } from './files'
import { chooseSaveTarget, hasHandle, inPlaceSaving, openStudyWithHandle, writeToHandle } from './fileAccess'
import { choraFileName } from '@renderer/lib/documentWorkflows'

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

// The browser menu bar and shortcuts stand in for the desktop application menu.
type MenuListener = (action: MenuAction) => void
const menuListeners = new Set<MenuListener>()
let availability = { canUndo: false, canRedo: false }

export function dispatchMenuAction(action: MenuAction): void {
  for (const cb of menuListeners) cb(action)
}

/** Undo/Redo availability as last reported by App (desktop: menu enablement). */
export function historyAvailability(): { canUndo: boolean; canRedo: boolean } {
  return availability
}

function listen<T>(set: Set<T>, cb: T): () => void {
  set.add(cb)
  return () => { set.delete(cb) }
}

const noop = (): void => {}
const noSubscription = (): (() => void) => noop

// Desktop-only behaviour stays off in the browser whatever was stored: there
// is no last file to reopen, no window to position, and no update check.
const BROWSER_OVERRIDES: Partial<Preferences> = {
  reopenLastFile: false,
  lastFilePath: null,
  rememberWindowPositions: false,
  checkForUpdatesOnLaunch: false
}

function readStoredPreferences(): Preferences {
  let stored = {}
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (raw) stored = JSON.parse(raw)
  } catch { /* unreadable or blocked storage: defaults */ }
  return { ...mergePreferences(stored), ...BROWSER_OVERRIDES }
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
  // Files open through the browser picker. Where the browser offers writable
  // file handles (fileAccess.ts) Save and Save As write in place; elsewhere
  // saving is a download (lib/host.ts documentSave) and the save dialog is
  // never reached. Spreadsheet export is always a download.
  openFile:           () => inPlaceSaving ? openStudyWithHandle() : pickFile('.chora,.mtda'),
  showSaveDialog:     () => inPlaceSaving ? chooseSaveTarget(choraFileName()) : Promise.resolve(null),
  openCsvFile:        () => pickFile('.tsv,.csv,.txt'),
  showCsvSaveDialog:  () => Promise.resolve(null),
  readFile:           readHeldFile,
  writeFile:          (path, text) => hasHandle(path)
    ? writeToHandle(path, text)
    : Promise.reject(new Error('This browser saves by downloading.')),
  readBundledExample: (fileName) => bundled(BUNDLED_EXAMPLES, fileName),
  readHelpDocument:   (fileName) => bundled(HELP_DOCUMENTS, fileName),

  getAppVersion:   () => __CHORA_VERSION__,
  getUpdateNotice: () => Promise.resolve(null),
  onMenuAction:    (cb) => listen(menuListeners, cb),

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
  setHistoryAvailability: (canUndo, canRedo) => { availability = { canUndo, canRedo } },

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
