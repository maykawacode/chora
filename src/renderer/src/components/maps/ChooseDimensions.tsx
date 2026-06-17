// ── Map creation dialogs ──────────────────────────────────────────────────────
//
// Two modal dialogs live in this file because they share the same CSS module
// and follow the same interaction pattern (pick from a list → create map).
//
// ChooseDimensions   — creates a Cartesian map; user picks exactly 2 dimensions
// CreateSemanticMap  — creates a Semantic map; user picks any subset of dimensions

import { useState } from 'react'
import { v4 as uuid } from 'uuid'
import { useAppStore } from '../../store/appStore'
import { usePrefsStore } from '../../store/prefsStore'
import type { CartesianMapConfig, SemanticMapConfig, TypeProjectionMapConfig } from '../../lib/types'
import styles from './ChooseDimensions.module.css'

interface Props { onClose: () => void }

// ── Cartesian map dialog ──────────────────────────────────────────────────────

export function ChooseDimensions({ onClose }: Props): React.JSX.Element {
  const dimensions = useAppStore(s => s.dimensions)
  const maps       = useAppStore(s => s.maps)
  const addMap     = useAppStore(s => s.addMap)
  const prefs      = usePrefsStore(s => s.prefs)

  const [selected, setSelected] = useState<string[]>([])

  // Maintain a sliding window of 2: drop the oldest selection when a third is added
  function toggle(id: string): void {
    setSelected(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id)
      if (prev.length < 2)   return [...prev, id]
      return [prev[1], id]
    })
  }

  function handleDraw(): void {
    if (selected.length !== 2) return
    const config: CartesianMapConfig = {
      id: uuid(),
      type: 'cartesian',
      title: `Map ${maps.length + 1}`,
      xDimensionId: selected[0],
      yDimensionId: selected[1],
      xFlipped: false,
      yFlipped: false,
      sizeByWeight: true,
      showLabels: prefs.defaultShowLabels,
      showDots: prefs.defaultShowDots,
      windowX: 100,
      windowY: 100,
      windowWidth: 600,
      windowHeight: 500
    }
    addMap(config)
    onClose()
  }

  return (
    <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.dialog}>
        <h2 className={styles.title}>Choose Dimensions</h2>
        <p className={styles.subtitle}>Select two dimensions for the map axes.</p>

        {dimensions.length < 2 && (
          <p className={styles.warning}>You need at least two dimensions.</p>
        )}

        <ul className={styles.list}>
          {dimensions.map((dim, i) => {
            const selIdx = selected.indexOf(dim.id)
            return (
              <li
                key={dim.id}
                className={`${styles.item} ${selIdx !== -1 ? styles.selected : ''}`}
                onClick={() => toggle(dim.id)}
              >
                {/* Show X/Y axis assignment for the two selected dimensions */}
                {selIdx !== -1 && (
                  <span className={styles.axisLabel}>{selIdx === 0 ? 'X' : 'Y'}</span>
                )}
                <span className={styles.dimLabel}>{dim.label || `Dimension ${i + 1}`}</span>
              </li>
            )
          })}
        </ul>

        <div className={styles.buttons}>
          <button className={styles.btnCancel} onClick={onClose}>Cancel</button>
          <button
            className={styles.btnDraw}
            disabled={selected.length !== 2}
            onClick={handleDraw}
          >
            Draw Map
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Type Projection map dialog ────────────────────────────────────────────────
//
// User picks 2 dimensions for the X/Y axes plus an optional membership threshold.
// Types are projected as halos centered on the centroid of member elements' scores.

export function CreateTypeProjectionMap({ onClose }: Props): React.JSX.Element {
  const dimensions = useAppStore(s => s.dimensions)
  const types      = useAppStore(s => s.types)
  const maps       = useAppStore(s => s.maps)
  const addMap     = useAppStore(s => s.addMap)
  const prefs      = usePrefsStore(s => s.prefs)

  const [selected,  setSelected]  = useState<string[]>([])
  const [threshold, setThreshold] = useState(0.5)

  function toggle(id: string): void {
    setSelected(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id)
      if (prev.length < 2)   return [...prev, id]
      return [prev[1], id]
    })
  }

  function handleDraw(): void {
    if (selected.length !== 2) return
    const projCount = maps.filter(m => m.type === 'typeprojection').length
    const config: TypeProjectionMapConfig = {
      id: uuid(),
      type: 'typeprojection',
      title: `Type Map ${projCount + 1}`,
      xDimensionId: selected[0],
      yDimensionId: selected[1],
      xFlipped: false,
      yFlipped: false,
      threshold,
      sizeByWeight: true,
      showLabels: prefs.defaultShowLabels,
      showDots: prefs.defaultShowDots,
      windowX: 100,
      windowY: 100,
      windowWidth: 650,
      windowHeight: 550
    }
    addMap(config)
    onClose()
  }

  return (
    <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.dialog}>
        <h2 className={styles.title}>Type Projection Map</h2>
        <p className={styles.subtitle}>
          Select two dimensions for the axes. Types appear as halos at the centroid of their member elements
          ({types.length} type{types.length !== 1 ? 's' : ''}).
        </p>

        {types.length === 0 && (
          <p className={styles.warning}>No types defined yet. Add types first to see halos.</p>
        )}

        {dimensions.length < 2 && (
          <p className={styles.warning}>You need at least two dimensions.</p>
        )}

        <ul className={styles.list}>
          {dimensions.map((dim, i) => {
            const selIdx = selected.indexOf(dim.id)
            return (
              <li
                key={dim.id}
                className={`${styles.item} ${selIdx !== -1 ? styles.selected : ''}`}
                onClick={() => toggle(dim.id)}
              >
                {selIdx !== -1 && (
                  <span className={styles.axisLabel}>{selIdx === 0 ? 'X' : 'Y'}</span>
                )}
                <span className={styles.dimLabel}>{dim.label || `Dimension ${i + 1}`}</span>
              </li>
            )
          })}
        </ul>

        <div className={styles.thresholdRow}>
          <label className={styles.thresholdLabel}>
            Membership threshold: <strong>{threshold.toFixed(2)}</strong>
          </label>
          <input
            type="range"
            min="0.1"
            max="0.9"
            step="0.05"
            value={threshold}
            onChange={e => setThreshold(parseFloat(e.target.value))}
            className={styles.thresholdSlider}
          />
          <span className={styles.thresholdHint}>
            Elements must score ≥ {threshold.toFixed(2)} on a type to anchor its halo.
          </span>
        </div>

        <div className={styles.buttons}>
          <button className={styles.btnCancel} onClick={onClose}>Cancel</button>
          <button
            className={styles.btnDraw}
            disabled={selected.length !== 2}
            onClick={handleDraw}
          >
            Draw Map
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Semantic map dialog ───────────────────────────────────────────────────────

export function CreateSemanticMap({ onClose }: Props): React.JSX.Element {
  const dimensions = useAppStore(s => s.dimensions)
  const elements   = useAppStore(s => s.elements)
  const maps       = useAppStore(s => s.maps)
  const addMap     = useAppStore(s => s.addMap)
  const prefs      = usePrefsStore(s => s.prefs)

  // Start with all dimensions selected — user can deselect ones they don't want
  const [selectedIds, setSelectedIds] = useState<string[]>(() => dimensions.map(d => d.id))

  function toggle(id: string): void {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  function handleDraw(): void {
    if (selectedIds.length < 2) return
    const semanticCount = maps.filter(m => m.type === 'semantic').length
    const config: SemanticMapConfig = {
      id: uuid(),
      type: 'semantic',
      title: `Semantic Map ${semanticCount + 1}`,
      elementIds: elements.map(e => e.id),
      dimensionIds: selectedIds,
      flippedDimensionIds: [],
      showLabels: prefs.defaultShowLabels,
      showDots: prefs.defaultShowDots,
      windowX: 100,
      windowY: 100,
      windowWidth: 600,
      windowHeight: 500
    }
    addMap(config)
    onClose()
  }

  return (
    <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.dialog}>
        <h2 className={styles.title}>Create Semantic Map</h2>
        <p className={styles.subtitle}>
          Select dimensions to include ({elements.length} element{elements.length !== 1 ? 's' : ''}).
        </p>

        {dimensions.length < 2 && (
          <p className={styles.warning}>You need at least two dimensions.</p>
        )}

        <ul className={styles.list}>
          {dimensions.map((dim, i) => {
            const isOn = selectedIds.includes(dim.id)
            return (
              <li
                key={dim.id}
                className={`${styles.item} ${isOn ? styles.selected : ''}`}
                onClick={() => toggle(dim.id)}
              >
                <span className={styles.axisLabel}>{isOn ? '✓' : ''}</span>
                <span className={styles.dimLabel}>{dim.label || `Dimension ${i + 1}`}</span>
              </li>
            )
          })}
        </ul>

        <div className={styles.buttons}>
          <button className={styles.btnCancel} onClick={onClose}>Cancel</button>
          <button
            className={styles.btnDraw}
            disabled={selectedIds.length < 2}
            onClick={handleDraw}
          >
            Draw Map
          </button>
        </div>
      </div>
    </div>
  )
}
