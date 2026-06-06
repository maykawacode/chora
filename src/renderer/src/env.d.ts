/// <reference types="vite/client" />

interface Window {
  api: {
    // File I/O
    openFile:          () => Promise<string | null>
    showSaveDialog:    () => Promise<string | null>
    openCsvFile:       () => Promise<string | null>
    showCsvSaveDialog: () => Promise<string | null>
    readFile:          (path: string) => Promise<string>
    writeFile:         (path: string, data: string) => Promise<void>

    // Menu (Score Window)
    onMenuAction: (cb: (action: string) => void) => () => void

    // Map window management
    openMap:      (mapId: string, stateJson: string) => void
    closeAllMaps: () => void
    signalReady:  () => void
    setModalOpen: (open: boolean) => void

    // State broadcast (Score Window → maps)
    broadcastState:     (stateJson: string) => void
    broadcastScore:     (elementId: string, dimensionId: string, value: number) => void
    broadcastMapConfig: (mapId: string, changes: Record<string, unknown>) => void

    // Listeners (map windows)
    onMapInit: (cb: (mapId: string, stateJson: string) => void) => () => void
    onState:   (cb: (stateJson: string) => void) => () => void
    onScore:   (cb: (elementId: string, dimensionId: string, value: number) => void) => () => void

    // Listeners (Score Window)
    onMapConfig:  (cb: (mapId: string, changes: Record<string, unknown>) => void) => () => void
    onMapClosed:  (cb: (mapId: string) => void) => () => void
  }
}
