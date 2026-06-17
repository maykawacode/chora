// ── Session serialization ─────────────────────────────────────────────────────
//
// Converts AppState to/from JSON for file save/open and IPC broadcasts.
// FORMAT_VERSION must be bumped any time the saved schema changes in a
// backward-incompatible way. The deserializer always merges missing fields
// with safe defaults so that older files don't crash on load.
//
// Migration table:
//   3.0 → 4.0: element.description → element.definition
//               dimension.description → dimension.definition
//               added sessionMeta, types[]

import type { AppState, Element, Type, Dimension, MapConfig, SessionMeta } from './types'
import { defaultCategories, defaultSessionMeta, parsePoles } from './types'

const FORMAT_VERSION = '4.0'

/**
 * Serializes only the persistent parts of AppState to a JSON string.
 * Runtime fields (filePath, isDirty, selection, activeTab) are intentionally
 * excluded — they are always reset when a file is opened.
 */
export function serializeSession(state: AppState): string {
  return JSON.stringify({
    version: FORMAT_VERSION,
    sessionMeta: state.sessionMeta,
    elements: state.elements,
    types: state.types,
    dimensions: state.dimensions,
    scores: state.scores,
    maps: state.maps
  }, null, 2)
}

/**
 * Parses a JSON string back into a fresh AppState.
 * Accepts version 3.0 (migrates description→definition, adds sessionMeta/types)
 * and version 4.0. Throws if the JSON is malformed or the version is unrecognized.
 * All optional fields are filled with safe defaults to handle old files.
 */
export function deserializeSession(json: string): AppState {
  const raw = JSON.parse(json)

  if (!raw || typeof raw !== 'object') throw new Error('Invalid file format')
  const version = raw.version
  if (version !== FORMAT_VERSION && version !== '3.0') {
    throw new Error(`Unsupported file version: ${version}`)
  }

  // ── SessionMeta (new in 4.0) ─────────────────────────────────────────────
  const sessionMeta: SessionMeta = raw.sessionMeta
    ? {
        id:         raw.sessionMeta.id         ?? crypto.randomUUID(),
        name:       raw.sessionMeta.name        ?? '',
        definition: raw.sessionMeta.definition  ?? ''
      }
    : defaultSessionMeta()

  // ── Elements ─────────────────────────────────────────────────────────────
  const elements: Element[] = (raw.elements ?? []).map((e: Record<string, unknown>) => ({
    id:         requireString(e.id, 'element.id'),
    name:       typeof e.name       === 'string' ? e.name       : '',
    // 3.0 files store 'description'; 4.0 files store 'definition'
    definition: typeof e.definition === 'string' ? e.definition
                : typeof e.description === 'string' ? e.description : '',
    weight:     typeof e.weight === 'number' ? e.weight : 1,
    color:      typeof e.color  === 'string' ? e.color  : '#9d9d53',
    shape:      (['circle', 'square', 'triangle', 'diamond'].includes(e.shape as string)
                  ? e.shape : 'circle') as Element['shape']
  }))

  // ── Types (new in 4.0) ───────────────────────────────────────────────────
  const types: Type[] = (raw.types ?? []).map((t: Record<string, unknown>) => ({
    id:         requireString(t.id, 'type.id'),
    name:       typeof t.name       === 'string' ? t.name       : '',
    definition: typeof t.definition === 'string' ? t.definition : ''
  }))

  // ── Dimensions ───────────────────────────────────────────────────────────
  const dimensions: Dimension[] = (raw.dimensions ?? []).map((d: Record<string, unknown>) => {
    const label = typeof d.label === 'string' ? d.label : ''
    const poles = parsePoles(label)
    return {
      id:    requireString(d.id, 'dimension.id'),
      label,
      // poleA/poleB may be missing in very old files — re-derive from label
      poleA: typeof d.poleA === 'string' ? d.poleA : poles.poleA,
      poleB: typeof d.poleB === 'string' ? d.poleB : poles.poleB,
      // 3.0 files store 'description'; 4.0 files store 'definition'
      definition: typeof d.definition === 'string' ? d.definition
                  : typeof d.description === 'string' ? d.description : '',
      weight: typeof d.weight === 'number' ? d.weight : 1,
      // categories may be missing in old files — merge with empty defaults
      categories: { ...defaultCategories(), ...((d.categories as object) ?? {}) }
    }
  })

  // ── Maps ─────────────────────────────────────────────────────────────────
  const maps: MapConfig[] = (raw.maps ?? []).map((m: Record<string, unknown>) => {
    if (m.type === 'cartesian') {
      return {
        id:           requireString(m.id, 'map.id'),
        type:         'cartesian' as const,
        title:        typeof m.title       === 'string'  ? m.title       : 'Map',
        showLabels:   m.showLabels  !== false,
        showDots:     m.showDots    !== false,
        windowX:      typeof m.windowX      === 'number' ? m.windowX      : 100,
        windowY:      typeof m.windowY      === 'number' ? m.windowY      : 100,
        windowWidth:  typeof m.windowWidth  === 'number' ? m.windowWidth  : 600,
        windowHeight: typeof m.windowHeight === 'number' ? m.windowHeight : 500,
        xDimensionId: typeof m.xDimensionId === 'string' ? m.xDimensionId : '',
        yDimensionId: typeof m.yDimensionId === 'string' ? m.yDimensionId : '',
        xFlipped:     m.xFlipped    === true,
        yFlipped:     m.yFlipped    === true,
        sizeByWeight: m.sizeByWeight !== false
      }
    }
    if (m.type === 'semantic') {
      return {
        id:           requireString(m.id, 'map.id'),
        type:         'semantic' as const,
        title:        typeof m.title       === 'string'  ? m.title       : 'Semantic Map',
        showLabels:   m.showLabels  !== false,
        showDots:     m.showDots    !== false,
        windowX:      typeof m.windowX      === 'number' ? m.windowX      : 100,
        windowY:      typeof m.windowY      === 'number' ? m.windowY      : 100,
        windowWidth:  typeof m.windowWidth  === 'number' ? m.windowWidth  : 600,
        windowHeight: typeof m.windowHeight === 'number' ? m.windowHeight : 500,
        elementIds:          Array.isArray(m.elementIds)          ? m.elementIds          as string[] : [],
        dimensionIds:        Array.isArray(m.dimensionIds)        ? m.dimensionIds        as string[] : [],
        flippedDimensionIds: Array.isArray(m.flippedDimensionIds) ? m.flippedDimensionIds as string[] : []
      }
    }
    if (m.type === 'typeprojection') {
      return {
        id:           requireString(m.id, 'map.id'),
        type:         'typeprojection' as const,
        title:        typeof m.title        === 'string'  ? m.title        : 'Type Map',
        showLabels:   m.showLabels  !== false,
        showDots:     m.showDots    !== false,
        windowX:      typeof m.windowX      === 'number'  ? m.windowX      : 100,
        windowY:      typeof m.windowY      === 'number'  ? m.windowY      : 100,
        windowWidth:  typeof m.windowWidth  === 'number'  ? m.windowWidth  : 650,
        windowHeight: typeof m.windowHeight === 'number'  ? m.windowHeight : 550,
        xDimensionId: typeof m.xDimensionId === 'string'  ? m.xDimensionId : '',
        yDimensionId: typeof m.yDimensionId === 'string'  ? m.yDimensionId : '',
        xFlipped:     m.xFlipped     === true,
        yFlipped:     m.yFlipped     === true,
        threshold:    typeof m.threshold    === 'number'  ? m.threshold    : 0.5,
        sizeByWeight: m.sizeByWeight !== false,
        blobStyle:    m.blobStyle === 'blob' ? 'blob' : 'circle',
        typeIds:      Array.isArray(m.typeIds) ? m.typeIds as string[] : []
      }
    }
    throw new Error(`Unknown map type: ${m.type}`)
  })

  return {
    filePath: null,           // always reset on open — caller sets it from the actual path
    isDirty: false,
    sessionMeta,
    elements,
    types,
    dimensions,
    scores: (raw.scores as AppState['scores']) ?? {},
    maps,
    selectedElementId: null,
    selectedDimensionId: null,
    selectedTypeId: null,
    activeTab: 'elements'
  }
}

// ── Private helpers ───────────────────────────────────────────────────────────

/** Throws a descriptive error if a required string field is missing or empty. */
function requireString(val: unknown, field: string): string {
  if (typeof val !== 'string' || !val) throw new Error(`Missing required field: ${field}`)
  return val
}
