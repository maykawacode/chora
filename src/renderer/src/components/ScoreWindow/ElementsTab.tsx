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

import { useRef, useState, KeyboardEvent } from 'react'
import { useAppStore } from '../../store/appStore'
import { usePrefsStore } from '../../store/prefsStore'
import styles from './DataTab.module.css'

export function ElementsTab(): React.JSX.Element {
  const elements      = useAppStore(s => s.elements)
  const selectedId    = useAppStore(s => s.selectedElementId)
  const addElement    = useAppStore(s => s.addElement)
  const updateElement = useAppStore(s => s.updateElement)
  const removeElement = useAppStore(s => s.removeElement)
  const selectElement = useAppStore(s => s.selectElement)
  const prefs         = usePrefsStore(s => s.prefs)

  const selected    = elements.find(e => e.id === selectedId) ?? null
  const [newName,   setNewName]   = useState('')
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [detailWidth, setDetailWidth] = useState(160)
  const addInputRef = useRef<HTMLInputElement>(null)
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null)

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
    if (!selectedId || elements.length === 0) return
    const idx = elements.findIndex(el => el.id === selectedId)

    if (e.key === 'ArrowDown' && idx < elements.length - 1) {
      selectElement(elements[idx + 1].id)
      e.preventDefault()
    } else if (e.key === 'ArrowUp' && idx > 0) {
      selectElement(elements[idx - 1].id)
      e.preventDefault()
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
      requestDelete(selectedId)
    }
  }

  const confirmElement = elements.find(e => e.id === confirmId) ?? null

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className={styles.tab}>
      {/* ── List pane ── */}
      <div className={styles.listPane}>
        <div className={styles.listHeader}>Elements ({elements.length})</div>

        {elements.length === 0
          ? <p className={styles.emptyHint}>Begin by entering a list of elements.</p>
          : (
            <ul
              className={styles.list}
              tabIndex={0}
              onKeyDown={handleListKeyDown}
              aria-label="Elements"
            >
              {elements.map(el => (
                <li
                  key={el.id}
                  className={`${styles.listItem} ${el.id === selectedId ? styles.selected : ''}`}
                  onClick={() => selectElement(el.id)}
                >
                  <span className={styles.colorDot} style={{ background: el.color }} />
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
            value={selected?.color ?? '#808000'}
            disabled={!selected}
            onChange={e => selected && updateElement(selected.id, { color: e.target.value })}
          />
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
          placeholder="Description…"
          value={selected?.description ?? ''}
          disabled={!selected}
          onChange={e => selected && updateElement(selected.id, { description: e.target.value })}
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
