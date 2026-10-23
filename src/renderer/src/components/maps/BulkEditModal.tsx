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
import type { Element, ElementShape } from '../../lib/types'
import styles from './ElementDetailModal.module.css'
import { openWeight } from '../../lib/numericRange'
import { ForwardActionButton } from '../ConfirmationDisc'
import { ModalShell } from '../ModalShell'
import { CollectionsField, ColorField, ShapeField, WeightField } from './ElementFields'

interface BulkChanges {
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

  // Derive initial element field values
  const allSameColor  = selected.length > 0 && selected.every(e => e.color  === selected[0].color)
  const allSameShape  = selected.length > 0 && selected.every(e => e.shape  === selected[0].shape)
  const allSameWeight = selected.length > 0 && selected.every(e => e.weight === selected[0].weight)

  const [color,    setColor]    = useState<string | null>(allSameColor  ? selected[0].color  : null)
  const [shape,    setShape]    = useState<ElementShape | null>(allSameShape ? selected[0].shape : null)
  const [weight,   setWeight]   = useState(allSameWeight ? String(selected[0].weight) : '')

  // true → every selected element joins, false → every one leaves,
  // absent → untouched, and each element keeps whatever it already had.
  const [membership, setMembership] = useState<Record<string, boolean>>({})

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

  return (
    <ModalShell overlayClassName={styles.overlay} dialogClassName={styles.modal} onClose={handleCancel}>
        <div className={styles.header}>
          <span className={styles.name}>Edit {elementIds.length} Elements</span>
        </div>

        <ColorField color={color} onChange={setColor} several />
        {/* Picking the chosen shape again clears it, back to "unchanged". */}
        <ShapeField shape={shape} onPick={s => setShape(prev => prev === s ? null : s)} />
        <WeightField weight={weight} onChange={setWeight} several />

        <CollectionsField
          className={styles.bulkCollectionsSection}
          stateOf={effectiveState}
          onToggle={toggleCollection}
          onCreated={id => setMembership(prev => ({ ...prev, [id]: true }))}
        />

        <div className={styles.footer}>
          <ForwardActionButton label="Apply changes" onClick={handleApply} />
        </div>
    </ModalShell>
  )
}
