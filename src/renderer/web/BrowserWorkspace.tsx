import { useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '@renderer/store/appStore'
import { MapPanel } from '@renderer/components/maps/MapPanel'
import { MapHostContext, type MapHost } from '@renderer/components/maps/mapHost'
import {
  activateSurface, activeSurface, beginTransaction, endTransaction, releaseSurface, setModalLock
} from './interaction'
import { PANE_MIN_WIDTH } from '@renderer/components/ScoreWindow/useResizableSplitPane'
import styles from './BrowserWorkspace.module.css'

// Browser map area beside the Score Window: one tile per map in the session.
// Tiles render straight from the shared store; closing one removes the map,
// as closing a desktop map window does. Maximize keeps the other tiles
// mounted but hidden and inert, so their state survives the round trip.

// Smallest tile that holds the element, bulk and dimension editors without clipping.
const MODAL_ROOM = { width: 560, height: 560 }

function MapTile({ mapId, hidden, maximized, onToggleMaximize }: {
  mapId: string
  hidden: boolean
  maximized: boolean
  onToggleMaximize: () => void
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
    minimizable: false,
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
    isActive: () => activeSurface() === mapId
    }
  }, [mapId, maximized, onToggleMaximize])

  useEffect(() => () => releaseSurface(mapId), [mapId])

  // Hiding a tile (another was maximized) ends any gesture it still holds.
  useEffect(() => { if (hidden) releaseSurface(mapId) }, [hidden, mapId])

  return (
    <section ref={tileRef} className={styles.tile} hidden={hidden} inert={hidden} data-surface={mapId}>
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

// Score's two side-by-side panes (list and detail) at their own minimums.
const SCORE_MIN_WIDTH = 2 * PANE_MIN_WIDTH
const WORKSPACE_MIN_WIDTH = 360
const KEY_STEP = 16

const clampScoreWidth = (width: number): number =>
  Math.round(Math.max(SCORE_MIN_WIDTH, Math.min(width, window.innerWidth - WORKSPACE_MIN_WIDTH)))

/**
 * Divider on Score's right edge. Drag, or focus it and use the arrow keys, to
 * resize Score; double-click returns to the default share. Score starts at the
 * page's left edge, so its width is the divider's x position.
 */
function Splitter({ width, onChange }: { width: number | null; onChange: (w: number | null) => void }): React.JSX.Element {
  return (
    <div
      className={styles.splitter}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize Score"
      aria-valuemin={SCORE_MIN_WIDTH}
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

export function BrowserWorkspace(): React.JSX.Element | null {
  useSurfaceTracking()
  // Null keeps the default proportional width; session-only until layout persistence (phase 3).
  const [scoreWidth, setScoreWidth] = useState<number | null>(null)
  const mapIds = useAppStore(s => s.maps.map(m => m.id).join('\n'))
  const [maximizedId, setMaximizedId] = useState<string | null>(null)

  const ids = mapIds ? mapIds.split('\n') : []
  if (ids.length === 0) return null

  // A maximized map that was closed or undone away no longer holds the view.
  const maximized = maximizedId !== null && ids.includes(maximizedId) ? maximizedId : null

  return (
    <>
    <Splitter width={scoreWidth} onChange={setScoreWidth} />
    <main
      className={`${styles.workspace} ${maximized ? styles.maximized : ''}`}
      style={{
        '--score-min-width': `${SCORE_MIN_WIDTH}px`,
        ...(scoreWidth === null ? {} : { '--score-width': `${scoreWidth}px` })
      } as React.CSSProperties}
    >
      {ids.map(id => (
        <MapTile
          key={id}
          mapId={id}
          hidden={maximized !== null && maximized !== id}
          maximized={maximized === id}
          onToggleMaximize={() => setMaximizedId(current => current === id ? null : id)}
        />
      ))}
    </main>
    </>
  )
}
