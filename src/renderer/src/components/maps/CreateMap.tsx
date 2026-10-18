// ── Creating a map ────────────────────────────────────────────────────────────
//
// DimensionPicker chooses a new map's dimensions and adds the map. A cartesian
// map takes exactly two (the first is X, the second Y); a semantic map takes
// any two or more and starts with every dimension chosen. The map types and
// how each starts are described in mapTypes.ts.

import { useState } from 'react'
import { useAppStore } from '../../store/appStore'
import { usePrefsStore } from '../../store/prefsStore'
import type { MapType } from '../../lib/types'
import { ForwardActionButton } from '../ConfirmationDisc'
import { ModalShell } from '../ModalShell'
import { mapTypeInfo, newMapConfig } from './mapTypes'
import styles from './CreateMap.module.css'

function DimensionPicker({ type, onCreated }: {
  type: MapType
  onCreated: () => void
}): React.JSX.Element {
  const info       = mapTypeInfo(type)
  const pair       = info.dimensions === 'pair'
  const dimensions = useAppStore(s => s.dimensions)
  const elements   = useAppStore(s => s.elements)
  const addMap     = useAppStore(s => s.addMap)

  const [selected, setSelected] = useState<string[]>(() => pair ? [] : dimensions.map(d => d.id))
  const ready = pair ? selected.length === 2 : selected.length >= 2

  function toggle(id: string): void {
    setSelected(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id)
      // A pair keeps a sliding window of two: a third choice drops the oldest.
      if (pair && prev.length === 2) return [prev[1], id]
      return [...prev, id]
    })
  }

  function create(): void {
    if (!ready) return
    const { prefs } = usePrefsStore.getState()
    addMap(newMapConfig(type, {
      dimensionIds: selected,
      maps: useAppStore.getState().maps,
      elements,
      showLabels: prefs.defaultShowLabels,
      marks: prefs.defaultMarks
    }))
    onCreated()
  }

  return (
    <>
      <h2 className={styles.title}>{info.picker.title}</h2>
      <p className={styles.subtitle}>{info.picker.hint(elements.length)}</p>

      {dimensions.length < 2 && (
        <p className={styles.warning}>You need at least two dimensions.</p>
      )}

      <ul className={styles.list}>
        {dimensions.map((dim, i) => {
          const at = selected.indexOf(dim.id)
          // A pair shows which axis each choice becomes; several show a check.
          const mark = at === -1 ? '' : pair ? (at === 0 ? 'X' : 'Y') : '✓'
          return (
            <li
              key={dim.id}
              className={`${styles.item} ${at !== -1 ? styles.selected : ''}`}
              onClick={() => toggle(dim.id)}
            >
              {(mark || !pair) && <span className={styles.axisLabel}>{mark}</span>}
              <span className={styles.dimLabel}>{dim.label || `Dimension ${i + 1}`}</span>
            </li>
          )
        })}
      </ul>

      <div className={styles.buttons}>
        <ForwardActionButton label={info.picker.action} disabled={!ready} onClick={create} />
      </div>
    </>
  )
}

export function CreateMapDialog({ type, onClose }: { type: MapType; onClose: () => void }): React.JSX.Element {
  return (
    <ModalShell overlayClassName={styles.overlay} dialogClassName={`${styles.dialog} ${styles.selectionDialog}`} onClose={onClose}>
      <DimensionPicker type={type} onCreated={onClose} />
    </ModalShell>
  )
}
