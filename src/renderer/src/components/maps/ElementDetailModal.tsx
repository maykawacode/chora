// ── ElementDetailModal ────────────────────────────────────────────────────────
//
// Centered modal triggered by right-clicking an element dot on any map.
// Edits color, shape, weight, definition, and collection membership in local
// draft state. Every change is committed together through onClose.
//
// Membership used to be written separately, as scores, and had to be broadcast
// to the main window BEFORE the element update — the main window answers an
// element update by re-broadcasting full state, which would otherwise arrive
// and overwrite the not-yet-sent assignment. Membership is an element field
// now, so it travels in the same payload as color and shape and cannot arrive
// out of order with itself.

import { useState, useEffect, useRef, useCallback } from 'react'
import { useAppStore } from '../../store/appStore'
import { ELEMENT_SHAPES } from '../../lib/types'
import type { Element, ElementShape } from '../../lib/types'
import styles from './ElementDetailModal.module.css'
import { formatRange, numericRange, openWeight } from '../../lib/numericRange'

const SHAPE_SYMBOL: Record<ElementShape, string> = {
  circle:   '●',
  square:   '■',
  triangle: '▲',
  diamond:  '◆'
}

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
  const addCollection = useAppStore(s => s.addCollection)

  const [color,      setColor]      = useState(element?.color ?? '#9d9d53')
  const [hexInput,   setHexInput]   = useState(element?.color ?? '#9d9d53')
  const [shape,      setShape]      = useState<ElementShape>(element?.shape ?? 'circle')
  const [weight,     setWeight]     = useState(String(element?.weight ?? 1))
  const [definition, setDefinition] = useState(element?.definition ?? '')
  const [memberOf,   setMemberOf]   = useState<string[]>(element?.collectionIds ?? [])
  const [newCollectionName, setNewCollectionName] = useState('')

  function toggleCollection(collectionId: string): void {
    setMemberOf(prev => prev.includes(collectionId)
      ? prev.filter(id => id !== collectionId)
      : [...prev, collectionId])
  }

  // The collection has to exist in the store before a chip can be drawn for it,
  // so this one edit is applied immediately rather than held in the draft. The
  // membership it implies still goes through the draft like any other.
  function handleAddCollection(): void {
    const name = newCollectionName.trim()
    if (!name) return
    const id = addCollection(name)
    window.api?.broadcastNewCollection(id, name)
    setMemberOf(prev => [...prev, id])
    setNewCollectionName('')
  }

  // Re-assigned every render so the closure always captures latest state
  const handleCloseRef = useRef<() => void>(() => {})
  handleCloseRef.current = () => {
    if (!element) { onClose(null); return }
    const parsedWeight = openWeight(Number(weight))
    const validCollectionIds = new Set(collections.map(collection => collection.id))
    const validMembership = memberOf.filter(id => validCollectionIds.has(id))
    const currentMembership = element.collectionIds.filter(id => validCollectionIds.has(id))
    const changes: Partial<Element> = {}
    if (color        !== element.color)      changes.color      = color
    if (shape        !== element.shape)      changes.shape      = shape
    if (parsedWeight !== element.weight)     changes.weight     = parsedWeight
    if (definition   !== element.definition) changes.definition = definition
    if (!sameMembership(validMembership, currentMembership)) changes.collectionIds = validMembership
    onClose(Object.keys(changes).length > 0 ? changes : null)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') handleCloseRef.current() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const handleClose = useCallback(() => handleCloseRef.current(), [])

  if (!element) return null

  const weightRange = numericRange(elements.map(item => item.weight))

  function handleColorPicker(value: string): void {
    setColor(value)
    setHexInput(value)
  }

  function handleHexInput(value: string): void {
    setHexInput(value)
    if (/^#[0-9a-fA-F]{6}$/.test(value)) setColor(value)
  }

  return (
    <div
      className={styles.overlay}
      onClick={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
      onMouseMove={e => e.stopPropagation()}
      onMouseUp={e => e.stopPropagation()}
      onContextMenu={e => e.stopPropagation()}
    >
      <div className={styles.modal}>
        <div className={styles.header}>
          <span className={styles.name}>{element.name}</span>
        </div>

        <div className={styles.fieldRow}>
          <label className={styles.label}>Color</label>
          <div className={styles.colorRow}>
            <input
              type="color"
              className={styles.colorSwatch}
              value={color}
              onChange={e => handleColorPicker(e.target.value)}
            />
            <input
              type="text"
              className={styles.hexInput}
              value={hexInput}
              onChange={e => handleHexInput(e.target.value)}
              onBlur={() => setHexInput(color)}
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
                onClick={() => setShape(s)}
                title={s.charAt(0).toUpperCase() + s.slice(1)}
              >
                {SHAPE_SYMBOL[s]}
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
            onChange={e => setWeight(e.target.value)}
          />
          <span className={styles.range}>{formatRange(weightRange)}</span>
        </div>

        <textarea
          className={styles.description}
          value={definition}
          rows={4}
          placeholder="Definition…"
          onChange={e => setDefinition(e.target.value)}
        />

        <div className={styles.collectionsSection}>
          <span className={styles.collectionsLabel}>Collections</span>
          {collections.length > 0 && (
            <div className={styles.collectionList}>
              {collections.map(c => {
                const member = memberOf.includes(c.id)
                return (
                  <div
                    key={c.id}
                    className={`${styles.collectionRow} ${member ? styles.collectionRowOn : ''}`}
                    onClick={() => toggleCollection(c.id)}
                  >
                    <span className={styles.collectionDot} style={{ background: c.color }} />
                    <span className={styles.collectionName}>{c.name}</span>
                    {member && <span className={styles.collectionCheck}>✓</span>}
                  </div>
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
                if (e.key === 'Escape') {
                  if (newCollectionName.trim()) {
                    e.nativeEvent.stopImmediatePropagation()
                    setNewCollectionName('')
                  }
                  return
                }
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
          <button className={styles.doneBtn} onClick={handleClose}>Done</button>
        </div>
      </div>
    </div>
  )
}
