import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '@renderer/store/appStore'
import { MapPanel } from '@renderer/components/maps/MapPanel'
import { MapHostContext, type MapHost } from '@renderer/components/maps/mapHost'
import {
  activateSurface, activeSurface, beginTransaction, endTransaction, releaseSurface, setModalLock
} from './interaction'
import styles from './BrowserWorkspace.module.css'

// Browser map area beside the Score Window: one tile per map in the session.
// Tiles render straight from the shared store; closing one removes the map,
// as closing a desktop map window does. Maximize keeps the other tiles
// mounted but hidden and inert, so their state survives the round trip.

function MapTile({ mapId, hidden, maximized, onToggleMaximize }: {
  mapId: string
  hidden: boolean
  maximized: boolean
  onToggleMaximize: () => void
}): React.JSX.Element {
  const host = useMemo<MapHost>(() => ({
    control: (action) => {
      if (action === 'close') useAppStore.getState().removeMap(mapId)
      else if (action === 'zoom') onToggleMaximize()
    },
    minimizable: false,
    zoomLabel: maximized ? 'Restore' : 'Maximize',
    history: {
      historyBegin:        () => beginTransaction(mapId),
      historyEnd:          () => endTransaction(mapId),
      setHistoryModalOpen: (open) => setModalLock(mapId, open)
    },
    isActive: () => activeSurface() === mapId
  }), [mapId, maximized, onToggleMaximize])

  useEffect(() => () => releaseSurface(mapId), [mapId])

  // Hiding a tile (another was maximized) ends any gesture it still holds.
  useEffect(() => { if (hidden) releaseSurface(mapId) }, [hidden, mapId])

  return (
    <section className={styles.tile} hidden={hidden} inert={hidden} data-surface={mapId}>
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

export function BrowserWorkspace(): React.JSX.Element | null {
  useSurfaceTracking()
  const mapIds = useAppStore(s => s.maps.map(m => m.id).join('\n'))
  const [maximizedId, setMaximizedId] = useState<string | null>(null)

  const ids = mapIds ? mapIds.split('\n') : []
  if (ids.length === 0) return null

  // A maximized map that was closed or undone away no longer holds the view.
  const maximized = maximizedId !== null && ids.includes(maximizedId) ? maximizedId : null

  return (
    <main className={`${styles.workspace} ${maximized ? styles.maximized : ''}`} data-count={Math.min(ids.length, 4)}>
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
  )
}
