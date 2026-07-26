// ── BulkEditModal ─────────────────────────────────────────────────────────────
//
// Modal for batch-editing color, shape, weight, and type membership across
// multiple selected elements. Triggered by right-clicking a selected dot when
// 2+ elements are in selectedElementIds. Empty/null draft fields mean "don't
// change this property" — only fields the user explicitly touches are applied.
// Type actions are flushed to the store on Apply; Cancel discards all changes.

import { useState, useEffect, useRef, useCallback } from 'react'
import { useAppStore } from '../../store/appStore'
import { ELEMENT_SHAPES } from '../../lib/types'
import type { Element, ElementShape } from '../../lib/types'
import styles from './BulkEditModal.module.css'

const SHAPE_SYMBOL: Record<ElementShape, string> = {
  circle:   '●',
  square:   '■',
  triangle: '▲',
  diamond:  '◆'
}

interface Props {
  elementIds: string[]
  elements:   Element[]
  onClose:    (changes?: Partial<Element>) => void
}

export function BulkEditModal({ elementIds, elements, onClose }: Props): React.JSX.Element {
  const selected = elements.filter(e => elementIds.includes(e.id))

  const types      = useAppStore(s => s.types)
  const scores     = useAppStore(s => s.scores)
  const addType    = useAppStore(s => s.addType)
  const setScore   = useAppStore(s => s.setScore)
  const clearScore = useAppStore(s => s.clearScore)

  // Derive initial element field values
  const allSameColor  = selected.length > 0 && selected.every(e => e.color  === selected[0].color)
  const allSameShape  = selected.length > 0 && selected.every(e => e.shape  === selected[0].shape)
  const allSameWeight = selected.length > 0 && selected.every(e => e.weight === selected[0].weight)

  const [color,    setColor]    = useState<string | null>(allSameColor  ? selected[0].color  : null)
  const [hexInput, setHexInput] = useState(allSameColor ? selected[0].color : '')
  const [shape,    setShape]    = useState<ElementShape | null>(allSameShape ? selected[0].shape : null)
  const [weight,   setWeight]   = useState(allSameWeight ? String(selected[0].weight) : '')

  // 'assign' → set all to 1.0, 'unassign' → clear all, null → untouched
  const [typeActions, setTypeActions] = useState<Record<string, 'assign' | 'unassign' | null>>({})
  const [newTypeName, setNewTypeName] = useState('')

  function getInitialTypeState(typeId: string): 'all' | 'none' | 'mixed' {
    const count = elementIds.filter(eid => (scores[eid]?.[typeId] ?? 0) > 0).length
    if (count === 0) return 'none'
    if (count === elementIds.length) return 'all'
    return 'mixed'
  }

  function getEffectiveState(typeId: string): 'all' | 'none' | 'mixed' {
    if (typeActions[typeId] === 'assign') return 'all'
    if (typeActions[typeId] === 'unassign') return 'none'
    return getInitialTypeState(typeId)
  }

  function toggleType(typeId: string): void {
    const current = getEffectiveState(typeId)
    setTypeActions(prev => ({ ...prev, [typeId]: current === 'all' ? 'unassign' : 'assign' }))
  }

  function handleAddType(): void {
    const name = newTypeName.trim()
    if (!name) return
    const id = addType(name)
    window.api?.broadcastNewType(id, name)
    setTypeActions(prev => ({ ...prev, [id]: 'assign' }))
    setNewTypeName('')
  }

  const handleCloseRef = useRef<(apply: boolean) => void>(() => {})
  handleCloseRef.current = (apply: boolean) => {
    if (!apply) { onClose(undefined); return }
    // Broadcast scores to main window BEFORE the element update IPC fires —
    // same ordering fix as ElementDetailModal.
    const hasTypeChanges = Object.values(typeActions).some(a => a !== null)
    for (const [typeId, action] of Object.entries(typeActions)) {
      if (!action) continue
      for (const eid of elementIds) {
        window.api?.broadcastScore(eid, typeId, action === 'assign' ? 1.0 : 0)
        if (action === 'assign') setScore(eid, typeId, 1.0)
        else clearScore(eid, typeId)
      }
    }
    const changes: Partial<Element> = {}
    if (color !== null) changes.color = color
    if (shape !== null) changes.shape = shape
    const parsed = parseInt(weight, 10)
    if (!isNaN(parsed) && parsed >= 1 && parsed <= 100) changes.weight = parsed
    const payload = Object.keys(changes).length > 0 ? changes : (hasTypeChanges ? {} : undefined)
    onClose(payload)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') handleCloseRef.current(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

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
            placeholder="mixed"
            onChange={e => setWeight(e.target.value)}
          />
        </div>

        <div className={styles.typesSection}>
          <span className={styles.typesLabel}>Collections</span>
          {types.length > 0 && (
            <div className={styles.typeList}>
              {types.map(t => {
                const state = getEffectiveState(t.id)
                return (
                  <div
                    key={t.id}
                    className={`${styles.typeRow} ${state === 'all' ? styles.typeRowOn : ''}`}
                    onClick={() => toggleType(t.id)}
                  >
                    <span className={styles.typeDot} style={{ background: t.color }} />
                    <span className={styles.typeName}>{t.name}</span>
                    {state === 'all'   && <span className={styles.typeCheck}>✓</span>}
                    {state === 'mixed' && <span className={styles.typeMixed}>–</span>}
                  </div>
                )
              })}
            </div>
          )}
          {types.length === 0 && (
            <span className={styles.typesEmpty}>No collections — add one below</span>
          )}
          <div className={styles.newTypeRow}>
            <input
              className={styles.newTypeInput}
              value={newTypeName}
              placeholder="New collection…"
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
          <button className={styles.cancelBtn} onClick={handleCancel}>Cancel</button>
          <button className={styles.applyBtn}  onClick={handleApply}>Apply</button>
        </div>
      </div>
    </div>
  )
}
