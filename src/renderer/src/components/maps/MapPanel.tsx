// ── MapPanel ──────────────────────────────────────────────────────────────────
//
// Renders one cartesian or semantic map in its dedicated BrowserWindow.
// Pure geometry and hit testing live in mapGeometry; this component coordinates
// React state, canvas painting, pointer gestures, and map-window controls.

import { useRef, useEffect, useCallback, useContext, useMemo, useState } from 'react'
import { MapHostContext } from './mapHost'
import { useAppStore } from '../../store/appStore'
import { useHistoryGesture } from '../../store/historyBindings'
import { usePrefsStore } from '../../store/prefsStore'
import type { CartesianMapConfig, SemanticMapConfig } from '../../lib/types'
import { MARGIN } from './cartesian/drawCartesian'
import { ElementDetailModal } from './ElementDetailModal'
import { BulkEditModal } from './BulkEditModal'
import { DimensionDetailModal } from './DimensionDetailModal'
import { MapSidebar } from './MapSidebar'
import { MapWindowChrome } from './MapWindowChrome'
import { AxisPicker } from './AxisPicker'
import { uiTheme } from '../../design/theme'
import styles from './MapPanel.module.css'
import { downloadText } from '../../lib/download'
import { axisControl, drawMap, mapAdapter, type AxisHit, type MapAdapter, type MapScene, type ScoreDrag } from './mapAdapter'
import type { Rect } from './mapGeometry'

// Room a map needs to stay readable: plot margins on both sides plus a small
// plot, and the control sidebar's width (MapPanel.module.css --map-sidebar-width).
const MIN_MAP_WIDTH = 2 * MARGIN + 160
const SIDEBAR_WIDTH = 230

/** A drag in progress, with where it started and how its map type treats a grab. */
interface HeldDot {
  drag: ScoreDrag
  startX: number
  startY: number
  grabSelects: boolean
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

  // What the map is drawn and hit-tested from; selection is added when painting.
  const scene: MapScene = useMemo(
    () => ({ elements, collections, dimensions, scores, defaultDotRadius, elementLabelSize, dimensionLabelSize }),
    [elements, collections, dimensions, scores, defaultDotRadius, elementLabelSize, dimensionLabelSize]
  )

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
  const heldRef        = useRef<HeldDot | null>(null)

  // Lasso (rubber-band multi-select). Mutated in place during mouse-move so
  // the canvas overlay always reflects the current rect.
  const lassoRef = useRef<Rect | null>(null)

  // Set once a drag or lasso actually moves, so the click that ends it is not
  // read as a click on the map.
  const movedRef = useRef(false)

  // ── React state ───────────────────────────────────────────────────────────────

  const [picker,         setPicker]         = useState<AxisHit | null>(null)
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

  // Map windows do not own history. They bracket gestures through the bridge
  // so the authoritative Score Window captures one snapshot around every score
  // drag or compound edit, however many fine-grained updates it receives.
  const gesture = useHistoryGesture(historyBridge)

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
      if (picker) {
        setPicker(null)
        return
      }
      deselectAll()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [deselectAll, mapHost, picker])

  // SVG export loads its library on first use, keeping it out of startup.
  async function handleExportSvg(): Promise<void> {
    const wrapper = wrapperRef.current
    if (!wrapper || !config) return
    const rect = wrapper.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    const { buildMapSvg } = await import('./svgExport')
    // Exports leave out selection highlights.
    const svg = buildMapSvg(rect.width, rect.height, (ctx, w, h) => drawMap(ctx, w, h, config, scene))
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

    drawMap(ctx, cssW, cssH, config, {
      ...scene,
      selectedElementId: selectedElementId ?? undefined,
      selectedElementIds,
      draggingElementId: heldRef.current?.drag.elementId
    })

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
  }, [config, scene, selectedElementId, selectedElementIds])

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

  /** The map's adapter at the canvas's current size, or null before it has one. */
  function adapterNow(): { map: MapAdapter; rect: DOMRect } | null {
    const wrapper = wrapperRef.current
    if (!wrapper || !config) return null
    const rect = wrapper.getBoundingClientRect()
    return { map: mapAdapter(config, scene, rect.width, rect.height), rect }
  }

  /** The adapter plus the pointer's position on the canvas. */
  function pointerOn(e: React.MouseEvent): { map: MapAdapter; x: number; y: number } | null {
    const now = adapterNow()
    return now && { map: now.map, x: e.clientX - now.rect.left, y: e.clientY - now.rect.top }
  }

  function handleMouseDown(e: React.MouseEvent<HTMLDivElement>): void {
    if (e.button !== 0) return  // ignore right-click and middle-click
    const at = pointerOn(e)
    if (!at) return
    const { map, x, y } = at

    const hit = map.dotAt(x, y)
    if (!hit) {
      // Shift + drag on empty space starts a lasso.
      if (e.shiftKey) {
        lassoRef.current = { x1: x, y1: y, x2: x, y2: y }
        movedRef.current = false
      }
      return
    }
    if (e.shiftKey) return  // defer to handleClick for toggle selection

    const selectedIds = useAppStore.getState().selectedElementIds
    const drag = map.startDrag(hit, x, y, selectedIds)
    if (!drag) return
    heldRef.current = { drag, startX: x, startY: y, grabSelects: map.grabSelects }
    movedRef.current = false
    setCursor('grabbing')
    selectElement(hit.elementId)
    window.api?.broadcastSelection(hit.elementId)
    // Grabbing a dot outside the current multi-selection replaces it, the way
    // clicking one always has. Grabbing one inside it leaves it alone, so the
    // group stays draggable.
    if (map.grabSelects && !selectedIds.includes(hit.elementId)) {
      selectElements([hit.elementId])
      window.api?.broadcastMultiSelection([hit.elementId])
    }
    e.preventDefault()
    redraw()
  }

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>): void {
    const at = pointerOn(e)
    if (!at) return
    const { map, x, y } = at

    const held = heldRef.current
    if (held) {
      // A dot must move 4px before the press counts as a drag.
      if (!movedRef.current && Math.abs(x - held.startX) < 4 && Math.abs(y - held.startY) < 4) {
        setCursor('grabbing')
        return
      }
      const updates = held.drag.moveTo(x, y, e.shiftKey)
      if (updates.length > 0) {
        gesture.begin()
        setScores(updates)
        for (const u of updates) window.api?.broadcastScore(u.elementId, u.targetId, u.value)
      }
      movedRef.current = true
      setCursor('grabbing')
      return
    }

    if (lassoRef.current) {
      lassoRef.current.x2 = x
      lassoRef.current.y2 = y
      movedRef.current = true
      setCursor('crosshair')
      redraw()
      return
    }

    if (map.dotAt(x, y))       setCursor(e.shiftKey ? 'copy' : 'grab')
    else if (map.axisAt(x, y)) setCursor('pointer')
    else                       setCursor(e.shiftKey ? 'crosshair' : 'default')
  }

  /** Lets go of a held dot; one that only highlighted while held loses the highlight. */
  function releaseDot(): void {
    const held = heldRef.current
    heldRef.current = null
    setCursor('default')
    if (!held) return
    if (held.grabSelects) {
      redraw()
    } else {
      selectElement(null)
      window.api?.broadcastSelection(null)
    }
  }

  function handleMouseUp(): void {
    gesture.end()

    const lasso = lassoRef.current
    if (lasso) {
      const now = movedRef.current ? adapterNow() : null
      if (now) {
        const existing = useAppStore.getState().selectedElementIds
        selectElements([...new Set([...existing, ...now.map.dotsIn(lasso)])])
        window.api?.broadcastMultiSelection(useAppStore.getState().selectedElementIds)
        if (now.map.grabSelects) {
          selectElement(null)
          window.api?.broadcastSelection(null)
        }
      }
      // movedRef stays set: handleClick reads it to suppress this gesture's click.
      lassoRef.current = null
      setCursor('default')
      redraw()
      return
    }
    releaseDot()
  }

  // The pointer leaving the canvas (a fast movement, say) cancels a lasso and
  // ends a drag where it is.
  function handleMouseLeave(): void {
    gesture.end()
    if (lassoRef.current) {
      lassoRef.current = null
      movedRef.current = false
      setCursor('default')
      redraw()
      return
    }
    releaseDot()
  }

  function handleContextMenu(e: React.MouseEvent<HTMLDivElement>): void {
    e.preventDefault()
    gesture.end()
    // Modal intercepts mouseup so the canvas would never see it — clear drag
    // state here so it can't leak through after the modal closes.
    heldRef.current = null
    setCursor('default')
    const at = pointerOn(e)
    if (!at) return
    const { map, x, y } = at

    const hit = map.dotAt(x, y)
    if (hit) {
      setPicker(null)
      // Read directly from store to avoid stale React closure (e.g. after rapid shift+click)
      const liveIds = useAppStore.getState().selectedElementIds.filter(id => map.visibleIds.has(id))
      if (liveIds.length > 1 && liveIds.includes(hit.elementId)) {
        setBulkModalIds(liveIds)
      } else {
        setElementModal(hit.elementId)
      }
      return
    }

    // No dot under the pointer: an axis opens its dimension instead.
    const axis = map.axisAt(x, y)
    if (axis && dimensions.some(d => d.id === axis.dimensionId)) {
      setPicker(null)
      setDimensionModal(axis.dimensionId)
    }
  }

  function handleClick(e: React.MouseEvent<HTMLDivElement>): void {
    // If the mouse moved during this gesture it was a drag or lasso, not a click.
    if (movedRef.current) { movedRef.current = false; return }
    const at = pointerOn(e)
    if (!at) return
    const { map, x, y } = at

    const hit = map.dotAt(x, y)
    if (hit) {
      // Without Shift, mouse-down has already highlighted or selected the dot.
      if (e.shiftKey) toggleMapSelection(hit.elementId)
      return
    }
    // An axis opens its picker. Open space means "never mind": the whole
    // selection goes.
    const axis = map.axisAt(x, y)
    setPicker(axis)
    if (!axis) deselectAll()
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  if (!config) return null

  const pickerControl = picker && axisControl(config, picker)
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
                gesture.begin()
                try {
                  for (const id of bulkModalIds) {
                    const forElement = changes.collectionIds
                      ? { ...changes.fields, collectionIds: changes.collectionIds[id] }
                      : changes.fields
                    updateElement(id, forElement)
                    window.api?.broadcastElement(id, forElement as Record<string, unknown>)
                  }
                } finally {
                  gesture.end()
                }
              }
              setBulkModalIds([])
            }}
          />
        )}

        {/* Axis picker — shown when the user clicks an axis */}
        {pickerControl && (
          <AxisPicker
            title={pickerControl.title}
            currentId={pickerControl.currentId}
            isFlipped={pickerControl.isFlipped}
            dimensions={dimensions}
            onPick={(id) => {
              updateConfig(pickerControl.pick(id))
              setPicker(null)
            }}
            onFlip={() => {
              updateConfig(pickerControl.flip())
              setPicker(null)
            }}
            onClose={() => setPicker(null)}
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
          onExportSvg={() => void handleExportSvg()}
        />
      </div>

    </div>
  )
}
