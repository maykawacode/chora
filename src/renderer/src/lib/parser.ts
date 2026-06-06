import type { AppState, Element, Dimension, MapConfig } from './types'
import { defaultCategories, parsePoles } from './types'

const FORMAT_VERSION = '3.0'

export function serializeSession(state: AppState): string {
  return JSON.stringify({
    version: FORMAT_VERSION,
    elements: state.elements,
    dimensions: state.dimensions,
    scores: state.scores,
    maps: state.maps
  }, null, 2)
}

export function deserializeSession(json: string): AppState {
  const raw = JSON.parse(json)

  if (!raw || typeof raw !== 'object') throw new Error('Invalid file format')
  if (raw.version !== FORMAT_VERSION) throw new Error(`Unsupported file version: ${raw.version}`)

  const elements: Element[] = (raw.elements ?? []).map((e: Partial<Element>) => ({
    id: requireString(e.id, 'element.id'),
    name: e.name ?? '',
    weight: typeof e.weight === 'number' ? e.weight : 1,
    color: e.color ?? '#808000',
    description: e.description ?? ''
  }))

  const dimensions: Dimension[] = (raw.dimensions ?? []).map((d: Partial<Dimension>) => {
    const label = d.label ?? ''
    const poles = parsePoles(label)
    return {
      id: requireString(d.id, 'dimension.id'),
      label,
      poleA: d.poleA ?? poles.poleA,
      poleB: d.poleB ?? poles.poleB,
      weight: typeof d.weight === 'number' ? d.weight : 1,
      description: d.description ?? '',
      categories: { ...defaultCategories(), ...(d.categories ?? {}) }
    }
  })

  const maps: MapConfig[] = (raw.maps ?? []).map((m: Partial<MapConfig>) => {
    if (m.type === 'cartesian') {
      const cm = m as Record<string, unknown>
      return {
        id: requireString(m.id, 'map.id'),
        type: 'cartesian' as const,
        title: m.title ?? 'Map',
        showLabels: m.showLabels !== false,
        showDots: m.showDots !== false,
        windowX: typeof cm.windowX === 'number' ? cm.windowX : 100,
        windowY: typeof cm.windowY === 'number' ? cm.windowY : 100,
        windowWidth:  typeof cm.windowWidth  === 'number' ? cm.windowWidth  : 600,
        windowHeight: typeof cm.windowHeight === 'number' ? cm.windowHeight : 500,
        xDimensionId: typeof cm.xDimensionId === 'string' ? cm.xDimensionId : '',
        yDimensionId: typeof cm.yDimensionId === 'string' ? cm.yDimensionId : '',
        xFlipped: cm.xFlipped === true,
        yFlipped: cm.yFlipped === true,
      }
    }
    if (m.type === 'semantic') {
      const sm = m as Record<string, unknown>
      return {
        id: requireString(m.id, 'map.id'),
        type: 'semantic' as const,
        title: m.title ?? 'Semantic Map',
        showLabels: m.showLabels !== false,
        showDots: m.showDots !== false,
        windowX: typeof sm.windowX === 'number' ? sm.windowX : 100,
        windowY: typeof sm.windowY === 'number' ? sm.windowY : 100,
        windowWidth:  typeof sm.windowWidth  === 'number' ? sm.windowWidth  : 600,
        windowHeight: typeof sm.windowHeight === 'number' ? sm.windowHeight : 500,
        elementIds:  Array.isArray(sm.elementIds)  ? sm.elementIds  as string[] : [],
        dimensionIds: Array.isArray(sm.dimensionIds) ? sm.dimensionIds as string[] : [],
        flippedDimensionIds: Array.isArray(sm.flippedDimensionIds) ? sm.flippedDimensionIds as string[] : [],
      }
    }
    throw new Error(`Unknown map type: ${m.type}`)
  })

  return {
    filePath: null,
    isDirty: false,
    elements,
    dimensions,
    scores: raw.scores ?? {},
    maps,
    selectedElementId: elements[0]?.id ?? null,
    selectedDimensionId: dimensions[0]?.id ?? null,
    activeTab: 'elements'
  }
}

function requireString(val: unknown, field: string): string {
  if (typeof val !== 'string' || !val) throw new Error(`Missing required field: ${field}`)
  return val
}
