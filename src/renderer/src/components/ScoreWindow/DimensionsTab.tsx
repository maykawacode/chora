// ── DimensionsTab ─────────────────────────────────────────────────────────────
//
// Left pane: scrollable list of dimensions with keyboard navigation.
// Right pane: detail editor (Pole A, Pole B, Weight, Description).
//
// Pole editing: Pole A and Pole B are editable independently. On commit the
// label is rebuilt as "PoleA–PoleB" so the two representations stay in sync.
//
// Delete behavior:
//   - If the dimension has any scores, show a confirmation dialog (data loss warning)
//   - If it has no scores, delete immediately
//   Escape dismisses the confirmation dialog.

import { useRef, useState, useEffect, KeyboardEvent } from 'react'
import { useAppStore } from '../../store/appStore'
import styles from './DataTab.module.css'

interface Props { onOpenStarterPicker: () => void }

export function DimensionsTab({ onOpenStarterPicker }: Props): React.JSX.Element {
  const dimensions      = useAppStore(s => s.dimensions)
  const selectedId      = useAppStore(s => s.selectedDimensionId)
  const addDimension    = useAppStore(s => s.addDimension)
  const updateDimension = useAppStore(s => s.updateDimension)
  const removeDimension = useAppStore(s => s.removeDimension)
  const selectDimension = useAppStore(s => s.selectDimension)
  const scores          = useAppStore(s => s.scores)

  const selected = dimensions.find(d => d.id === selectedId) ?? null
  const [newLabel,       setNewLabel]       = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [detailWidth, setDetailWidth] = useState(160)
  const addInputRef = useRef<HTMLInputElement>(null)
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null)
  const tabRef  = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (tabRef.current) {
      const w = tabRef.current.getBoundingClientRect().width
      if (w > 0) setDetailWidth(Math.round(w / 2))
    }
  }, [])

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

  // Bring Score Window to front when the delete confirmation overlay opens
  useEffect(() => {
    if (confirmDeleteId !== null) window.api.setModalOpen(true)
  }, [confirmDeleteId])

  // Dismiss the delete confirmation on Escape regardless of where focus is
  useEffect(() => {
    if (!confirmDeleteId) return
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setConfirmDeleteId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [confirmDeleteId])

  // ── Handlers ─────────────────────────────────────────────────────────────────

  function handleAdd(): void {
    const label = newLabel.trim()
    if (!label) return
    addDimension(label)
    setNewLabel('')
    addInputRef.current?.focus()
  }

  function handleAddKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Enter') handleAdd()
  }

  // Keep poleA, poleB, and label in sync: editing either pole rebuilds the label
  function handlePoleEdit(field: 'poleA' | 'poleB', value: string): void {
    if (!selected) return
    const poleA = field === 'poleA' ? value : selected.poleA
    const poleB = field === 'poleB' ? value : selected.poleB
    updateDimension(selected.id, { poleA, poleB, label: `${poleA}–${poleB}` })
  }

  function handleListKeyDown(e: KeyboardEvent<HTMLUListElement>): void {
    if (!selectedId || dimensions.length === 0) return
    const idx = dimensions.findIndex(d => d.id === selectedId)

    if (e.key === 'ArrowDown' && idx < dimensions.length - 1) {
      selectDimension(dimensions[idx + 1].id)
      e.preventDefault()
    } else if (e.key === 'ArrowUp' && idx > 0) {
      selectDimension(dimensions[idx - 1].id)
      e.preventDefault()
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
      // Require confirmation if any element has a score on this dimension
      const hasScores = Object.values(scores).some(el => el[selectedId] !== undefined)
      if (hasScores) {
        setConfirmDeleteId(selectedId)
      } else {
        removeDimension(selectedId)
      }
    }
  }

  const confirmDim = confirmDeleteId ? dimensions.find(d => d.id === confirmDeleteId) : null

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className={styles.tab} ref={tabRef}>
      {/* ── List pane ── */}
      <div className={styles.listPane}>
        <div className={styles.listHeader}>Dimensions ({dimensions.length})</div>

        {dimensions.length === 0
          ? <p className={styles.emptyHint}>Begin by entering a list of dimensions.</p>
          : (
            <ul
              className={styles.list}
              tabIndex={0}
              onKeyDown={handleListKeyDown}
              aria-label="Dimensions"
            >
              {dimensions.map(dim => (
                <li
                  key={dim.id}
                  className={`${styles.listItem} ${dim.id === selectedId ? styles.selected : ''}`}
                  onClick={() => selectDimension(dim.id)}
                >
                  <span className={styles.name}>{dim.label}</span>
                </li>
              ))}
            </ul>
          )
        }

        <div className={styles.addRow}>
          <input
            ref={addInputRef}
            className={styles.addInput}
            placeholder="New dimension (e.g. Hot–Cold)…"
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            onKeyDown={handleAddKeyDown}
          />
          <button
            className={styles.starterBtn}
            onClick={onOpenStarterPicker}
            title="Browse starter lists"
          >
            ⋯
          </button>
        </div>
      </div>

      {/* ── Resize handle ── */}
      <div className={styles.resizeHandle} onMouseDown={onHandleMouseDown} />

      {/* ── Detail pane ── */}
      <div className={styles.detailPane} style={{ width: detailWidth }}>
        <div className={styles.fieldRow}>
          <label className={styles.label}>Pole A</label>
          {/* key forces input reset when selection changes */}
          <input
            key={`poleA-${selected?.id ?? 'none'}`}
            className={styles.poleInput}
            defaultValue={selected?.poleA ?? ''}
            disabled={!selected}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Tab') e.currentTarget.blur() }}
            onBlur={e => {
              const v = e.target.value.trim()
              if (selected && v !== selected.poleA) handlePoleEdit('poleA', v)
            }}
          />
        </div>
        <div className={styles.fieldRow}>
          <label className={styles.label}>Pole B</label>
          <input
            key={`poleB-${selected?.id ?? 'none'}`}
            className={styles.poleInput}
            defaultValue={selected?.poleB ?? ''}
            disabled={!selected}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Tab') e.currentTarget.blur() }}
            onBlur={e => {
              const v = e.target.value.trim()
              if (selected && v !== selected.poleB) handlePoleEdit('poleB', v)
            }}
          />
        </div>
        <div className={styles.fieldRow}>
          <label className={styles.label}>Weight</label>
          <input
            key={`weight-${selected?.id ?? 'none'}`}
            className={styles.weightInput}
            type="number"
            min={1}
            max={100}
            defaultValue={selected?.weight ?? 1}
            disabled={!selected}
            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
            onBlur={e => selected && updateDimension(selected.id, {
              weight: Math.max(1, Math.min(100, +e.target.value || 1))
            })}
          />
        </div>
        <textarea
          className={styles.description}
          placeholder="Definition…"
          value={selected?.definition ?? ''}
          disabled={!selected}
          onChange={e => selected && updateDimension(selected.id, { definition: e.target.value })}
        />
      </div>

      {/* ── Delete confirmation overlay (only shown when dimension has scores) ── */}
      {confirmDim && (
        <div className={styles.confirmOverlay}>
          <div className={styles.confirmBox}>
            <p>Delete <strong>{confirmDim.label}</strong>?<br />All scores for this dimension will be lost.</p>
            <div className={styles.confirmButtons}>
              <button className={styles.confirmCancel} onClick={() => setConfirmDeleteId(null)}>Cancel</button>
              <button
                className={styles.confirmDelete}
                onClick={() => { removeDimension(confirmDeleteId!); setConfirmDeleteId(null) }}
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
