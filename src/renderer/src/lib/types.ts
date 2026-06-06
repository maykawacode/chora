// ── Core data types ──────────────────────────────────────────────────────────

export interface Element {
  id: string
  name: string
  weight: number       // 1–100, default 1
  color: string        // hex, default '#808000' (olive)
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
  label: string        // full "PoleA–PoleB" display string
  poleA: string        // left / bottom pole
  poleB: string        // right / top pole
  weight: number
  description: string
  categories: DimensionCategories  // used by Phase 3 Starter Lists; stored now so files round-trip
}

// scores[elementId][dimensionId] = 0.0–1.0, or undefined if not yet scored
export type ScoreMap = Record<string, Record<string, number | undefined>>

// ── Map configuration types ───────────────────────────────────────────────────

export type MapType = 'cartesian' | 'semantic'

export interface BaseMapConfig {
  id: string
  type: MapType
  title: string
  showLabels: boolean
  showDots: boolean
  // Window geometry stored now; used by Phase 4 multi-window positioning
  windowX: number
  windowY: number
  windowWidth: number
  windowHeight: number
}

export interface CartesianMapConfig extends BaseMapConfig {
  type: 'cartesian'
  xDimensionId: string
  yDimensionId: string
  xFlipped: boolean
  yFlipped: boolean
}

export interface SemanticMapConfig extends BaseMapConfig {
  type: 'semantic'
  elementIds: string[]
  dimensionIds: string[]
  flippedDimensionIds: string[]
}

export type MapConfig = CartesianMapConfig | SemanticMapConfig

// ── Application state ─────────────────────────────────────────────────────────

export interface AppState {
  filePath: string | null
  isDirty: boolean
  elements: Element[]
  dimensions: Dimension[]
  scores: ScoreMap
  maps: MapConfig[]
  selectedElementId: string | null
  selectedDimensionId: string | null
  activeTab: 'elements' | 'dimensions' | 'scores'
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

export function parsePoles(label: string): { poleA: string; poleB: string } {
  const sep = label.includes('–') ? '–' : label.includes('-') ? '-' : null
  if (!sep) return { poleA: label, poleB: '' }
  const idx = label.indexOf(sep)
  return { poleA: label.slice(0, idx).trim(), poleB: label.slice(idx + sep.length).trim() }
}

// Scoring status for an element across all dimensions
export function scoreStatus(
  element: Element,
  dimensions: Dimension[],
  scores: ScoreMap,
  activeDimensionId: string | null
): '–' | '◇' | '●' {
  if (dimensions.length === 0) return '–'
  const elScores = scores[element.id] ?? {}
  const scoredAll = dimensions.every(d => elScores[d.id] !== undefined)
  if (scoredAll) return '●'
  if (activeDimensionId && elScores[activeDimensionId] !== undefined) return '◇'
  return '–'
}
