import { createContext } from 'react'
import type { ChoraApi, MapWindowAction } from '../../../../shared/contracts'

/**
 * Where a MapPanel is hosted. Absent (null) in a desktop map window, whose
 * chrome buttons control the native window. The browser supplies one per tile
 * so the same buttons close or maximize the tile instead.
 */
export interface MapHost {
  control: (action: MapWindowAction) => void
  /** False hides the Minimize button; a tile has nowhere to minimize to. */
  minimizable: boolean
  zoomLabel: string
  /** Per-tile history bridge, so transactions and locks carry this tile as owner. */
  history: Pick<ChoraApi, 'historyBegin' | 'historyEnd' | 'setHistoryModalOpen'>
  /** Whether this tile is the surface that receives page-wide keys such as Escape. */
  isActive: () => boolean
}

export const MapHostContext = createContext<MapHost | null>(null)
