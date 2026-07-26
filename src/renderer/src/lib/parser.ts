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
//   within 4.0: map.showColors (boolean) → map.colorMode (enum) — see
//               readColorMode; old files still load unchanged.

import type { AppState, ColorMode, Element, Type, Dimension, MapConfig, SessionMeta } from './types'
import { defaultCategories, defaultSessionMeta, parsePoles } from './types'

const FORMAT_VERSION = '4.0'

const COLOR_MODES: ColorMode[] = ['none', 'element', 'type']

/**
 * Reads a map's color mode, tolerating the showColors boolean it replaced.
 *
 * Files written before the change carry only the boolean, where true (or a
 * missing key) meant element colors and false meant neutral gray — so those two
 * states map onto 'element' and 'none' with nothing lost. An unrecognized
 * colorMode value falls through to 'element', matching how every other field
 * here degrades to a safe default rather than throwing.
 */
function readColorMode(m: Record<string, unknown>): ColorMode {
  if (COLOR_MODES.includes(m.colorMode as ColorMode)) return m.colorMode as ColorMode
  return m.showColors === false ? 'none' : 'element'
}

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
    definition: typeof t.definition === 'string' ? t.definition : '',
    color:      typeof t.color      === 'string' ? t.color      : '#808080'
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
  //
  // 'typeprojection' was a separate map type through Phase 5. It is now a
  // cartesian map with showTypes on — see the migration branch below. Files
  // written by this version only ever contain 'cartesian' and 'semantic'.
  const maps: MapConfig[] = (raw.maps ?? []).map((m: Record<string, unknown>) => {
    // Settings shared by every map type, all sidebar-driven.
    const base = {
      id:           requireString(m.id, 'map.id'),
      showLabels:   m.showLabels   !== false,
      showDots:     m.showDots     !== false,
      sizeByWeight: m.sizeByWeight !== false,
      colorMode:    readColorMode(m),
      windowX:      typeof m.windowX      === 'number' ? m.windowX      : 100,
      windowY:      typeof m.windowY      === 'number' ? m.windowY      : 100,
      windowWidth:  typeof m.windowWidth  === 'number' ? m.windowWidth  : 600,
      windowHeight: typeof m.windowHeight === 'number' ? m.windowHeight : 500
    }

    if (m.type === 'cartesian' || m.type === 'typeprojection') {
      // A pre-merge type-projection map becomes a cartesian map with the type
      // overlay already switched on, so it opens looking as it did before.
      // blobStyle is dropped — the merged map always draws freeform blobs.
      const wasTypeMap = m.type === 'typeprojection'
      return {
        ...base,
        type:         'cartesian' as const,
        title:        typeof m.title === 'string' ? m.title : (wasTypeMap ? 'Type Map' : 'Map'),
        xDimensionId: typeof m.xDimensionId === 'string' ? m.xDimensionId : '',
        yDimensionId: typeof m.yDimensionId === 'string' ? m.yDimensionId : '',
        xFlipped:     m.xFlipped === true,
        yFlipped:     m.yFlipped === true,
        showTypes:    typeof m.showTypes === 'boolean' ? m.showTypes : wasTypeMap,
        typeIds:      Array.isArray(m.typeIds) ? m.typeIds as string[] : [],
        threshold:    typeof m.threshold === 'number' ? m.threshold : 0.5
      }
    }
    if (m.type === 'semantic') {
      return {
        ...base,
        type:         'semantic' as const,
        title:        typeof m.title === 'string' ? m.title : 'Semantic Map',
        // Semantic maps had no weight sizing before the merge, so default it
        // OFF here rather than inheriting base's on-by-default — otherwise
        // every existing semantic map would open with resized dots.
        sizeByWeight: m.sizeByWeight === true,
        elementIds:          Array.isArray(m.elementIds)          ? m.elementIds          as string[] : [],
        dimensionIds:        Array.isArray(m.dimensionIds)        ? m.dimensionIds        as string[] : [],
        flippedDimensionIds: Array.isArray(m.flippedDimensionIds) ? m.flippedDimensionIds as string[] : []
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
