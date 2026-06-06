import { useState } from 'react'
import { v4 as uuid } from 'uuid'
import { useAppStore } from '../../store/appStore'
import { usePrefsStore } from '../../store/prefsStore'
import type { CartesianMapConfig, SemanticMapConfig } from '../../lib/types'
import styles from './ChooseDimensions.module.css'

interface Props { onClose: () => void }

// ── Cartesian ─────────────────────────────────────────────────────────────────

export function ChooseDimensions({ onClose }: Props): React.JSX.Element {
  const dimensions = useAppStore(s => s.dimensions)
  const maps       = useAppStore(s => s.maps)
  const addMap     = useAppStore(s => s.addMap)
  const prefs      = usePrefsStore(s => s.prefs)

  const [selected, setSelected] = useState<string[]>([])

  function toggle(id: string): void {
    setSelected(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id)
      if (prev.length < 2)   return [...prev, id]
      return [prev[1], id]   // slide window: drop oldest, add new
    })
  }

  function handleDraw(): void {
    if (selected.length !== 2) return
    const mapCount = maps.length + 1
    const config: CartesianMapConfig = {
      id: uuid(),
      type: 'cartesian',
      title: `Map ${mapCount}`,
      xDimensionId: selected[0],
      yDimensionId: selected[1],
      xFlipped: false,
      yFlipped: false,
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

// ── Semantic ──────────────────────────────────────────────────────────────────

export function CreateSemanticMap({ onClose }: Props): React.JSX.Element {
  const dimensions = useAppStore(s => s.dimensions)
  const elements   = useAppStore(s => s.elements)
  const maps       = useAppStore(s => s.maps)
  const addMap     = useAppStore(s => s.addMap)
  const prefs      = usePrefsStore(s => s.prefs)

  const [selectedIds, setSelectedIds] = useState<string[]>(() => dimensions.map(d => d.id))

  function toggle(id: string): void {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  function handleDraw(): void {
    if (selectedIds.length < 2) return
    const config: SemanticMapConfig = {
      id: uuid(),
      type: 'semantic',
      title: `Semantic Map ${maps.filter(m => m.type === 'semantic').length + 1}`,
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
