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

export type TransformMode = 'dim-to-weight' | 'weight-to-dim' | 'dim-to-color' | 'randomize-scores'

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
  'dim-to-color': {
    title: 'Dimension → Color',
    subtitle: "Sets each element's color by interpolating between the low and high colors configured in Preferences. Unscored elements are unchanged."
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
  const dimensionToColor  = useAppStore(s => s.dimensionToColor)
  const randomizeScores   = useAppStore(s => s.randomizeScores)

  const [selectedId, setSelectedId]   = useState<string | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)
  // poleFlipped=false (default): poleB maps to the "high" end (score 1.0 / weight 100)
  // poleFlipped=true:            poleA maps to the "high" end (score direction inverted)
  // Only relevant for dim-to-weight and weight-to-dim — other modes ignore it.
  const [poleFlipped, setPoleFlipped] = useState(false)

  // Whether this mode has a meaningful pole direction to expose to the user
  const hasPoleControl = mode === 'dim-to-weight' || mode === 'weight-to-dim'

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
      // Pass poleFlipped so the store can invert the score direction when needed
      case 'dim-to-weight':    dimensionToWeight(selectedId, poleFlipped); break
      case 'weight-to-dim':    weightToDimension(selectedId, poleFlipped); break
      case 'dim-to-color':     dimensionToColor(selectedId);               break
      case 'randomize-scores': randomizeScores(selectedId);                break
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

        {/* ── Pole direction — only for score↔weight transforms ── */}
        {/* Shows which end of the chosen dimension maps to the "high" value.   */}
        {/* Default (poleB active): score 1.0 / weight 100 = the B pole.        */}
        {/* Flipped (poleA active): score direction is inverted before mapping.  */}
        {hasPoleControl && (
          <div className={styles.poleSection}>
            <div className={styles.poleSectionLabel}>High end</div>
            <div className={styles.poleButtons}>
              {/* poleA button — active when poleFlipped=true */}
              <button
                type="button"
                className={`${styles.poleBtn} ${poleFlipped ? styles.poleBtnActive : ''}`}
                onClick={() => setPoleFlipped(true)}
                title={selectedDim?.poleA ?? 'Pole A'}
              >
                {selectedDim?.poleA || 'Pole A'}
              </button>
              {/* poleB button — active by default (flip=false is the current behavior) */}
              <button
                type="button"
                className={`${styles.poleBtn} ${!poleFlipped ? styles.poleBtnActive : ''}`}
                onClick={() => setPoleFlipped(false)}
                title={selectedDim?.poleB ?? 'Pole B'}
              >
                {selectedDim?.poleB || 'Pole B'}
              </button>
            </div>
          </div>
        )}

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
