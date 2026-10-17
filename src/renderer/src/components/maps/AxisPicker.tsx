// ── AxisPicker ────────────────────────────────────────────────────────────────
//
// Opens over the centre of a map when one of its axes is clicked: flip the
// axis's poles with the button beside the title, or choose another dimension
// for it from the list. Cartesian and semantic maps share it.

import type { Dimension } from '../../lib/types'
import { ModalShell } from '../ModalShell'
import styles from './MapPanel.module.css'

// Two opposing arrows: the poles trading ends.
const FLIP_GLYPH = 'M2.5 5.5h10M10 3l2.5 2.5L10 8M13.5 10.5h-10M6 8l-2.5 2.5L6 13'

export function AxisPicker({ title, currentId, isFlipped, dimensions, onPick, onFlip, onClose }: {
  title: string
  currentId: string
  isFlipped: boolean
  dimensions: Dimension[]
  onPick: (dimensionId: string) => void
  onFlip: () => void
  onClose: () => void
}): React.JSX.Element {
  const flipLabel = isFlipped ? 'Restore poles' : 'Flip poles'
  return (
    <ModalShell
      overlayClassName={styles.axisPickerBackdrop}
      dialogClassName={styles.axisPicker}
      onClose={onClose}
      label={`${title} options`}
    >
      <div className={styles.axisPickerHeader}>
        <span className={styles.axisPickerTitle}>{title}</span>
        <button
          type="button"
          className={styles.axisPickerFlip}
          title={flipLabel}
          aria-label={flipLabel}
          aria-pressed={isFlipped}
          onClick={(e) => { e.stopPropagation(); onFlip() }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path d={FLIP_GLYPH} fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      <ul className={styles.axisPickerList}>
        {dimensions.map((dim, i) => (
          <li
            key={dim.id}
            className={`${styles.axisPickerItem} ${dim.id === currentId ? styles.axisPickerSelected : ''}`}
            onClick={(e) => { e.stopPropagation(); onPick(dim.id) }}
          >
            {dim.label || `Dimension ${i + 1}`}
          </li>
        ))}
      </ul>
    </ModalShell>
  )
}
