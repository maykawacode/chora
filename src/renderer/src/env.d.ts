/// <reference types="vite/client" />

declare module 'canvas2svg' {
  class C2S extends CanvasRenderingContext2D {
    constructor(width: number, height: number)
    getSerializedSvg(fixNamedEntities?: boolean): string
  }
  export default C2S
}

// ── window.api type declarations ─────────────────────────────────────────────
//
// These types must stay in sync with the actual object exposed by
// src/preload/index.ts. TypeScript cannot verify them automatically because
// the preload and renderer are separate bundles — update both if you add
// or remove API surface.

interface Window {
  api: {
    // File I/O
    openFile:          () => Promise<string | null>
    showSaveDialog:    () => Promise<string | null>
    openCsvFile:       () => Promise<string | null>
    showCsvSaveDialog: () => Promise<string | null>
    readFile:          (path: string) => Promise<string>
    writeFile:         (path: string, data: string) => Promise<void>

    // Menu actions (Score Window only) — callback receives action string without 'menu:' prefix
    onMenuAction: (cb: (action: string) => void) => () => void

    // Map window management
    openMap:      (mapId: string, stateJson: string) => void
    closeMap:     (mapId: string) => void
    closeAllMaps: () => void
    signalReady:  () => void    // map renderer calls this after mounting IPC listeners
    setModalOpen: (open: boolean) => void
    focusMainWindow: () => Promise<void>

    // Application history
    historyBegin: () => void
    historyEnd:   () => void
    onHistoryTransaction: (cb: (ownerId: number, phase: 'begin' | 'end') => void) => () => void
    setHistoryAvailability: (canUndo: boolean, canRedo: boolean) => void

    // Preferences
    getPrefsSync:         () => Record<string, unknown>
    loadPreferences:      () => Promise<Record<string, unknown>>
    savePreferences:      (prefs: Record<string, unknown>) => void
    getMapWindowPositions: () => Promise<Record<string, { x: number; y: number; width: number; height: number }>>
    restoreMainWindowBounds: () => void

    // Outbound state broadcasts (Score Window → maps)
    broadcastState:     (stateJson: string) => void
    broadcastScore:     (elementId: string, dimensionId: string, value: number) => void
    broadcastMapConfig: (mapId: string, changes: Record<string, unknown>) => void
    broadcastElement:   (elementId: string, changes: Record<string, unknown>) => void
    broadcastNewCollection: (id: string, name: string) => void
    broadcastSelection:      (elementId: string | null) => void
    broadcastMultiSelection: (ids: string[]) => void
    broadcastPrefs:          (prefs: Record<string, unknown>) => void

    // Inbound listeners (map windows) — each returns a cleanup function
    onPrefs:   (cb: (prefs: Record<string, unknown>) => void) => () => void
    onMapInit: (cb: (mapId: string, stateJson: string) => void) => () => void
    onState:   (cb: (stateJson: string) => void) => () => void
    onScore:   (cb: (elementId: string, dimensionId: string, value: number) => void) => () => void

    // Inbound listeners (Score Window) — each returns a cleanup function
    onMapConfig:          (cb: (mapId: string, changes: Record<string, unknown>) => void) => () => void
    onMapClosed:          (cb: (mapId: string) => void) => () => void
    onElementUpdate:      (cb: (elementId: string, changes: Record<string, unknown>) => void) => () => void
    onCollectionAdd:      (cb: (id: string, name: string) => void) => () => void
    onSelection:          (cb: (elementId: string | null) => void) => () => void
    onMultiSelection:     (cb: (ids: string[]) => void) => () => void

    // Quit confirmation
    onQuitRequested: (cb: () => void) => () => void
    confirmQuit:     () => void
  }
}
