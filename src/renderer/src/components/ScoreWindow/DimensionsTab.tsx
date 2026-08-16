// ── DimensionsTab ─────────────────────────────────────────────────────────────
//
// Left pane: scrollable list of dimensions with keyboard navigation.
// Right pane: detail editor (Pole A, Pole B, Weight, Description).
//
// Pole editing: Pole A and Pole B are editable independently. On commit the
// label is rebuilt as "PoleA–PoleB" so the two representations stay in sync.
//
// Delete behavior:
//   - Every deletion follows the global confirmDeleteData preference
//   Escape dismisses the confirmation dialog.

import { useRef, useState, useEffect, KeyboardEvent } from 'react'
import { useAppStore } from '../../store/appStore'
import { history, SCORE_HISTORY_OWNER } from '../../store/history'
import { useResizableSplitPane } from './useResizableSplitPane'
import styles from './DataTab.module.css'
import { formatRange, numericRange, openWeight } from '../../lib/numericRange'
import { ConfirmationDisc } from '../ConfirmationDisc'
import { usePrefsStore } from '../../store/prefsStore'

interface Props { onOpenStarterPicker: () => void }

interface DimensionListLabelProps {
  poleA: string
  poleB: string
}

function DimensionListLabel({ poleA, poleB }: DimensionListLabelProps): React.JSX.Element {
  const containerRef = useRef<HTMLSpanElement>(null)
  const measureRef = useRef<HTMLSpanElement>(null)
  const [isWrapped, setIsWrapped] = useState(false)
  const displayLabel = `${poleA} - ${poleB}`

  useEffect(() => {
    const container = containerRef.current
    const measure = measureRef.current
    if (!container || !measure) return

    const updateWrapping = (): void => {
      setIsWrapped(measure.scrollWidth > container.clientWidth)
    }
    updateWrapping()

    const observer = new ResizeObserver(updateWrapping)
    observer.observe(container)
    observer.observe(measure)
    return () => observer.disconnect()
  }, [displayLabel])

  return (
    <span
      ref={containerRef}
      className={`${styles.name} ${styles.dimensionName} ${isWrapped ? styles.dimensionNameWrapped : ''}`}
      aria-label={displayLabel}
    >
      <span ref={measureRef} className={styles.dimensionMeasure} aria-hidden="true">{displayLabel}</span>
      {isWrapped
        ? <>
            <span className={styles.dimensionPole}>{poleA} -</span>
            <span className={`${styles.dimensionPole} ${styles.dimensionPoleB}`}>{poleB}</span>
          </>
        : displayLabel
      }
    </span>
  )
}

export function DimensionsTab({ onOpenStarterPicker }: Props): React.JSX.Element {
  const dimensions      = useAppStore(s => s.dimensions)
  const selectedId      = useAppStore(s => s.selectedDimensionId)
  const addDimension    = useAppStore(s => s.addDimension)
  const updateDimension = useAppStore(s => s.updateDimension)
  const removeDimension = useAppStore(s => s.removeDimension)
  const selectDimension = useAppStore(s => s.selectDimension)
  const scores          = useAppStore(s => s.scores)
  const confirmDeleteData = usePrefsStore(s => s.prefs.confirmDeleteData)

  const selected = dimensions.find(d => d.id === selectedId) ?? null
  const [newLabel,       setNewLabel]       = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const addInputRef = useRef<HTMLInputElement>(null)
  const splitPane = useResizableSplitPane()

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
      if (confirmDeleteData) setConfirmDeleteId(selectedId)
      else removeDimension(selectedId)
    }
  }

  const confirmDim = confirmDeleteId ? dimensions.find(d => d.id === confirmDeleteId) : null
  const confirmDimHasScores = confirmDeleteId
    ? Object.values(scores).some(elementScores => elementScores[confirmDeleteId] !== undefined)
    : false
  const weightRange = numericRange(dimensions.map(dimension => dimension.weight), 1)

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className={styles.tab} ref={splitPane.containerRef} style={splitPane.containerStyle}>
      {/* ── List pane ── */}
      <div className={styles.listPane} style={splitPane.leftPaneStyle}>
        <div className={styles.listHeader}>Dimensions ({dimensions.length})</div>

        <div className={styles.listEditor}>
          {dimensions.length > 0 && (
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
                  <DimensionListLabel poleA={dim.poleA} poleB={dim.poleB} />
                </li>
              ))}
            </ul>
          )}

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
      </div>

      {/* ── Resize handle ── */}
      <div className={styles.resizeHandle} style={splitPane.dividerStyle} {...splitPane.dividerProps} />

      {/* ── Detail pane ── */}
      <div className={styles.detailPane} style={splitPane.rightPaneStyle}>
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
            min={0}
            defaultValue={selected?.weight ?? 1}
            disabled={!selected}
            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
            onBlur={e => selected && updateDimension(selected.id, {
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
            if (selected) updateDimension(selected.id, { definition: e.target.value })
          }}
        />
      </div>

      {/* ── Delete confirmation overlay ── */}
      {confirmDim && (
        <ConfirmationDisc
          title={<>Delete <strong>{confirmDim.label}</strong>?</>}
          detail={confirmDimHasScores ? 'Its scores will be lost.' : 'This cannot be undone.'}
          actionLabel="Delete"
          onCancel={() => setConfirmDeleteId(null)}
          onAction={() => { removeDimension(confirmDeleteId!); setConfirmDeleteId(null) }}
        />
      )}
    </div>
  )
}
