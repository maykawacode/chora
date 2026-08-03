// ── ElementsTab ───────────────────────────────────────────────────────────────
//
// Left pane: scrollable list of elements with a color dot, add-input at the
// bottom, and keyboard navigation (↑ ↓ for selection, Delete/Backspace to
// trigger delete).
//
// Right pane: detail editor for the selected element, ordered name, color,
// shape, weight, definition, collections — the single-line fields first, as one
// aligned column, then the two blocks that need room.
//
// Multi-selection:
//   Shift-click and Cmd/Ctrl-click extend the selection, as do Shift+↑ ↓. The
//   list writes to the same selectedElementIds the map windows use for lasso
//   selection, so a selection made here lights up on every open map — and a
//   lasso drawn on a map arrives here ready to be assigned to a collection.
//   Only the collection rows act on the whole selection; the rest of the detail
//   pane edits the anchor element, which is the one drawn in full amber.
//
// Delete behavior:
//   - Multi-selection → always confirms, whatever the pref says
//   - Single element → confirmation overlay only if confirmDeleteElement is ON
//   - There is no delete button in the UI; the keyboard is the only trigger.

import { useRef, useState, useEffect, KeyboardEvent } from 'react'
import { useAppStore } from '../../store/appStore'
import { history, SCORE_HISTORY_OWNER } from '../../store/history'
import { usePrefsStore } from '../../store/prefsStore'
import { ELEMENT_SHAPES } from '../../lib/types'
import type { ElementShape } from '../../lib/types'
import styles from './DataTab.module.css'

const SHAPE_SYMBOL: Record<ElementShape, string> = {
  circle:   '●',
  square:   '■',
  triangle: '▲',
  diamond:  '◆'
}

// How many of a target set belong to a collection, expressed as the three
// states a membership control can be in. "mixed" only ever arises for a
// multi-selection; a single element is simply in or out.
type Membership = 'all' | 'none' | 'mixed'

export function ElementsTab(): React.JSX.Element {
  const elements         = useAppStore(s => s.elements)
  const collections      = useAppStore(s => s.collections)
  const selectedId       = useAppStore(s => s.selectedElementId)
  const selectedIds      = useAppStore(s => s.selectedElementIds)
  const addElement       = useAppStore(s => s.addElement)
  const duplicateElement = useAppStore(s => s.duplicateElement)
  const updateElement    = useAppStore(s => s.updateElement)
  const removeElement    = useAppStore(s => s.removeElement)
  const selectElement    = useAppStore(s => s.selectElement)
  const selectElements   = useAppStore(s => s.selectElements)
  const clearSelection   = useAppStore(s => s.clearElementSelection)
  const setCollection    = useAppStore(s => s.setElementsCollection)
  const prefs            = usePrefsStore(s => s.prefs)

  const selected    = elements.find(e => e.id === selectedId) ?? null

  // sortAlpha=false → display in creation/import order (the store's canonical order)
  // sortAlpha=true  → display alphabetically by name (view-only; store order is unchanged)
  const [sortAlpha, setSortAlpha] = useState(false)

  // Derived display list — sorted copy when sortAlpha is on, raw store array otherwise.
  // All list rendering and keyboard navigation uses this, never `elements` directly,
  // so ↑ ↓ keys walk the visible order regardless of which sort is active.
  const displayElements = sortAlpha
    ? [...elements].sort((a, b) => a.name.localeCompare(b.name))
    : elements

  // What a collection row acts on. Falls back to the anchor so the control
  // behaves identically whether or not a multi-selection is active.
  const targetIds = selectedIds.length > 0
    ? selectedIds
    : (selectedId ? [selectedId] : [])

  const byId = new Map(elements.map(el => [el.id, el]))

  function membership(collectionId: string): Membership {
    if (targetIds.length === 0) return 'none'
    let n = 0
    for (const id of targetIds) {
      if (byId.get(id)?.collectionIds.includes(collectionId)) n++
    }
    return n === 0 ? 'none' : n === targetIds.length ? 'all' : 'mixed'
  }

  // Drives the header link, which offers whichever action is still available.
  const allOn = collections.length > 0 && targetIds.length > 0 &&
    collections.every(c => membership(c.id) === 'all')

  const [newName,   setNewName]   = useState('')
  const [confirmIds, setConfirmIds] = useState<string[]>([])
  const [detailWidth, setDetailWidth] = useState(160)
  const addInputRef = useRef<HTMLInputElement>(null)
  const dragRef     = useRef<{ startX: number; startWidth: number } | null>(null)
  const tabRef      = useRef<HTMLDivElement>(null)

  // Bring Score Window to front when the delete confirmation overlay opens
  useEffect(() => {
    if (confirmIds.length > 0) window.api.setModalOpen(true)
  }, [confirmIds])

  // Set detail pane to 50% of the tab container width on first render
  useEffect(() => {
    if (tabRef.current) {
      const w = tabRef.current.getBoundingClientRect().width
      if (w > 0) setDetailWidth(Math.round(w / 2))
    }
  }, [])

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

  function onHandleMouseDown(e: React.MouseEvent): void {
    dragRef.current = { startX: e.clientX, startWidth: detailWidth }
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return
      const delta = dragRef.current.startX - ev.clientX
      setDetailWidth(Math.max(120, Math.min(320, dragRef.current.startWidth + delta)))
    }
    const onUp = () => {
      dragRef.current = null
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

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

  // ── Membership ───────────────────────────────────────────────────────────────
  //
  // A mixed selection resolves to one answer rather than each element flipping
  // independently: the first click brings everyone in, the next takes everyone
  // out. Flipping individually would make the row's own state unreadable.
  function toggleMembership(collectionId: string): void {
    if (targetIds.length === 0) return
    setCollection(targetIds, collectionId, membership(collectionId) !== 'all')
  }

  const confirmElements = confirmIds
    .map(id => elements.find(e => e.id === id))
    .filter((e): e is NonNullable<typeof e> => e != null)

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className={styles.tab} ref={tabRef}>
      {/* ── List pane ── */}
      <div className={styles.listPane}>
        {/* Header doubles as a sort toggle — click cycles creation order ↔ A–Z */}
        <button
          className={styles.listHeaderBtn}
          onClick={() => setSortAlpha(s => !s)}
          title={sortAlpha ? 'Showing A–Z — click for creation order' : 'Showing creation order — click for A–Z'}
        >
          <span>Elements ({elements.length})</span>
          <span className={styles.sortBadge}>{sortAlpha ? 'A–Z' : '⇅'}</span>
        </button>

        {elements.length === 0
          ? <p className={styles.emptyHint}>Begin by entering a list of elements.</p>
          : (
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
                    <span className={styles.shapeIcon} style={{ color: el.color }}>{SHAPE_SYMBOL[el.shape]}</span>
                    <span className={styles.name}>{el.name}</span>
                  </li>
                )
              })}
            </ul>
          )
        }

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

      {/* ── Resize handle ── */}
      <div className={styles.resizeHandle} onMouseDown={onHandleMouseDown} />

      {/* ── Detail pane ── */}
      <div className={styles.detailPane} style={{ width: detailWidth }}>
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
                {SHAPE_SYMBOL[shape]}
              </button>
            ))}
          </div>
        </div>
        <div className={styles.fieldRow}>
          <label className={styles.label}>Weight</label>
          <input
            key={selected?.id ?? 'none'}
            className={styles.weightInput}
            type="number"
            min={1}
            max={100}
            defaultValue={selected?.weight ?? 1}
            disabled={!selected}
            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
            onBlur={e => selected && updateElement(selected.id, {
              weight: Math.max(1, Math.min(100, +e.target.value || 1))
            })}
          />
        </div>
        {/* The four single-line fields above stack without interruption so the
            label gutter they share reads as one column and their controls line
            up down the left. The two tall blocks follow, definition then
            collections — putting either of them in the middle breaks that
            column in half, which is what the earlier order did. */}
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
        {/* Membership goes last because it is the only control here that can
            reach past the anchor element, and the only one that is a list
            rather than a single value — the two things that make it the odd
            one out among the fields above. It keeps a section of its own for
            the same reason. */}
        <div className={styles.collectionSection}>
          <div className={styles.collectionHeader}>
            <span className={styles.label}>
              Collections
              {targetIds.length > 1 && (
                <span className={styles.targetCount}>{targetIds.length} selected</span>
              )}
            </span>
            {collections.length > 0 && targetIds.length > 0 && (
              <button
                type="button"
                className={styles.linkBtn}
                onClick={() => {
                  history.run(SCORE_HISTORY_OWNER, () => {
                    for (const c of collections) setCollection(targetIds, c.id, !allOn)
                  })
                }}
              >
                {allOn ? 'None' : 'All'}
              </button>
            )}
          </div>

          {collections.length === 0
            ? <span className={styles.fieldHint}>None defined — add some on the Collections tab.</span>
            : (
              <div className={styles.collectionList}>
                {collections.map(collection => {
                  const state = membership(collection.id)
                  const c     = collection.color
                  // Solid when everyone selected is a member, a hollow ring of
                  // the collection's color when nobody is, half-filled when the
                  // selection is split. The map sidebar draws the first two the
                  // same way, deliberately.
                  const swatch = state === 'all'
                    ? { background: c, borderColor: c }
                    : state === 'none'
                      ? { background: 'transparent', borderColor: c }
                      : { background: `linear-gradient(90deg, ${c} 0 50%, transparent 50% 100%)`, borderColor: c }
                  return (
                    <button
                      key={collection.id}
                      type="button"
                      className={styles.collectionRow}
                      disabled={targetIds.length === 0}
                      aria-pressed={state === 'all'}
                      aria-label={`${collection.name || 'Untitled collection'} — ${state === 'mixed' ? 'some selected elements' : state === 'all' ? 'all selected elements' : 'no selected elements'}`}
                      onClick={() => toggleMembership(collection.id)}
                    >
                      <span className={styles.collectionSwatch} style={swatch} />
                      <span className={styles.collectionRowName}>
                        {collection.name || 'Untitled collection'}
                      </span>
                      {/* Total members across the whole session, not just the
                          selection — the same number the map sidebar shows. */}
                      <span className={styles.collectionRowCount}>
                        {elements.filter(el => el.collectionIds.includes(collection.id)).length}
                      </span>
                    </button>
                  )
                })}
              </div>
            )
          }
        </div>
      </div>

      {/* ── Delete confirmation overlay ── */}
      {confirmElements.length > 0 && (
        <div className={styles.confirmOverlay}>
          <div className={styles.confirmBox}>
            {confirmElements.length === 1
              ? <p>Delete <strong>{confirmElements[0].name}</strong>? This will remove all its scores.</p>
              : <p>Delete <strong>{confirmElements.length} elements</strong>? This will remove all their scores.</p>
            }
            <div className={styles.confirmButtons}>
              <button className={styles.confirmCancel} onClick={() => setConfirmIds([])}>Cancel</button>
              <button
                className={styles.confirmDelete}
                onClick={() => {
                  history.run(SCORE_HISTORY_OWNER, () => {
                    for (const el of confirmElements) removeElement(el.id)
                  })
                  clearSelection()
                  setConfirmIds([])
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
