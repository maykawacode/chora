// ── ElementDetailModal ────────────────────────────────────────────────────────
//
// Centered modal triggered by right-clicking an element dot on any map.
// Edits color, shape, weight, and description in local draft state.
// All changes are batched and committed in a single updateElement call when
// the modal closes — no per-keystroke updates.

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
  const element = useAppStore(s => s.elements.find(e => e.id === elementId))

  const [color,       setColor]       = useState(element?.color       ?? '#808000')
  const [hexInput,    setHexInput]    = useState(element?.color       ?? '#808000')
  const [shape,       setShape]       = useState<ElementShape>(element?.shape ?? 'circle')
  const [weight,      setWeight]      = useState(String(element?.weight ?? 1))
  const [description, setDescription] = useState(element?.description ?? '')

  // Keep a stable ref to the close handler so the Escape listener never goes stale
  const handleCloseRef = useRef<() => void>(() => {})
  handleCloseRef.current = () => {
    if (!element) { onClose(null); return }
    const parsedWeight = Math.max(1, Math.min(100, +weight || 1))
    const changes: Partial<Element> = {}
    if (color       !== element.color)       changes.color       = color
    if (shape       !== element.shape)       changes.shape       = shape
    if (parsedWeight !== element.weight)     changes.weight      = parsedWeight
    if (description !== element.description) changes.description = description
    onClose(Object.keys(changes).length > 0 ? changes : null)
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
          value={description}
          rows={4}
          placeholder="Description…"
          onChange={e => setDescription(e.target.value)}
        />

        <div className={styles.footer}>
          <button className={styles.doneBtn} onClick={handleClose}>Done</button>
        </div>
      </div>
    </div>
  )
}
