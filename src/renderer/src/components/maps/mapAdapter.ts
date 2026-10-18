// ── Map adapters ──────────────────────────────────────────────────────────────
//
// What MapPanel asks of a map type: which dot or axis is under the pointer,
// which dots a lasso holds, how dragging a dot turns into scores, and how an
// axis is changed. Each type answers in its own adapter file, and MapPanel's
// pointer handlers are written once against this interface, so a new map type
// is one adapter plus its painter.

import type { CartesianMapConfig, Collection, Dimension, Element, MapConfig, ScoreMap, SemanticMapConfig } from '../../lib/types'
import type { ScoreEntry } from '../../store/appStore'
import type { Rect } from './mapGeometry'
import { cartesianAdapter, cartesianAxisControl } from './cartesian/cartesianAdapter'
import { semanticAdapter, semanticAxisControl } from './semantic/semanticAdapter'

/** The study and display settings an adapter measures against. */
export interface MapData {
  elements: Element[]
  collections: Collection[]
  dimensions: Dimension[]
  scores: ScoreMap
  defaultDotRadius: number
  dimensionLabelSize: number
}


/** A dot under the pointer; a semantic dot also names the axis it sits on. */
interface DotHit { elementId: string; dimensionId?: string }

/** An axis under the pointer: cartesian 0 is x and 1 is y; semantic counts rows from the top. */
export interface AxisHit { index: number; dimensionId: string }

/** A drag in progress: the scores that put the grabbed dot under the pointer. */
export interface ScoreDrag {
  elementId: string
  /** `shift` locks a cartesian drag to its main direction. */
  moveTo: (x: number, y: number, shift: boolean) => ScoreEntry[]
}

type MapConfigPatch = Partial<CartesianMapConfig> | Partial<SemanticMapConfig>

/** What the axis picker shows for an axis, and the config changes it makes. */
export interface AxisControl {
  title: string
  currentId: string
  isFlipped: boolean
  pick: (dimensionId: string) => MapConfigPatch
  flip: () => MapConfigPatch
}

export interface MapAdapter {
  /**
   * Grabbing a dot selects it, replacing a selection it is outside, and it
   * stays highlighted after release; a lasso drops the highlight. Otherwise a
   * grabbed dot is highlighted only while held.
   */
  grabSelects: boolean
  /** Elements the map draws; hits and selections never reach beyond them. */
  visibleIds: Set<string>
  dotAt: (x: number, y: number) => DotHit | null
  dotsIn: (rect: Rect) => string[]
  axisAt: (x: number, y: number) => AxisHit | null
  /** Null when the dot cannot be dragged. */
  startDrag: (hit: DotHit, x: number, y: number, selectedIds: string[]) => ScoreDrag | null
}

/** The adapter for a map laid out at width × height. */
export function mapAdapter(config: MapConfig, data: MapData, width: number, height: number): MapAdapter {
  return config.type === 'cartesian'
    ? cartesianAdapter(config, data, width, height)
    : semanticAdapter(config, data, width, height)
}

export function axisControl(config: MapConfig, axis: AxisHit): AxisControl {
  return config.type === 'cartesian' ? cartesianAxisControl(config, axis) : semanticAxisControl(config, axis)
}
