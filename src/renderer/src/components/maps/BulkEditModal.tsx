// ── BulkEditModal ─────────────────────────────────────────────────────────────
//
// Modal for batch-editing color, shape, weight, and collection membership
// across multiple selected elements. Triggered by right-clicking a selected dot
// when 2+ elements are in selectedElementIds. Empty/null draft fields mean
// "don't change this property" — only fields the user explicitly touches are
// applied. Cancel discards all changes.
//
// Color, shape and weight resolve to one value for the whole selection, so they
// travel as a single shared payload. Membership cannot: a collection nobody
// touched must leave each element's own answer alone, so only the collections
// the user did touch are driven to all-or-none, and the result is a different
// id list per element. Hence the two-part BulkChanges below.

import { useState, useRef, useCallback } from 'react'
import { useAppStore } from '../../store/appStore'
import { ELEMENT_SHAPES, ELEMENT_SHAPE_SYMBOLS } from '../../lib/types'
import type { Element, ElementShape } from '../../lib/types'
import styles from './ElementDetailModal.module.css'
import { openWeight } from '../../lib/numericRange'
import { CollectionChoiceRow } from '../CollectionChoiceRow'
import { ForwardActionButton } from '../ConfirmationDisc'
import { ModalShell } from '../ModalShell'

export interface BulkChanges {
  /** Applied identically to every selected element. */
  fields: Partial<Element>
  /** Resulting membership by element id — present only if any chip was touched. */
  collectionIds?: Record<string, string[]>
}

interface Props {
  elementIds: string[]
  elements:   Element[]
  onClose:    (changes?: BulkChanges) => void
}

export function BulkEditModal({ elementIds, elements, onClose }: Props): React.JSX.Element {
  const selected = elements.filter(e => elementIds.includes(e.id))

  const collections   = useAppStore(s => s.collections)
  const addCollection = useAppStore(s => s.addCollection)

  // Derive initial element field values
  const allSameColor  = selected.length > 0 && selected.every(e => e.color  === selected[0].color)
  const allSameShape  = selected.length > 0 && selected.every(e => e.shape  === selected[0].shape)
  const allSameWeight = selected.length > 0 && selected.every(e => e.weight === selected[0].weight)

  const [color,    setColor]    = useState<string | null>(allSameColor  ? selected[0].color  : null)
  const [hexInput, setHexInput] = useState(allSameColor ? selected[0].color : '')
  const [shape,    setShape]    = useState<ElementShape | null>(allSameShape ? selected[0].shape : null)
  const [weight,   setWeight]   = useState(allSameWeight ? String(selected[0].weight) : '')

  // true → every selected element joins, false → every one leaves,
  // absent → untouched, and each element keeps whatever it already had.
  const [membership, setMembership] = useState<Record<string, boolean>>({})
  const [newCollectionName, setNewCollectionName] = useState('')

  function initialState(collectionId: string): 'all' | 'none' | 'mixed' {
    const count = selected.filter(e => e.collectionIds.includes(collectionId)).length
    if (count === 0) return 'none'
    if (count === selected.length) return 'all'
    return 'mixed'
  }

  function effectiveState(collectionId: string): 'all' | 'none' | 'mixed' {
    const pending = membership[collectionId]
    if (pending === undefined) return initialState(collectionId)
    return pending ? 'all' : 'none'
  }

  // Mixed resolves to all, so one click gives a partly-assigned selection a
  // single answer rather than inverting each element separately.
  function toggleCollection(collectionId: string): void {
    const next = effectiveState(collectionId) !== 'all'
    setMembership(prev => ({ ...prev, [collectionId]: next }))
  }

  function handleAddCollection(): void {
    const name = newCollectionName.trim()
    if (!name) return
    const id = addCollection(name)
    window.api?.broadcastNewCollection(id, name)
    setMembership(prev => ({ ...prev, [id]: true }))
    setNewCollectionName('')
  }

  const handleCloseRef = useRef<(apply: boolean) => void>(() => {})
  handleCloseRef.current = (apply: boolean) => {
    if (!apply) { onClose(undefined); return }

    const fields: Partial<Element> = {}
    if (color !== null) fields.color = color
    if (shape !== null) fields.shape = shape
    if (weight.trim() !== '') fields.weight = openWeight(Number(weight))

    const validCollectionIds = new Set(collections.map(collection => collection.id))
    const touched = Object.entries(membership)
      .filter(([collectionId]) => validCollectionIds.has(collectionId))
    const collectionIds = touched.length > 0
      ? Object.fromEntries(selected.map(el => {
          const ids = new Set(el.collectionIds.filter(id => validCollectionIds.has(id)))
          for (const [collectionId, member] of touched) {
            if (member) ids.add(collectionId)
            else ids.delete(collectionId)
          }
          return [el.id, [...ids]]
        }))
      : undefined

    if (Object.keys(fields).length === 0 && !collectionIds) { onClose(undefined); return }
    onClose({ fields, collectionIds })
  }

  const handleApply  = useCallback(() => handleCloseRef.current(true),  [])
  const handleCancel = useCallback(() => handleCloseRef.current(false), [])

  function handleColorPicker(value: string): void {
    setColor(value)
    setHexInput(value)
  }

  function handleHexInput(value: string): void {
    setHexInput(value)
    if (/^#[0-9a-fA-F]{6}$/.test(value)) setColor(value)
  }

  return (
    <ModalShell overlayClassName={styles.overlay} dialogClassName={styles.modal} onClose={handleCancel}>
        <div className={styles.header}>
          <span className={styles.name}>Edit {elementIds.length} Elements</span>
        </div>

        <div className={styles.fieldRow}>
          <label className={styles.label}>Color</label>
          <div className={styles.colorRow}>
            <input
              type="color"
              className={styles.colorSwatch}
              value={color ?? '#9d9d53'}
              onChange={e => handleColorPicker(e.target.value)}
            />
            <input
              type="text"
              className={styles.hexInput}
              value={hexInput}
              placeholder="mixed"
              onChange={e => handleHexInput(e.target.value)}
              onBlur={() => { if (color) setHexInput(color) }}
              spellCheck={false}
              maxLength={7}
            />
          </div>
        </div>

        <div className={styles.fieldRow}>
          <label className={styles.label}>Shape</label>
          <div className={styles.shapePicker}>
            {ELEMENT_SHAPES.map(s => (
              <button
                key={s}
                className={`${styles.shapeBtn} ${shape === s ? styles.shapeBtnActive : ''}`}
                onClick={() => setShape(prev => prev === s ? null : s)}
                title={s.charAt(0).toUpperCase() + s.slice(1)}
              >
                {ELEMENT_SHAPE_SYMBOLS[s]}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.fieldRow}>
          <label className={styles.label}>Weight</label>
          <input
            type="number"
            className={styles.weightInput}
            min={0}
            value={weight}
            placeholder="mixed"
            onChange={e => setWeight(e.target.value)}
          />
        </div>

        <div className={`${styles.collectionsSection} ${styles.bulkCollectionsSection}`}>
          <span className={styles.collectionsLabel}>Collections</span>
          {collections.length > 0 && (
            <div className={styles.collectionList}>
              {collections.map(c => {
                const state = effectiveState(c.id)
                return (
                  <CollectionChoiceRow
                    key={c.id}
                    name={c.name || 'Untitled collection'}
                    color={c.color}
                    state={state}
                    onToggle={() => toggleCollection(c.id)}
                  />
                )
              })}
            </div>
          )}
          {collections.length === 0 && (
            <span className={styles.collectionsEmpty}>No collections — add one below</span>
          )}
          <div className={styles.newCollectionRow}>
            <input
              className={styles.newCollectionInput}
              value={newCollectionName}
              placeholder="New collection…"
              onChange={e => setNewCollectionName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && newCollectionName.trim()) handleAddCollection()
              }}
            />
            <button
              className={styles.addCollectionBtn}
              disabled={!newCollectionName.trim()}
              onClick={handleAddCollection}
            >Add</button>
          </div>
        </div>

        <div className={styles.footer}>
          <ForwardActionButton label="Apply changes" onClick={handleApply} />
        </div>
    </ModalShell>
  )
}
