// ── MapPanel ──────────────────────────────────────────────────────────────────
//
// Renders a single map (cartesian or semantic) inside a resizable container.
// Used in two contexts:
//   1. Embedded in the Score Window's map list (windowed=false)
//   2. Fullscreen in a dedicated BrowserWindow (windowed=true)
//
// When windowed=true, the title bar adds left padding to clear macOS traffic
// lights and enables the -webkit-app-region:drag so the user can move the
// window by dragging the title bar area.
//
// Hit testing and drag logic live entirely in this component; the draw
// functions (drawCartesian / drawSemantic) are pure canvas painters.

import { useRef, useEffect, useCallback, useState } from 'react'
import { useAppStore } from '../../store/appStore'
import type { CartesianMapConfig, SemanticMapConfig, Dimension, ScoreMap } from '../../lib/types'
import { drawCartesian, MARGIN, DOT_MIN_RADIUS, DOT_MAX_RADIUS } from './cartesian/drawCartesian'
import { drawSemantic, SEM_MARGIN_H, SEM_MARGIN_V, SEM_DOT_R } from './semantic/drawSemantic'
import { ElementDetailModal } from './ElementDetailModal'
import styles from './MapPanel.module.css'

// ── Types ─────────────────────────────────────────────────────────────────────

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

// Active cartesian drag. startX/Y and lockedAxis are mutated in place during
// the drag — they are NOT set by cartesianHitDot() (which only knows the hit
// element) but are filled in by handleMouseDown() before storing in the ref.
interface DragTarget {
  elementId: string
  xDimId: string
  yDimId: string
  startX: number          // pointer position when drag started — used to pick lock axis
  startY: number
  lockedAxis: 'x' | 'y' | null  // set on first significant move while Shift is held
}

interface SemanticDragTarget {
  elementId: string
  dimId: string
}

// ── Hit-test helpers ──────────────────────────────────────────────────────────

/**
 * Distributes semantic axes evenly across the canvas height.
 * Returns a single centered Y for one dimension, or evenly spaced Ys for many.
 */
function semAxisYs(H: number, count: number): number[] {
  if (count === 0) return []
  if (count === 1) return [H / 2]
  return Array.from({ length: count }, (_, i) =>
    SEM_MARGIN_V + i * (H - 2 * SEM_MARGIN_V) / (count - 1)
  )
}

/**
 * Returns the semantic dimension row index hit by a pointer at (_, y), or -1.
 * Tolerates ±6px from the axis line so small dots are easy to grab.
 */
function semanticHitRow(y: number, H: number, dimCount: number): number {
  if (dimCount === 0) return -1
  const ys  = semAxisYs(H, dimCount)
  const TOL = 6
  for (let i = 0; i < ys.length; i++) {
    if (Math.abs(y - ys[i]) <= TOL) return i
  }
  return -1
}

/**
 * Returns which cartesian axis edge was clicked, or null.
 * Matches both the center crosshair lines (inside the plot) and the pole
 * label region (in the margin) so users can click either target.
 */
function cartesianHitEdge(x: number, y: number, W: number, H: number): Edge | null {
  const midX = W / 2
  const midY = H / 2
  const pL = MARGIN, pR = W - MARGIN, pT = MARGIN, pB = H - MARGIN
  const TOL = 6

  if (Math.abs(y - midY) <= TOL && x >= pL && x <= pR) return x < midX ? 'left' : 'right'
  if (Math.abs(x - midX) <= TOL && y >= pT && y <= pB) return y < midY ? 'top' : 'bottom'

  // Pole label areas
  if (x < pL && Math.abs(y - midY) <= 18) return 'left'
  if (x > pR && Math.abs(y - midY) <= 18) return 'right'
  if (y < pT && Math.abs(x - midX) <= 50) return 'top'
  if (y > pB && Math.abs(x - midX) <= 50) return 'bottom'

  return null
}

/**
 * Returns a partial DragTarget (no startX/Y/lockedAxis) for the cartesian dot
 * under the pointer, or null. The caller fills in the missing fields before
 * storing the result. Uses the same radius formula as drawCartesian so the
 * hit area always matches the visible dot size.
 */
function cartesianHitDot(
  x: number, y: number, W: number, H: number,
  config: CartesianMapConfig,
  elements: { id: string; weight: number }[],
  scores: ScoreMap
): Pick<DragTarget, 'elementId' | 'xDimId' | 'yDimId'> | null {
  if (!config.showDots) return null

  const plotLeft  = MARGIN, plotRight  = W - MARGIN
  const plotTop   = MARGIN, plotBottom = H - MARGIN
  const plotW = plotRight - plotLeft
  const plotH = plotBottom - plotTop

  // Test lightest (topmost-drawn) elements first so stacked dots select correctly
  const sorted = [...elements].sort((a, b) => a.weight - b.weight)
  for (const el of sorted) {
    const xScore = scores[el.id]?.[config.xDimensionId]
    const yScore = scores[el.id]?.[config.yDimensionId]

    // Mirror drawCartesian: use 0.5 placeholder for any missing axis
    const rawX = xScore ?? 0.5
    const rawY = yScore ?? 0.5

    const ex = config.xFlipped ? 1 - rawX : rawX
    const ey = config.yFlipped ? 1 - rawY : rawY
    const cx = plotLeft + ex * plotW
    const cy = plotTop  + (1 - ey) * plotH
    const r  = DOT_MIN_RADIUS + (el.weight - 1) / 99 * (DOT_MAX_RADIUS - DOT_MIN_RADIUS)

    // Use max(r, 8) so tiny dots still have a reasonable tap target
    if ((x - cx) ** 2 + (y - cy) ** 2 <= Math.max(r, 8) ** 2) {
      return { elementId: el.id, xDimId: config.xDimensionId, yDimId: config.yDimensionId }
    }
  }
  return null
}

/**
 * Returns the semantic element × dimension under the pointer, or null.
 */
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
  const HIT = Math.max(SEM_DOT_R, 8)   // minimum tap target radius

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

// ── MapPanel component ────────────────────────────────────────────────────────

interface Props {
  mapId: string
  onClose: () => void
  windowed?: boolean  // true when rendered inside a dedicated BrowserWindow
}

export function MapPanel({ mapId, onClose, windowed }: Props): React.JSX.Element | null {
  const config              = useAppStore(s => s.maps.find(m => m.id === mapId))
  const elements            = useAppStore(s => s.elements)
  const dimensions          = useAppStore(s => s.dimensions)
  const scores              = useAppStore(s => s.scores)
  const isDirty             = useAppStore(s => s.isDirty)
  const selectedElementId   = useAppStore(s => s.selectedElementId)
  const selectElement       = useAppStore(s => s.selectElement)
  const updateMapConfig     = useAppStore(s => s.updateMapConfig)
  const updateElement       = useAppStore(s => s.updateElement)
  const setScore            = useAppStore(s => s.setScore)

  // Wraps updateMapConfig + IPC so changes made in either window stay in sync.
  // Map windows send broadcastMapConfig → main → Score Window's onMapConfig
  // listener → Score Window re-broadcasts full state to all maps.
  function updateConfig(changes: Partial<CartesianMapConfig> | Partial<SemanticMapConfig>): void {
    updateMapConfig(mapId, changes)
    window.api?.broadcastMapConfig(mapId, changes as Record<string, unknown>)
  }

  // ── Canvas refs ───────────────────────────────────────────────────────────────

  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Drag state is kept in refs (not state) so mouse-move handlers are always
  // synchronous and never see stale values from a React re-render mid-drag.
  const draggingRef     = useRef<DragTarget | null>(null)
  const dragMovedRef    = useRef(false)
  const semDraggingRef  = useRef<SemanticDragTarget | null>(null)
  const semDragMovedRef = useRef(false)

  // ── React state ───────────────────────────────────────────────────────────────

  const [axisPicker,     setAxisPicker]     = useState<AxisPickerState | null>(null)
  const [semanticPicker, setSemanticPicker] = useState<SemanticPickerState | null>(null)
  const [elementModal,   setElementModal]   = useState<string | null>(null)
  const [cursor,         setCursor]         = useState('default')
  const [editingTitle,   setEditingTitle]   = useState(false)
  const [titleDraft,     setTitleDraft]     = useState('')
  const [showMenu,       setShowMenu]       = useState(false)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const menuRef       = useRef<HTMLDivElement>(null)

  // Close the dropdown when the user clicks outside it
  useEffect(() => {
    if (!showMenu) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showMenu])

  // ── Title editing ─────────────────────────────────────────────────────────────

  function startEditingTitle(): void {
    setTitleDraft(config?.title ?? '')
    setEditingTitle(true)
    // Focus the input after React renders it — setTimeout yields to the paint cycle
    setTimeout(() => { titleInputRef.current?.select() }, 0)
  }

  function commitTitle(): void {
    const trimmed = titleDraft.trim()
    if (trimmed && trimmed !== config?.title) updateConfig({ title: trimmed })
    setEditingTitle(false)
  }

  function cancelTitle(): void {
    setEditingTitle(false)
  }

  function handleExportPng(): void {
    const canvas = canvasRef.current
    if (!canvas) return
    const dataUrl = canvas.toDataURL('image/png')
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = `${config?.title ?? 'map'}.png`
    a.click()
    setShowMenu(false)
  }

  // ── Canvas drawing ────────────────────────────────────────────────────────────

  const redraw = useCallback(() => {
    const canvas  = canvasRef.current
    const wrapper = wrapperRef.current
    const ctx     = canvas?.getContext('2d')
    if (!canvas || !wrapper || !ctx || !config) return

    const rect = wrapper.getBoundingClientRect()
    const cssW = rect.width
    const cssH = rect.height

    // Match canvas bitmap to CSS size × devicePixelRatio for sharp rendering
    canvas.width  = cssW * window.devicePixelRatio
    canvas.height = cssH * window.devicePixelRatio
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio)

    if (config.type === 'cartesian') {
      drawCartesian(ctx, cssW, cssH, config as CartesianMapConfig, elements, dimensions, scores, selectedElementId ?? undefined)
    } else if (config.type === 'semantic') {
      drawSemantic(ctx, cssW, cssH, config as SemanticMapConfig, elements, dimensions, scores, semDraggingRef.current?.elementId, selectedElementId ?? undefined)
    }
  // selectedElementId must be in deps: the draw functions use it for the red
  // selection ring. Without it, the ring only appeared as a side-effect of the
  // IPC round-trip (broadcastSelection → state:push → new elements reference).
  // Now it redraws synchronously the moment the store value changes.
  }, [config, elements, dimensions, scores, selectedElementId])

  // Redraw whenever any input data changes
  useEffect(() => { redraw() }, [redraw])

  // Redraw when the wrapper div is resized (window resize or layout change)
  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return
    const observer = new ResizeObserver(() => redraw())
    observer.observe(wrapper)
    return () => observer.disconnect()
  }, [redraw])

  // ── Mouse event handlers ──────────────────────────────────────────────────────

  function handleMouseDown(e: React.MouseEvent<HTMLDivElement>): void {
    if (e.button !== 0) return  // ignore right-click and middle-click
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
        selectElement(hit.elementId)
        window.api?.broadcastSelection(hit.elementId)
        e.preventDefault()
      }
    } else if (config.type === 'semantic') {
      const hit = semanticHitDot(x, y, rect.width, rect.height, config as SemanticMapConfig, elements, dimensions, scores)
      if (hit) {
        semDraggingRef.current  = hit
        semDragMovedRef.current = false
        setCursor('grabbing')
        selectElement(hit.elementId)
        window.api?.broadcastSelection(hit.elementId)
        e.preventDefault()
        redraw()
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

    // ── Active cartesian drag ─────────────────────────────────────────────────

    if (draggingRef.current && config.type === 'cartesian') {
      const drag    = draggingRef.current
      const cartCfg = config as CartesianMapConfig
      const plotLeft = MARGIN, plotRight  = W - MARGIN
      const plotTop  = MARGIN, plotBottom = H - MARGIN
      const plotW    = plotRight - plotLeft
      const plotH    = plotBottom - plotTop

      // Shift-constrain: once the drag has moved far enough in one direction,
      // lock to that axis for the remainder of the gesture
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

    // ── Active semantic drag (horizontal only) ────────────────────────────────

    if (semDraggingRef.current && config.type === 'semantic') {
      const { elementId, dimId } = semDraggingRef.current
      const semCfg    = config as SemanticMapConfig
      const axisLeft  = SEM_MARGIN_H
      const axisRight = W - SEM_MARGIN_H
      const axisWidth = axisRight - axisLeft
      const cx        = Math.max(axisLeft, Math.min(axisRight, x))
      let score       = (cx - axisLeft) / axisWidth
      if (semCfg.flippedDimensionIds.includes(dimId)) score = 1 - score
      setScore(elementId, dimId, score)
      window.api?.broadcastScore(elementId, dimId, score)
      semDragMovedRef.current = true
      setCursor('grabbing')
      return
    }

    // ── Hover cursor ──────────────────────────────────────────────────────────

    if (config.type === 'cartesian') {
      const hit = cartesianHitDot(x, y, W, H, config as CartesianMapConfig, elements, scores)
      if (hit)                           { setCursor('grab');    return }
      if (cartesianHitEdge(x, y, W, H)) { setCursor('pointer'); return }
      setCursor('default')
    } else if (config.type === 'semantic') {
      const hit = semanticHitDot(x, y, W, H, config as SemanticMapConfig, elements, dimensions, scores)
      if (hit) { setCursor('grab'); return }
      setCursor(semanticHitRow(y, H, (config as SemanticMapConfig).dimensionIds.length) >= 0 ? 'pointer' : 'default')
    }
  }

  function handleMouseUp(): void {
    // Capture before clearing — same pattern as wasSemDragging below
    const wasCartesianDragging = draggingRef.current    !== null
    const wasSemDragging       = semDraggingRef.current !== null
    draggingRef.current    = null
    semDraggingRef.current = null
    setCursor('default')
    // The red selection ring and the semantic line-weight boost are both
    // "active while pressing" indicators. Release the selection on mouseUp
    // so the highlight disappears the moment the user lets go, mirroring
    // how the heavy connecting line reverts when a semantic drag ends.
    if (wasCartesianDragging || wasSemDragging) {
      selectElement(null)
      window.api?.broadcastSelection(null)
    }
    if (wasSemDragging) redraw()
  }

  function handleMouseLeave(): void {
    // Cancel drag if the pointer leaves the canvas area (e.g. fast movement)
    const wasCartesianDragging = draggingRef.current    !== null
    const wasSemDragging       = semDraggingRef.current !== null
    draggingRef.current    = null
    semDraggingRef.current = null
    setCursor('default')
    // Same release-on-exit logic as mouseUp — keeps highlight in sync with
    // the drag state even when the pointer escapes the canvas bounds.
    if (wasCartesianDragging || wasSemDragging) {
      selectElement(null)
      window.api?.broadcastSelection(null)
    }
    if (wasSemDragging) redraw()
  }

  function handleContextMenu(e: React.MouseEvent<HTMLDivElement>): void {
    e.preventDefault()
    const wrapper = wrapperRef.current
    if (!wrapper || !config) return
    const rect = wrapper.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const W = rect.width
    const H = rect.height

    let hitId: string | null = null
    if (config.type === 'cartesian') {
      const hit = cartesianHitDot(x, y, W, H, config as CartesianMapConfig, elements, scores)
      if (hit) hitId = hit.elementId
    } else if (config.type === 'semantic') {
      const hit = semanticHitDot(x, y, W, H, config as SemanticMapConfig, elements, dimensions, scores)
      if (hit) hitId = hit.elementId
    }

    if (hitId) {
      setAxisPicker(null)
      setSemanticPicker(null)
      setElementModal(hitId)
    }
  }

  function handleClick(e: React.MouseEvent<HTMLDivElement>): void {
    // If the mouse moved during this gesture it was a drag — suppress the picker
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
      // Dot clicks don't open the axis picker
      if (cartesianHitDot(x, y, W, H, config as CartesianMapConfig, elements, scores)) return
      setSemanticPicker(null)
      const edge = cartesianHitEdge(x, y, W, H)
      if (edge) {
        setAxisPicker({ edge, clickX: x, clickY: y })
      } else {
        setAxisPicker(null)
        selectElement(null)
        window.api?.broadcastSelection(null)
      }
    } else if (config.type === 'semantic') {
      setAxisPicker(null)
      const semCfg = config as SemanticMapConfig
      if (semanticHitDot(x, y, W, H, semCfg, elements, dimensions, scores)) return
      const dims = semCfg.dimensionIds
        .map(id => dimensions.find(d => d.id === id))
        .filter((d): d is Dimension => d !== undefined)
      const rowIdx = semanticHitRow(y, H, dims.length)
      if (rowIdx >= 0) {
        setSemanticPicker({ dimIndex: rowIdx, dimId: dims[rowIdx].id, clickX: x, clickY: y })
      } else {
        setSemanticPicker(null)
        selectElement(null)
        window.api?.broadcastSelection(null)
      }
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  if (!config) return null

  const cartConfig = config as CartesianMapConfig
  const semConfig  = config as SemanticMapConfig

  return (
    <div className={windowed ? styles.panelWindowed : styles.panel}>
      <div className={windowed ? styles.titleBarWindowed : styles.titleBar}>
        {editingTitle ? (
          <input
            ref={titleInputRef}
            className={styles.titleInput}
            value={titleDraft}
            onChange={e => setTitleDraft(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={e => {
              if (e.key === 'Enter')  { e.preventDefault(); commitTitle() }
              if (e.key === 'Escape') { e.preventDefault(); cancelTitle() }
            }}
          />
        ) : (
          <span
            className={styles.title}
            onDoubleClick={startEditingTitle}
            title="Double-click to rename"
          >
            {config.title}
          </span>
        )}

        <div className={styles.titleBarActions} ref={menuRef}>
          {isDirty && <span className={styles.unsavedBadge}>Unsaved</span>}
          <button
            className={styles.menuBtn}
            onClick={() => setShowMenu(v => !v)}
            title="Map options"
          >
            ⋯
          </button>

          {showMenu && (
            <div className={styles.menuDropdown}>
              <div
                className={styles.menuItem}
                onClick={() => { updateConfig({ showDots: !config.showDots }); setShowMenu(false) }}
              >
                <span className={styles.menuCheck}>{config.showDots ? '✓' : ''}</span>
                Show Dots
              </div>
              <div
                className={styles.menuItem}
                onClick={() => { updateConfig({ showLabels: !config.showLabels }); setShowMenu(false) }}
              >
                <span className={styles.menuCheck}>{config.showLabels ? '✓' : ''}</span>
                Show Labels
              </div>
              <div className={styles.menuSeparator} />
              <div className={styles.menuItem} onClick={handleExportPng}>
                <span className={styles.menuCheck} />
                Export as PNG…
              </div>
            </div>
          )}

          {/* Close button only shown in embedded (non-windowed) mode */}
          {!windowed && (
            <button className={styles.closeBtn} onClick={onClose} title="Close map">✕</button>
          )}
        </div>
      </div>

      {/* Canvas wrapper — fills remaining space; ResizeObserver triggers redraws */}
      <div
        ref={wrapperRef}
        className={styles.canvasWrapper}
        style={{ cursor }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
      >
        <canvas ref={canvasRef} className={styles.canvas} />

        {/* Element detail modal — shown on right-click of any element dot */}
        {elementModal && (
          <ElementDetailModal
            elementId={elementModal}
            onClose={(changes) => {
              if (changes) {
                updateElement(elementModal, changes)
                window.api?.broadcastElement(elementModal, changes as Record<string, unknown>)
              }
              setElementModal(null)
            }}
          />
        )}

        {/* Axis picker — shown when the user clicks a cartesian axis */}
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

        {/* Dimension picker — shown when the user clicks a semantic axis */}
        {semanticPicker && config.type === 'semantic' && (
          <SemanticAxisPicker
            currentDimId={semanticPicker.dimId}
            isFlipped={semConfig.flippedDimensionIds.includes(semanticPicker.dimId)}
            dimensions={dimensions}
            clickX={semanticPicker.clickX}
            clickY={semanticPicker.clickY}
            onPick={(newId) => {
              const newIds = [...semConfig.dimensionIds]
              newIds[semanticPicker.dimIndex] = newId
              // Remove the old dimension from the flipped list if it was there
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
//
// Floating panel positioned near the clicked axis edge. Lets the user swap
// which dimension is assigned to that axis, or flip its poles.

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

  // Position the picker near the click, anchored to the axis side it came from
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
      {/* Transparent full-canvas backdrop — click to dismiss */}
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
//
// Floating panel for semantic axis interaction — swap which dimension is on
// a given row, or flip its poles.

interface SemanticAxisPickerProps {
  // dimIndex was removed: the picker doesn't need to know its row position,
  // only the caller (SemanticAxisPicker usage site) needs that for onPick.
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
    top:  Math.max(4, clickY - 20)
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

// MapPanelList (embedded maps in the Score Window) was removed. Maps now always
// open as dedicated BrowserWindows via the map:open IPC channel. If embedded
// maps are ever needed again, restore this component from git history.
