// ── StarterListPicker ─────────────────────────────────────────────────────────
//
// Modal dialog for browsing and adding pre-defined dimension pairs.
// Dimensions are organized into semantic categories (Evaluative, Potency, etc.)
// and sourced from starterDimensions.ts.
//
// Items already in the session are shown with a checkmark and cannot be
// re-added. New items can be toggled on/off, then added in one batch.

import { useState } from 'react'
import { useAppStore } from '../../store/appStore'
import { history, SCORE_HISTORY_OWNER } from '../../store/history'
import { STARTER_DIMENSIONS, CATEGORIES } from '../../lib/starterDimensions'
import type { CategoryKey } from '../../lib/starterDimensions'
import type { DimensionCategories } from '../../lib/types'
import styles from './StarterListPicker.module.css'

interface Props { onClose: () => void }

export function StarterListPicker({ onClose }: Props): React.JSX.Element {
  const dimensions   = useAppStore(s => s.dimensions)
  const addDimension = useAppStore(s => s.addDimension)

  const [activeCategory, setActiveCategory] = useState<CategoryKey>('all')
  const [checked, setChecked]               = useState<Set<string>>(new Set())

  // Quick lookup set to detect which labels are already in the session
  const existingLabels = new Set(dimensions.map(d => d.label))

  // Filter the full list to the active category
  const filtered = activeCategory === 'all'
    ? STARTER_DIMENSIONS
    : STARTER_DIMENSIONS.filter(d => d.categories[activeCategory as keyof DimensionCategories])

  function toggle(label: string): void {
    setChecked(prev => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  }

  // Only add dimensions that are checked AND not already in the session
  function handleAdd(): void {
    history.run(SCORE_HISTORY_OWNER, () => {
      for (const sd of STARTER_DIMENSIONS) {
        if (checked.has(sd.label) && !existingLabels.has(sd.label)) {
          addDimension(sd.label, sd.categories)
        }
      }
    })
    onClose()
  }

  // Count of dimensions that will actually be added (checked and not already present)
  const toAdd = [...checked].filter(l => !existingLabels.has(l)).length

  return (
    <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.dialog}>
        <h2 className={styles.title}>Dimension Starter Lists</h2>

        <div className={styles.body}>
          {/* ── Category filter sidebar ── */}
          <div className={styles.catPane}>
            {CATEGORIES.map(cat => (
              <button
                key={cat.key}
                className={`${styles.catBtn} ${activeCategory === cat.key ? styles.catBtnActive : ''}`}
                onClick={() => setActiveCategory(cat.key)}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* ── Dimension list ── */}
          <ul className={styles.dimList}>
            {filtered.map(sd => {
              const inSession = existingLabels.has(sd.label)
              const isChecked = checked.has(sd.label)
              return (
                <li
                  key={sd.label}
                  className={`${styles.dimItem} ${inSession ? styles.inSession : ''} ${isChecked ? styles.dimChecked : ''}`}
                  onClick={() => { if (!inSession) toggle(sd.label) }}
                >
                  {/* ✓ = already in session, ● = selected to add, ○ = not selected */}
                  <span className={styles.check}>
                    {inSession ? '✓' : isChecked ? '●' : '○'}
                  </span>
                  <span className={styles.dimLabel}>{sd.label}</span>
                </li>
              )
            })}
          </ul>
        </div>

        <div className={styles.footer}>
          <span className={styles.hint}>
            {toAdd > 0
              ? `${toAdd} dimension${toAdd !== 1 ? 's' : ''} to add`
              : existingLabels.size > 0
                ? 'Select dimensions to add'
                : 'Select dimensions'}
          </span>
          <div className={styles.buttons}>
            <button className={styles.btnCancel} onClick={onClose}>Cancel</button>
            <button className={styles.btnAdd} disabled={toAdd === 0} onClick={handleAdd}>
              Add{toAdd > 0 ? ` ${toAdd}` : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
