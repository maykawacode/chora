import { useAppStore } from '../store/appStore'
import { usePrefsStore } from '../store/prefsStore'
import { history } from '../store/history'
import { exportSpreadsheet } from './exporter'
import { parseSpreadsheet, type ImportResult } from './importer'
import { deserializeBundledExample, deserializeSession, serializeSession } from './parser'
import { downloadText } from './download'

export interface ImportPreviewData {
  fileName: string
  result: ImportResult
}

/** Brings the main window forward (desktop) and shows a message. */
async function alertUser(message: string): Promise<void> {
  try { await window.api.focusMainWindow() } catch { /* alert regardless */ }
  alert(message)
}

async function showError(message: string, error: unknown): Promise<void> {
  await alertUser(`${message}:\n${error instanceof Error ? error.message : String(error)}`)
}

/** Opens a study: the one at `reopenPath` (the last file, at launch), or one the user picks. */
export async function openDocument(reopenPath?: string): Promise<boolean> {
  const filePath = reopenPath ?? await window.api.openFile()
  if (!filePath) return false
  try {
    const state = deserializeSession(await window.api.readFile(filePath))
    history.replaceDocument(() => {
      const store = useAppStore.getState()
      store.loadSession({ ...state, filePath, isDirty: false })
      store.selectElements([])
    })
    window.api.restoreMainWindowBounds()
    return true
  } catch (error) {
    await showError(reopenPath ? 'Could not reopen the last file' : 'Could not open file', error)
    return false
  }
}

export async function openBundledExample(): Promise<boolean> {
  try {
    const json = await window.api.readBundledExample('sample-dataset.chora')
    const state = deserializeBundledExample(json)
    history.replaceUnsavedDocument(() => {
      const store = useAppStore.getState()
      store.loadSession(state)
      store.selectElements([])
    })
    window.api.restoreMainWindowBounds()
    return true
  } catch (error) {
    await showError('Could not open the bundled example', error)
    return false
  }
}

export async function saveDocument(
  forceDialog: boolean,
  withoutStateBroadcast: (fn: () => void) => void
): Promise<boolean> {
  const startingGeneration = history.generation
  let filePath = useAppStore.getState().filePath

  try {
    if (!filePath || forceDialog) {
      filePath = await window.api.showSaveDialog()
      if (!filePath || history.generation !== startingGeneration) return false
    }

    const currentPrefs = usePrefsStore.getState().prefs
    if (currentPrefs.rememberWindowPositions) {
      const positions = await window.api.getMapWindowPositions()
      if (history.generation !== startingGeneration) return false
      history.suspend(() => withoutStateBroadcast(() => {
        for (const [mapId, bounds] of Object.entries(positions)) {
          useAppStore.getState().updateMapConfig(mapId, {
            windowX: bounds.x,
            windowY: bounds.y,
            windowWidth: bounds.width,
            windowHeight: bounds.height
          })
        }
      }))
    }

    if (history.generation !== startingGeneration) return false
    const saveToken = history.captureSave()
    await window.api.writeFile(filePath, saveToken.frame.session)

    if (!history.markSaved(saveToken, filePath)) {
      await alertUser('The session changed before the save completed. Please save again.')
      return false
    }

    const newPrefs = { ...currentPrefs, lastFilePath: filePath }
    usePrefsStore.getState().setPrefs(newPrefs)
    window.api.savePreferences(newPrefs)

    if (useAppStore.getState().isDirty) {
      await alertUser('The session changed while it was being saved. Recent changes are still unsaved.')
      return false
    }
    return true
  } catch (error) {
    await showError('Could not save file', error)
    return false
  }
}

/** The document's name as a .chora file (legacy .mtda becomes .chora). */
export function choraFileName(): string {
  const filePath = useAppStore.getState().filePath
  const name = (filePath?.split('/').pop() || 'Untitled.chora').replace(/\.mtda$/i, '.chora')
  return /\.chora$/i.test(name) ? name : `${name}.chora`
}

/**
 * Browser downloads; each returns the downloaded file's name.
 * - 'save': a snapshot of the document, treated as saved (owner decision
 *   2026-10-15), so the Unsaved badge clears and leaving stops warning. The
 *   browser cannot confirm the write; the status message says it started.
 * - 'copy' (Download a Copy): a snapshot that leaves the save target,
 *   savepoint and Unsaved state untouched.
 * - 'spreadsheet' (Export): the study as tab-separated values.
 */
export function download(kind: 'save' | 'copy' | 'spreadsheet'): string {
  const state = useAppStore.getState()
  if (kind === 'spreadsheet') {
    downloadText('chora-export.tsv', exportSpreadsheet(state), 'text/tab-separated-values')
    return 'chora-export.tsv'
  }
  const fileName = choraFileName()
  if (kind === 'copy') {
    downloadText(fileName, serializeSession(state), 'application/json')
    return fileName
  }
  const saveToken = history.captureSave()
  downloadText(fileName, saveToken.frame.session, 'application/json')
  history.markSaved(saveToken, state.filePath ?? `browser:/download/${fileName}`)
  return fileName
}

export async function chooseSpreadsheetImport(): Promise<ImportPreviewData | null> {
  const filePath = await window.api.openCsvFile()
  if (!filePath) return null
  try {
    return {
      fileName: filePath.split('/').pop() ?? filePath,
      result: parseSpreadsheet(await window.api.readFile(filePath))
    }
  } catch (error) {
    await showError('Could not parse file', error)
    return null
  }
}

export async function exportDocument(): Promise<void> {
  const filePath = await window.api.showCsvSaveDialog()
  if (!filePath) return
  try {
    await window.api.writeFile(filePath, exportSpreadsheet(useAppStore.getState()))
  } catch (error) {
    await showError('Could not export file', error)
  }
}
