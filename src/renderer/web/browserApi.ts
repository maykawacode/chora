import type { ChoraApi, HistoryPhase, MenuAction, Preferences } from '../../shared/contracts'
import { mergePreferences } from '../../shared/contracts'
import { pickFile, readHeldFile } from './files'
import {
  chooseSaveTarget, hasHandle, inPlaceSaving, openStudyWithHandle, takeSuggestedSaveName, writeToHandle
} from './fileAccess'
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

// Bundled files load when first asked for, keeping them out of startup.
const BUNDLED: Record<string, () => Promise<{ default: string }>> = {
  'sample-dataset.chora': () => import('../../../resources/examples/sample-dataset.chora?raw'),
  'orientation.md': () => import('../../../resources/help/orientation.md?raw')
}

type HistoryListener = (ownerId: number, phase: HistoryPhase) => void
const historyListeners = new Set<HistoryListener>()

// The strip's commands (StripCommands.tsx) and shortcuts stand in for the desktop application menu.
type MenuListener = (action: MenuAction) => void
const menuListeners = new Set<MenuListener>()

export function dispatchMenuAction(action: MenuAction): void {
  for (const cb of menuListeners) cb(action)
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

async function bundled(fileName: string): Promise<string> {
  const load = BUNDLED[fileName]
  if (!load) throw new Error(`No bundled file named ${fileName}`)
  return (await load()).default
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
  showSaveDialog:     () => inPlaceSaving
    ? chooseSaveTarget(takeSuggestedSaveName(choraFileName()))
    : Promise.resolve(null),
  openCsvFile:        () => pickFile('.tsv,.csv,.txt'),
  showCsvSaveDialog:  () => Promise.resolve(null),
  readFile:           readHeldFile,
  writeFile:          (path, text) => hasHandle(path)
    ? writeToHandle(path, text)
    : Promise.reject(new Error('This browser saves by downloading.')),
  readBundledExample: bundled,
  readHelpDocument:   bundled,

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
  // No Edit menu to enable; Undo and Redo are shortcuts only.
  setHistoryAvailability: noop,

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
