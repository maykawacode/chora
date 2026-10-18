// ── Data list pieces ──────────────────────────────────────────────────────────
//
// What the Elements, Dimensions and Collections lists share: arrow keys and
// Delete on the list, deletion that asks first when the preference says so,
// and the add row under the list. Each view keeps its own rows, detail fields
// and confirmation wording.

import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { usePrefsStore } from '../../store/prefsStore'
import styles from './DataTab.module.css'

/**
 * Keydown for a list: ↑ ↓ step through `ids` in display order, staying put at
 * either end; Delete or Backspace asks to delete. Does nothing without a
 * current item.
 */
export function listKeys({ ids, currentId, onStep, onDelete }: {
  ids: string[]
  currentId: string | null
  onStep: (id: string, shift: boolean) => void
  onDelete: () => void
}): (e: KeyboardEvent) => void {
  return e => {
    if (!currentId || ids.length === 0) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const next = ids.indexOf(currentId) + (e.key === 'ArrowDown' ? 1 : -1)
      if (next < 0 || next >= ids.length) return
      e.preventDefault()
      onStep(ids[next], e.shiftKey)
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
      onDelete()
    }
  }
}

/** Deletion that follows the confirmDeleteData preference: at once, or after the view's confirmation. */
export function useConfirmedDelete(remove: (ids: string[]) => void): {
  /** Ids awaiting confirmation; the view shows its confirmation while there are any. */
  pendingIds: string[]
  request: (ids: string[]) => void
  confirm: () => void
  cancel: () => void
} {
  const confirmFirst = usePrefsStore(s => s.prefs.confirmDeleteData)
  const [pendingIds, setPendingIds] = useState<string[]>([])
  return {
    pendingIds,
    request: ids => {
      if (ids.length === 0) return
      if (confirmFirst) setPendingIds(ids)
      else remove(ids)
    },
    confirm: () => { remove(pendingIds); setPendingIds([]) },
    cancel: () => setPendingIds([])
  }
}

/** The input under a list: Enter adds the trimmed name, then the field clears and keeps focus. */
export function AddRow({ placeholder, onAdd, children }: {
  placeholder: string
  onAdd: (name: string) => void
  /** Extra controls beside the input. */
  children?: ReactNode
}): React.JSX.Element {
  const [name, setName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <div className={styles.addRow}>
      <input
        ref={inputRef}
        className={styles.addInput}
        placeholder={placeholder}
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => {
          if (e.key !== 'Enter' || !name.trim()) return
          onAdd(name.trim())
          setName('')
          inputRef.current?.focus()
        }}
      />
      {children}
    </div>
  )
}
