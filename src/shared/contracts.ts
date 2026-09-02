export type MarkMode = 'none' | 'circle' | 'element'
export type ElementShape = 'circle' | 'square' | 'triangle' | 'diamond'

export interface Preferences {
  rememberWindowPositions: boolean
  defaultMarks: MarkMode
  defaultShowLabels: boolean
  defaultElementColor: string
  defaultElementShape: ElementShape
  reopenLastFile: boolean
  confirmDeleteData: boolean
  lastFilePath: string | null
  elementLabelSize: number
  dimensionLabelSize: number
  dotDefaultSize: number
  dimColorLow: string
  dimColorHigh: string
  mainWindowX: number | null
  mainWindowY: number | null
  mainWindowWidth: number
  mainWindowHeight: number
}

export const DEFAULT_PREFERENCES: Preferences = {
  rememberWindowPositions: true,
  defaultMarks: 'circle',
  defaultShowLabels: true,
  defaultElementColor: '#9d9d53',
  defaultElementShape: 'circle',
  reopenLastFile: false,
  confirmDeleteData: true,
  lastFilePath: null,
  elementLabelSize: 11,
  dimensionLabelSize: 11,
  dotDefaultSize: 6,
  dimColorLow: '#b04040',
  dimColorHigh: '#508050',
  mainWindowX: null,
  mainWindowY: null,
  mainWindowWidth: 530,
  mainWindowHeight: 800
}

type StoredPreferences = Partial<Preferences> & {
  /** Preference name used before deletion confirmation became global. */
  confirmDeleteElement?: boolean
}

// ── The one accepted color format ─────────────────────────────────────────────
//
// '#rrggbb' and nothing else, for documents and for preferences alike. It lives
// here rather than beside the renderer's color math because both processes need
// it: the main process merges preferences before any window exists, and the
// renderer validates colors read out of a session file.
//
// A color is not just decoration — it is written into a CSS background, and CSS
// backgrounds accept `url(...)`, so a color-shaped string is a place a request
// to a remote server can hide. See lib/color.ts, which re-exports these.

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

/** True only for a literal '#rrggbb' string. */
export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_COLOR.test(value)
}

/** A color from an untrusted source, or `fallback` if it is anything else. */
export function readHexColor(value: unknown, fallback: string): string {
  return isHexColor(value) ? value : fallback
}

// ── Reading stored preferences ────────────────────────────────────────────────

const bool = (value: unknown, fallback: boolean): boolean =>
  typeof value === 'boolean' ? value : fallback

const finite = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback

const finiteOrNull = (value: unknown, fallback: number | null): number | null => {
  if (value === null) return null
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? value as T : fallback

const MARK_MODES: readonly MarkMode[] = ['none', 'circle', 'element']
const SHAPES: readonly ElementShape[] = ['circle', 'square', 'triangle', 'diamond']

/**
 * Builds a complete Preferences from whatever was on disk.
 *
 * Every field is checked against its own type rather than spread over the
 * defaults. preferences.json is an ordinary user-writable file that a partial
 * write, a hand edit, or an older version can leave malformed, and the values
 * are used without further checking: window geometry goes straight to
 * setBounds, the colors reach CSS, and lastFilePath is handed to readFile at
 * startup. A wrong type used to travel all the way to the point of use.
 */
export function mergePreferences(raw: StoredPreferences = {}): Preferences {
  const stored = (raw ?? {}) as Record<string, unknown>
  const d = DEFAULT_PREFERENCES

  return {
    rememberWindowPositions: bool(stored.rememberWindowPositions, d.rememberWindowPositions),
    defaultMarks:            oneOf(stored.defaultMarks, MARK_MODES, d.defaultMarks),
    defaultShowLabels:       bool(stored.defaultShowLabels, d.defaultShowLabels),
    defaultElementColor:     readHexColor(stored.defaultElementColor, d.defaultElementColor),
    defaultElementShape:     oneOf(stored.defaultElementShape, SHAPES, d.defaultElementShape),
    reopenLastFile:          bool(stored.reopenLastFile, d.reopenLastFile),

    // Renamed when deletion confirmation stopped being element-specific; a file
    // written before that still carries the old name and is honored.
    confirmDeleteData: bool(
      stored.confirmDeleteData,
      bool(stored.confirmDeleteElement, d.confirmDeleteData)
    ),

    // Only a string is a usable path. Anything else means "no file to reopen".
    lastFilePath: typeof stored.lastFilePath === 'string' ? stored.lastFilePath : null,

    elementLabelSize:   finite(stored.elementLabelSize, d.elementLabelSize),
    dimensionLabelSize: finite(stored.dimensionLabelSize, d.dimensionLabelSize),
    dotDefaultSize:     finite(stored.dotDefaultSize, d.dotDefaultSize),
    dimColorLow:        readHexColor(stored.dimColorLow, d.dimColorLow),
    dimColorHigh:       readHexColor(stored.dimColorHigh, d.dimColorHigh),

    // Null is meaningful for x/y: it means "never positioned, so center".
    mainWindowX:      finiteOrNull(stored.mainWindowX, d.mainWindowX),
    mainWindowY:      finiteOrNull(stored.mainWindowY, d.mainWindowY),
    mainWindowWidth:  finite(stored.mainWindowWidth, d.mainWindowWidth),
    mainWindowHeight: finite(stored.mainWindowHeight, d.mainWindowHeight)
  }
}

export const MENU_ACTIONS = [
  'undo', 'redo',
  'new', 'open', 'open-example', 'save', 'save-as',
  'import-spreadsheet', 'export-spreadsheet',
  'create-cartesian', 'create-semantic',
  'preferences', 'orientation', 'about'
] as const

export type MenuAction = typeof MENU_ACTIONS[number]
export type MapWindowAction = 'close' | 'minimize' | 'zoom'
export type HistoryPhase = 'begin' | 'end'

export interface MapWindowBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface MapStateEnvelope {
  isDirty: boolean
  filePath: string | null
  session: string
  selectedElementId: string | null
  selectedElementIds: string[]
}

export function encodeMapStateEnvelope(envelope: MapStateEnvelope): string {
  return JSON.stringify(envelope)
}

export function decodeMapStateEnvelope(payload: string): MapStateEnvelope {
  const parsed = JSON.parse(payload) as Partial<MapStateEnvelope>
  if (typeof parsed.session !== 'string') throw new Error('Map state payload is missing its session')
  return {
    isDirty: parsed.isDirty ?? false,
    filePath: parsed.filePath ?? null,
    session: parsed.session,
    selectedElementId: parsed.selectedElementId ?? null,
    selectedElementIds: parsed.selectedElementIds ?? []
  }
}

export interface ChoraApi {
  openFile: () => Promise<string | null>
  showSaveDialog: () => Promise<string | null>
  openCsvFile: () => Promise<string | null>
  showCsvSaveDialog: () => Promise<string | null>
  readFile: (path: string) => Promise<string>
  writeFile: (path: string, data: string) => Promise<void>
  readBundledExample: (fileName: string) => Promise<string>
  readHelpDocument: (fileName: string) => Promise<string>
  getAppVersion: () => string
  onMenuAction: (cb: (action: MenuAction) => void) => () => void
  openMap: (mapId: string, stateJson: string) => void
  closeMap: (mapId: string) => void
  controlMapWindow: (action: MapWindowAction) => void
  signalReady: () => void
  setModalOpen: (open: boolean) => void
  focusMainWindow: () => Promise<void>
  historyBegin: () => void
  historyEnd: () => void
  setHistoryModalOpen: (open: boolean) => void
  onHistoryTransaction: (cb: (ownerId: number, phase: HistoryPhase) => void) => () => void
  setHistoryAvailability: (canUndo: boolean, canRedo: boolean) => void
  getPrefsSync: () => Preferences
  loadPreferences: () => Promise<Preferences>
  savePreferences: (prefs: Preferences) => void
  getMapWindowPositions: () => Promise<Record<string, MapWindowBounds>>
  restoreMainWindowBounds: () => void
  broadcastState: (stateJson: string) => void
  broadcastScore: (elementId: string, dimensionId: string, value: number) => void
  broadcastMapConfig: (mapId: string, changes: Record<string, unknown>) => void
  broadcastElement: (elementId: string, changes: Record<string, unknown>) => void
  broadcastNewCollection: (id: string, name: string) => void
  broadcastSelection: (elementId: string | null, clearDimension?: boolean) => void
  broadcastMultiSelection: (ids: string[]) => void
  broadcastPrefs: (prefs: Preferences) => void
  onPrefs: (cb: (prefs: Preferences) => void) => () => void
  onMapInit: (cb: (mapId: string, stateJson: string) => void) => () => void
  onState: (cb: (stateJson: string) => void) => () => void
  onScore: (cb: (elementId: string, dimensionId: string, value: number) => void) => () => void
  onMapConfig: (cb: (mapId: string, changes: Record<string, unknown>) => void) => () => void
  onMapClosed: (cb: (mapId: string) => void) => () => void
  onElementUpdate: (cb: (elementId: string, changes: Record<string, unknown>) => void) => () => void
  onCollectionAdd: (cb: (id: string, name: string) => void) => () => void
  onSelection: (cb: (elementId: string | null, clearDimension: boolean) => void) => () => void
  onMultiSelection: (cb: (ids: string[]) => void) => () => void
  onCancelModals: (cb: () => void) => () => void
  onQuitRequested: (cb: () => void) => () => void
  confirmQuit: () => void
}
