// ── Core data types ───────────────────────────────────────────────────────────
//
// These are the plain data structures shared across all windows via JSON.
// All IDs are UUIDs (generated at creation, never changed).
// Scores live separately from elements/dimensions so adding/removing either
// doesn't corrupt the other — it just leaves orphaned keys that are ignored.
//
// Canonical schema reference: Output/2026-07-26_dataset-schema_v2.md

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
  definition: string     // what this element IS
  weight: number         // non-negative; maps normalize size across the current Element range
  color: string          // hex string, e.g. '#808000' (olive default)
  shape: ElementShape    // plot symbol used on all maps
  collectionIds: string[]  // collections this element belongs to; see below
}

// A Collection is a nominal category. Membership is binary and lives on the
// element, in the same breath as its color and shape: an element is in a
// collection or it is not.
//
// It used to be a 0–1 score in the ScoreMap, which every map then compared
// against its own threshold slider — so the same element could be a member on
// one map and not on another, and no single place in the data could answer
// whether it belonged. Storing the membership itself removes the question.
export interface Collection {
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
  weight: number       // non-negative and open-ended; stored for weighting and round-tripping
  categories: DimensionCategories  // used by the Starter Lists picker
}

// scores[elementId][dimensionId] = 0.0–1.0
// A missing key means the element has not been scored on that dimension yet.
//
// Dimension scores only. Collection membership shared this map until format
// 5.0, which meant a key's meaning depended on which list its UUID turned up
// in; membership now lives on Element.collectionIds and this map holds one
// kind of thing again.
export type ScoreMap = Record<string, Record<string, number | undefined>>

// ── Map configuration types ───────────────────────────────────────────────────
//
// Each open map window corresponds to exactly one MapConfig stored in the
// session. Window geometry (x/y/width/height) is stored here so it can be
// restored on next open when rememberWindowPositions is enabled.

export type MapType = 'cartesian' | 'semantic'

// What drives element color on a map:
//   'none'       — neutral gray throughout; the map reads as pure structure
//   'element'    — each element's own color attribute
//   'collection' — the color of the collection(s) it belongs to, mixed evenly
//                  when it belongs to more than one
// Replaced the earlier showColors boolean; see readColorMode in parser.ts for
// how files written before this change are migrated.
export type ColorMode = 'none' | 'element' | 'collection'

// What mark, if any, is drawn at each element's position:
//   'none'    — no marks; on a cartesian map only labels remain, and on a
//               semantic map only the polylines
//   'circle'  — every element drawn as a circle, whatever shape it carries
//   'element' — each element's own shape attribute
// Replaced the earlier showDots boolean; see readMarkMode in parser.ts for how
// files written before this change are migrated.
export type MarkMode = 'none' | 'circle' | 'element'

// Settings every map has, all driven from the map window's sidebar.
//
// shownCollectionIds is the collections this map is focused on, and an empty
// list means it is focused on nothing in particular — every element, no
// emphasis. What "focused on" draws as is the map's own business, because the
// two have different room to say it:
//
//   cartesian — draws each selected collection as a translucent blob without
//               overriding element colors. It normally keeps everything
//               plotted, with an optional members-only filter.
//   semantic  — draws only the members and hides the rest. There is no 2D space
//               to enclose a cluster in, so it narrows to the cluster instead.
//               It claims colors too, but only under colorMode 'none', where
//               there is no chosen color to overwrite — see drawSemantic.
//
// Named for what it selects rather than matching Element.collectionIds: one is
// a per-map display choice, the other is the membership itself, and a shared
// name would invite reading a map's selection as data about the elements.
export interface BaseMapConfig {
  id: string
  type: MapType
  title: string        // user-editable; also used as the OS window title
  showLabels: boolean
  marks: MarkMode       // what mark is drawn at each element's position
  sizeByWeight: boolean // true = dot radius scales with element weight; false = uniform default size
  colorMode: ColorMode  // what element color is drawn from
  shownCollectionIds: string[] // collections this map is focused on; empty = none
  windowX: number
  windowY: number
  windowWidth: number
  windowHeight: number
}

// A cartesian map plots every element in a 2D dimension space, and draws a
// translucent blob around the members of each collection in the shared
// shownCollectionIds — the map formerly known as the Type Projection map, now
// folded in as an overlay rather than a separate map type.
//
// An empty selection means no blobs. The separate onlySelectedCollections flag
// can narrow dots to the union of selected collections without changing what
// the selection itself means. See readShownCollectionIds in parser.ts for how
// files written under the older selection rules are migrated.
export interface CartesianMapConfig extends BaseMapConfig {
  type: 'cartesian'
  onlySelectedCollections: boolean // true = draw only members of selected collections
  xDimensionId: string
  yDimensionId: string
  xFlipped: boolean            // reverses poleA/poleB direction on that axis
  yFlipped: boolean
}

// A semantic map has no 2D space to project a cluster into, so it draws no
// blobs; its shownCollectionIds filters instead, narrowing the map to the
// members of the selected collections. See semanticElements in drawSemantic,
// which resolves that against elementIds and is what MapPanel hit-tests too.
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
  collections: Collection[]
  dimensions: Dimension[]
  scores: ScoreMap
  maps: MapConfig[]
  selectedElementId: string | null
  selectedDimensionId: string | null
  selectedCollectionId: string | null
  activeTab: 'elements' | 'dimensions' | 'scores' | 'collections' | 'conversions'
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
 * '–' — not fully scored and the active dimension is unscored or absent
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
