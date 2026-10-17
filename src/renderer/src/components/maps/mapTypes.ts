// ── Map types ─────────────────────────────────────────────────────────────────
//
// The kinds of map a study can hold, and how a new one starts. Creating a map
// reads from here, so a new map type is described once.

import type { CartesianMapConfig, Element, MapConfig, MapType, MarkMode, SemanticMapConfig } from '../../lib/types'

export interface MapTypeInfo {
  type: MapType
  label: string
  description: string
  /** Dimensions a new map asks for: exactly two, or any two or more. */
  dimensions: 'pair' | 'several'
  /** The dimension picker's heading, hint and create action. */
  picker: { title: string; hint: (elementCount: number) => string; action: string }
}

export const MAP_TYPES: readonly MapTypeInfo[] = [
  {
    type: 'cartesian',
    label: 'Cartesian Map',
    description: 'Places elements on two dimensions at right angles. Collections can be drawn as regions.',
    dimensions: 'pair',
    picker: {
      title: 'Choose Dimensions',
      hint: () => 'Select two dimensions for the map axes.',
      action: 'Draw map'
    }
  },
  {
    type: 'semantic',
    label: 'Semantic Map',
    description: 'Compares elements across many dimensions as lines over stacked axes.',
    dimensions: 'several',
    picker: {
      title: 'Create Semantic Map',
      hint: n => `Select dimensions to include (${n} element${n !== 1 ? 's' : ''}).`,
      action: 'Draw semantic map'
    }
  }
]

export function mapTypeInfo(type: MapType): MapTypeInfo {
  return MAP_TYPES.find(t => t.type === type)!
}

export interface NewMapInput {
  dimensionIds: string[]
  maps: MapConfig[]
  elements: Element[]
  showLabels: boolean
  marks: MarkMode
}

/** A new map's settings. New maps always begin with each Element's own color. */
export function newMapConfig(type: MapType, input: NewMapInput): MapConfig {
  const base = {
    id: crypto.randomUUID(),
    colorMode: 'element' as const,
    // Nothing focused to start — collections are chosen in the map's sidebar.
    shownCollectionIds: [],
    showLabels: input.showLabels,
    marks: input.marks,
    windowX: 100,
    windowY: 100,
    windowWidth: 600,
    windowHeight: 500
  }
  if (type === 'cartesian') {
    const [xDimensionId, yDimensionId] = input.dimensionIds
    const config: CartesianMapConfig = {
      ...base,
      type: 'cartesian',
      title: `Map ${input.maps.length + 1}`,
      xDimensionId,
      yDimensionId,
      xFlipped: false,
      yFlipped: false,
      sizeByWeight: true,
      onlySelectedCollections: false
    }
    return config
  }
  const config: SemanticMapConfig = {
    ...base,
    type: 'semantic',
    title: `Semantic Map ${input.maps.filter(m => m.type === 'semantic').length + 1}`,
    elementIds: input.elements.map(e => e.id),
    dimensionIds: input.dimensionIds,
    flippedDimensionIds: [],
    // Semantic axes sit close together, so uniform dots keep a fresh map readable.
    sizeByWeight: false
  }
  return config
}
