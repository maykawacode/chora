import { useAppStore } from '../store/appStore'
import { usePrefsStore } from '../store/prefsStore'
import { history } from '../store/history'
import { exportSpreadsheet } from './exporter'
import { parseSpreadsheet, type ImportResult } from './importer'
import { deserializeBundledExample, deserializeSession } from './parser'

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
    const json = await window.api.readBundledExample('campus-study-spaces.mtda')
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
