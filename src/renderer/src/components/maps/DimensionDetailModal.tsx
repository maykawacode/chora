// ── DimensionDetailModal ──────────────────────────────────────────────────────
//
// Centered modal triggered by right-clicking an axis on any map. Edits a
// dimension's poles, weight, and definition in local draft state, committed
// only through the green arrow; Escape or a background click abandons it.

import { useState, useRef, useCallback } from 'react'
import { useAppStore } from '../../store/appStore'
import type { Dimension } from '../../lib/types'
import styles from './ElementDetailModal.module.css'
import { formatRange, numericRange, openWeight } from '../../lib/numericRange'
import { ForwardActionButton } from '../ConfirmationDisc'
import { ModalShell } from '../ModalShell'

interface Props {
  dimensionId: string
  onClose: (changes: Partial<Dimension> | null) => void
}

export function DimensionDetailModal({ dimensionId, onClose }: Props): React.JSX.Element | null {
  const dimensions = useAppStore(s => s.dimensions)
  const dimension  = dimensions.find(d => d.id === dimensionId)

  const [poleA,      setPoleA]      = useState(dimension?.poleA ?? '')
  const [poleB,      setPoleB]      = useState(dimension?.poleB ?? '')
  const [weight,     setWeight]     = useState(String(dimension?.weight ?? 1))
  const [definition, setDefinition] = useState(dimension?.definition ?? '')

  // Re-assigned every render so the closure always captures latest state
  const handleCloseRef = useRef<(apply: boolean) => void>(() => {})
  handleCloseRef.current = (apply: boolean) => {
    if (!apply || !dimension) { onClose(null); return }
    const trimmedA = poleA.trim() || dimension.poleA
    const trimmedB = poleB.trim() || dimension.poleB
    const parsedWeight = openWeight(Number(weight))
    const changes: Partial<Dimension> = {}
    // The label is derived from the poles, matching the Dimensions tab.
    if (trimmedA !== dimension.poleA || trimmedB !== dimension.poleB) {
      changes.poleA = trimmedA
      changes.poleB = trimmedB
      changes.label = `${trimmedA}–${trimmedB}`
    }
    if (parsedWeight !== dimension.weight)     changes.weight     = parsedWeight
    if (definition   !== dimension.definition) changes.definition = definition
    onClose(Object.keys(changes).length > 0 ? changes : null)
  }

  const handleApply  = useCallback(() => handleCloseRef.current(true),  [])
  const handleCancel = useCallback(() => handleCloseRef.current(false), [])

  if (!dimension) return null

  const weightRange = numericRange(dimensions.map(item => item.weight))

  return (
    <ModalShell overlayClassName={styles.overlay} dialogClassName={styles.modal} onClose={handleCancel}>
        <div className={styles.header}>
          <span className={styles.name}>{dimension.label}</span>
        </div>

        <div className={styles.fieldRow}>
          <label className={styles.label}>Pole A</label>
          <input
            className={`${styles.hexInput} ${styles.poleInput}`}
            value={poleA}
            onChange={e => setPoleA(e.target.value)}
          />
        </div>

        <div className={styles.fieldRow}>
          <label className={styles.label}>Pole B</label>
          <input
            className={`${styles.hexInput} ${styles.poleInput}`}
            value={poleB}
            onChange={e => setPoleB(e.target.value)}
          />
        </div>

        <div className={styles.fieldRow}>
          <label className={styles.label}>Weight</label>
          <input
            type="number"
            className={styles.weightInput}
            min={0}
            value={weight}
            onChange={e => setWeight(e.target.value)}
          />
          <span className={styles.range}>{formatRange(weightRange)}</span>
        </div>

        <textarea
          className={styles.description}
          value={definition}
          rows={4}
          placeholder="Definition…"
          onChange={e => setDefinition(e.target.value)}
        />

        <div className={styles.footer}>
          <ForwardActionButton label="Apply dimension changes" onClick={handleApply} />
        </div>
    </ModalShell>
  )
}
