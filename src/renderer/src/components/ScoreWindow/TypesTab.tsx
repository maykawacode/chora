// ── TypesTab ───────────────────────────────────────────────────────────────────
//
// Left pane: scrollable list of types with keyboard navigation.
// Right pane: detail editor (Name, Definition).
//
// Delete behavior:
//   - If the type has any membership scores → confirmation overlay (data loss warning)
//   - Otherwise → deletes immediately

import { useRef, useState, useEffect, KeyboardEvent } from 'react'
import { useAppStore } from '../../store/appStore'
import styles from './DataTab.module.css'

export function TypesTab(): React.JSX.Element {
  const types      = useAppStore(s => s.types)
  const selectedId = useAppStore(s => s.selectedTypeId)
  const scoreMap   = useAppStore(s => s.scores)
  const addType    = useAppStore(s => s.addType)
  const updateType = useAppStore(s => s.updateType)
  const removeType = useAppStore(s => s.removeType)
  const selectType = useAppStore(s => s.selectType)

  const selected = types.find(t => t.id === selectedId) ?? null

  const [newName,         setNewName]         = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [detailWidth,     setDetailWidth]     = useState(160)
  const addInputRef = useRef<HTMLInputElement>(null)
  const dragRef     = useRef<{ startX: number; startWidth: number } | null>(null)
  const tabRef      = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (tabRef.current) {
      const w = tabRef.current.getBoundingClientRect().width
      if (w > 0) setDetailWidth(Math.round(w / 2))
    }
  }, [])

  useEffect(() => {
    if (confirmDeleteId !== null) window.api.setModalOpen(true)
  }, [confirmDeleteId])

  useEffect(() => {
    if (!confirmDeleteId) return
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setConfirmDeleteId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [confirmDeleteId])

  function onHandleMouseDown(e: React.MouseEvent): void {
    dragRef.current = { startX: e.clientX, startWidth: detailWidth }
    const onMove = (ev: MouseEvent): void => {
      if (!dragRef.current) return
      const delta = dragRef.current.startX - ev.clientX
      setDetailWidth(Math.max(120, Math.min(400, dragRef.current.startWidth + delta)))
    }
    const onUp = (): void => {
      dragRef.current = null
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  function handleAdd(): void {
    const name = newName.trim()
    if (!name) return
    addType(name)
    setNewName('')
    addInputRef.current?.focus()
  }

  function requestDelete(id: string): void {
    const hasScores = Object.values(scoreMap).some(el => el[id] !== undefined)
    if (hasScores) setConfirmDeleteId(id)
    else removeType(id)
  }

  function handleListKeyDown(e: KeyboardEvent<HTMLUListElement>): void {
    if (!selectedId || types.length === 0) return
    const idx = types.findIndex(t => t.id === selectedId)
    if (e.key === 'ArrowDown' && idx < types.length - 1) {
      selectType(types[idx + 1].id); e.preventDefault()
    } else if (e.key === 'ArrowUp' && idx > 0) {
      selectType(types[idx - 1].id); e.preventDefault()
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
      requestDelete(selectedId)
    }
  }

  const confirmType = confirmDeleteId ? types.find(t => t.id === confirmDeleteId) : null

  return (
    <div className={styles.tab} ref={tabRef}>
      {/* ── List pane ── */}
      <div className={styles.listPane}>
        <div className={styles.listHeader}>Types ({types.length})</div>

        {types.length === 0
          ? <p className={styles.emptyHint}>Begin by entering a list of types.</p>
          : (
            <ul
              className={styles.list}
              tabIndex={0}
              onKeyDown={handleListKeyDown}
              aria-label="Types"
            >
              {types.map(type => (
                <li
                  key={type.id}
                  className={`${styles.listItem} ${type.id === selectedId ? styles.selected : ''}`}
                  onClick={() => selectType(type.id)}
                >
                  <span className={styles.name}>{type.name}</span>
                </li>
              ))}
            </ul>
          )
        }

        <div className={styles.addRow}>
          <input
            ref={addInputRef}
            className={styles.addInput}
            placeholder="New type…"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
          />
        </div>
      </div>

      {/* ── Resize handle ── */}
      <div className={styles.resizeHandle} onMouseDown={onHandleMouseDown} />

      {/* ── Detail pane ── */}
      <div className={styles.detailPane} style={{ width: detailWidth }}>
        <div className={styles.fieldRow}>
          <label className={styles.label}>Name</label>
          <input
            key={`name-${selected?.id ?? 'none'}`}
            className={styles.poleInput}
            defaultValue={selected?.name ?? ''}
            disabled={!selected}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Tab') e.currentTarget.blur() }}
            onBlur={e => {
              const v = e.target.value.trim()
              if (selected && v && v !== selected.name) updateType(selected.id, { name: v })
            }}
          />
        </div>
        <div className={styles.fieldRow}>
          <label className={styles.label}>Color</label>
          <input
            type="color"
            className={styles.colorInput}
            value={selected?.color ?? '#808080'}
            disabled={!selected}
            onChange={e => selected && updateType(selected.id, { color: e.target.value })}
          />
        </div>
        <textarea
          className={styles.description}
          placeholder="Definition…"
          value={selected?.definition ?? ''}
          disabled={!selected}
          onChange={e => selected && updateType(selected.id, { definition: e.target.value })}
        />
      </div>

      {/* ── Delete confirmation overlay ── */}
      {confirmType && (
        <div className={styles.confirmOverlay}>
          <div className={styles.confirmBox}>
            <p>Delete <strong>{confirmType.name}</strong>?<br />All membership scores for this type will be lost.</p>
            <div className={styles.confirmButtons}>
              <button className={styles.confirmCancel} onClick={() => setConfirmDeleteId(null)}>Cancel</button>
              <button
                className={styles.confirmDelete}
                onClick={() => { removeType(confirmDeleteId!); setConfirmDeleteId(null) }}
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
