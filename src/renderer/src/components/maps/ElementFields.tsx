// ── Map dialog fields ─────────────────────────────────────────────────────────
//
// The fields the map's edit dialogs share: colour, shape, weight and
// collection membership. Each edits a draft the dialog owns and applies on
// its green arrow. In the bulk dialog (`several`), a null colour or shape and
// an empty weight mean "unchanged", and empty text fields read "mixed".

import { useState } from 'react'
import { useAppStore } from '../../store/appStore'
import { ELEMENT_SHAPES, ELEMENT_SHAPE_SYMBOLS, type ElementShape } from '../../lib/types'
import { formatRange, type NumericRange } from '../../lib/numericRange'
import { DEFAULT_ELEMENT_COLOR, isHexColor } from '../../lib/color'
import { CollectionChoiceRow } from '../CollectionChoiceRow'
import styles from './ElementDetailModal.module.css'

/** Swatch plus hex entry; the hex text applies once it is a full colour, and settles back to it on blur. */
export function ColorField({ color, onChange, several = false }: {
  color: string | null
  onChange: (color: string) => void
  several?: boolean
}): React.JSX.Element {
  const [hex, setHex] = useState(color ?? '')
  return (
    <div className={styles.fieldRow}>
      <label className={styles.label}>Color</label>
      <div className={styles.colorRow}>
        <input
          type="color"
          className={styles.colorSwatch}
          value={color ?? DEFAULT_ELEMENT_COLOR}
          onChange={e => { onChange(e.target.value); setHex(e.target.value) }}
        />
        <input
          type="text"
          className={styles.hexInput}
          value={hex}
          placeholder={several ? 'mixed' : undefined}
          onChange={e => { setHex(e.target.value); if (isHexColor(e.target.value)) onChange(e.target.value) }}
          onBlur={() => { if (color !== null) setHex(color) }}
          spellCheck={false}
          maxLength={7}
        />
      </div>
    </div>
  )
}

export function ShapeField({ shape, onPick }: {
  shape: ElementShape | null
  onPick: (shape: ElementShape) => void
}): React.JSX.Element {
  return (
    <div className={styles.fieldRow}>
      <label className={styles.label}>Shape</label>
      <div className={styles.shapePicker}>
        {ELEMENT_SHAPES.map(s => (
          <button
            key={s}
            className={`${styles.shapeBtn} ${shape === s ? styles.shapeBtnActive : ''}`}
            onClick={() => onPick(s)}
            title={s.charAt(0).toUpperCase() + s.slice(1)}
          >
            <span className="elementShapeGlyph" data-shape={s}>{ELEMENT_SHAPE_SYMBOLS[s]}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

/** Weight as typed, so an empty field can mean "unchanged"; the range shows the current spread. */
export function WeightField({ weight, onChange, range, several = false }: {
  weight: string
  onChange: (weight: string) => void
  range?: NumericRange
  several?: boolean
}): React.JSX.Element {
  return (
    <div className={styles.fieldRow}>
      <label className={styles.label}>Weight</label>
      <input
        type="number"
        className={styles.weightInput}
        min={0}
        value={weight}
        placeholder={several ? 'mixed' : undefined}
        onChange={e => onChange(e.target.value)}
      />
      {range && <span className={styles.range}>{formatRange(range)}</span>}
    </div>
  )
}

/**
 * Collection rows plus "New collection…". A new collection is created in the
 * store at once, since a row can only be drawn for one that exists; joining it
 * goes through the dialog's draft like any other change.
 */
export function CollectionsField({ stateOf, onToggle, onCreated, className = '' }: {
  stateOf: (collectionId: string) => 'all' | 'none' | 'mixed'
  onToggle: (collectionId: string) => void
  onCreated: (collectionId: string) => void
  className?: string
}): React.JSX.Element {
  const collections   = useAppStore(s => s.collections)
  const addCollection = useAppStore(s => s.addCollection)
  const [newName, setNewName] = useState('')

  function create(): void {
    const name = newName.trim()
    if (!name) return
    const id = addCollection(name)
    window.api?.broadcastNewCollection(id, name)
    onCreated(id)
    setNewName('')
  }

  return (
    <div className={`${styles.collectionsSection} ${className}`}>
      <span className={styles.collectionsLabel}>Collections</span>
      {collections.length > 0 ? (
        <div className={styles.collectionList}>
          {collections.map(c => (
            <CollectionChoiceRow
              key={c.id}
              name={c.name || 'Untitled collection'}
              color={c.color}
              state={stateOf(c.id)}
              onToggle={() => onToggle(c.id)}
            />
          ))}
        </div>
      ) : (
        <span className={styles.collectionsEmpty}>No collections — add one below</span>
      )}
      <div className={styles.newCollectionRow}>
        <input
          className={styles.newCollectionInput}
          value={newName}
          placeholder="New collection…"
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') create() }}
        />
        <button className={styles.addCollectionBtn} disabled={!newName.trim()} onClick={create}>Add</button>
      </div>
    </div>
  )
}
