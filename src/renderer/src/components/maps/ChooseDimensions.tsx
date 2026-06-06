import { useState } from 'react'
import { v4 as uuid } from 'uuid'
import { useAppStore } from '../../store/appStore'
import type { CartesianMapConfig } from '../../lib/types'
import styles from './ChooseDimensions.module.css'

interface Props {
  onClose: () => void
}

export function ChooseDimensions({ onClose }: Props): React.JSX.Element {
  const dimensions = useAppStore(s => s.dimensions)
  const maps       = useAppStore(s => s.maps)
  const addMap     = useAppStore(s => s.addMap)

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
      showLabels: true,
      showDots: true,
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
