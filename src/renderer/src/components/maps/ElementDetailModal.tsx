// ── ElementDetailModal ────────────────────────────────────────────────────────
//
// Centered modal triggered by right-clicking an element dot on any map.
// Edits color, shape, weight, definition, and type membership in local draft
// state. Element field changes are batched and committed via onClose callback;
// type assignment changes are flushed to the store before the callback fires.

import { useState, useEffect, useRef, useCallback } from 'react'
import { useAppStore } from '../../store/appStore'
import { ELEMENT_SHAPES } from '../../lib/types'
import type { Element, ElementShape } from '../../lib/types'
import styles from './ElementDetailModal.module.css'

const SHAPE_SYMBOL: Record<ElementShape, string> = {
  circle:   '●',
  square:   '■',
  triangle: '▲',
  diamond:  '◆'
}

interface Props {
  elementId: string
  onClose: (changes: Partial<Element> | null) => void
}

export function ElementDetailModal({ elementId, onClose }: Props): React.JSX.Element | null {
  const element    = useAppStore(s => s.elements.find(e => e.id === elementId))
  const types      = useAppStore(s => s.types)
  const scores     = useAppStore(s => s.scores)
  const addType    = useAppStore(s => s.addType)
  const setScore   = useAppStore(s => s.setScore)
  const clearScore = useAppStore(s => s.clearScore)

  const [color,       setColor]       = useState(element?.color       ?? '#9d9d53')
  const [hexInput,    setHexInput]    = useState(element?.color       ?? '#9d9d53')
  const [shape,       setShape]       = useState<ElementShape>(element?.shape ?? 'circle')
  const [weight,      setWeight]      = useState(String(element?.weight ?? 1))
  const [definition,  setDefinition]  = useState(element?.definition ?? '')
  const [typeChanges, setTypeChanges] = useState<Record<string, boolean>>({})
  const [newTypeName, setNewTypeName] = useState('')

  function isAssigned(typeId: string): boolean {
    if (typeId in typeChanges) return typeChanges[typeId]
    return (scores[elementId]?.[typeId] ?? 0) > 0
  }

  function toggleType(typeId: string): void {
    setTypeChanges(prev => ({ ...prev, [typeId]: !isAssigned(typeId) }))
  }

  function handleAddType(): void {
    const name = newTypeName.trim()
    if (!name) return
    const id = addType(name)
    window.api?.broadcastNewType(id, name)
    setTypeChanges(prev => ({ ...prev, [id]: true }))
    setNewTypeName('')
  }

  // Re-assigned every render so the closure always captures latest state
  const handleCloseRef = useRef<() => void>(() => {})
  handleCloseRef.current = () => {
    if (!element) { onClose(null); return }
    // Broadcast scores to main window BEFORE the element update IPC fires.
    // The main window's onElementUpdate re-broadcasts full state to all map
    // windows; if scores haven't reached the main window first, the broadcast
    // overwrites the local score change and the assignment reverts.
    const hasTypeChanges = Object.keys(typeChanges).length > 0
    for (const [typeId, assigned] of Object.entries(typeChanges)) {
      window.api?.broadcastScore(elementId, typeId, assigned ? 1.0 : 0)
      if (assigned) setScore(elementId, typeId, 1.0)
      else clearScore(elementId, typeId)
    }
    const parsedWeight = Math.max(1, Math.min(100, +weight || 1))
    const changes: Partial<Element> = {}
    if (color       !== element.color)      changes.color      = color
    if (shape       !== element.shape)      changes.shape      = shape
    if (parsedWeight !== element.weight)    changes.weight     = parsedWeight
    if (definition  !== element.definition) changes.definition = definition
    // Pass {} when only type changes were made so broadcastElement still fires,
    // which triggers the main window to broadcast the updated state back.
    const payload = Object.keys(changes).length > 0 ? changes : (hasTypeChanges ? {} : null)
    onClose(payload)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') handleCloseRef.current() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const handleClose = useCallback(() => handleCloseRef.current(), [])

  if (!element) return null

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
            min={1}
            max={100}
            value={weight}
            onChange={e => setWeight(e.target.value)}
          />
        </div>

        <textarea
          className={styles.description}
          value={definition}
          rows={4}
          placeholder="Definition…"
          onChange={e => setDefinition(e.target.value)}
        />

        <div className={styles.typesSection}>
          <span className={styles.typesLabel}>Types</span>
          {types.length > 0 && (
            <div className={styles.typeList}>
              {types.map(t => {
                const assigned = isAssigned(t.id)
                return (
                  <div
                    key={t.id}
                    className={`${styles.typeRow} ${assigned ? styles.typeRowOn : ''}`}
                    onClick={() => toggleType(t.id)}
                  >
                    <span className={styles.typeDot} style={{ background: t.color }} />
                    <span className={styles.typeName}>{t.name}</span>
                    {assigned && <span className={styles.typeCheck}>✓</span>}
                  </div>
                )
              })}
            </div>
          )}
          {types.length === 0 && (
            <span className={styles.typesEmpty}>No types — add one below</span>
          )}
          <div className={styles.newTypeRow}>
            <input
              className={styles.newTypeInput}
              value={newTypeName}
              placeholder="New type…"
              onChange={e => setNewTypeName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Escape') {
                  if (newTypeName.trim()) { e.nativeEvent.stopImmediatePropagation(); setNewTypeName('') }
                  return
                }
                if (e.key === 'Enter' && newTypeName.trim()) handleAddType()
              }}
            />
            <button
              className={styles.addTypeBtn}
              disabled={!newTypeName.trim()}
              onClick={handleAddType}
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
