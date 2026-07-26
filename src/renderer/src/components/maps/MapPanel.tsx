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
import { useAppStore, type ScoreEntry } from '../../store/appStore'
import { usePrefsStore } from '../../store/prefsStore'
import type { CartesianMapConfig, SemanticMapConfig, Dimension, Type, Element, ScoreMap } from '../../lib/types'
import C2S from 'canvas2svg'
import { drawCartesian, visibleElements, MARGIN, POLE_LABEL_HIT_SPAN, DOT_MIN_RADIUS, DOT_MAX_RADIUS, DOT_DEFAULT_RADIUS } from './cartesian/drawCartesian'
import { drawSemantic, semDotRadius, SEM_MARGIN_H, SEM_MARGIN_V, SEM_DOT_MAX_R } from './semantic/drawSemantic'
import { ElementDetailModal } from './ElementDetailModal'
import { BulkEditModal } from './BulkEditModal'
import { MapSidebar } from './MapSidebar'
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

// ── Drag state ────────────────────────────────────────────────────────────────
//
// A drag moves the whole multi-selection when the grabbed dot belongs to it,
// and just that dot otherwise. The group translates rigidly: every member keeps
// its offset from the others, so a drag rearranges where a cluster sits without
// rearranging the cluster.
//
// Start scores are captured once, at mouse-down, and every frame is computed as
// an offset from them rather than from wherever the dots are now. Accumulating
// frame to frame would let rounding drift the group apart, and would let a
// clamped frame — one where the group is pressed against an edge — permanently
// squash the spacing.

/** One element a drag is moving, with the scores it started the gesture at. */
interface DragMember {
  id: string
  x0: number
  y0: number
}

// Active cartesian drag. startX/Y and lockedAxis are mutated in place during
// the drag — they are NOT set by cartesianHitDot() (which only knows the hit
// element) but are filled in by handleMouseDown() before storing in the ref.
interface DragTarget {
  elementId: string
  xDimId: string
  yDimId: string
  members: DragMember[]   // everything this gesture moves, grabbed dot included
  origin: DragMember      // the grabbed dot's start scores; deltas measure from here
  startX: number          // pointer position when drag started — used to pick lock axis
  startY: number
  lockedAxis: 'x' | 'y' | null  // set on first significant move while Shift is held
}

/** One element a semantic drag is moving, on the single axis being dragged. */
interface SemDragMember {
  id: string
  s0: number
}

interface SemanticDragTarget {
  elementId: string
  dimId: string
  members: SemDragMember[]
  origin: SemDragMember
  startX: number
  startY: number
}

/**
 * Shifts a delta as far as it can go without pushing any member outside 0–1.
 *
 * Clamping the group rather than each element is what keeps it rigid: clamp
 * individually and the members still in range keep going while the ones at the
 * edge stall, and the cluster deforms a little more every time it is dragged
 * into a wall.
 */
function clampGroupDelta(starts: number[], delta: number): number {
  let lo = -Infinity
  let hi = Infinity
  for (const s of starts) {
    lo = Math.max(lo, -s)
    hi = Math.min(hi, 1 - s)
  }
  return Math.min(hi, Math.max(lo, delta))
}

/**
 * The scores an element starts a cartesian drag at.
 *
 * An axis with no score falls back to 0.5, which is exactly where
 * drawCartesian plots it — so an unscored dot moves from where it appears
 * instead of jumping. Dragging it does turn that placeholder into a real
 * score, which is what a single-dot drag has always done.
 */
function cartesianDragStart(id: string, xDimId: string, yDimId: string, scores: ScoreMap): DragMember {
  return {
    id,
    x0: scores[id]?.[xDimId] ?? 0.5,
    y0: scores[id]?.[yDimId] ?? 0.5
  }
}

/**
 * The elements a drag gesture moves: the whole multi-selection when the grabbed
 * element is part of it, otherwise the grabbed element alone.
 */
function dragGroupIds(draggedId: string, selectedIds: string[]): string[] {
  return selectedIds.includes(draggedId) ? selectedIds : [draggedId]
}

/**
 * The members of a semantic drag, on the one axis being dragged.
 *
 * Elements unscored on that axis are dropped: a semantic map draws no dot for
 * them there, so there is nothing on screen to move. This is the opposite of
 * the cartesian case only because the maps differ — there, an unscored element
 * is still drawn, at the center.
 */
function semanticDragMembers(ids: string[], dimId: string, scores: ScoreMap): SemDragMember[] {
  const members: SemDragMember[] = []
  for (const id of ids) {
    const s0 = scores[id]?.[dimId]
    if (s0 !== undefined) members.push({ id, s0 })
  }
  return members
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

  // Pole label areas. Every label runs parallel to its own plot edge, so all
  // four bands are measured the same way — along that edge, out from its
  // midpoint — and share one span. The vertical pair used to need a shorter
  // span than the horizontal pair because its text ran crosswise; the quarter
  // turn in drawPoleLabel removed that difference.
  if (x < pL && Math.abs(y - midY) <= POLE_LABEL_HIT_SPAN) return 'left'
  if (x > pR && Math.abs(y - midY) <= POLE_LABEL_HIT_SPAN) return 'right'
  if (y < pT && Math.abs(x - midX) <= POLE_LABEL_HIT_SPAN) return 'top'
  if (y > pB && Math.abs(x - midX) <= POLE_LABEL_HIT_SPAN) return 'bottom'

  return null
}

/**
 * Radius of an element's dot — must mirror drawCartesian exactly so the hit
 * area always matches what the user sees.
 */
function dotRadius(config: CartesianMapConfig, weight: number): number {
  return config.sizeByWeight
    ? DOT_MIN_RADIUS + (weight - 1) / 99 * (DOT_MAX_RADIUS - DOT_MIN_RADIUS)
    : DOT_DEFAULT_RADIUS
}

/**
 * Projects a 0–1 score pair into canvas coordinates for a cartesian map,
 * applying axis flips and the Y inversion. Mirrors drawCartesian's `project`.
 */
function cartesianProject(
  config: CartesianMapConfig, W: number, H: number, xScore: number, yScore: number
): { x: number; y: number } {
  const plotW = W - 2 * MARGIN
  const plotH = H - 2 * MARGIN
  return {
    x: MARGIN + (config.xFlipped ? 1 - xScore : xScore) * plotW,
    y: MARGIN + (1 - (config.yFlipped ? 1 - yScore : yScore)) * plotH
  }
}

/**
 * Returns a partial DragTarget (no startX/Y/lockedAxis) for the cartesian dot
 * under the pointer, or null. The caller fills in the missing fields before
 * storing the result.
 *
 * Only elements the map is actually drawing are hit-testable — a type filter
 * that hides an element must also make it ungrabbable.
 */
function cartesianHitDot(
  x: number, y: number, W: number, H: number,
  config: CartesianMapConfig,
  elements: Element[],
  types: Type[],
  scores: ScoreMap
): Pick<DragTarget, 'elementId' | 'xDimId' | 'yDimId'> | null {
  if (config.marks === 'none') return null

  // Test lightest (topmost-drawn) elements first so stacked dots select correctly
  const sorted = [...visibleElements(config, elements, types, scores)]
    .sort((a, b) => a.weight - b.weight)

  for (const el of sorted) {
    // Mirror drawCartesian: use 0.5 placeholder for any missing axis
    const { x: cx, y: cy } = cartesianProject(config, W, H,
      scores[el.id]?.[config.xDimensionId] ?? 0.5,
      scores[el.id]?.[config.yDimensionId] ?? 0.5)
    const r = dotRadius(config, el.weight)

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
  elements: Element[],
  dimensions: Dimension[],
  scores: ScoreMap
): Pick<SemanticDragTarget, 'elementId' | 'dimId'> | null {
  if (config.marks === 'none') return null

  const axisLeft  = SEM_MARGIN_H
  const axisRight = W - SEM_MARGIN_H
  const axisWidth = axisRight - axisLeft

  const dims = config.dimensionIds
    .map(id => dimensions.find(d => d.id === id))
    .filter((d): d is Dimension => d !== undefined)

  const els = semanticElements(config, elements)
  const ys  = semAxisYs(H, dims.length)

  // Row pre-filter uses the largest dot any element could have, so a heavy
  // (large) dot isn't skipped before its own radius is checked below.
  const ROW_TOL = Math.max(SEM_DOT_MAX_R, 8)

  for (let i = 0; i < dims.length; i++) {
    const dim = dims[i]
    const ay  = ys[i]
    if (Math.abs(y - ay) > ROW_TOL) continue
    for (const el of els) {
      const raw = scores[el.id]?.[dim.id]
      if (raw === undefined) continue
      const score = config.flippedDimensionIds.includes(dim.id) ? 1 - raw : raw
      const dx = axisLeft + score * axisWidth
      // Min 8px so tiny dots still have a reasonable tap target
      const hit = Math.max(semDotRadius(config, el.weight), 8)
      if ((x - dx) ** 2 + (y - ay) ** 2 <= hit ** 2) {
        return { elementId: el.id, dimId: dim.id }
      }
    }
  }
  return null
}

/**
 * Resolves which elements a semantic map draws: its explicit ordered list if
 * it has one, otherwise every element.
 */
function semanticElements(config: SemanticMapConfig, elements: Element[]): Element[] {
  if (config.elementIds.length === 0) return elements
  return config.elementIds
    .map(id => elements.find(e => e.id === id))
    .filter((e): e is Element => e !== undefined)
}

/**
 * Returns IDs of all visible elements whose cartesian dot center falls inside
 * the lasso rectangle defined by (rx1,ry1)→(rx2,ry2) in canvas coordinates.
 */
function cartesianHitRect(
  rx1: number, ry1: number, rx2: number, ry2: number,
  W: number, H: number,
  config: CartesianMapConfig,
  elements: Element[],
  types: Type[],
  scores: ScoreMap
): string[] {
  const minX = Math.min(rx1, rx2), maxX = Math.max(rx1, rx2)
  const minY = Math.min(ry1, ry2), maxY = Math.max(ry1, ry2)

  const hitIds: string[] = []
  for (const el of visibleElements(config, elements, types, scores)) {
    const { x: cx, y: cy } = cartesianProject(config, W, H,
      scores[el.id]?.[config.xDimensionId] ?? 0.5,
      scores[el.id]?.[config.yDimensionId] ?? 0.5)
    if (cx >= minX && cx <= maxX && cy >= minY && cy <= maxY) hitIds.push(el.id)
  }
  return hitIds
}

/**
 * Returns IDs of all elements that have at least one scored dot inside the
 * lasso rectangle defined by (rx1,ry1)→(rx2,ry2) in canvas coordinates.
 */
function semanticHitRect(
  rx1: number, ry1: number, rx2: number, ry2: number,
  W: number, H: number,
  config: SemanticMapConfig,
  elements: Element[],
  dimensions: Dimension[],
  scores: ScoreMap
): string[] {
  const minX = Math.min(rx1, rx2)
  const maxX = Math.max(rx1, rx2)
  const minY = Math.min(ry1, ry2)
  const maxY = Math.max(ry1, ry2)

  const axisLeft  = SEM_MARGIN_H
  const axisRight = W - SEM_MARGIN_H
  const axisWidth = axisRight - axisLeft

  const dims = config.dimensionIds
    .map(id => dimensions.find(d => d.id === id))
    .filter((d): d is Dimension => d !== undefined)

  const els    = semanticElements(config, elements)
  const ys     = semAxisYs(H, dims.length)
  const hitIds = new Set<string>()

  for (let i = 0; i < dims.length; i++) {
    const ay = ys[i]
    if (ay < minY || ay > maxY) continue
    const dim = dims[i]
    for (const el of els) {
      const raw = scores[el.id]?.[dim.id]
      if (raw === undefined) continue
      const score = config.flippedDimensionIds.includes(dim.id) ? 1 - raw : raw
      const dx = axisLeft + score * axisWidth
      if (dx >= minX && dx <= maxX) hitIds.add(el.id)
    }
  }

  return [...hitIds]
}

// ── MapPanel component ────────────────────────────────────────────────────────

interface Props {
  mapId: string
  onClose: () => void
  windowed?: boolean  // true when rendered inside a dedicated BrowserWindow
}

export function MapPanel({ mapId, onClose, windowed }: Props): React.JSX.Element | null {
  const config              = useAppStore(s => s.maps.find(m => m.id === mapId))
  const filePath            = useAppStore(s => s.filePath)
  const elements            = useAppStore(s => s.elements)
  const types               = useAppStore(s => s.types)
  const dimensions          = useAppStore(s => s.dimensions)
  const scores              = useAppStore(s => s.scores)
  const isDirty             = useAppStore(s => s.isDirty)
  const selectedElementId   = useAppStore(s => s.selectedElementId)
  const selectedElementIds  = useAppStore(s => s.selectedElementIds)
  const selectElement       = useAppStore(s => s.selectElement)
  const selectElements      = useAppStore(s => s.selectElements)
  const toggleElementSelection = useAppStore(s => s.toggleElementSelection)
  const clearElementSelection  = useAppStore(s => s.clearElementSelection)
  const updateMapConfig     = useAppStore(s => s.updateMapConfig)
  const updateElement       = useAppStore(s => s.updateElement)
  const bulkUpdateElements  = useAppStore(s => s.bulkUpdateElements)
  const setScores           = useAppStore(s => s.setScores)

  // Label sizes come from user preferences so they update live when the
  // Preferences dialog is saved (prefsStore notifies → component re-renders
  // → redraw useCallback deps change → canvas repaints).
  const elementLabelSize   = usePrefsStore(s => s.prefs.elementLabelSize)
  const dimensionLabelSize = usePrefsStore(s => s.prefs.dimensionLabelSize)

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

  // Lasso (rubber-band multi-select) — semantic maps only. Mutated in place
  // during mouse-move so the canvas overlay always reflects the current rect.
  const lassoRef      = useRef<{ x1: number; y1: number; x2: number; y2: number } | null>(null)
  const lassoMovedRef = useRef(false)

  // ── React state ───────────────────────────────────────────────────────────────

  const [axisPicker,     setAxisPicker]     = useState<AxisPickerState | null>(null)
  const [semanticPicker, setSemanticPicker] = useState<SemanticPickerState | null>(null)
  const [elementModal,   setElementModal]   = useState<string | null>(null)
  const [bulkModal,      setBulkModal]      = useState(false)
  const [cursor,         setCursor]         = useState('default')
  const [editingTitle,   setEditingTitle]   = useState(false)
  const [titleDraft,     setTitleDraft]     = useState('')
  // Sidebar visibility lives here, not in MapSidebar, because the toggle that
  // drives it sits in the title bar. Deliberately not persisted.
  const [sidebarOpen,    setSidebarOpen]    = useState(false)
  const titleInputRef = useRef<HTMLInputElement>(null)

  // Escape clears all selection
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        clearElementSelection()
        selectElement(null)
        window.api?.broadcastSelection(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [clearElementSelection, selectElement])

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

  function handleExportSvg(): void {
    const wrapper = wrapperRef.current
    if (!wrapper || !config) return
    const rect = wrapper.getBoundingClientRect()
    const cssW = rect.width
    const cssH = rect.height
    const ctx = new C2S(cssW, cssH)
    // canvas2svg v1.0.16 omits setLineDash — patch a no-op so draw functions
    // don't throw; dashed lines simply render as solid in the SVG output
    ;(ctx as unknown as Record<string, unknown>).setLineDash = (): void => {}
    if (config.type === 'cartesian') {
      drawCartesian(ctx, cssW, cssH, config, elements, types, dimensions, scores,
        selectedElementId ?? undefined, elementLabelSize, dimensionLabelSize, selectedElementIds)
    } else {
      drawSemantic(ctx, cssW, cssH, config, elements, types, dimensions, scores,
        undefined, selectedElementId ?? undefined, elementLabelSize, dimensionLabelSize, selectedElementIds)
    }
    const svg = ctx.getSerializedSvg(true)
    const blob = new Blob([svg], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${config.title ?? 'map'}.svg`
    a.click()
    URL.revokeObjectURL(url)
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
      drawCartesian(ctx, cssW, cssH, config, elements, types, dimensions, scores,
        selectedElementId ?? undefined, elementLabelSize, dimensionLabelSize, selectedElementIds)
    } else {
      drawSemantic(ctx, cssW, cssH, config, elements, types, dimensions, scores,
        semDraggingRef.current?.elementId, selectedElementId ?? undefined,
        elementLabelSize, dimensionLabelSize, selectedElementIds)
    }

    // Lasso overlay — applies to all map types
    if (lassoRef.current) {
      const { x1, y1, x2, y2 } = lassoRef.current
      ctx.save()
      ctx.strokeStyle = '#4488ff'
      ctx.lineWidth = 1
      ctx.setLineDash([4, 3])
      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1)
      ctx.restore()
    }
  // selectedElementId, selectedElementIds, elementLabelSize, dimensionLabelSize must all be deps:
  // any of them changing should immediately repaint the canvas.
  }, [config, elements, types, dimensions, scores, selectedElementId, selectedElementIds, elementLabelSize, dimensionLabelSize])

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
      const hit = cartesianHitDot(x, y, rect.width, rect.height, config, elements, types, scores)
      if (hit) {
        if (e.shiftKey) return  // defer to handleClick for toggle selection
        const groupIds = dragGroupIds(hit.elementId, useAppStore.getState().selectedElementIds)
        draggingRef.current = {
          ...hit,
          members: groupIds.map(id => cartesianDragStart(id, hit.xDimId, hit.yDimId, scores)),
          origin:  cartesianDragStart(hit.elementId, hit.xDimId, hit.yDimId, scores),
          startX: x, startY: y, lockedAxis: null
        }
        dragMovedRef.current = false
        setCursor('grabbing')
        selectElement(hit.elementId)
        window.api?.broadcastSelection(hit.elementId)
        e.preventDefault()
      } else if (e.shiftKey) {
        lassoRef.current      = { x1: x, y1: y, x2: x, y2: y }
        lassoMovedRef.current = false
      }
    } else {
      const hit = semanticHitDot(x, y, rect.width, rect.height, config, elements, dimensions, scores)
      if (hit) {
        if (e.shiftKey) {
          // Shift+mousedown on a dot: defer to handleClick for toggle
          return
        }
        // semanticHitDot only ever returns a dot it drew, and it draws none for
        // an unscored axis — so this is really an invariant, expressed as a
        // guard rather than an assertion.
        const s0 = scores[hit.elementId]?.[hit.dimId]
        if (s0 === undefined) return

        const selectedIds = useAppStore.getState().selectedElementIds
        semDraggingRef.current = {
          ...hit,
          members: semanticDragMembers(dragGroupIds(hit.elementId, selectedIds), hit.dimId, scores),
          origin:  { id: hit.elementId, s0 },
          startX: x, startY: y
        }
        semDragMovedRef.current = false
        setCursor('grabbing')
        selectElement(hit.elementId)
        window.api?.broadcastSelection(hit.elementId)
        // Grabbing a dot outside the current multi-selection replaces it, the
        // way clicking one always has. Grabbing one inside it leaves it alone —
        // collapsing here is what used to make a group un-draggable.
        if (!selectedIds.includes(hit.elementId)) {
          selectElements([hit.elementId])
          window.api?.broadcastMultiSelection([hit.elementId])
        }
        e.preventDefault()
        redraw()
      } else if (e.shiftKey) {
        // Shift + drag on empty space — start lasso
        lassoRef.current      = { x1: x, y1: y, x2: x, y2: y }
        lassoMovedRef.current = false
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
      const cartCfg = config

      if (!dragMovedRef.current) {
        const dx = Math.abs(x - drag.startX), dy = Math.abs(y - drag.startY)
        if (dx < 4 && dy < 4) { setCursor('grabbing'); return }
      }

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

      // The grabbed dot follows the pointer; everything else in the group moves
      // by the same delta. With one member that is just the pointer position,
      // so a single-dot drag behaves exactly as it did.
      const updates: ScoreEntry[] = []

      if (drag.lockedAxis !== 'y') {
        let xScore = (cx - plotLeft) / plotW
        if (cartCfg.xFlipped) xScore = 1 - xScore
        const dx = clampGroupDelta(drag.members.map(m => m.x0), xScore - drag.origin.x0)
        for (const m of drag.members) {
          updates.push({ elementId: m.id, targetId: drag.xDimId, value: m.x0 + dx })
        }
      }
      if (drag.lockedAxis !== 'x') {
        let yScore = 1 - (cy - plotTop) / plotH
        if (cartCfg.yFlipped) yScore = 1 - yScore
        const dy = clampGroupDelta(drag.members.map(m => m.y0), yScore - drag.origin.y0)
        for (const m of drag.members) {
          updates.push({ elementId: m.id, targetId: drag.yDimId, value: m.y0 + dy })
        }
      }

      if (updates.length > 0) {
        setScores(updates)
        for (const u of updates) window.api?.broadcastScore(u.elementId, u.targetId, u.value)
      }

      dragMovedRef.current = true
      setCursor('grabbing')
      return
    }

    // ── Active semantic drag (horizontal only) ────────────────────────────────

    if (semDraggingRef.current && config.type === 'semantic') {
      const semDrag = semDraggingRef.current

      if (!semDragMovedRef.current) {
        const dx = Math.abs(x - semDrag.startX), dy = Math.abs(y - semDrag.startY)
        if (dx < 4 && dy < 4) { setCursor('grabbing'); return }
      }

      const { dimId } = semDrag
      const semCfg    = config as SemanticMapConfig
      const axisLeft  = SEM_MARGIN_H
      const axisRight = W - SEM_MARGIN_H
      const axisWidth = axisRight - axisLeft
      const cx        = Math.max(axisLeft, Math.min(axisRight, x))
      let score       = (cx - axisLeft) / axisWidth
      if (semCfg.flippedDimensionIds.includes(dimId)) score = 1 - score

      // Every member shares this axis and its flip state, so one delta in score
      // space moves them all — no need to re-flip per element.
      const ds = clampGroupDelta(semDrag.members.map(m => m.s0), score - semDrag.origin.s0)
      const updates: ScoreEntry[] = semDrag.members.map(m => ({
        elementId: m.id, targetId: dimId, value: m.s0 + ds
      }))

      setScores(updates)
      for (const u of updates) window.api?.broadcastScore(u.elementId, u.targetId, u.value)
      semDragMovedRef.current = true
      setCursor('grabbing')
      return
    }

    // ── Active lasso ──────────────────────────────────────────────────────────

    if (lassoRef.current) {
      lassoRef.current.x2   = x
      lassoRef.current.y2   = y
      lassoMovedRef.current = true
      setCursor('crosshair')
      redraw()
      return
    }

    // ── Hover cursor ──────────────────────────────────────────────────────────

    if (config.type === 'cartesian') {
      const hit = cartesianHitDot(x, y, W, H, config, elements, types, scores)
      if (hit)                          { setCursor(e.shiftKey ? 'copy' : 'grab'); return }
      if (cartesianHitEdge(x, y, W, H)) { setCursor('pointer'); return }
      setCursor(e.shiftKey ? 'crosshair' : 'default')
    } else {
      const hit = semanticHitDot(x, y, W, H, config, elements, dimensions, scores)
      if (hit) { setCursor(e.shiftKey ? 'copy' : 'grab'); return }
      if (semanticHitRow(y, H, config.dimensionIds.length) >= 0) { setCursor('pointer'); return }
      setCursor(e.shiftKey ? 'crosshair' : 'default')
    }
  }

  function handleMouseUp(): void {
    // Commit lasso if active
    if (lassoRef.current) {
      if (lassoMovedRef.current) {
        const wrapper = wrapperRef.current
        if (wrapper && config) {
          const { width, height } = wrapper.getBoundingClientRect()
          const { x1, y1, x2, y2 } = lassoRef.current
          const existing = useAppStore.getState().selectedElementIds
          if (config.type === 'cartesian') {
            // cartesianHitRect applies the type visibility filter itself, so a
            // lasso can never pick up a dot that isn't on screen.
            const newIds = cartesianHitRect(x1, y1, x2, y2, width, height,
              config, elements, types, scores)
            selectElements([...new Set([...existing, ...newIds])])
            window.api?.broadcastMultiSelection(useAppStore.getState().selectedElementIds)
          } else {
            const newIds = semanticHitRect(x1, y1, x2, y2, width, height,
              config, elements, dimensions, scores)
            selectElements([...new Set([...existing, ...newIds])])
            window.api?.broadcastMultiSelection(useAppStore.getState().selectedElementIds)
            selectElement(null)
            window.api?.broadcastSelection(null)
          }
        }
      }
      // Don't clear lassoMovedRef here — handleClick reads it to suppress the click event
      lassoRef.current = null
      setCursor('default')
      redraw()
      return
    }

    const wasCartesianDragging = draggingRef.current    !== null
    const wasSemDragging       = semDraggingRef.current !== null
    draggingRef.current    = null
    semDraggingRef.current = null
    setCursor('default')
    if (wasCartesianDragging) {
      selectElement(null)
      window.api?.broadcastSelection(null)
    }
    if (wasSemDragging) redraw()
  }

  function handleMouseLeave(): void {
    // Cancel lasso if active
    if (lassoRef.current) {
      lassoRef.current      = null
      lassoMovedRef.current = false
      setCursor('default')
      redraw()
      return
    }

    // Cancel drag if the pointer leaves the canvas area (e.g. fast movement)
    const wasCartesianDragging = draggingRef.current    !== null
    const wasSemDragging       = semDraggingRef.current !== null
    draggingRef.current    = null
    semDraggingRef.current = null
    setCursor('default')
    if (wasCartesianDragging) {
      selectElement(null)
      window.api?.broadcastSelection(null)
    }
    if (wasSemDragging) redraw()
  }

  function handleContextMenu(e: React.MouseEvent<HTMLDivElement>): void {
    e.preventDefault()
    // Modal intercepts mouseup so the canvas would never see it — clear drag
    // state here so it can't leak through after the modal closes.
    draggingRef.current    = null
    semDraggingRef.current = null
    setCursor('default')
    const wrapper = wrapperRef.current
    if (!wrapper || !config) return
    const rect = wrapper.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const W = rect.width
    const H = rect.height

    let hitId: string | null = null
    if (config.type === 'cartesian') {
      const hit = cartesianHitDot(x, y, W, H, config, elements, types, scores)
      if (hit) hitId = hit.elementId
    } else {
      const hit = semanticHitDot(x, y, W, H, config, elements, dimensions, scores)
      if (hit) hitId = hit.elementId
    }

    if (hitId) {
      setAxisPicker(null)
      setSemanticPicker(null)
      // Read directly from store to avoid stale React closure (e.g. after rapid shift+click)
      const liveIds = useAppStore.getState().selectedElementIds
      if (liveIds.length > 1 && liveIds.includes(hitId)) {
        setBulkModal(true)
      } else {
        setElementModal(hitId)
      }
    }
  }

  function handleClick(e: React.MouseEvent<HTMLDivElement>): void {
    // If the mouse moved during this gesture it was a drag — suppress the picker
    if (dragMovedRef.current)    { dragMovedRef.current    = false; return }
    if (semDragMovedRef.current) { semDragMovedRef.current = false; return }
    if (lassoMovedRef.current)   { lassoMovedRef.current   = false; return }

    const wrapper = wrapperRef.current
    if (!wrapper || !config) return
    const rect = wrapper.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const W = rect.width
    const H = rect.height

    if (config.type === 'cartesian') {
      const dotHit = cartesianHitDot(x, y, W, H, config, elements, types, scores)
      if (dotHit) {
        if (e.shiftKey) {
          toggleElementSelection(dotHit.elementId)
          window.api?.broadcastMultiSelection(useAppStore.getState().selectedElementIds)
        }
        // Non-shift: transient highlight via selectedElementId (cleared on mouseUp)
        return
      }
      setSemanticPicker(null)
      const edge = cartesianHitEdge(x, y, W, H)
      if (edge) {
        setAxisPicker({ edge, clickX: x, clickY: y })
        return
      }
      setAxisPicker(null)
      selectElement(null)
      clearElementSelection()
      window.api?.broadcastSelection(null)
      window.api?.broadcastMultiSelection([])
    } else {
      setAxisPicker(null)
      const semCfg = config
      const hit = semanticHitDot(x, y, W, H, semCfg, elements, dimensions, scores)
      if (hit) {
        if (e.shiftKey) {
          toggleElementSelection(hit.elementId)
          window.api?.broadcastMultiSelection(useAppStore.getState().selectedElementIds)
        }
        // Non-shift: mouseDown already called selectElements([id]) — nothing to do
        return
      }
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
        clearElementSelection()
      }
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  if (!config) return null

  // The pickers below are each rendered behind a config.type guard, so these
  // narrowing casts are only ever read for the matching map type.
  const cartConfig = config as CartesianMapConfig
  const semConfig  = config as SemanticMapConfig

  return (
    <div className={windowed ? styles.panelWindowed : styles.panel}>
      <div className={`${styles.titleBar} ${windowed ? styles.titleBarWindowed : ''}`}>
        {/* The group is rendered unconditionally and only its naming element
            swaps, so the unsaved badge keeps its place beside the name while
            the title is being edited. */}
        <div className={styles.titleGroup}>
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
            <>
              <span
                className={styles.title}
                onDoubleClick={startEditingTitle}
                title="Double-click to rename"
              >
                {config.title}
              </span>
              {windowed && filePath && (
                <span className={styles.titleFileName}>
                  {filePath.split('/').pop()}
                </span>
              )}
            </>
          )}

          {isDirty && <span className={styles.unsavedBadge}>Unsaved</span>}
        </div>

        <div className={styles.titleBarActions}>
          {/* Close button only shown in embedded (non-windowed) mode */}
          {!windowed && (
            <button className={styles.closeBtn} onClick={onClose} title="Close map">✕</button>
          )}

          <button
            className={`${styles.sidebarBtn} ${sidebarOpen ? styles.sidebarBtnActive : ''}`}
            onClick={() => setSidebarOpen(o => !o)}
            title={sidebarOpen ? 'Hide map controls' : 'Show map controls'}
            aria-label={sidebarOpen ? 'Hide map controls' : 'Show map controls'}
            aria-pressed={sidebarOpen}
          >
            {/* Standard sidebar glyph: a panel outline with the right pane filled */}
            <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
              <rect
                x="1.5" y="2.5" width="13" height="11" rx="2"
                fill="none" stroke="currentColor" strokeWidth="1.3"
              />
              <path d="M10 2.5v11" stroke="currentColor" strokeWidth="1.3" />
              <path d="M10 3.5h3a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-3z" fill="currentColor" />
            </svg>
          </button>
        </div>
      </div>

      {/* Body — canvas on the left, collapsible control sidebar on the right */}
      <div className={styles.body}>
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

        {/* Bulk edit modal — shown on right-click when multiple elements are selected */}
        {bulkModal && selectedElementIds.length > 0 && (
          <BulkEditModal
            elementIds={selectedElementIds}
            elements={elements}
            onClose={(changes) => {
              if (changes) {
                bulkUpdateElements(selectedElementIds, changes)
                for (const id of selectedElementIds) {
                  window.api?.broadcastElement(id, changes as Record<string, unknown>)
                }
              }
              setBulkModal(false)
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

        {sidebarOpen && (
          <MapSidebar
            config={config}
            updateConfig={updateConfig}
            onExportSvg={handleExportSvg}
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
