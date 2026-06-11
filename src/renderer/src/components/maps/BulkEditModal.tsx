// ── BulkEditModal ─────────────────────────────────────────────────────────────
//
// Modal for batch-editing color, shape, and/or weight across multiple selected
// elements. Triggered by right-clicking a selected dot when 2+ elements are
// in selectedElementIds. Empty/null draft fields mean "don't change this
// property" — only fields the user explicitly touches are applied.

import { useState, useEffect, useRef, useCallback } from 'react'
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

  // Derive initial values — null/empty means values are mixed across the selection
  const allSameColor  = selected.length > 0 && selected.every(e => e.color  === selected[0].color)
  const allSameShape  = selected.length > 0 && selected.every(e => e.shape  === selected[0].shape)
  const allSameWeight = selected.length > 0 && selected.every(e => e.weight === selected[0].weight)

  const [color,    setColor]    = useState<string | null>(allSameColor  ? selected[0].color            : null)
  const [hexInput, setHexInput] = useState(allSameColor ? selected[0].color : '')
  const [shape,    setShape]    = useState<ElementShape | null>(allSameShape  ? selected[0].shape : null)
  const [weight,   setWeight]   = useState(allSameWeight ? String(selected[0].weight) : '')

  const handleCloseRef = useRef<(apply: boolean) => void>(() => {})
  handleCloseRef.current = (apply: boolean) => {
    if (!apply) { onClose(undefined); return }
    const changes: Partial<Element> = {}
    if (color !== null) changes.color = color
    if (shape !== null) changes.shape = shape
    const parsed = parseInt(weight, 10)
    if (!isNaN(parsed) && parsed >= 1 && parsed <= 100) changes.weight = parsed
    onClose(Object.keys(changes).length > 0 ? changes : undefined)
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

        <div className={styles.footer}>
          <button className={styles.cancelBtn} onClick={handleCancel}>Cancel</button>
          <button className={styles.applyBtn}  onClick={handleApply}>Apply</button>
        </div>
      </div>
    </div>
  )
}
