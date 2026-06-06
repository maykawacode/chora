import { useRef, useEffect, useCallback, useState } from 'react'
import { useAppStore } from '../../store/appStore'
import type { CartesianMapConfig, SemanticMapConfig, Dimension, ScoreMap } from '../../lib/types'
import { drawCartesian, MARGIN, DOT_MIN_RADIUS, DOT_MAX_RADIUS } from './cartesian/drawCartesian'
import { drawSemantic, SEM_MARGIN_H, SEM_MARGIN_V, SEM_DOT_R } from './semantic/drawSemantic'
import styles from './MapPanel.module.css'

type Edge = 'left' | 'right' | 'top' | 'bottom'

interface AxisPickerState {
  edge: Edge
  clickX: number
  clickY: number
}

interface SemanticPickerState {
  dimIndex: number
  dimId: string
  clickX: number
  clickY: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function semAxisYs(H: number, count: number): number[] {
  if (count === 0) return []
  if (count === 1) return [H / 2]
  return Array.from({ length: count }, (_, i) =>
    SEM_MARGIN_V + i * (H - 2 * SEM_MARGIN_V) / (count - 1)
  )
}

// Returns the semantic dimension row index hit, or -1.
// Triggers anywhere along the full horizontal extent of the row (axis line + pole labels).
function semanticHitRow(y: number, H: number, dimCount: number): number {
  if (dimCount === 0) return -1
  const ys = semAxisYs(H, dimCount)
  const TOL = 6
  for (let i = 0; i < ys.length; i++) {
    if (Math.abs(y - ys[i]) <= TOL) return i
  }
  return -1
}

// Returns which Cartesian axis edge was hit, or null.
// Triggers near the crosshair center lines (inside the plot) or the pole labels (in the margin).
function cartesianHitEdge(x: number, y: number, W: number, H: number): Edge | null {
  const midX = W / 2
  const midY = H / 2
  const pL = MARGIN, pR = W - MARGIN, pT = MARGIN, pB = H - MARGIN
  const TOL = 6  // px tolerance

  // Horizontal center line (X axis) — use nearest end for picker placement
  if (Math.abs(y - midY) <= TOL && x >= pL && x <= pR) return x < midX ? 'left' : 'right'

  // Vertical center line (Y axis) — use nearest end for picker placement
  if (Math.abs(x - midX) <= TOL && y >= pT && y <= pB) return y < midY ? 'top' : 'bottom'

  // Pole labels (in margin zone, near the midpoint where labels are drawn)
  if (x < pL && Math.abs(y - midY) <= 18) return 'left'
  if (x > pR && Math.abs(y - midY) <= 18) return 'right'
  if (y < pT && Math.abs(x - midX) <= 50) return 'top'
  if (y > pB && Math.abs(x - midX) <= 50) return 'bottom'

  return null
}

interface DragTarget {
  elementId: string
  xDimId: string
  yDimId: string
  startX: number          // pointer position when drag began — used to pick lock axis
  startY: number
  lockedAxis: 'x' | 'y' | null
}

// Returns the element under the pointer on a cartesian map, or null.
// Dots must be visible; uses the same radius formula as drawCartesian.
function cartesianHitDot(
  x: number, y: number, W: number, H: number,
  config: CartesianMapConfig,
  elements: { id: string; weight: number }[],
  scores: ScoreMap
): DragTarget | null {
  if (!config.showDots) return null
  const plotLeft = MARGIN, plotRight = W - MARGIN
  const plotTop  = MARGIN, plotBottom = H - MARGIN
  const plotW = plotRight - plotLeft
  const plotH = plotBottom - plotTop

  for (const el of elements) {
    const xScore = scores[el.id]?.[config.xDimensionId]
    const yScore = scores[el.id]?.[config.yDimensionId]
    if (xScore === undefined || yScore === undefined) continue
    const ex = config.xFlipped ? 1 - xScore : xScore
    const ey = config.yFlipped ? 1 - yScore : yScore
    const cx = plotLeft + ex * plotW
    const cy = plotTop  + (1 - ey) * plotH
    const r  = DOT_MIN_RADIUS + (el.weight - 1) / 99 * (DOT_MAX_RADIUS - DOT_MIN_RADIUS)
    if ((x - cx) ** 2 + (y - cy) ** 2 <= Math.max(r, 8) ** 2) {
      return { elementId: el.id, xDimId: config.xDimensionId, yDimId: config.yDimensionId }
    }
  }
  return null
}

interface SemanticDragTarget { elementId: string; dimId: string }

// Returns the semantic dot under the pointer (element × dimension), or null.
function semanticHitDot(
  x: number, y: number, W: number, H: number,
  config: SemanticMapConfig,
  elements: { id: string }[],
  dimensions: Dimension[],
  scores: ScoreMap
): SemanticDragTarget | null {
  if (!config.showDots) return null
  const axisLeft  = SEM_MARGIN_H
  const axisRight = W - SEM_MARGIN_H
  const axisWidth = axisRight - axisLeft
  const dims = config.dimensionIds
    .map(id => dimensions.find(d => d.id === id))
    .filter((d): d is Dimension => d !== undefined)
  const els = config.elementIds.length > 0
    ? config.elementIds.map(id => elements.find(e => e.id === id)).filter((e): e is { id: string } => e !== undefined)
    : elements
  const ys  = semAxisYs(H, dims.length)
  const HIT = Math.max(SEM_DOT_R, 8)

  for (let i = 0; i < dims.length; i++) {
    const dim = dims[i]
    const ay  = ys[i]
    if (Math.abs(y - ay) > HIT) continue
    for (const el of els) {
      const raw = scores[el.id]?.[dim.id]
      if (raw === undefined) continue
      const score = config.flippedDimensionIds.includes(dim.id) ? 1 - raw : raw
      const dx = axisLeft + score * axisWidth
      if ((x - dx) ** 2 + (y - ay) ** 2 <= HIT ** 2) {
        return { elementId: el.id, dimId: dim.id }
      }
    }
  }
  return null
}

// ── MapPanel ──────────────────────────────────────────────────────────────────

interface Props {
  mapId: string
  onClose: () => void
  windowed?: boolean
}

export function MapPanel({ mapId, onClose, windowed }: Props): React.JSX.Element | null {
  const config          = useAppStore(s => s.maps.find(m => m.id === mapId))
  const elements        = useAppStore(s => s.elements)
  const dimensions      = useAppStore(s => s.dimensions)
  const scores          = useAppStore(s => s.scores)
  const updateMapConfig = useAppStore(s => s.updateMapConfig)
  const setScore        = useAppStore(s => s.setScore)

  // Wraps updateMapConfig + IPC broadcast so map windows stay in sync
  function updateConfig(changes: Partial<CartesianMapConfig> | Partial<SemanticMapConfig>): void {
    updateMapConfig(mapId, changes)
    window.api?.broadcastMapConfig(mapId, changes as Record<string, unknown>)
  }

  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Drag state kept in refs so handlers are synchronous without stale closures
  const draggingRef     = useRef<DragTarget | null>(null)
  const dragMovedRef    = useRef(false)
  const semDraggingRef  = useRef<SemanticDragTarget | null>(null)
  const semDragMovedRef = useRef(false)

  const [axisPicker,     setAxisPicker]     = useState<AxisPickerState | null>(null)
  const [semanticPicker, setSemanticPicker] = useState<SemanticPickerState | null>(null)
  const [cursor,         setCursor]         = useState('default')

  const redraw = useCallback(() => {
    const canvas  = canvasRef.current
    const wrapper = wrapperRef.current
    const ctx     = canvas?.getContext('2d')
    if (!canvas || !wrapper || !ctx || !config) return

    const rect = wrapper.getBoundingClientRect()
    const cssW = rect.width
    const cssH = rect.height
    canvas.width  = cssW * window.devicePixelRatio
    canvas.height = cssH * window.devicePixelRatio
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio)

    if (config.type === 'cartesian') {
      drawCartesian(ctx, cssW, cssH, config as CartesianMapConfig, elements, dimensions, scores)
    } else if (config.type === 'semantic') {
      drawSemantic(ctx, cssW, cssH, config as SemanticMapConfig, elements, dimensions, scores)
    }
  }, [config, elements, dimensions, scores])

  useEffect(() => { redraw() }, [redraw])

  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return
    const observer = new ResizeObserver(() => redraw())
    observer.observe(wrapper)
    return () => observer.disconnect()
  }, [redraw])

  function handleMouseDown(e: React.MouseEvent<HTMLDivElement>): void {
    const wrapper = wrapperRef.current
    if (!wrapper || !config) return
    const rect = wrapper.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    if (config.type === 'cartesian') {
      const hit = cartesianHitDot(x, y, rect.width, rect.height, config as CartesianMapConfig, elements, scores)
      if (hit) {
        draggingRef.current  = { ...hit, startX: x, startY: y, lockedAxis: null }
        dragMovedRef.current = false
        setCursor('grabbing')
        e.preventDefault()
      }
    } else if (config.type === 'semantic') {
      const hit = semanticHitDot(x, y, rect.width, rect.height, config as SemanticMapConfig, elements, dimensions, scores)
      if (hit) {
        semDraggingRef.current  = hit
        semDragMovedRef.current = false
        setCursor('grabbing')
        e.preventDefault()
      }
    }
  }

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>): void {
    const wrapper = wrapperRef.current
    if (!wrapper || !config) return
    const rect = wrapper.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const W = rect.width
    const H = rect.height

    // Cartesian live drag
    if (draggingRef.current && config.type === 'cartesian') {
      const drag     = draggingRef.current
      const cartCfg  = config as CartesianMapConfig
      const plotLeft = MARGIN, plotRight  = W - MARGIN
      const plotTop  = MARGIN, plotBottom = H - MARGIN
      const plotW    = plotRight  - plotLeft
      const plotH    = plotBottom - plotTop

      // Shift-constrain: lock to whichever axis had the larger initial movement
      if (e.shiftKey) {
        if (!drag.lockedAxis) {
          const dx = Math.abs(x - drag.startX)
          const dy = Math.abs(y - drag.startY)
          if (dx > 4 || dy > 4) drag.lockedAxis = dx >= dy ? 'x' : 'y'
        }
      } else {
        drag.lockedAxis = null
      }

      const cx = Math.max(plotLeft, Math.min(plotRight,  x))
      const cy = Math.max(plotTop,  Math.min(plotBottom, y))

      if (drag.lockedAxis !== 'y') {
        let xScore = (cx - plotLeft) / plotW
        if (cartCfg.xFlipped) xScore = 1 - xScore
        setScore(drag.elementId, drag.xDimId, xScore)
        window.api?.broadcastScore(drag.elementId, drag.xDimId, xScore)
      }
      if (drag.lockedAxis !== 'x') {
        let yScore = 1 - (cy - plotTop) / plotH
        if (cartCfg.yFlipped) yScore = 1 - yScore
        setScore(drag.elementId, drag.yDimId, yScore)
        window.api?.broadcastScore(drag.elementId, drag.yDimId, yScore)
      }

      dragMovedRef.current = true
      setCursor('grabbing')
      return
    }

    // Semantic live drag — horizontal only, constrained to axis line
    if (semDraggingRef.current && config.type === 'semantic') {
      const { elementId, dimId } = semDraggingRef.current
      const semCfg   = config as SemanticMapConfig
      const axisLeft = SEM_MARGIN_H
      const axisRight = W - SEM_MARGIN_H
      const axisWidth = axisRight - axisLeft
      const cx = Math.max(axisLeft, Math.min(axisRight, x))
      let score = (cx - axisLeft) / axisWidth
      if (semCfg.flippedDimensionIds.includes(dimId)) score = 1 - score
      setScore(elementId, dimId, score)
      window.api?.broadcastScore(elementId, dimId, score)
      semDragMovedRef.current = true
      setCursor('grabbing')
      return
    }

    if (config.type === 'cartesian') {
      const hit = cartesianHitDot(x, y, W, H, config as CartesianMapConfig, elements, scores)
      if (hit)                                             { setCursor('grab');    return }
      if (cartesianHitEdge(x, y, W, H))                   { setCursor('pointer'); return }
      setCursor('default')
    } else if (config.type === 'semantic') {
      const semCfg = config as SemanticMapConfig
      const hit = semanticHitDot(x, y, W, H, semCfg, elements, dimensions, scores)
      if (hit) { setCursor('grab'); return }
      setCursor(semanticHitRow(y, H, semCfg.dimensionIds.length) >= 0 ? 'pointer' : 'default')
    }
  }

  function handleMouseUp(): void {
    draggingRef.current    = null
    semDraggingRef.current = null
    setCursor('default')
  }

  function handleMouseLeave(): void {
    draggingRef.current    = null
    semDraggingRef.current = null
    setCursor('default')
  }

  function handleClick(e: React.MouseEvent<HTMLDivElement>): void {
    // Suppress picker if the mouse actually moved during either drag
    if (dragMovedRef.current)    { dragMovedRef.current    = false; return }
    if (semDragMovedRef.current) { semDragMovedRef.current = false; return }
    const wrapper = wrapperRef.current
    if (!wrapper || !config) return
    const rect = wrapper.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const W = rect.width
    const H = rect.height

    if (config.type === 'cartesian') {
      // Dot click (no drag) — don't open picker
      if (cartesianHitDot(x, y, W, H, config as CartesianMapConfig, elements, scores)) return
      setSemanticPicker(null)
      const edge = cartesianHitEdge(x, y, W, H)
      if (edge) setAxisPicker({ edge, clickX: x, clickY: y })
      else      setAxisPicker(null)
    } else if (config.type === 'semantic') {
      setAxisPicker(null)
      const semCfg = config as SemanticMapConfig
      // Dot click (no drag) — don't open picker
      if (semanticHitDot(x, y, W, H, semCfg, elements, dimensions, scores)) return
      const dims = semCfg.dimensionIds
        .map(id => dimensions.find(d => d.id === id))
        .filter((d): d is Dimension => d !== undefined)
      const rowIdx = semanticHitRow(y, H, dims.length)
      if (rowIdx >= 0) {
        setSemanticPicker({ dimIndex: rowIdx, dimId: dims[rowIdx].id, clickX: x, clickY: y })
      } else {
        setSemanticPicker(null)
      }
    }
  }

  if (!config) return null

  const cartConfig = config as CartesianMapConfig
  const semConfig  = config as SemanticMapConfig

  return (
    <div className={windowed ? styles.panelWindowed : styles.panel}>
      <div className={windowed ? styles.titleBarWindowed : styles.titleBar}>
        <span className={styles.title}>{config.title}</span>
        <div className={styles.titleBarActions}>
          <button
            className={styles.labelToggle}
            onClick={() => updateConfig({ showDots: !config.showDots })}
            title="Show/Hide Dots"
          >
            {config.showDots ? 'Dots ✓' : 'Dots'}
          </button>
          <button
            className={styles.labelToggle}
            onClick={() => updateConfig({ showLabels: !config.showLabels })}
            title="Show/Hide Labels"
          >
            {config.showLabels ? 'Labels ✓' : 'Labels'}
          </button>
          {!windowed && (
            <button className={styles.closeBtn} onClick={onClose} title="Close map">✕</button>
          )}
        </div>
      </div>
      <div
        ref={wrapperRef}
        className={styles.canvasWrapper}
        style={{ cursor }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
      >
        <canvas ref={canvasRef} className={styles.canvas} />

        {axisPicker && config.type === 'cartesian' && (
          <AxisPicker
            edge={axisPicker.edge}
            clickX={axisPicker.clickX}
            clickY={axisPicker.clickY}
            currentId={
              axisPicker.edge === 'left' || axisPicker.edge === 'right'
                ? cartConfig.xDimensionId
                : cartConfig.yDimensionId
            }
            isFlipped={
              axisPicker.edge === 'left' || axisPicker.edge === 'right'
                ? cartConfig.xFlipped
                : cartConfig.yFlipped
            }
            dimensions={dimensions}
            onPick={(id) => {
              if (axisPicker.edge === 'left' || axisPicker.edge === 'right') {
                updateConfig({ xDimensionId: id })
              } else {
                updateConfig({ yDimensionId: id })
              }
              setAxisPicker(null)
            }}
            onFlip={() => {
              if (axisPicker.edge === 'left' || axisPicker.edge === 'right') {
                updateConfig({ xFlipped: !cartConfig.xFlipped })
              } else {
                updateConfig({ yFlipped: !cartConfig.yFlipped })
              }
              setAxisPicker(null)
            }}
            onClose={() => setAxisPicker(null)}
          />
        )}

        {semanticPicker && config.type === 'semantic' && (
          <SemanticAxisPicker
            dimIndex={semanticPicker.dimIndex}
            currentDimId={semanticPicker.dimId}
            isFlipped={semConfig.flippedDimensionIds.includes(semanticPicker.dimId)}
            dimensions={dimensions}
            clickX={semanticPicker.clickX}
            clickY={semanticPicker.clickY}
            onPick={(newId) => {
              const newIds = [...semConfig.dimensionIds]
              newIds[semanticPicker.dimIndex] = newId
              const newFlipped = semConfig.flippedDimensionIds.filter(id => id !== semanticPicker.dimId)
              updateConfig({ dimensionIds: newIds, flippedDimensionIds: newFlipped })
              setSemanticPicker(null)
            }}
            onFlip={() => {
              const id = semanticPicker.dimId
              const current = semConfig.flippedDimensionIds
              const newFlipped = current.includes(id)
                ? current.filter(x => x !== id)
                : [...current, id]
              updateConfig({ flippedDimensionIds: newFlipped })
              setSemanticPicker(null)
            }}
            onClose={() => setSemanticPicker(null)}
          />
        )}
      </div>
    </div>
  )
}

// ── AxisPicker (Cartesian) ────────────────────────────────────────────────────

interface AxisPickerProps {
  edge: Edge
  clickX: number
  clickY: number
  currentId: string
  isFlipped: boolean
  dimensions: Dimension[]
  onPick: (id: string) => void
  onFlip: () => void
  onClose: () => void
}

function AxisPicker({ edge, clickX, clickY, currentId, isFlipped, dimensions, onPick, onFlip, onClose }: AxisPickerProps): React.JSX.Element {
  const axis = edge === 'left' || edge === 'right' ? 'X Axis' : 'Y Axis'

  const pickerStyle: React.CSSProperties = (() => {
    const base: React.CSSProperties = { position: 'absolute', zIndex: 10 }
    switch (edge) {
      case 'left':   return { ...base, left: MARGIN + 4,  top: Math.max(4, clickY - 20) }
      case 'right':  return { ...base, right: MARGIN + 4, top: Math.max(4, clickY - 20) }
      case 'top':    return { ...base, left: Math.max(4, clickX - 70), top: MARGIN + 4 }
      case 'bottom': return { ...base, left: Math.max(4, clickX - 70), bottom: MARGIN + 4 }
    }
  })()

  return (
    <>
      <div style={{ position: 'absolute', inset: 0, zIndex: 9 }} onClick={onClose} />
      <div className={styles.axisPicker} style={pickerStyle}>
        <div className={styles.axisPickerTitle}>{axis}</div>
        <button
          className={styles.axisPickerFlipBtn}
          onClick={(e) => { e.stopPropagation(); onFlip() }}
        >
          ↔ {isFlipped ? 'Restore poles' : 'Flip poles'}
        </button>
        <div className={styles.axisPickerSubtitle}>Change to</div>
        <ul className={styles.axisPickerList}>
          {dimensions.map((dim, i) => (
            <li
              key={dim.id}
              className={`${styles.axisPickerItem} ${dim.id === currentId ? styles.axisPickerSelected : ''}`}
              onClick={(e) => { e.stopPropagation(); onPick(dim.id) }}
            >
              {dim.label || `Dimension ${i + 1}`}
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}

// ── SemanticAxisPicker ────────────────────────────────────────────────────────

interface SemanticAxisPickerProps {
  dimIndex: number
  currentDimId: string
  isFlipped: boolean
  dimensions: Dimension[]
  clickX: number
  clickY: number
  onPick: (newDimId: string) => void
  onFlip: () => void
  onClose: () => void
}

function SemanticAxisPicker({ currentDimId, isFlipped, dimensions, clickX, clickY, onPick, onFlip, onClose }: SemanticAxisPickerProps): React.JSX.Element {
  const pickerStyle: React.CSSProperties = {
    position: 'absolute',
    zIndex: 10,
    left: Math.max(4, clickX - 70),
    top: Math.max(4, clickY - 20)
  }

  return (
    <>
      <div style={{ position: 'absolute', inset: 0, zIndex: 9 }} onClick={onClose} />
      <div className={styles.axisPicker} style={pickerStyle}>
        <div className={styles.axisPickerTitle}>Dimension</div>
        <button
          className={styles.axisPickerFlipBtn}
          onClick={(e) => { e.stopPropagation(); onFlip() }}
        >
          ↔ {isFlipped ? 'Restore poles' : 'Flip poles'}
        </button>
        <div className={styles.axisPickerSubtitle}>Change to</div>
        <ul className={styles.axisPickerList}>
          {dimensions.map((dim, i) => (
            <li
              key={dim.id}
              className={`${styles.axisPickerItem} ${dim.id === currentDimId ? styles.axisPickerSelected : ''}`}
              onClick={(e) => { e.stopPropagation(); onPick(dim.id) }}
            >
              {dim.label || `Dimension ${i + 1}`}
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}

// ── MapPanelList ──────────────────────────────────────────────────────────────

export function MapPanelList(): React.JSX.Element {
  const maps      = useAppStore(s => s.maps)
  const removeMap = useAppStore(s => s.removeMap)

  if (maps.length === 0) return <></>

  return (
    <div className={styles.panelList}>
      {maps.map(m => (
        <MapPanel key={m.id} mapId={m.id} onClose={() => removeMap(m.id)} />
      ))}
    </div>
  )
}
