import { createContext } from 'react'
import type { ChoraApi, MapWindowAction } from '../../../../shared/contracts'

/**
 * Where a MapPanel is hosted. Absent (null) in a desktop map window, whose
 * chrome buttons control the native window. The browser supplies one per tile
 * so the same buttons close or maximize the tile instead.
 */
export interface MapHost {
  control: (action: MapWindowAction) => void
  zoomLabel: string
  /** Per-tile history bridge, so transactions and locks carry this tile as owner. */
  history: Pick<ChoraApi, 'historyBegin' | 'historyEnd' | 'setHistoryModalOpen'>
  /** Maximizes the host when it is smaller than the given size; 0 ignores an axis. */
  ensureRoom: (minWidth: number, minHeight: number) => void
  /** Whether this tile is the surface that receives page-wide keys such as Escape. */
  isActive: () => boolean
  /** Pointer down on the title bar; the browser starts moving the tile from here. */
  beginTileMove?: (event: React.PointerEvent) => void
}

export const MapHostContext = createContext<MapHost | null>(null)
