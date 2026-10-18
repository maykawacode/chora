// ── Data list pieces ──────────────────────────────────────────────────────────
//
// What the Elements, Dimensions and Collections lists share: their layout,
// arrow keys and Delete on the list, deletion that asks first when the
// preference says so, and the add row under the list. Each view keeps its own
// rows, detail fields and confirmation wording.

import { useRef, useState, type FocusEvent, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from 'react'
import { usePrefsStore } from '../../store/prefsStore'
import { hostCapabilities } from '../../lib/host'
import { openWeight } from '../../lib/numericRange'
import { useResizableSplitPane } from './useResizableSplitPane'
import styles from './DataTab.module.css'

/**
 * The view's list-and-detail layout. Where the host stacks these views
 * (narrowDataViews: the browser), the detail stays below the list at every
 * width and list names stay on one line, shortened with "…"; `stacked` tells the view to title its rows
 * with their full names. Elsewhere, list and detail sit side by side until
 * the view is too narrow.
 */
export function useDataViewLayout(): {
  stacked: boolean
  splitPane: ReturnType<typeof useResizableSplitPane>
  className: string
} {
  const stacked = hostCapabilities().narrowDataViews
  return {
    stacked,
    splitPane: useResizableSplitPane(stacked ? 'stacked' : 'responsive'),
    className: stacked ? `${styles.tab} ${styles.stacked}` : styles.tab
  }
}

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

/**
 * Handlers that select a field's whole value when it is entered, so typing
 * replaces it. A click's mouseup would otherwise drop the selection again in
 * some browsers, so the mouseup that ends the entering click is cancelled; a
 * later click inside the field places the caret as usual.
 */
export const selectAllOnEntry = {
  onPointerDown: (e: PointerEvent<HTMLInputElement>): void => {
    if (document.activeElement !== e.currentTarget) e.currentTarget.dataset.entering = ''
  },
  onFocus: (e: FocusEvent<HTMLInputElement>): void => e.currentTarget.select(),
  onMouseUp: (e: MouseEvent<HTMLInputElement>): void => {
    if (!('entering' in e.currentTarget.dataset)) return
    delete e.currentTarget.dataset.entering
    e.preventDefault()
  }
}

/**
 * A typed weight as a whole number of at least 1. Anything not a number gives
 * back `current` when it is already such a whole number, otherwise 1.
 */
function wholeWeight(typed: string, current: number): number {
  const value = Number(typed.trim())
  if (typed.trim() !== '' && Number.isFinite(value)) return Math.max(1, Math.round(value))
  return Number.isInteger(current) && current >= 1 ? current : 1
}

/**
 * The weight field of an element or dimension, applied on blur or Enter.
 * Key it on the live weight as well as the item: Randomize and a map's
 * dialogs change a weight without changing selection, and an uncontrolled
 * field keyed on the item alone would show, and write back, the old value.
 *
 * `wholeNumbers` (stacked views) makes it a plain text field with no stepper
 * arrows: the typed value is rounded to a whole number of at least 1, and
 * anything that is not a number restores the current weight if it is a whole
 * number, otherwise 1. Otherwise it is a number field taking any value of at
 * least 0. Entering a whole-number field selects its value (selectAllOnEntry).
 */
export function WeightInput({ weight, disabled, wholeNumbers, onCommit }: {
  weight: number
  disabled: boolean
  wholeNumbers: boolean
  onCommit: (weight: number) => void
}): React.JSX.Element {
  return (
    <input
      className={styles.weightInput}
      type={wholeNumbers ? 'text' : 'number'}
      inputMode={wholeNumbers ? 'numeric' : undefined}
      min={wholeNumbers ? undefined : 0}
      aria-label="Weight"
      {...(wholeNumbers ? selectAllOnEntry : {})}
      defaultValue={weight}
      disabled={disabled}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
      onBlur={e => {
        if (!wholeNumbers) return onCommit(openWeight(Number(e.target.value)))
        const next = wholeWeight(e.target.value, weight)
        e.currentTarget.value = String(next)
        if (next !== weight) onCommit(next)
      }}
    />
  )
}
