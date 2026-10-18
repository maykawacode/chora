import { holdFile, pseudoPath } from './files'

// In-place saving where the browser offers file pickers that return writable
// handles (feature-detected, never by browser name). Elsewhere Save stays a
// download. A handle lives only in memory, keyed by the document's
// pseudo-path; after a reload the next Save asks for a location again.

interface PickerType { description: string; accept: Record<string, string[]> }
interface WritableHandle {
  readonly name: string
  getFile: () => Promise<File>
  createWritable: () => Promise<{ write: (data: string) => Promise<void>; close: () => Promise<void> }>
  queryPermission?: (d: { mode: 'readwrite' }) => Promise<PermissionState>
  requestPermission?: (d: { mode: 'readwrite' }) => Promise<PermissionState>
}
interface PickerHost {
  showOpenFilePicker?: (o: { types: PickerType[]; excludeAcceptAllOption?: boolean }) => Promise<WritableHandle[]>
  showSaveFilePicker?: (o: { suggestedName: string; types: PickerType[] }) => Promise<WritableHandle>
}

const STUDY_TYPES: PickerType[] = [
  { description: 'Chora study', accept: { 'application/json': ['.chora', '.mtda'] } }
]
const SAVE_TYPES: PickerType[] = [
  { description: 'Chora study', accept: { 'application/json': ['.chora'] } }
]

const COPY_HINT = 'Use File › Download a Copy to keep your work.'

const host = (): PickerHost => globalThis as unknown as PickerHost

/**
 * Whether Save can write to a chosen file. Pickers need a secure context and
 * are refused in cross-origin frames, so both are checked too.
 */
function detectInPlaceSaving(): boolean {
  const h = host()
  return typeof h.showOpenFilePicker === 'function' &&
    typeof h.showSaveFilePicker === 'function' &&
    globalThis.isSecureContext === true &&
    (typeof window === 'undefined' || window.self === window.top)
}

export const inPlaceSaving = detectInPlaceSaving()

const handles = new Map<string, WritableHandle>()

const isAbort = (e: unknown): boolean => e instanceof DOMException && e.name === 'AbortError'

function pickerError(e: unknown, action: string): Error {
  const blocked = e instanceof DOMException && (e.name === 'SecurityError' || e.name === 'NotAllowedError')
  return new Error(blocked
    ? `The browser blocked the window to ${action}. Try again from the File menu. ${COPY_HINT}`
    : `${e instanceof Error ? e.message : String(e)} ${COPY_HINT}`)
}

/** Open with a writable handle; the study can then be saved back to the same file. */
export async function openStudyWithHandle(): Promise<string | null> {
  let handle: WritableHandle
  try {
    [handle] = await host().showOpenFilePicker!({ types: STUDY_TYPES })
  } catch (e) {
    if (isAbort(e)) return null
    throw pickerError(e, 'open a file')
  }
  const text = await (await handle.getFile()).text()
  const path = holdFile(handle.name, text)
  handles.set(path, handle)
  return path
}

// A Save As started by Rename suggests the new name, once.
let suggestedName: string | null = null

export function suggestSaveName(name: string): void {
  suggestedName = name
}

/** The name the save picker should offer: a pending Rename's, else `fallback`. */
export function takeSuggestedSaveName(fallback: string): string {
  const name = suggestedName ?? fallback
  suggestedName = null
  return name
}

/** Save As target. Resolves to its pseudo-path, or null when cancelled. */
export async function chooseSaveTarget(suggestedName: string): Promise<string | null> {
  let handle: WritableHandle
  try {
    handle = await host().showSaveFilePicker!({ suggestedName, types: SAVE_TYPES })
  } catch (e) {
    if (isAbort(e)) return null
    throw pickerError(e, 'choose where to save')
  }
  const path = pseudoPath(handle.name)
  handles.set(path, handle)
  return path
}

export function hasHandle(path: string | null): boolean {
  return path !== null && handles.has(path)
}

/**
 * Writes the whole file and resolves only once the browser has closed (and so
 * committed) it. Any failure rejects, so the shared Save never marks it saved.
 */
export async function writeToHandle(path: string, text: string): Promise<void> {
  const handle = handles.get(path)
  if (!handle) throw new Error(`This file can no longer be saved in place. Choose Save As. ${COPY_HINT}`)
  try {
    if (handle.queryPermission && (await handle.queryPermission({ mode: 'readwrite' })) !== 'granted') {
      if ((await handle.requestPermission?.({ mode: 'readwrite' })) !== 'granted') {
        throw new DOMException('Permission to save this file was not given.', 'NotAllowedError')
      }
    }
    const writable = await handle.createWritable()
    await writable.write(text)
    await writable.close()
  } catch (e) {
    const denied = e instanceof DOMException && e.name === 'NotAllowedError'
    throw new Error(denied
      ? `Chora was not given permission to save ${handle.name}. ${COPY_HINT}`
      : `${e instanceof Error ? e.message : String(e)} ${COPY_HINT}`, { cause: e })
  }
}
