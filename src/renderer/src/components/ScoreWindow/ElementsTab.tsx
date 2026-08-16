// ── ElementsTab ───────────────────────────────────────────────────────────────
//
// Left pane: scrollable list of elements with a color dot, the add-input in the
// next list position, and keyboard navigation (↑ ↓ for selection,
// Delete/Backspace to trigger delete).
//
// Right pane: detail editor for the selected element, ordered name, color,
// shape, weight, and definition.
//
// Multi-selection:
//   Shift-click and Cmd/Ctrl-click extend the selection, as do Shift+↑ ↓. The
//   list writes to the same selectedElementIds the map windows use for lasso
//   selection, so a selection made here lights up on every open map and a
//   lasso drawn on a map arrives here with the same highlighted group.
//   The detail pane edits the anchor element, which is drawn in full amber.
//
// Delete behavior:
//   - Multi-selection → always confirms, whatever the pref says
//   - Single element → confirmation overlay only if confirmDeleteElement is ON
//   - There is no delete button in the UI; the keyboard is the only trigger.

import { useRef, useState, useEffect, KeyboardEvent } from 'react'
import { useAppStore } from '../../store/appStore'
import { history, SCORE_HISTORY_OWNER } from '../../store/history'
import { usePrefsStore } from '../../store/prefsStore'
import { ELEMENT_SHAPES, ELEMENT_SHAPE_SYMBOLS } from '../../lib/types'
import { useResizableSplitPane } from './useResizableSplitPane'
import { formatRange, numericRange, openWeight } from '../../lib/numericRange'
import { ConfirmationDisc } from '../ConfirmationDisc'
import styles from './DataTab.module.css'

export function ElementsTab(): React.JSX.Element {
  const elements         = useAppStore(s => s.elements)
  const selectedId       = useAppStore(s => s.selectedElementId)
  const selectedIds      = useAppStore(s => s.selectedElementIds)
  const addElement       = useAppStore(s => s.addElement)
  const duplicateElement = useAppStore(s => s.duplicateElement)
  const updateElement    = useAppStore(s => s.updateElement)
  const removeElement    = useAppStore(s => s.removeElement)
  const selectElement    = useAppStore(s => s.selectElement)
  const selectElements   = useAppStore(s => s.selectElements)
  const clearSelection   = useAppStore(s => s.clearElementSelection)
  const prefs            = usePrefsStore(s => s.prefs)

  const selected    = elements.find(e => e.id === selectedId) ?? null
  const weightRange = numericRange(elements.map(element => element.weight), 1)

  // sortAlpha=false → display in creation/import order (the store's canonical order)
  // sortAlpha=true  → display alphabetically by name (view-only; store order is unchanged)
  const [sortAlpha, setSortAlpha] = useState(false)

  // Derived display list — sorted copy when sortAlpha is on, raw store array otherwise.
  // All list rendering and keyboard navigation uses this, never `elements` directly,
  // so ↑ ↓ keys walk the visible order regardless of which sort is active.
  const displayElements = sortAlpha
    ? [...elements].sort((a, b) => a.name.localeCompare(b.name))
    : elements

  const [newName,   setNewName]   = useState('')
  const [confirmIds, setConfirmIds] = useState<string[]>([])
  const addInputRef = useRef<HTMLInputElement>(null)
  const splitPane = useResizableSplitPane()

  // Cmd+D (Mac) / Ctrl+D (Windows/Linux) duplicates the selected element.
  // Registered at document level so it fires even when a detail field has
  // focus, not just when the list itself is focused.
  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent): void => {
      // Match the unmodified application shortcut exactly. In particular,
      // Cmd/Ctrl+Shift+D belongs to New Semantic Map and must not also create
      // a duplicate in this renderer-level handler.
      if (e.metaKey !== e.ctrlKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'd' && selectedId) {
        e.preventDefault()   // prevent browser "add to bookmarks" default
        // The shortcut is intentionally active inside detail fields. Split it
        // from any focus-to-blur edit so Duplicate remains its own Undo step.
        history.end(SCORE_HISTORY_OWNER)
        history.run(SCORE_HISTORY_OWNER, () => duplicateElement(selectedId))
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [selectedId, duplicateElement])

  // ── Handlers ─────────────────────────────────────────────────────────────────

  function handleAdd(): void {
    const name = newName.trim()
    if (!name) return
    addElement(name, prefs.defaultElementColor)
    setNewName('')
    addInputRef.current?.focus()
  }

  function handleAddKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Enter') handleAdd()
  }

  // Route a delete request through the confirmation preference.
  // A multi-element delete always confirms: the pref exists to spare the user a
  // prompt for one element, not to drop a dozen of them without a word.
  function requestDelete(ids: string[]): void {
    if (ids.length === 0) return
    if (ids.length > 1 || prefs.confirmDeleteElement) {
      setConfirmIds(ids)  // show the confirmation overlay
    } else {
      removeElement(ids[0])
    }
  }

  // Whatever a click or arrow key would delete: the whole multi-selection when
  // there is one, otherwise just the anchor.
  function deletionTargets(): string[] {
    return selectedIds.length > 1 ? selectedIds : (selectedId ? [selectedId] : [])
  }

  // ── Selection ────────────────────────────────────────────────────────────────
  //
  // Both handlers keep selectedElementId pointing at a row that is actually
  // highlighted, so the detail pane is never editing something invisible.

  function handleRowClick(e: React.MouseEvent, id: string): void {
    // Shift extends from the anchor over the visible order, and leaves the
    // anchor where it is so the same range can be redrawn from it.
    if (e.shiftKey && selectedId) {
      const a = displayElements.findIndex(el => el.id === selectedId)
      const b = displayElements.findIndex(el => el.id === id)
      if (a >= 0 && b >= 0) {
        const [lo, hi] = a < b ? [a, b] : [b, a]
        selectElements(displayElements.slice(lo, hi + 1).map(el => el.id))
        return
      }
    }

    // Cmd/Ctrl grows a selection out of whatever is already highlighted; if
    // nothing is, the current single selection becomes its first member.
    if (e.metaKey || e.ctrlKey) {
      const base = selectedIds.length > 0 ? selectedIds : (selectedId ? [selectedId] : [])
      const next = base.includes(id) ? base.filter(x => x !== id) : [...base, id]
      selectElements(next)
      if (next.includes(id)) selectElement(id)
      else if (next.length > 0) selectElement(next[next.length - 1])
      return
    }

    clearSelection()
    selectElement(id)
  }

  function handleListKeyDown(e: KeyboardEvent<HTMLUListElement>): void {
    if (!selectedId || displayElements.length === 0) return
    // Use displayElements so ↑ ↓ navigate the visible order, not the store order
    const idx = displayElements.findIndex(el => el.id === selectedId)

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const next = e.key === 'ArrowDown' ? idx + 1 : idx - 1
      if (next < 0 || next >= displayElements.length) return
      e.preventDefault()
      const targetId = displayElements[next].id

      if (e.shiftKey) {
        const base = selectedIds.length > 0 ? selectedIds : [selectedId]
        // Stepping onto an already-highlighted row means the user reversed
        // direction: shrink by dropping the row being left, rather than grow.
        selectElements(base.includes(targetId)
          ? base.filter(x => x !== selectedId)
          : [...base, targetId])
      } else {
        clearSelection()
      }
      selectElement(targetId)
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
      requestDelete(deletionTargets())
    }
  }

  const confirmElements = confirmIds
    .map(id => elements.find(e => e.id === id))
    .filter((e): e is NonNullable<typeof e> => e != null)

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className={styles.tab} ref={splitPane.containerRef} style={splitPane.containerStyle}>
      {/* ── List pane ── */}
      <div className={styles.listPane} style={splitPane.leftPaneStyle}>
        {/* Header doubles as a sort toggle — click cycles creation order ↔ A–Z */}
        <button
          className={styles.listHeaderBtn}
          onClick={() => setSortAlpha(s => !s)}
          title={sortAlpha ? 'Showing A–Z — click for creation order' : 'Showing creation order — click for A–Z'}
        >
          <span>Elements ({elements.length})</span>
          <span className={styles.sortBadge}>{sortAlpha ? 'A–Z' : '⇅'}</span>
        </button>

        <div className={styles.listEditor}>
          {elements.length > 0 && (
            <ul
              className={styles.list}
              tabIndex={0}
              onKeyDown={handleListKeyDown}
              aria-label="Elements"
              role="listbox"
              aria-multiselectable
            >
              {displayElements.map(el => {
                const inGroup = selectedIds.includes(el.id)
                return (
                  <li
                    key={el.id}
                    className={[
                      styles.listItem,
                      inGroup ? styles.multiSelected : '',
                      el.id === selectedId ? styles.selected : ''
                    ].filter(Boolean).join(' ')}
                    role="option"
                    aria-selected={inGroup || el.id === selectedId}
                    onClick={e => handleRowClick(e, el.id)}
                  >
                    <span className={styles.shapeIcon} style={{ color: el.color }}>{ELEMENT_SHAPE_SYMBOLS[el.shape]}</span>
                    <span className={styles.name}>{el.name}</span>
                  </li>
                )
              })}
            </ul>
          )}

          <div className={styles.addRow}>
            <input
              ref={addInputRef}
              className={styles.addInput}
              placeholder="New element…"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={handleAddKeyDown}
            />
          </div>
        </div>
      </div>

      {/* ── Resize handle ── */}
      <div className={styles.resizeHandle} style={splitPane.dividerStyle} {...splitPane.dividerProps} />

      {/* ── Detail pane ── */}
      <div className={styles.detailPane} style={splitPane.rightPaneStyle}>
        <div className={styles.fieldRow}>
          <label className={styles.label}>Name</label>
          {/* key forces input reset when selection changes, avoiding stale defaultValue */}
          <input
            key={`name-${selected?.id ?? 'none'}`}
            className={styles.poleInput}
            defaultValue={selected?.name ?? ''}
            disabled={!selected}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Tab') e.currentTarget.blur() }}
            onBlur={e => {
              const v = e.target.value.trim()
              if (selected && v && v !== selected.name) updateElement(selected.id, { name: v })
            }}
          />
        </div>
        <div className={styles.fieldRow}>
          <label className={styles.label}>Color</label>
          <input
            type="color"
            className={styles.colorInput}
            value={selected?.color ?? '#9d9d53'}
            disabled={!selected}
            onFocus={() => history.begin(SCORE_HISTORY_OWNER)}
            onBlur={() => history.end(SCORE_HISTORY_OWNER)}
            onChange={e => {
              history.begin(SCORE_HISTORY_OWNER)
              if (selected) updateElement(selected.id, { color: e.target.value })
            }}
          />
        </div>
        <div className={styles.fieldRow}>
          <label className={styles.label}>Shape</label>
          <div className={styles.shapePicker}>
            {ELEMENT_SHAPES.map(shape => (
              <button
                key={shape}
                className={`${styles.shapeBtn} ${selected?.shape === shape ? styles.shapeBtnActive : ''}`}
                disabled={!selected}
                onClick={() => selected && updateElement(selected.id, { shape })}
                title={shape.charAt(0).toUpperCase() + shape.slice(1)}
              >
                {ELEMENT_SHAPE_SYMBOLS[shape]}
              </button>
            ))}
          </div>
        </div>
        <div className={styles.fieldRow}>
          <label className={styles.label}>Weight</label>
          {/* Batch transforms and map edits can change weight without changing
              selection. Include the live value so this uncontrolled field
              cannot display—or later write back—a stale pre-transform value. */}
          <input
            key={`weight-${selected?.id ?? 'none'}-${selected?.weight ?? 1}`}
            className={styles.weightInput}
            type="number"
            min={0}
            defaultValue={selected?.weight ?? 1}
            disabled={!selected}
            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
            onBlur={e => selected && updateElement(selected.id, {
              weight: openWeight(Number(e.target.value))
            })}
          />
          <span className={styles.range}>{formatRange(weightRange)}</span>
        </div>
        <textarea
          className={styles.description}
          placeholder="Definition…"
          value={selected?.definition ?? ''}
          disabled={!selected}
          onFocus={() => history.begin(SCORE_HISTORY_OWNER)}
          onBlur={() => history.end(SCORE_HISTORY_OWNER)}
          onChange={e => {
            history.begin(SCORE_HISTORY_OWNER)
            if (selected) updateElement(selected.id, { definition: e.target.value })
          }}
        />
      </div>

      {/* ── Delete confirmation overlay ── */}
      {confirmElements.length > 0 && (
        <ConfirmationDisc
          title={confirmElements.length === 1
            ? <>Delete <strong>{confirmElements[0].name}</strong>?</>
            : <>Delete <strong>{confirmElements.length} elements</strong>?</>
          }
          detail={confirmElements.length === 1 ? 'Its scores will be lost.' : 'Their scores will be lost.'}
          actionLabel="Delete"
          onCancel={() => setConfirmIds([])}
          onAction={() => {
            history.run(SCORE_HISTORY_OWNER, () => {
              for (const el of confirmElements) removeElement(el.id)
            })
            clearSelection()
            setConfirmIds([])
          }}
        />
      )}
    </div>
  )
}
