// ── MapPanel ──────────────────────────────────────────────────────────────────
//
// Renders one cartesian or semantic map in its dedicated BrowserWindow.
// Pure geometry and hit testing live in mapGeometry; this component coordinates
// React state, canvas painting, pointer gestures, and map-window controls.

import { useRef, useEffect, useCallback, useContext, useState } from 'react'
import { MapHostContext } from './mapHost'
import { useAppStore, type ScoreEntry } from '../../store/appStore'
import { usePrefsStore } from '../../store/prefsStore'
import type { CartesianMapConfig, SemanticMapConfig } from '../../lib/types'
import { buildMapSvg } from './svgExport'
import { cartesianPlot, drawCartesian, MARGIN } from './cartesian/drawCartesian'
import { drawSemantic, semanticElements } from './semantic/drawSemantic'
import { scoreAtX, semanticLayout, type SemanticLayout } from './semantic/semanticLayout'
import { ElementDetailModal } from './ElementDetailModal'
import { BulkEditModal } from './BulkEditModal'
import { DimensionDetailModal } from './DimensionDetailModal'
import { MapSidebar } from './MapSidebar'
import { MapWindowChrome } from './MapWindowChrome'
import { AxisPicker } from './AxisPicker'
import { uiTheme } from '../../design/theme'
import styles from './MapPanel.module.css'
import { cartesianElements } from './collections'

// Room a map needs to stay readable: plot margins on both sides plus a small
// plot, and the control sidebar's width (MapPanel.module.css --map-sidebar-width).
const MIN_MAP_WIDTH = 2 * MARGIN + 160
const SIDEBAR_WIDTH = 230
import { downloadText } from '../../lib/download'
import {
  cartesianDragStart,
  cartesianHitDot,
  cartesianHitEdge,
  cartesianHitRect,
  clampGroupDelta,
  dragGroupIds,
  semanticDragMembers,
  semanticHitDot,
  semanticHitRect,
  semanticHitRow,
  type DragTarget,
  type Edge,
  type SemanticDragTarget
} from './mapGeometry'

// ── Types ─────────────────────────────────────────────────────────────────────

interface AxisPickerState {
  edge: Edge
}

interface SemanticPickerState {
  dimIndex: number
  dimId: string
}

// ── MapPanel component ────────────────────────────────────────────────────────

interface Props {
  mapId: string
}

export function MapPanel({ mapId }: Props): React.JSX.Element | null {
  const config              = useAppStore(s => s.maps.find(m => m.id === mapId))
  const filePath            = useAppStore(s => s.filePath)
  const elements            = useAppStore(s => s.elements)
  const collections         = useAppStore(s => s.collections)
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
  const updateDimension     = useAppStore(s => s.updateDimension)
  const setScores           = useAppStore(s => s.setScores)

  // Label sizes come from user preferences so they update live when the
  // Preferences dialog is saved (prefsStore notifies → component re-renders
  // → redraw useCallback deps change → canvas repaints).
  const elementLabelSize   = usePrefsStore(s => s.prefs.elementLabelSize)
  const dimensionLabelSize = usePrefsStore(s => s.prefs.dimensionLabelSize)
  const defaultDotRadius   = usePrefsStore(s => s.prefs.dotDefaultSize)

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
  const historyOpenRef  = useRef(false)

  // Lasso (rubber-band multi-select) — semantic maps only. Mutated in place
  // during mouse-move so the canvas overlay always reflects the current rect.
  const lassoRef      = useRef<{ x1: number; y1: number; x2: number; y2: number } | null>(null)
  const lassoMovedRef = useRef(false)

  // ── React state ───────────────────────────────────────────────────────────────

  const [axisPicker,     setAxisPicker]     = useState<AxisPickerState | null>(null)
  const [semanticPicker, setSemanticPicker] = useState<SemanticPickerState | null>(null)
  const [elementModal,   setElementModal]   = useState<string | null>(null)
  const [bulkModalIds,   setBulkModalIds]   = useState<string[]>([])
  const [dimensionModal, setDimensionModal] = useState<string | null>(null)
  const [cursor,         setCursor]         = useState('default')
  // Sidebar visibility lives here, not in MapSidebar, because the toggle that
  // drives it sits in the title bar. Deliberately not persisted.
  const [sidebarOpen,    setSidebarOpen]    = useState(false)

  // A browser tile supplies its own history bridge; a desktop map window uses IPC.
  const mapHost = useContext(MapHostContext)
  const historyBridge = mapHost?.history ?? window.api

  // A map modal owns keyboard interaction while it is visible. Tell main to
  // gate native Undo/Redo; cleanup also releases a block if this renderer exits.
  const historyModalOpen =
    elementModal !== null || bulkModalIds.length > 0 || dimensionModal !== null
  useEffect(() => {
    historyBridge.setHistoryModalOpen(historyModalOpen)
    return () => {
      if (historyModalOpen) historyBridge.setHistoryModalOpen(false)
    }
  }, [historyModalOpen, historyBridge])

  // Map windows do not own history. They bracket gestures over IPC so the
  // authoritative Score Window captures one snapshot around every score drag or
  // compound edit, regardless of how many fine-grained updates it receives.
  const beginHistory = useCallback((): void => {
    historyOpenRef.current = true
    // Repeated begin messages from the same owner are deliberately harmless.
    // Reasserting before each drag write lets a gesture resume cleanly if Undo,
    // Redo, or Save finalized its Score-side transaction while the pointer was
    // still down.
    historyBridge.historyBegin()
  }, [historyBridge])

  const finishHistory = useCallback((): void => {
    if (!historyOpenRef.current) return
    historyOpenRef.current = false
    historyBridge.historyEnd()
  }, [historyBridge])

  // A gesture can end without a canvas mouseup when the window loses focus or
  // closes. Always close the remote transaction so it cannot absorb a later edit.
  useEffect(() => {
    window.addEventListener('blur', finishHistory)
    return () => {
      window.removeEventListener('blur', finishHistory)
      finishHistory()
    }
  }, [finishHistory])

  /**
   * Drops every kind of selection — the transient single highlight and the
   * multi-selection — here and in every other window.
   *
   * Both broadcasts are required, and a half-clear is worse than none. A map
   * window doesn't own the selection: the Score Window does, and it answers any
   * selection message by pushing full state back to every map. Broadcasting the
   * single clear alone triggers that push while the Score Window still holds
   * the old multi-selection, so the ids we just cleared locally arrive back
   * milliseconds later and the dots re-light — which reads as the click having
   * done nothing at all.
   */
  const deselectAll = useCallback(() => {
    selectElement(null)
    clearElementSelection()
    window.api?.broadcastSelection(null, true)
    window.api?.broadcastMultiSelection([])
  }, [selectElement, clearElementSelection])

  // Shift-click updates both layers of selection: the group used for batch
  // operations and the single anchor Assess uses for scoring. Keeping this in
  // one helper prevents Cartesian and semantic maps from drifting apart.
  function toggleMapSelection(elementId: string): void {
    toggleElementSelection(elementId)
    const selectedIds = useAppStore.getState().selectedElementIds
    const anchorId = selectedIds.includes(elementId)
      ? elementId
      : (selectedIds[selectedIds.length - 1] ?? null)
    selectElement(anchorId)
    window.api?.broadcastSelection(anchorId, anchorId === null)
    window.api?.broadcastMultiSelection(selectedIds)
  }

  // Escape closes any map picker and clears all selection on every map type.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (mapHost && !mapHost.isActive()) return
      // One Escape, one interaction: an open picker closes before selection clears.
      if (axisPicker || semanticPicker) {
        setAxisPicker(null)
        setSemanticPicker(null)
        return
      }
      deselectAll()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [deselectAll, mapHost, axisPicker, semanticPicker])

  function handleExportSvg(): void {
    const wrapper = wrapperRef.current
    if (!wrapper || !config) return
    const rect = wrapper.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    // Exports leave out selection highlights.
    const svg = buildMapSvg(rect.width, rect.height, (ctx, w, h) => {
      if (config.type === 'cartesian') {
        drawCartesian(ctx, w, h, config, elements, collections, dimensions, scores,
          undefined, elementLabelSize, dimensionLabelSize, [], defaultDotRadius)
      } else {
        drawSemantic(ctx, w, h, config, elements, collections, dimensions, scores,
          undefined, undefined, elementLabelSize, dimensionLabelSize, [], defaultDotRadius)
      }
    })
    downloadText(`${config.title ?? 'map'}.svg`, svg, 'image/svg+xml')
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
    // A hidden or collapsed host (minimized window, hidden tile) has no area to paint.
    if (cssW <= 0 || cssH <= 0) return

    // Match canvas bitmap to CSS size × devicePixelRatio for sharp rendering.
    // The bitmap is reallocated only when that size changes; otherwise the
    // frame is cleared, and save/restore keeps one frame's drawing state
    // (dashes, alpha, transforms) out of the next.
    const dpr = window.devicePixelRatio
    const bitmapW = Math.trunc(cssW * dpr)
    const bitmapH = Math.trunc(cssH * dpr)
    if (canvas.width !== bitmapW || canvas.height !== bitmapH) {
      canvas.width  = bitmapW
      canvas.height = bitmapH
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, cssW, cssH)
    ctx.save()

    if (config.type === 'cartesian') {
      drawCartesian(ctx, cssW, cssH, config, elements, collections, dimensions, scores,
        selectedElementId ?? undefined, elementLabelSize, dimensionLabelSize,
        selectedElementIds, defaultDotRadius)
    } else {
      drawSemantic(ctx, cssW, cssH, config, elements, collections, dimensions, scores,
        semDraggingRef.current?.elementId, selectedElementId ?? undefined,
        elementLabelSize, dimensionLabelSize, selectedElementIds, defaultDotRadius)
    }

    // Lasso overlay — applies to all map types
    if (lassoRef.current) {
      const { x1, y1, x2, y2 } = lassoRef.current
      ctx.save()
      ctx.strokeStyle = uiTheme.map.drag
      ctx.lineWidth = 1
      ctx.setLineDash([4, 3])
      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1)
      ctx.restore()
    }
    ctx.restore()
  // Selection and every map appearance preference must be dependencies:
  // any of them changing should immediately repaint the canvas.
  }, [config, elements, collections, dimensions, scores, selectedElementId,
    selectedElementIds, elementLabelSize, dimensionLabelSize, defaultDotRadius])

  // Redraw whenever any input data changes
  const redrawRef = useRef(redraw)
  useEffect(() => {
    redrawRef.current = redraw
    redraw()
  }, [redraw])

  // Redraw when the wrapper div is resized (window resize or layout change).
  // One observer while the canvas is mounted, calling the latest redraw:
  // recreating it per data change would make its initial size report repaint
  // each change a second time (Issue #5). The wrapper appears once the map's
  // config arrives (a desktop map window starts without it).
  const hasCanvas = !!config
  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return
    const observer = new ResizeObserver(() => redrawRef.current())
    observer.observe(wrapper)
    return () => observer.disconnect()
  }, [hasCanvas])

  // ── Mouse event handlers ──────────────────────────────────────────────────────

  /** The semantic map's axes at a canvas size, exactly as drawSemantic lays them out. */
  function semanticLayoutAt(width: number, height: number): SemanticLayout {
    return semanticLayout(width, height, config as SemanticMapConfig, dimensions, dimensionLabelSize)
  }

  function handleMouseDown(e: React.MouseEvent<HTMLDivElement>): void {
    if (e.button !== 0) return  // ignore right-click and middle-click
    const wrapper = wrapperRef.current
    if (!wrapper || !config) return
    const rect = wrapper.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    if (config.type === 'cartesian') {
      const hit = cartesianHitDot(
        x, y, rect.width, rect.height, config, elements, collections, scores, defaultDotRadius
      )
      if (hit) {
        if (e.shiftKey) return  // defer to handleClick for toggle selection
        const visibleIds = new Set(
          cartesianElements(config, elements, collections).map(element => element.id)
        )
        const groupIds = dragGroupIds(hit.elementId, useAppStore.getState().selectedElementIds)
          .filter(id => visibleIds.has(id))
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
      const hit = semanticHitDot(
        x, y, semanticLayoutAt(rect.width, rect.height), config, elements, collections, scores,
        defaultDotRadius
      )
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
        const visibleIds  = new Set(
          semanticElements(config, elements, collections).map(el => el.id)
        )
        semDraggingRef.current = {
          ...hit,
          members: semanticDragMembers(
            dragGroupIds(hit.elementId, selectedIds), hit.dimId, scores, visibleIds
          ),
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

      const { left: plotLeft, top: plotTop, right: plotRight, bottom: plotBottom } = cartesianPlot(W, H)
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
        beginHistory()
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
      const layout = semanticLayoutAt(W, H)
      const axis   = layout.axes.find(a => a.dimension.id === dimId)
      if (!axis) return
      const score  = scoreAtX(layout, axis, x)

      // Every member shares this axis and its flip state, so one delta in score
      // space moves them all — no need to re-flip per element.
      const ds = clampGroupDelta(semDrag.members.map(m => m.s0), score - semDrag.origin.s0)
      const updates: ScoreEntry[] = semDrag.members.map(m => ({
        elementId: m.id, targetId: dimId, value: m.s0 + ds
      }))

      beginHistory()
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
      const hit = cartesianHitDot(
        x, y, W, H, config, elements, collections, scores, defaultDotRadius
      )
      if (hit)                          { setCursor(e.shiftKey ? 'copy' : 'grab'); return }
      if (cartesianHitEdge(x, y, W, H)) { setCursor('pointer'); return }
      setCursor(e.shiftKey ? 'crosshair' : 'default')
    } else {
      const layout = semanticLayoutAt(W, H)
      const hit = semanticHitDot(x, y, layout, config, elements, collections, scores, defaultDotRadius)
      if (hit) { setCursor(e.shiftKey ? 'copy' : 'grab'); return }
      if (semanticHitRow(y, layout) >= 0) { setCursor('pointer'); return }
      setCursor(e.shiftKey ? 'crosshair' : 'default')
    }
  }

  function handleMouseUp(): void {
    finishHistory()

    // Commit lasso if active
    if (lassoRef.current) {
      if (lassoMovedRef.current) {
        const wrapper = wrapperRef.current
        if (wrapper && config) {
          const { width, height } = wrapper.getBoundingClientRect()
          const { x1, y1, x2, y2 } = lassoRef.current
          const existing = useAppStore.getState().selectedElementIds
          if (config.type === 'cartesian') {
            // cartesianHitRect applies collection visibility itself, so a
            // lasso can never pick up a dot that isn't on screen.
            const newIds = cartesianHitRect(x1, y1, x2, y2, width, height,
              config, elements, collections, scores)
            selectElements([...new Set([...existing, ...newIds])])
            window.api?.broadcastMultiSelection(useAppStore.getState().selectedElementIds)
          } else {
            const newIds = semanticHitRect(x1, y1, x2, y2, semanticLayoutAt(width, height),
              config, elements, collections, scores)
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
    finishHistory()

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
    finishHistory()
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
      const hit = cartesianHitDot(
        x, y, W, H, config, elements, collections, scores, defaultDotRadius
      )
      if (hit) hitId = hit.elementId
    } else {
      const hit = semanticHitDot(
        x, y, semanticLayoutAt(W, H), config, elements, collections, scores, defaultDotRadius
      )
      if (hit) hitId = hit.elementId
    }

    if (hitId) {
      setAxisPicker(null)
      setSemanticPicker(null)
      // Read directly from store to avoid stale React closure (e.g. after rapid shift+click)
      const visibleIds = new Set((config.type === 'cartesian'
        ? cartesianElements(config, elements, collections)
        : semanticElements(config, elements, collections)
      ).map(element => element.id))
      const liveIds = useAppStore.getState().selectedElementIds.filter(id => visibleIds.has(id))
      if (liveIds.length > 1 && liveIds.includes(hitId)) {
        setBulkModalIds(liveIds)
      } else {
        setElementModal(hitId)
      }
      return
    }

    // No dot under the pointer: an axis opens its dimension instead.
    let dimensionId: string | undefined
    if (config.type === 'cartesian') {
      const edge = cartesianHitEdge(x, y, W, H)
      if (edge) dimensionId = edge === 'left' || edge === 'right' ? config.xDimensionId : config.yDimensionId
    } else {
      const layout = semanticLayoutAt(W, H)
      dimensionId = layout.axes[semanticHitRow(y, layout)]?.dimension.id
    }
    if (dimensionId && dimensions.some(d => d.id === dimensionId)) {
      setAxisPicker(null)
      setSemanticPicker(null)
      setDimensionModal(dimensionId)
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
      const dotHit = cartesianHitDot(
        x, y, W, H, config, elements, collections, scores, defaultDotRadius
      )
      if (dotHit) {
        if (e.shiftKey) {
          toggleMapSelection(dotHit.elementId)
        }
        // Non-shift: transient highlight via selectedElementId (cleared on mouseUp)
        return
      }
      setSemanticPicker(null)
      const edge = cartesianHitEdge(x, y, W, H)
      if (edge) {
        setAxisPicker({ edge })
        return
      }
      setAxisPicker(null)
      deselectAll()
    } else {
      setAxisPicker(null)
      const semCfg = config
      const layout = semanticLayoutAt(W, H)
      const hit = semanticHitDot(x, y, layout, semCfg, elements, collections, scores, defaultDotRadius)
      if (hit) {
        if (e.shiftKey) {
          toggleMapSelection(hit.elementId)
        }
        // Non-shift: mouseDown already called selectElements([id]) — nothing to do
        return
      }
      const rowIdx = semanticHitRow(y, layout)
      if (rowIdx >= 0) {
        setSemanticPicker({ dimIndex: rowIdx, dimId: layout.axes[rowIdx].dimension.id })
      } else {
        // Open space: no dot, no axis row. Same as the cartesian case — the
        // click means "never mind", so the whole selection goes.
        setSemanticPicker(null)
        deselectAll()
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
    <div className={`${styles.panelWindowed} ${sidebarOpen ? styles.panelSidebarOpen : ''}`}>
      <MapWindowChrome
        title={config.title}
        filePath={filePath}
        isDirty={isDirty}
        sidebarOpen={sidebarOpen}
        onRename={title => updateConfig({ title })}
        onToggleSidebar={() => {
          // A browser tile too narrow for controls plus a useful plot maximizes first.
          if (!sidebarOpen) mapHost?.ensureRoom(SIDEBAR_WIDTH + MIN_MAP_WIDTH, 0)
          setSidebarOpen(open => !open)
        }}
      />

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

        {/* Dimension detail modal — shown on right-click of an axis */}
        {dimensionModal && (
          <DimensionDetailModal
            dimensionId={dimensionModal}
            onClose={(changes) => {
              if (changes) {
                updateDimension(dimensionModal, changes)
                window.api?.broadcastDimension(dimensionModal, changes as Record<string, unknown>)
              }
              setDimensionModal(null)
            }}
          />
        )}

        {/* Bulk edit modal — shown on right-click when multiple elements are selected */}
        {bulkModalIds.length > 0 && (
          <BulkEditModal
            elementIds={bulkModalIds}
            elements={elements}
            onClose={(changes) => {
              if (changes) {
                // Membership resolves per element, so each one gets its own
                // payload; the shared fields are identical across them.
                beginHistory()
                try {
                  for (const id of bulkModalIds) {
                    const forElement = changes.collectionIds
                      ? { ...changes.fields, collectionIds: changes.collectionIds[id] }
                      : changes.fields
                    updateElement(id, forElement)
                    window.api?.broadcastElement(id, forElement as Record<string, unknown>)
                  }
                } finally {
                  finishHistory()
                }
              }
              setBulkModalIds([])
            }}
          />
        )}

        {/* Axis picker — shown when the user clicks a cartesian axis */}
        {axisPicker && config.type === 'cartesian' && (
          <AxisPicker
            title={axisPicker.edge === 'left' || axisPicker.edge === 'right' ? 'X Axis' : 'Y Axis'}
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
          <AxisPicker
            title="Dimension"
            currentId={semanticPicker.dimId}
            isFlipped={semConfig.flippedDimensionIds.includes(semanticPicker.dimId)}
            dimensions={dimensions}
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

      <div
        className={`${styles.sidebarShell} ${sidebarOpen ? styles.sidebarShellOpen : ''}`}
        aria-hidden={!sidebarOpen}
        inert={!sidebarOpen}
      >
        <div className={styles.sidebarHeader} />
        <MapSidebar
          config={config}
          updateConfig={updateConfig}
          onExportSvg={handleExportSvg}
        />
      </div>

    </div>
  )
}
