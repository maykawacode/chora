// ── Core data types ───────────────────────────────────────────────────────────
//
// These are the plain data structures shared across all windows via JSON.
// All IDs are UUIDs (generated at creation, never changed).
// Scores live separately from elements/dimensions/types so adding/removing any
// of them doesn't corrupt the other — it just leaves orphaned keys that are ignored.
//
// Canonical schema reference: Output/2026-06-17_dataset-schema_v1.md

export type ElementShape = 'circle' | 'square' | 'triangle' | 'diamond'

export const ELEMENT_SHAPES: ElementShape[] = ['circle', 'square', 'triangle', 'diamond']

export interface SessionMeta {
  id: string          // UUID, generated once at session creation, never changed
  name: string        // human name for this analysis
  definition: string  // what this dataset represents / what is being analyzed
}

export interface Element {
  id: string
  name: string
  definition: string   // what this element IS
  weight: number       // 1–100; drives dot size on cartesian maps
  color: string        // hex string, e.g. '#808000' (olive default)
  shape: ElementShape  // plot symbol used on all maps
}

// A Type is a nominal membership category. Elements are scored against types
// (via ScoreMap) to express degree of membership (0 = none, 1 = full).
export interface Type {
  id:         string
  name:       string
  definition: string  // what defines membership in this category
  color:      string  // hex color, e.g. '#808080'
}

export interface DimensionCategories {
  evaluative: boolean
  potency: boolean
  activity: boolean
  utility: boolean
  socialMeaning: boolean
  aesthetics: boolean
}

export interface Dimension {
  id: string
  label: string        // full display string, e.g. "Hot–Cold"
  poleA: string        // left / bottom end of the axis (score 0.0)
  poleB: string        // right / top end of the axis (score 1.0)
  definition: string   // how scores are calculated; what 0.0 and 1.0 mean for this axis
  weight: number       // future use; stored now so files round-trip cleanly
  categories: DimensionCategories  // used by the Starter Lists picker
}

// scores[elementId][typeOrDimensionId] = 0.0–1.0
// A missing key means the element has not been scored on that type/dimension yet.
// Type IDs and Dimension IDs are both UUIDs and never collide in this namespace.
export type ScoreMap = Record<string, Record<string, number | undefined>>

// ── Map configuration types ───────────────────────────────────────────────────
//
// Each open map window corresponds to exactly one MapConfig stored in the
// session. Window geometry (x/y/width/height) is stored here so it can be
// restored on next open when rememberWindowPositions is enabled.

export type MapType = 'cartesian' | 'semantic'

// What drives element color on a map:
//   'none'    — neutral gray throughout; the map reads as pure structure
//   'element' — each element's own color attribute
//   'type'    — the color of the type(s) it belongs to, blended by membership
//               strength when it belongs to more than one
// Replaced the earlier showColors boolean; see readColorMode in parser.ts for
// how files written before this change are migrated.
export type ColorMode = 'none' | 'element' | 'type'

// What mark, if any, is drawn at each element's position:
//   'none'    — no marks; on a cartesian map only labels remain, and on a
//               semantic map only the polylines
//   'circle'  — every element drawn as a circle, whatever shape it carries
//   'element' — each element's own shape attribute
// Replaced the earlier showDots boolean; see readMarkMode in parser.ts for how
// files written before this change are migrated.
export type MarkMode = 'none' | 'circle' | 'element'

// How the Type membership → Element color conversion derives a color:
//   'dominant' — the color of the type the element belongs to most strongly
//   'blend'    — all its type colors mixed by membership, matching what a map
//                colored by type draws live
export type TypeColorMethod = 'dominant' | 'blend'

// Settings every map has, all driven from the map window's sidebar.
export interface BaseMapConfig {
  id: string
  type: MapType
  title: string        // user-editable; also used as the OS window title
  showLabels: boolean
  marks: MarkMode       // what mark is drawn at each element's position
  sizeByWeight: boolean // true = dot radius scales with element weight; false = uniform default size
  colorMode: ColorMode  // what element color is drawn from
  windowX: number
  windowY: number
  windowWidth: number
  windowHeight: number
}

// A cartesian map plots every element in a 2D dimension space, and draws a
// translucent blob around the members of each selected type — the map formerly
// known as the Type Projection map, now folded in as an overlay rather than a
// separate map type.
//
// typeIds chooses which blobs are drawn and nothing else. It used to do double
// duty, also hiding any element that qualified for no selected type, with an
// empty list meaning "all types". Both of those are gone: every element is
// always plotted, and an empty list now means no blobs at all. See readTypeIds
// in parser.ts for how a file written under the old rule is migrated.
export interface CartesianMapConfig extends BaseMapConfig {
  type: 'cartesian'
  xDimensionId: string
  yDimensionId: string
  xFlipped: boolean    // reverses poleA/poleB direction on that axis
  yFlipped: boolean
  typeIds: string[]    // types whose blob is drawn; empty = no blobs
  threshold: number    // min membership score for an element to count as a type member
}

export interface SemanticMapConfig extends BaseMapConfig {
  type: 'semantic'
  elementIds: string[]           // ordered list of elements to show
  dimensionIds: string[]         // ordered list of axes to display
  flippedDimensionIds: string[]  // subset of dimensionIds whose poles are reversed
}

export type MapConfig = CartesianMapConfig | SemanticMapConfig

// ── Application state ─────────────────────────────────────────────────────────
//
// The full session state. Serialized to JSON for file save and for
// broadcasting between windows via IPC. filePath and isDirty are
// runtime-only and are not persisted to disk.

export interface AppState {
  filePath: string | null           // null = not yet saved
  isDirty: boolean                  // true = unsaved changes exist
  sessionMeta: SessionMeta
  elements: Element[]
  types: Type[]
  dimensions: Dimension[]
  scores: ScoreMap
  maps: MapConfig[]
  selectedElementId: string | null
  selectedDimensionId: string | null
  selectedTypeId: string | null
  activeTab: 'elements' | 'dimensions' | 'scores' | 'types' | 'conversions'
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns a DimensionCategories with all flags set to false. */
export function defaultCategories(): DimensionCategories {
  return {
    evaluative: false,
    potency: false,
    activity: false,
    utility: false,
    socialMeaning: false,
    aesthetics: false
  }
}

/** Returns a SessionMeta with a fresh UUID and empty strings. */
export function defaultSessionMeta(): SessionMeta {
  return { id: crypto.randomUUID(), name: '', definition: '' }
}

/**
 * Returns a display indicator showing how completely an element has been scored
 * against the available types.
 * '●' — all types scored
 * '◇' — the currently selected type is scored (but not all)
 * '–' — nothing scored yet (or no types exist)
 */
export function typeScoreStatus(
  element: Element,
  types: Type[],
  scores: ScoreMap,
  activeTypeId: string | null
): '–' | '◇' | '●' {
  if (types.length === 0) return '–'
  const elScores = scores[element.id] ?? {}
  if (types.every(t => elScores[t.id] !== undefined)) return '●'
  if (activeTypeId && elScores[activeTypeId] !== undefined) return '◇'
  return '–'
}

/**
 * Splits a dimension label into its two poles.
 * Recognizes the en-dash "–" separator first, then falls back to hyphen "-".
 * If neither separator is found, poleA equals the full label and poleB is empty.
 */
export function parsePoles(label: string): { poleA: string; poleB: string } {
  const sep = label.includes('–') ? '–' : label.includes('-') ? '-' : null
  if (!sep) return { poleA: label, poleB: '' }
  const idx = label.indexOf(sep)
  return {
    poleA: label.slice(0, idx).trim(),
    poleB: label.slice(idx + sep.length).trim()
  }
}

/**
 * Returns a single character representing the scoring status of an element.
 *
 * '●' — all dimensions scored
 * '◇' — the currently selected dimension is scored (but not all)
 * '–' — nothing scored yet (or no dimensions exist)
 */
export function scoreStatus(
  element: Element,
  dimensions: Dimension[],
  scores: ScoreMap,
  activeDimensionId: string | null
): '–' | '◇' | '●' {
  if (dimensions.length === 0) return '–'
  const elScores = scores[element.id] ?? {}
  if (dimensions.every(d => elScores[d.id] !== undefined)) return '●'
  if (activeDimensionId && elScores[activeDimensionId] !== undefined) return '◇'
  return '–'
}
