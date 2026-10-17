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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function focusMainSafely(): Promise<void> {
  try { await window.api.focusMainWindow() } catch { /* alert in the caller */ }
}

async function showError(message: string, error: unknown): Promise<void> {
  await focusMainSafely()
  alert(`${message}:\n${errorMessage(error)}`)
}

function replaceWithOpenedSession(json: string, filePath: string): void {
  const state = deserializeSession(json)
  history.replaceDocument(() => {
    const store = useAppStore.getState()
    store.loadSession({ ...state, filePath, isDirty: false })
    store.selectElements([])
  })
  window.api.restoreMainWindowBounds()
}

export async function reopenLastDocument(filePath: string): Promise<boolean> {
  try {
    replaceWithOpenedSession(await window.api.readFile(filePath), filePath)
    return true
  } catch (error) {
    await showError('Could not reopen the last file', error)
    return false
  }
}

export async function openDocument(): Promise<boolean> {
  const filePath = await window.api.openFile()
  if (!filePath) return false
  try {
    replaceWithOpenedSession(await window.api.readFile(filePath), filePath)
    return true
  } catch (error) {
    await showError('Could not open file', error)
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
      await focusMainSafely()
      alert('The session changed before the save completed. Please save again.')
      return false
    }

    const newPrefs = { ...currentPrefs, lastFilePath: filePath }
    usePrefsStore.getState().setPrefs(newPrefs)
    window.api.savePreferences(newPrefs)

    if (useAppStore.getState().isDirty) {
      await focusMainSafely()
      alert('The session changed while it was being saved. Recent changes are still unsaved.')
      return false
    }
    return true
  } catch (error) {
    await showError('Could not save file', error)
    return false
  }
}

/** Base name of a document path, or the given fallback for an unsaved one. */
function documentName(fallback: string): string {
  const filePath = useAppStore.getState().filePath
  return filePath ? (filePath.split('/').pop() || fallback) : fallback
}

/** The document's name as a .chora file (legacy .mtda becomes .chora). */
export function choraFileName(): string {
  const name = documentName('Untitled.chora').replace(/\.mtda$/i, '.chora')
  return /\.chora$/i.test(name) ? name : `${name}.chora`
}

/**
 * Browser Save: downloads a snapshot of the current document and treats it as
 * saved (owner decision 2026-10-15), so the Unsaved badge clears and leaving
 * the page stops warning. The browser cannot confirm the write; the status
 * message says the download started. Returns the downloaded name.
 */
export function downloadDocument(): string {
  const fileName = choraFileName()
  const saveToken = history.captureSave()
  downloadText(fileName, saveToken.frame.session, 'application/json')
  history.markSaved(saveToken, useAppStore.getState().filePath ?? `browser:/download/${fileName}`)
  return fileName
}

/**
 * Browser Download a Copy: a snapshot of the current document that leaves its
 * save target, savepoint and Unsaved state untouched. Returns the name.
 */
export function downloadDocumentCopy(): string {
  const fileName = choraFileName()
  downloadText(fileName, serializeSession(useAppStore.getState()), 'application/json')
  return fileName
}

/** Browser Export: downloads the spreadsheet as tab-separated values. */
export function downloadSpreadsheet(): string {
  const fileName = 'chora-export.tsv'
  downloadText(fileName, exportSpreadsheet(useAppStore.getState()), 'text/tab-separated-values')
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

export async function openOrientationDocument(): Promise<string | null> {
  try {
    return await window.api.readHelpDocument('orientation.md')
  } catch (error) {
    await showError('Could not open Chora Orientation', error)
    return null
  }
}
