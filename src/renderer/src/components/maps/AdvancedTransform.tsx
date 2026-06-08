// ── AdvancedTransform ─────────────────────────────────────────────────────────
//
// Modal dialog for four data-manipulation operations that each take a dimension
// as their target. The user picks a dimension from a list, then clicks Apply.
//
// The four modes share enough UI that a single component handles all of them;
// the INFO map provides the title and description for each.
//
// All actual data changes happen in the Zustand store (appStore.ts). This
// component just picks the target dimension and dispatches the right action.

import { useState, useEffect } from 'react'
import { useAppStore } from '../../store/appStore'
import styles from './ChooseDimensions.module.css'

export type TransformMode = 'dim-to-weight' | 'weight-to-dim' | 'dim-to-gray' | 'randomize-scores'

// Human-readable labels and descriptions for each transform mode
const INFO: Record<TransformMode, { title: string; subtitle: string }> = {
  'dim-to-weight': {
    title: 'Dimension → Weight',
    subtitle: "Sets each element's weight from its score on the chosen dimension (scaled 1–100). Unscored elements are unchanged."
  },
  'weight-to-dim': {
    title: 'Weight → Dimension',
    subtitle: "Writes each element's weight as its score on the chosen dimension (scaled 0–1). All elements are updated."
  },
  'dim-to-gray': {
    title: 'Dimension → Gray',
    subtitle: "Sets each element's color to a gray shade based on its score on the chosen dimension. Unscored elements are unchanged."
  },
  'randomize-scores': {
    title: 'Randomize Scores',
    subtitle: "Assigns a random score to every element on the chosen dimension. Useful for seeding an empty dataset."
  }
}

interface Props {
  mode: TransformMode
  onClose: () => void
}

export function AdvancedTransform({ mode, onClose }: Props): React.JSX.Element {
  const dimensions        = useAppStore(s => s.dimensions)
  const scores            = useAppStore(s => s.scores)
  const dimensionToWeight = useAppStore(s => s.dimensionToWeight)
  const weightToDimension = useAppStore(s => s.weightToDimension)
  const dimensionToGray   = useAppStore(s => s.dimensionToGray)
  const randomizeScores   = useAppStore(s => s.randomizeScores)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)

  useEffect(() => {
    if (!showConfirm) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowConfirm(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showConfirm])

  function handleApply(): void {
    if (!selectedId) return
    if (mode === 'randomize-scores') {
      const hasScores = Object.values(scores).some(el => el[selectedId] !== undefined)
      if (hasScores) { setShowConfirm(true); return }
    }
    applyTransform()
  }

  function applyTransform(): void {
    if (!selectedId) return
    switch (mode) {
      case 'dim-to-weight':    dimensionToWeight(selectedId); break
      case 'weight-to-dim':    weightToDimension(selectedId); break
      case 'dim-to-gray':      dimensionToGray(selectedId);   break
      case 'randomize-scores': randomizeScores(selectedId);   break
    }
    onClose()
  }

  const info = INFO[mode]

  const selectedDim = selectedId ? dimensions.find(d => d.id === selectedId) : null

  return (
    <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.dialog}>
        <h2 className={styles.title}>{info.title}</h2>
        <p className={styles.subtitle}>{info.subtitle}</p>

        {dimensions.length === 0 && (
          <p className={styles.warning}>No dimensions defined.</p>
        )}

        <ul className={styles.list}>
          {dimensions.map((dim, i) => (
            <li
              key={dim.id}
              className={`${styles.item} ${dim.id === selectedId ? styles.selected : ''}`}
              onClick={() => setSelectedId(dim.id)}
            >
              <span className={styles.dimLabel}>{dim.label || `Dimension ${i + 1}`}</span>
            </li>
          ))}
        </ul>

        <div className={styles.buttons}>
          <button className={styles.btnCancel} onClick={onClose}>Cancel</button>
          <button
            className={styles.btnDraw}
            disabled={!selectedId || dimensions.length === 0}
            onClick={handleApply}
          >
            Apply
          </button>
        </div>

        {showConfirm && selectedDim && (
          <div className={styles.confirmOverlay}>
            <div className={styles.confirmBox}>
              <p>Randomize <strong>{selectedDim.label}</strong>?<br />Existing scores will be overwritten.</p>
              <div className={styles.confirmButtons}>
                <button className={styles.confirmCancel} onClick={() => setShowConfirm(false)}>Cancel</button>
                <button className={styles.confirmDelete} onClick={applyTransform}>Randomize</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
