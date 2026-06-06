/// <reference types="vite/client" />

interface Window {
  api: {
    openFile: () => Promise<string | null>
    showSaveDialog: () => Promise<string | null>
    openCsvFile: () => Promise<string | null>
    showCsvSaveDialog: () => Promise<string | null>
    readFile: (path: string) => Promise<string>
    writeFile: (path: string, data: string) => Promise<void>
    onMenuAction: (cb: (action: string) => void) => () => void
  }
}
