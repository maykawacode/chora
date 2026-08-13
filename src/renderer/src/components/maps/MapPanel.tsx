// ── MapPanel ──────────────────────────────────────────────────────────────────
//
// Renders one cartesian or semantic map in its dedicated BrowserWindow.
// Pure geometry and hit testing live in mapGeometry; this component coordinates
// React state, canvas painting, pointer gestures, and map-window controls.

import { useRef, useEffect, useCallback, useState } from 'react'
import { useAppStore, type ScoreEntry } from '../../store/appStore'
import { usePrefsStore } from '../../store/prefsStore'
import type { CartesianMapConfig, SemanticMapConfig, Dimension } from '../../lib/types'
import C2S from 'canvas2svg'
import { drawCartesian, MARGIN } from './cartesian/drawCartesian'
import { drawSemantic, semanticElements, SEM_MARGIN_H } from './semantic/drawSemantic'
import { ElementDetailModal } from './ElementDetailModal'
import { BulkEditModal } from './BulkEditModal'
import { MapSidebar } from './MapSidebar'
import { MapWindowChrome } from './MapWindowChrome'
import { ModalShell } from '../ModalShell'
import styles from './MapPanel.module.css'
import { cartesianElements } from './collections'
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
  clickX: number
  clickY: number
}

interface SemanticPickerState {
  dimIndex: number
  dimId: string
  clickX: number
  clickY: number
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
  const [cursor,         setCursor]         = useState('default')
  // Sidebar visibility lives here, not in MapSidebar, because the toggle that
  // drives it sits in the title bar. Deliberately not persisted.
  const [sidebarOpen,    setSidebarOpen]    = useState(false)

  // A map modal owns keyboard interaction while it is visible. Tell main to
  // gate native Undo/Redo; cleanup also releases a block if this renderer exits.
  const historyModalOpen = elementModal !== null || bulkModalIds.length > 0
  useEffect(() => {
    window.api.setHistoryModalOpen(historyModalOpen)
    return () => {
      if (historyModalOpen) window.api.setHistoryModalOpen(false)
    }
  }, [historyModalOpen])

  // Map windows do not own history. They bracket gestures over IPC so the
  // authoritative Score Window captures one snapshot around every score drag or
  // compound edit, regardless of how many fine-grained updates it receives.
  const beginHistory = useCallback((): void => {
    historyOpenRef.current = true
    // Repeated begin messages from the same owner are deliberately harmless.
    // Reasserting before each drag write lets a gesture resume cleanly if Undo,
    // Redo, or Save finalized its Score-side transaction while the pointer was
    // still down.
    window.api.historyBegin()
  }, [])

  const finishHistory = useCallback((): void => {
    if (!historyOpenRef.current) return
    historyOpenRef.current = false
    window.api.historyEnd()
  }, [])

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
      setAxisPicker(null)
      setSemanticPicker(null)
      deselectAll()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [deselectAll])

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
      drawCartesian(ctx, cssW, cssH, config, elements, collections, dimensions, scores,
        selectedElementId ?? undefined, elementLabelSize, dimensionLabelSize, selectedElementIds)
    } else {
      drawSemantic(ctx, cssW, cssH, config, elements, collections, dimensions, scores,
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
      drawCartesian(ctx, cssW, cssH, config, elements, collections, dimensions, scores,
        selectedElementId ?? undefined, elementLabelSize, dimensionLabelSize, selectedElementIds)
    } else {
      drawSemantic(ctx, cssW, cssH, config, elements, collections, dimensions, scores,
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
  }, [config, elements, collections, dimensions, scores, selectedElementId, selectedElementIds, elementLabelSize, dimensionLabelSize])

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
      const hit = cartesianHitDot(x, y, rect.width, rect.height, config, elements, collections, scores)
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
      const hit = semanticHitDot(x, y, rect.width, rect.height, config, elements, collections, dimensions, scores)
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
      const hit = cartesianHitDot(x, y, W, H, config, elements, collections, scores)
      if (hit)                          { setCursor(e.shiftKey ? 'copy' : 'grab'); return }
      if (cartesianHitEdge(x, y, W, H)) { setCursor('pointer'); return }
      setCursor(e.shiftKey ? 'crosshair' : 'default')
    } else {
      const hit = semanticHitDot(x, y, W, H, config, elements, collections, dimensions, scores)
      if (hit) { setCursor(e.shiftKey ? 'copy' : 'grab'); return }
      if (semanticHitRow(y, H, config.dimensionIds.length) >= 0) { setCursor('pointer'); return }
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
            const newIds = semanticHitRect(x1, y1, x2, y2, width, height,
              config, elements, collections, dimensions, scores)
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
      const hit = cartesianHitDot(x, y, W, H, config, elements, collections, scores)
      if (hit) hitId = hit.elementId
    } else {
      const hit = semanticHitDot(x, y, W, H, config, elements, collections, dimensions, scores)
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
      const dotHit = cartesianHitDot(x, y, W, H, config, elements, collections, scores)
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
        setAxisPicker({ edge, clickX: x, clickY: y })
        return
      }
      setAxisPicker(null)
      deselectAll()
    } else {
      setAxisPicker(null)
      const semCfg = config
      const hit = semanticHitDot(x, y, W, H, semCfg, elements, collections, dimensions, scores)
      if (hit) {
        if (e.shiftKey) {
          toggleMapSelection(hit.elementId)
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
        onToggleSidebar={() => setSidebarOpen(open => !open)}
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
      case 'left':   return { ...base, left: MARGIN + 4,  top: `calc(var(--map-titlebar-height) + ${Math.max(4, clickY - 20)}px)` }
      case 'right':  return { ...base, right: MARGIN + 4, top: `calc(var(--map-titlebar-height) + ${Math.max(4, clickY - 20)}px)` }
      case 'top':    return { ...base, left: Math.max(4, clickX - 70), top: `calc(var(--map-titlebar-height) + ${MARGIN + 4}px)` }
      case 'bottom': return { ...base, left: Math.max(4, clickX - 70), bottom: MARGIN + 4 }
    }
  })()

  return (
    <ModalShell
      overlayClassName={styles.axisPickerBackdrop}
      dialogClassName={styles.axisPicker}
      onClose={onClose}
      label={`${axis} options`}
      dialogStyle={pickerStyle}
    >
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
    </ModalShell>
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
    top:  `calc(var(--map-titlebar-height) + ${Math.max(4, clickY - 20)}px)`
  }

  return (
    <ModalShell
      overlayClassName={styles.axisPickerBackdrop}
      dialogClassName={styles.axisPicker}
      onClose={onClose}
      label="Dimension options"
      dialogStyle={pickerStyle}
    >
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
    </ModalShell>
  )
}

// MapPanelList (embedded maps in the Score Window) was removed. Maps now always
// open as dedicated BrowserWindows via the map:open IPC channel. If embedded
// maps are ever needed again, restore this component from git history.
