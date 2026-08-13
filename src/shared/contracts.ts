export type MarkMode = 'none' | 'circle' | 'element'

export interface Preferences {
  rememberWindowPositions: boolean
  defaultMarks: MarkMode
  defaultShowLabels: boolean
  defaultElementColor: string
  reopenLastFile: boolean
  confirmDeleteElement: boolean
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
  reopenLastFile: false,
  confirmDeleteElement: true,
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

export function mergePreferences(raw: Partial<Preferences> = {}): Preferences {
  return { ...DEFAULT_PREFERENCES, ...raw }
}

export const MENU_ACTIONS = [
  'undo', 'redo',
  'new', 'open', 'save', 'save-as',
  'import-spreadsheet', 'export-spreadsheet',
  'create-cartesian', 'create-semantic',
  'preferences', 'orientation'
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
  onQuitRequested: (cb: () => void) => () => void
  confirmQuit: () => void
}
