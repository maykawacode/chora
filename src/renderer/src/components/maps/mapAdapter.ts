// ── Map adapters ──────────────────────────────────────────────────────────────
//
// What MapPanel asks of a map type: which dot or axis is under the pointer,
// which dots a lasso holds, how dragging a dot turns into scores, and how an
// axis is changed. Each type answers in its own adapter file, and MapPanel's
// pointer handlers are written once against this interface, so a new map type
// is one adapter plus its painter, both added to the dispatches below.

import type { CartesianMapConfig, Collection, Dimension, Element, MapConfig, ScoreMap, SemanticMapConfig } from '../../lib/types'
import type { ScoreEntry } from '../../store/appStore'
import type { Rect } from './mapGeometry'
import { cartesianAdapter, cartesianAxisControl } from './cartesian/cartesianAdapter'
import { drawCartesian } from './cartesian/drawCartesian'
import { semanticAdapter, semanticAxisControl } from './semantic/semanticAdapter'
import { drawSemantic } from './semantic/drawSemantic'

/** Everything a map is drawn and hit-tested from, besides its config and size. */
export interface MapScene {
  elements: Element[]
  collections: Collection[]
  dimensions: Dimension[]
  scores: ScoreMap
  defaultDotRadius: number
  elementLabelSize: number
  dimensionLabelSize: number
  /** The single highlight and the multi-selection; exports leave both out. */
  selectedElementId?: string
  selectedElementIds?: string[]
  /** The dot being dragged, which a semantic map draws with a heavier line. */
  draggingElementId?: string
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
export function mapAdapter(config: MapConfig, scene: MapScene, width: number, height: number): MapAdapter {
  return config.type === 'cartesian'
    ? cartesianAdapter(config, scene, width, height)
    : semanticAdapter(config, scene, width, height)
}

/** Paints a map at width × height, on screen or into an SVG export. */
export function drawMap(ctx: CanvasRenderingContext2D, width: number, height: number, config: MapConfig, scene: MapScene): void {
  if (config.type === 'cartesian') drawCartesian(ctx, width, height, config, scene)
  else drawSemantic(ctx, width, height, config, scene)
}

export function axisControl(config: MapConfig, axis: AxisHit): AxisControl {
  return config.type === 'cartesian' ? cartesianAxisControl(config, axis) : semanticAxisControl(config, axis)
}
