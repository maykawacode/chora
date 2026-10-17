import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '@renderer/store/appStore'
import { MapPanel } from '@renderer/components/maps/MapPanel'
import { MapHostContext, type MapHost } from '@renderer/components/maps/mapHost'
import {
  activateSurface, activeSurface, beginTransaction, endTransaction, releaseSurface, setModalLock
} from './interaction'
import { MAP_AREA_MIN_WIDTH, SCORE_MIN_WIDTH, STRIP_WIDTH, useScoreLayout } from './scoreLayout'
import {
  FILL, columnsFor, computeArrangement, findSplit, minSize, moveTile, reconcile, setSplitSizes, useTileLayout,
  type Arrangement, type Divider, type FluidRect, type Rect, type Side, type Span
} from './tileLayout'
import styles from './BrowserWorkspace.module.css'

// Browser map area beside the Score Window: one tile per map in the session,
// or a "No maps" placeholder tile when there are none. Tiles are placed by the
// split tree in tileLayout.ts but rendered flat and absolutely positioned, so
// moving a tile to another split never remounts its map.
// Tiles render straight from the shared store; closing one removes the map,
// as closing a desktop map window does. Maximize keeps the other tiles
// mounted but hidden and inert, so their state survives the round trip.

// Smallest tile that holds the element, bulk and dimension editors without clipping.
const MODAL_ROOM = { width: 560, height: 560 }

const cssLength = ({ frac, px }: Span): string => `calc(${frac * 100}% + ${px}px)`

/** Absolute placement that the browser keeps in step with the area's size. */
function placement(f: FluidRect): React.CSSProperties {
  return { left: cssLength(f.x), top: cssLength(f.y), width: cssLength(f.width), height: cssLength(f.height) }
}

function MapTile({ mapId, place, hidden, maximized, dragging, onToggleMaximize, onBeginMove }: {
  mapId: string
  place: FluidRect | undefined
  hidden: boolean
  maximized: boolean
  dragging: boolean
  onToggleMaximize: () => void
  onBeginMove: (mapId: string, e: React.PointerEvent) => void
}): React.JSX.Element {
  const tileRef = useRef<HTMLElement>(null)
  const host = useMemo<MapHost>(() => {
    const ensureRoom = (minWidth: number, minHeight: number): void => {
      const rect = tileRef.current?.getBoundingClientRect()
      if (!rect || maximized) return
      if (rect.width < minWidth || rect.height < minHeight) onToggleMaximize()
    }
    return {
    control: (action) => {
      if (action === 'close') useAppStore.getState().removeMap(mapId)
      else if (action === 'zoom') onToggleMaximize()
    },
    zoomLabel: maximized ? 'Restore' : 'Maximize',
    history: {
      historyBegin:        () => beginTransaction(mapId),
      historyEnd:          () => endTransaction(mapId),
      setHistoryModalOpen: (open) => {
        // Map editing dialogs are laid out within the tile; give them room.
        if (open) ensureRoom(MODAL_ROOM.width, MODAL_ROOM.height)
        setModalLock(mapId, open)
      }
    },
    ensureRoom,
    isActive: () => activeSurface() === mapId,
    beginTileMove: (e) => onBeginMove(mapId, e)
    }
  }, [mapId, maximized, onToggleMaximize, onBeginMove])

  useEffect(() => () => releaseSurface(mapId), [mapId])

  // Hiding a tile (another was maximized) ends any gesture it still holds.
  useEffect(() => { if (hidden) releaseSurface(mapId) }, [hidden, mapId])

  return (
    <section
      ref={tileRef}
      className={`${styles.tile} ${dragging ? styles.tileDragging : ''}`}
      style={place ? placement(place) : undefined}
      hidden={hidden || !place}
      inert={hidden}
      data-surface={mapId}
    >
      <MapHostContext.Provider value={host}>
        <MapPanel mapId={mapId} />
      </MapHostContext.Provider>
    </section>
  )
}

/** The surface an event target belongs to; anything outside a tile is Score. */
function surfaceOf(target: EventTarget | null): string {
  const tile = target instanceof Element ? target.closest<HTMLElement>('[data-surface]') : null
  return tile?.dataset.surface ?? 'score'
}

function isTextEntry(el: Element | null): el is HTMLElement {
  return el instanceof HTMLElement &&
    (el.isContentEditable || el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)
}

// Pointer and focus entry pick the active surface. A pointer press on a tile
// also blurs a Score text field first, so its pending edit commits before the
// canvas gesture starts and typed keys stop landing in it.
function useSurfaceTracking(): void {
  useEffect(() => {
    const onPointerDown = (e: PointerEvent): void => {
      const surface = surfaceOf(e.target)
      const focused = document.activeElement
      if (surface !== 'score' && isTextEntry(focused) && surfaceOf(focused) !== surface) focused.blur()
      activateSurface(surface)
    }
    const onFocusIn = (e: FocusEvent): void => activateSurface(surfaceOf(e.target))
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('focusin', onFocusIn, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('focusin', onFocusIn, true)
    }
  }, [])
}

// Everything left of the splitter: the tab strip plus Score.
const LEFT_MIN_WIDTH = STRIP_WIDTH + SCORE_MIN_WIDTH
const KEY_STEP = 16

const clampScoreWidth = (width: number): number =>
  Math.round(Math.max(LEFT_MIN_WIDTH, Math.min(width, window.innerWidth - MAP_AREA_MIN_WIDTH)))

/**
 * Divider on Score's right edge. Drag, or focus it and use the arrow keys, to
 * resize Score; double-click returns to the default share. The strip and Score
 * start at the page's left edge, so their width is the divider's x position.
 */
function Splitter({ width, onChange }: { width: number | null; onChange: (w: number | null) => void }): React.JSX.Element {
  return (
    <div
      className={styles.splitter}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize Score"
      aria-valuemin={LEFT_MIN_WIDTH}
      aria-valuenow={width ?? undefined}
      tabIndex={0}
      onPointerDown={(e) => {
        e.preventDefault()
        e.currentTarget.setPointerCapture(e.pointerId)
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) onChange(clampScoreWidth(e.clientX))
      }}
      onDoubleClick={() => onChange(null)}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
        e.preventDefault()
        // Keep the arrows from also nudging the selected score (ScoresTab listens on window).
        e.stopPropagation()
        const left = e.currentTarget.getBoundingClientRect().left
        onChange(clampScoreWidth(left + (e.key === 'ArrowLeft' ? -KEY_STEP : KEY_STEP)))
      }}
    />
  )
}

const DRAG_THRESHOLD = 4

interface DropTarget { targetId: string; side: Side; rect: Rect }

/** Half of `r` on `side`, where a dropped tile will land. */
function halfRect(r: Rect, side: Side): Rect {
  switch (side) {
    case 'left':   return { ...r, width: r.width / 2 }
    case 'right':  return { ...r, x: r.x + r.width / 2, width: r.width / 2 }
    case 'top':    return { ...r, height: r.height / 2 }
    case 'bottom': return { ...r, y: r.y + r.height / 2, height: r.height / 2 }
  }
}

/** The tile under an area-space point other than the dragged one, and its nearest edge. */
function hitTest(arrangement: Arrangement, dragId: string, x: number, y: number): DropTarget | null {
  for (const [id, r] of arrangement.tiles) {
    if (id === dragId || x < r.x || x > r.x + r.width || y < r.y || y > r.y + r.height) continue
    const edges: [Side, number][] = [
      ['left', (x - r.x) / r.width], ['right', (r.x + r.width - x) / r.width],
      ['top', (y - r.y) / r.height], ['bottom', (r.y + r.height - y) / r.height]
    ]
    const side = edges.reduce((a, b) => (b[1] < a[1] ? b : a))[0]
    return { targetId: id, side, rect: halfRect(r, side) }
  }
  return null
}

/**
 * Moving a tile by its title bar. The drag starts after a few pixels, so
 * clicks, double-click rename and the window buttons behave as before; Escape
 * or a release away from another tile cancels.
 */
function useTileDrag(areaRef: React.RefObject<HTMLDivElement | null>, arrangementRef: React.RefObject<Arrangement>) {
  const [dragId, setDragId] = useState<string | null>(null)
  const [drop, setDrop] = useState<DropTarget | null>(null)

  const begin = useCallback((id: string, e: React.PointerEvent) => {
    if (e.button !== 0 || (e.target as Element).closest('button, input')) return
    const startX = e.clientX
    const startY = e.clientY
    let active = false
    let target: DropTarget | null = null

    const onMove = (ev: PointerEvent): void => {
      if (!active) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_THRESHOLD) return
        active = true
        setDragId(id)
      }
      ev.preventDefault()
      const area = areaRef.current?.getBoundingClientRect()
      target = area ? hitTest(arrangementRef.current, id, ev.clientX - area.left, ev.clientY - area.top) : null
      setDrop(target)
    }
    const finish = (commit: boolean): void => {
      window.removeEventListener('pointermove', onMove, true)
      window.removeEventListener('pointerup', onUp, true)
      window.removeEventListener('pointercancel', onCancel, true)
      window.removeEventListener('keydown', onKey, true)
      if (active) {
        // The release would otherwise click whatever lies under the pointer.
        window.addEventListener('click', stopClick, true)
        setTimeout(() => window.removeEventListener('click', stopClick, true), 0)
      }
      if (commit && active && target) {
        const { root, set } = useTileLayout.getState()
        set(moveTile(root, id, target.targetId, target.side))
      }
      setDragId(null)
      setDrop(null)
    }
    const stopClick = (c: MouseEvent): void => c.stopPropagation()
    const onUp = (): void => finish(true)
    const onCancel = (): void => finish(false)
    const onKey = (ev: KeyboardEvent): void => {
      if (ev.key !== 'Escape' || !active) return
      ev.preventDefault()
      ev.stopPropagation()
      finish(false)
    }
    window.addEventListener('pointermove', onMove, true)
    window.addEventListener('pointerup', onUp, true)
    window.addEventListener('pointercancel', onCancel, true)
    window.addEventListener('keydown', onKey, true)
  }, [areaRef, arrangementRef])

  return { dragId, drop, begin }
}

/** Line between two neighbouring tiles: drag or arrow keys resize them, double-click evens the split. */
function TileDivider({ divider, arrangementRef }: {
  divider: Divider
  arrangementRef: React.RefObject<Arrangement>
}): React.JSX.Element {
  const { splitId, index, dir } = divider
  const horizontal = dir === 'row'
  const drag = useRef<{ pointerId: number; start: number; lengths: number[] } | null>(null)

  const resizeBy = (delta: number, from?: number[]): void => {
    const info = arrangementRef.current.splits.get(splitId)
    if (!info) return
    const lengths = [...(from ?? info.lengths)]
    const pair = lengths[index] + lengths[index + 1]
    const a = Math.max(info.mins[index], Math.min(lengths[index] + delta, pair - info.mins[index + 1]))
    lengths[index] = a
    lengths[index + 1] = pair - a
    const { root, set } = useTileLayout.getState()
    set(setSplitSizes(root, splitId, lengths))
  }

  return (
    <div
      className={`${styles.divider} ${horizontal ? styles.dividerColumn : styles.dividerRow}`}
      style={placement(divider.fluid)}
      role="separator"
      aria-orientation={horizontal ? 'vertical' : 'horizontal'}
      aria-label="Resize maps"
      tabIndex={0}
      onPointerDown={(e) => {
        e.preventDefault()
        e.stopPropagation()
        const info = arrangementRef.current.splits.get(splitId)
        if (!info) return
        drag.current = { pointerId: e.pointerId, start: horizontal ? e.clientX : e.clientY, lengths: info.lengths }
        e.currentTarget.setPointerCapture(e.pointerId)
      }}
      onPointerMove={(e) => {
        const d = drag.current
        if (!d || d.pointerId !== e.pointerId) return
        resizeBy((horizontal ? e.clientX : e.clientY) - d.start, d.lengths)
      }}
      onPointerUp={() => { drag.current = null }}
      onPointerCancel={() => { drag.current = null }}
      onDoubleClick={() => {
        const { root, set } = useTileLayout.getState()
        const node = findSplit(root, splitId)
        if (node) set(setSplitSizes(root, splitId, node.children.map(() => 1)))
      }}
      onKeyDown={(e) => {
        const back = horizontal ? 'ArrowLeft' : 'ArrowUp'
        const forward = horizontal ? 'ArrowRight' : 'ArrowDown'
        if (e.key !== back && e.key !== forward) return
        e.preventDefault()
        // Keep the arrows from also nudging the selected score (ScoresTab listens on window).
        e.stopPropagation()
        resizeBy(e.key === back ? -KEY_STEP : KEY_STEP)
      }}
    />
  )
}

export function BrowserWorkspace(): React.JSX.Element {
  useSurfaceTracking()
  // Null keeps the default proportional width; remembered across reloads (scoreLayout.ts).
  const scoreWidth = useScoreLayout(s => s.scoreWidth)
  const setScoreWidth = useScoreLayout(s => s.setScoreWidth)
  const mapIds = useAppStore(s => s.maps.map(m => m.id).join('\n'))
  const [maximizedId, setMaximizedId] = useState<string | null>(null)
  const scoreCollapsed = useScoreLayout(s => s.collapsed)
  const scoreMotion = useScoreLayout(s => s.animating)
  const root = useTileLayout(s => s.root)
  const columns = useTileLayout(s => s.columns)

  const workspaceRef = useRef<HTMLElement>(null)
  const areaRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState({ width: 0, height: 0 })

  const ids = useMemo(() => (mapIds ? mapIds.split('\n') : []), [mapIds])

  // The visible map area's size; new maps are placed for the columns it fits.
  useEffect(() => {
    const el = workspaceRef.current
    if (!el) return
    const observer = new ResizeObserver(() => {
      setView({ width: el.clientWidth, height: el.clientHeight })
      useTileLayout.getState().setColumns(columnsFor(el.clientWidth))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Keep the arrangement in step with the study's maps before the frame paints.
  useLayoutEffect(() => {
    const { root, set } = useTileLayout.getState()
    const next = reconcile(root, ids, columns)
    if (next !== root) set(next)
  }, [ids, columns])

  // A maximized map that was closed or undone away no longer holds the view.
  const maximized = maximizedId !== null && ids.includes(maximizedId) ? maximizedId : null

  // When the tiles cannot all reach their minimums, the area grows and scrolls.
  // CSS sizes the area and places the tiles; the measured size only decides
  // which tiles are held at their minimum and serves hit-testing and drags.
  const min = root && !maximized ? minSize(root) : { width: 0, height: 0 }
  const area = maximized
    ? { x: 0, y: 0, width: view.width, height: view.height }
    : { x: 0, y: 0, width: Math.max(view.width, min.width), height: Math.max(view.height, min.height) }
  const arrangement = useMemo(() => computeArrangement(root, area), [root, area.width, area.height])
  const arrangementRef = useRef(arrangement)
  arrangementRef.current = arrangement

  const { dragId, drop, begin } = useTileDrag(areaRef, arrangementRef)

  return (
    <>
    {!scoreCollapsed && <Splitter width={scoreWidth} onChange={setScoreWidth} />}
    <main
      ref={workspaceRef}
      className={[
        styles.workspace,
        scoreCollapsed ? styles.scoreCollapsed : '',
        scoreMotion ? styles.scoreMotion : ''
      ].filter(Boolean).join(' ')}
      onTransitionEnd={(e) => {
        if (e.target === e.currentTarget && e.propertyName === 'flex-basis') useScoreLayout.getState().endAnimation()
      }}
      style={{
        '--score-min-width': `${LEFT_MIN_WIDTH}px`,
        '--strip-width': `${STRIP_WIDTH}px`,
        ...(scoreWidth === null ? {} : { '--score-width': `${scoreWidth}px` })
      } as React.CSSProperties}
    >
      <div
        ref={areaRef}
        className={`${styles.area} ${dragId ? styles.areaDragging : ''}`}
        style={{ minWidth: min.width, minHeight: min.height }}
      >
        {/* With no maps the area keeps its place, so Score's width does not jump. */}
        {ids.length === 0 && <section className={`${styles.tile} ${styles.placeholder}`}>No maps</section>}
        {ids.map(id => (
          <MapTile
            key={id}
            mapId={id}
            place={maximized === id ? FILL : arrangement.fluid.get(id)}
            hidden={maximized !== null && maximized !== id}
            maximized={maximized === id}
            dragging={dragId === id}
            onToggleMaximize={() => setMaximizedId(current => current === id ? null : id)}
            onBeginMove={begin}
          />
        ))}
        {!maximized && arrangement.dividers.map(d => (
          <TileDivider key={`${d.splitId}:${d.index}`} divider={d} arrangementRef={arrangementRef} />
        ))}
        {drop && (
          <div
            className={styles.dropTarget}
            style={{ left: drop.rect.x, top: drop.rect.y, width: drop.rect.width, height: drop.rect.height }}
          />
        )}
      </div>
    </main>
    </>
  )
}
