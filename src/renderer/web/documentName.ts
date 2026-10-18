import { create } from 'zustand'
import { useAppStore } from '../src/store/appStore'
import { history } from '../src/store/history'
import { dispatchMenuAction } from './browserApi'
import { inPlaceSaving, suggestSaveName } from './fileAccess'
import { pseudoPath } from './files'

// Naming the study's file in the browser. The name is the file name only (not
// the study name stored inside the file) and always comes from the
// document's path, as on the desktop.
//
// Where Save downloads, renaming points the document at the new name; the next
// Save downloads under it, and the first Save of an untitled study asks for a
// name. Renaming is not an edit: it never marks the study Unsaved or enters
// history (history.retarget).
//
// Where Save writes in place, the name belongs to the file on disk, which a
// web page cannot rename, so Rename opens Save As with the new name filled in.
// The first Save already asks for a name through the browser's save picker.

const EXTENSION = /\.(chora|mtda)$/i
// Control characters are unsafe in file names, so the pattern matches them on purpose.
const UNSAFE = /[/\\:*?"<>|\u0000-\u001f]/g // eslint-disable-line no-control-regex
const MAX_LENGTH = 120

/** The typed name as a .chora file name, or null when nothing usable is left. */
export function toFileName(typed: string): string | null {
  const base = typed.trim().replace(EXTENSION, '').replace(UNSAFE, '-').replace(/\s+/g, ' ').trim()
  return base ? `${base.slice(0, MAX_LENGTH)}.chora` : null
}

/** A document path's file name without its extension, or "Untitled". */
export function displayName(filePath: string | null): string {
  const name = filePath ? (filePath.split('/').pop() ?? '').replace(EXTENSION, '') : ''
  return name || 'Untitled'
}

/** The current file name without its extension, for editing. */
export function editableName(): string {
  return displayName(useAppStore.getState().filePath)
}

/** Renames the document's file; false when the typed name is unusable. */
export function renameDocument(typed: string): boolean {
  const fileName = toFileName(typed)
  if (!fileName) return false
  const current = useAppStore.getState().filePath?.split('/').pop()
  if (fileName === current) return true
  if (inPlaceSaving) {
    suggestSaveName(fileName)
    dispatchMenuAction('save-as')
  } else {
    history.retarget(pseudoPath(fileName))
  }
  return true
}

// ── Name prompt ───────────────────────────────────────────────────────────────

export type PromptPurpose = 'rename' | 'first-save'

interface NamePromptState {
  request: { purpose: PromptPurpose; resolve: (name: string | null) => void } | null
}

export const useNamePrompt = create<NamePromptState>(() => ({ request: null }))

/** Shows the name dialog; resolves to the typed name, or null when cancelled. */
function askName(purpose: PromptPurpose): Promise<string | null> {
  useNamePrompt.getState().request?.resolve(null)
  return new Promise(resolve => useNamePrompt.setState({ request: { purpose, resolve } }))
}

export function answerNamePrompt(name: string | null): void {
  const request = useNamePrompt.getState().request
  if (!request) return
  useNamePrompt.setState({ request: null })
  request.resolve(name)
}

/** File › Rename…: asks for a name, then renames. */
export async function promptRename(): Promise<void> {
  const name = await askName('rename')
  if (name !== null) renameDocument(name)
}

/**
 * Before the first download of an untitled study: asks for its name and
 * points the document at it. False when cancelled, so nothing downloads.
 */
export async function nameUntitledDocument(): Promise<boolean> {
  if (useAppStore.getState().filePath) return true
  const name = await askName('first-save')
  const fileName = name === null ? null : toFileName(name)
  if (!fileName) return false
  history.retarget(pseudoPath(fileName))
  return true
}
