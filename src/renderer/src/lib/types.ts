// ── Core data types ───────────────────────────────────────────────────────────
//
// These are the plain data structures shared across all windows via JSON.
// All IDs are UUIDs (generated at creation, never changed).
// Scores live separately from elements/dimensions so adding/removing either
// doesn't corrupt the other — it just leaves orphaned keys that are ignored.

export interface Element {
  id: string
  name: string
  weight: number       // 1–100; drives dot size on cartesian maps
  color: string        // hex string, e.g. '#808000' (olive default)
  description: string
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
  poleA: string        // left / bottom end of the axis
  poleB: string        // right / top end of the axis
  weight: number       // future use; stored now so files round-trip cleanly
  description: string
  categories: DimensionCategories  // used by the Starter Lists picker
}

// scores[elementId][dimensionId] = 0.0–1.0
// A missing key means the element has not been scored on that dimension yet.
export type ScoreMap = Record<string, Record<string, number | undefined>>

// ── Map configuration types ───────────────────────────────────────────────────
//
// Each open map window corresponds to exactly one MapConfig stored in the
// session. Window geometry (x/y/width/height) is stored here so it can be
// restored on next open when rememberWindowPositions is enabled.

export type MapType = 'cartesian' | 'semantic'

export interface BaseMapConfig {
  id: string
  type: MapType
  title: string        // user-editable; also used as the OS window title
  showLabels: boolean
  showDots: boolean
  windowX: number
  windowY: number
  windowWidth: number
  windowHeight: number
}

export interface CartesianMapConfig extends BaseMapConfig {
  type: 'cartesian'
  xDimensionId: string
  yDimensionId: string
  xFlipped: boolean    // reverses poleA/poleB direction on that axis
  yFlipped: boolean
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
  elements: Element[]
  dimensions: Dimension[]
  scores: ScoreMap
  maps: MapConfig[]
  selectedElementId: string | null
  selectedDimensionId: string | null
  activeTab: 'elements' | 'dimensions' | 'scores'
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
