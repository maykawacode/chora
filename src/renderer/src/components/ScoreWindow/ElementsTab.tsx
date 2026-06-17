// ── ElementsTab ───────────────────────────────────────────────────────────────
//
// Left pane: scrollable list of elements with a color dot, add-input at the
// bottom, and keyboard navigation (↑ ↓ for selection, Delete/Backspace to
// trigger delete).
//
// Right pane: detail editor for the selected element (name, color, weight,
// description).
//
// Delete behavior:
//   - If confirmDeleteElement pref is ON → shows an inline confirmation overlay
//   - Otherwise → deletes immediately
//   - There is no delete button in the UI; the keyboard is the only trigger.

import { useRef, useState, useEffect, KeyboardEvent } from 'react'
import { useAppStore } from '../../store/appStore'
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

export function ElementsTab(): React.JSX.Element {
  const elements         = useAppStore(s => s.elements)
  const selectedId       = useAppStore(s => s.selectedElementId)
  const addElement       = useAppStore(s => s.addElement)
  const duplicateElement = useAppStore(s => s.duplicateElement)
  const updateElement    = useAppStore(s => s.updateElement)
  const removeElement    = useAppStore(s => s.removeElement)
  const selectElement    = useAppStore(s => s.selectElement)
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

  const [newName,   setNewName]   = useState('')
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [detailWidth, setDetailWidth] = useState(160)
  const addInputRef = useRef<HTMLInputElement>(null)
  const dragRef     = useRef<{ startX: number; startWidth: number } | null>(null)
  const tabRef      = useRef<HTMLDivElement>(null)

  // Bring Score Window to front when the delete confirmation overlay opens
  useEffect(() => {
    if (confirmId !== null) window.api.setModalOpen(true)
  }, [confirmId])

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
    const handler = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'd' && selectedId) {
        e.preventDefault()   // prevent browser "add to bookmarks" default
        duplicateElement(selectedId)
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

  // Route a delete request through the confirmation preference
  function requestDelete(id: string): void {
    if (prefs.confirmDeleteElement) {
      setConfirmId(id)  // show the confirmation overlay
    } else {
      removeElement(id)
    }
  }

  function handleListKeyDown(e: KeyboardEvent<HTMLUListElement>): void {
    if (!selectedId || displayElements.length === 0) return
    // Use displayElements so ↑ ↓ navigate the visible order, not the store order
    const idx = displayElements.findIndex(el => el.id === selectedId)

    if (e.key === 'ArrowDown' && idx < displayElements.length - 1) {
      selectElement(displayElements[idx + 1].id)
      e.preventDefault()
    } else if (e.key === 'ArrowUp' && idx > 0) {
      selectElement(displayElements[idx - 1].id)
      e.preventDefault()
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
      requestDelete(selectedId)
    }
  }

  const confirmElement = elements.find(e => e.id === confirmId) ?? null

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
            >
              {displayElements.map(el => (
                <li
                  key={el.id}
                  className={`${styles.listItem} ${el.id === selectedId ? styles.selected : ''}`}
                  onClick={() => selectElement(el.id)}
                >
                  <span className={styles.shapeIcon} style={{ color: el.color }}>{SHAPE_SYMBOL[el.shape]}</span>
                  <span className={styles.name}>{el.name}</span>
                </li>
              ))}
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
            onChange={e => selected && updateElement(selected.id, { color: e.target.value })}
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
        <textarea
          className={styles.description}
          placeholder="Definition…"
          value={selected?.definition ?? ''}
          disabled={!selected}
          onChange={e => selected && updateElement(selected.id, { definition: e.target.value })}
        />
      </div>

      {/* ── Delete confirmation overlay ── */}
      {confirmElement && (
        <div className={styles.confirmOverlay}>
          <div className={styles.confirmBox}>
            <p>Delete <strong>{confirmElement.name}</strong>? This will remove all its scores.</p>
            <div className={styles.confirmButtons}>
              <button className={styles.confirmCancel} onClick={() => setConfirmId(null)}>Cancel</button>
              <button
                className={styles.confirmDelete}
                onClick={() => { removeElement(confirmElement.id); setConfirmId(null) }}
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
