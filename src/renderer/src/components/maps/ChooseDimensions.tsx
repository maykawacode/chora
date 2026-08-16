// ── Map creation dialogs ──────────────────────────────────────────────────────
//
// Two modal dialogs live in this file because they share the same CSS module
// and follow the same interaction pattern (pick from a list → create map).
//
// ChooseDimensions   — creates a Cartesian map; user picks exactly 2 dimensions
// CreateSemanticMap  — creates a Semantic map; user picks any subset of dimensions
//
// There is no separate type-projection dialog: type clusters are a toggle in
// the map's sidebar, so a cartesian map is the only 2D map you create.

import { useState } from 'react'
import { useAppStore } from '../../store/appStore'
import { usePrefsStore } from '../../store/prefsStore'
import type { CartesianMapConfig, SemanticMapConfig } from '../../lib/types'
import { ForwardActionButton } from '../ConfirmationDisc'
import { ModalShell } from '../ModalShell'
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
      id: crypto.randomUUID(),
      type: 'cartesian',
      title: `Map ${maps.length + 1}`,
      xDimensionId: selected[0],
      yDimensionId: selected[1],
      xFlipped: false,
      yFlipped: false,
      sizeByWeight: true,
      // New maps always begin with each Element's own color. This is deliberate
      // application behavior, not a user-configurable default.
      colorMode: 'element',
      onlySelectedCollections: false,
      // No blobs to start — select collections in the map's sidebar to draw
      // them and color their members.
      shownCollectionIds: [],
      showLabels: prefs.defaultShowLabels,
      marks: prefs.defaultMarks,
      windowX: 100,
      windowY: 100,
      windowWidth: 600,
      windowHeight: 500
    }
    addMap(config)
    onClose()
  }

  return (
    <ModalShell overlayClassName={styles.overlay} dialogClassName={`${styles.dialog} ${styles.selectionDialog}`} onClose={onClose}>
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
          <ForwardActionButton
            label="Draw map"
            disabled={selected.length !== 2}
            onClick={handleDraw}
          />
        </div>
    </ModalShell>
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
      id: crypto.randomUUID(),
      type: 'semantic',
      title: `Semantic Map ${semanticCount + 1}`,
      elementIds: elements.map(e => e.id),
      dimensionIds: selectedIds,
      flippedDimensionIds: [],
      // Weight sizing is off by default here: semantic axes sit close together,
      // so uniform dots keep a fresh map readable.
      sizeByWeight: false,
      // Match Cartesian maps: new maps always begin with Element colors.
      colorMode: 'element',
      // No collection claiming any color to start — select them in the map's
      // sidebar, same as on a cartesian map.
      shownCollectionIds: [],
      showLabels: prefs.defaultShowLabels,
      marks: prefs.defaultMarks,
      windowX: 100,
      windowY: 100,
      windowWidth: 600,
      windowHeight: 500
    }
    addMap(config)
    onClose()
  }

  return (
    <ModalShell overlayClassName={styles.overlay} dialogClassName={`${styles.dialog} ${styles.selectionDialog}`} onClose={onClose}>
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
          <ForwardActionButton
            label="Draw semantic map"
            disabled={selectedIds.length < 2}
            onClick={handleDraw}
          />
        </div>
    </ModalShell>
  )
}
