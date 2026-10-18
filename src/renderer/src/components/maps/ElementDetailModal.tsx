// ── ElementDetailModal ────────────────────────────────────────────────────────
//
// Centered modal triggered by right-clicking an element dot on any map.
// Edits name, color, shape, weight, definition, and collection membership in
// local draft state. Changes are committed only through the green arrow;
// Escape or a background click abandons the draft.
//
// Membership used to be written separately, as scores, and had to be broadcast
// to the main window BEFORE the element update — the main window answers an
// element update by re-broadcasting full state, which would otherwise arrive
// and overwrite the not-yet-sent assignment. Membership is an element field
// now, so it travels in the same payload as color and shape and cannot arrive
// out of order with itself.

import { useState, useRef, useCallback } from 'react'
import { useAppStore } from '../../store/appStore'
import type { Element, ElementShape } from '../../lib/types'
import styles from './ElementDetailModal.module.css'
import { numericRange, openWeight } from '../../lib/numericRange'
import { ForwardActionButton } from '../ConfirmationDisc'
import { ModalShell } from '../ModalShell'
import { DEFAULT_ELEMENT_COLOR } from '../../lib/color'
import { CollectionsField, ColorField, ShapeField, WeightField } from './ElementFields'

// Membership is a set; the array only records it. Two lists holding the same
// ids in a different order are the same membership and must not read as an
// edit, or closing the modal would broadcast a change nobody made.
function sameMembership(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every(id => b.includes(id))
}

interface Props {
  elementId: string
  onClose: (changes: Partial<Element> | null) => void
}

export function ElementDetailModal({ elementId, onClose }: Props): React.JSX.Element | null {
  const elements      = useAppStore(s => s.elements)
  const element       = elements.find(e => e.id === elementId)
  const collections   = useAppStore(s => s.collections)

  const [name,       setName]       = useState(element?.name ?? '')
  const [color,      setColor]      = useState(element?.color ?? DEFAULT_ELEMENT_COLOR)
  const [shape,      setShape]      = useState<ElementShape>(element?.shape ?? 'circle')
  const [weight,     setWeight]     = useState(String(element?.weight ?? 1))
  const [definition, setDefinition] = useState(element?.definition ?? '')
  const [memberOf,   setMemberOf]   = useState<string[]>(element?.collectionIds ?? [])

  function toggleCollection(collectionId: string): void {
    setMemberOf(prev => prev.includes(collectionId)
      ? prev.filter(id => id !== collectionId)
      : [...prev, collectionId])
  }

  // Re-assigned every render so the closure always captures latest state
  const handleCloseRef = useRef<(apply: boolean) => void>(() => {})
  handleCloseRef.current = (apply: boolean) => {
    if (!apply) { onClose(null); return }
    if (!element) { onClose(null); return }
    const parsedWeight = openWeight(Number(weight))
    const validCollectionIds = new Set(collections.map(collection => collection.id))
    const validMembership = memberOf.filter(id => validCollectionIds.has(id))
    const currentMembership = element.collectionIds.filter(id => validCollectionIds.has(id))
    const trimmedName = name.trim()
    const changes: Partial<Element> = {}
    if (trimmedName && trimmedName !== element.name) changes.name = trimmedName
    if (color        !== element.color)      changes.color      = color
    if (shape        !== element.shape)      changes.shape      = shape
    if (parsedWeight !== element.weight)     changes.weight     = parsedWeight
    if (definition   !== element.definition) changes.definition = definition
    if (!sameMembership(validMembership, currentMembership)) changes.collectionIds = validMembership
    onClose(Object.keys(changes).length > 0 ? changes : null)
  }

  const handleApply  = useCallback(() => handleCloseRef.current(true),  [])
  const handleCancel = useCallback(() => handleCloseRef.current(false), [])

  if (!element) return null

  const weightRange = numericRange(elements.map(item => item.weight))

  return (
    <ModalShell overlayClassName={styles.overlay} dialogClassName={styles.modal} onClose={handleCancel}>
        <div className={styles.header}>
          <input
            className={styles.nameInput}
            value={name}
            onChange={e => setName(e.target.value)}
            aria-label="Element name"
            spellCheck
          />
        </div>

        <ColorField color={color} onChange={setColor} />
        <ShapeField shape={shape} onPick={setShape} />
        <WeightField weight={weight} onChange={setWeight} range={weightRange} />

        <textarea
          className={styles.description}
          value={definition}
          rows={4}
          placeholder="Definition…"
          onChange={e => setDefinition(e.target.value)}
        />

        <CollectionsField
          stateOf={id => memberOf.includes(id) ? 'all' : 'none'}
          onToggle={toggleCollection}
          onCreated={id => setMemberOf(prev => [...prev, id])}
        />

        <div className={styles.footer}>
          <ForwardActionButton label="Apply element changes" onClick={handleApply} />
        </div>
    </ModalShell>
  )
}
