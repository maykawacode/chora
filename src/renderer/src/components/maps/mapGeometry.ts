import type {
  CartesianMapConfig,
  Collection,
  Element,
  ScoreMap,
  SemanticMapConfig
} from '../../lib/types'
import { numericRange } from '../../lib/numericRange'
import { cartesianElements } from './collections'
import { POLE_LABEL_HIT_SPAN, cartesianDotRadius, cartesianPlot } from './cartesian/drawCartesian'
import { SEM_DOT_MAX_R, semDotRadius, semanticElements } from './semantic/drawSemantic'
import { axisX, type SemanticLayout } from './semantic/semanticLayout'

export type Edge = 'left' | 'right' | 'top' | 'bottom'

export interface DragMember {
  id: string
  x0: number
  y0: number
}

export interface DragTarget {
  elementId: string
  xDimId: string
  yDimId: string
  members: DragMember[]
  origin: DragMember
  startX: number
  startY: number
  lockedAxis: 'x' | 'y' | null
}

export interface SemDragMember {
  id: string
  s0: number
}

export interface SemanticDragTarget {
  elementId: string
  dimId: string
  members: SemDragMember[]
  origin: SemDragMember
  startX: number
  startY: number
}

/** Keeps a rigid drag group inside the 0–1 score range. */
export function clampGroupDelta(starts: number[], delta: number): number {
  let lo = -Infinity
  let hi = Infinity
  for (const start of starts) {
    lo = Math.max(lo, -start)
    hi = Math.min(hi, 1 - start)
  }
  return Math.min(hi, Math.max(lo, delta))
}

/** Matches the center placeholder used to draw an unscored cartesian dot. */
export function cartesianDragStart(
  id: string,
  xDimId: string,
  yDimId: string,
  scores: ScoreMap
): DragMember {
  return {
    id,
    x0: scores[id]?.[xDimId] ?? 0.5,
    y0: scores[id]?.[yDimId] ?? 0.5
  }
}

export function dragGroupIds(draggedId: string, selectedIds: string[]): string[] {
  return selectedIds.includes(draggedId) ? selectedIds : [draggedId]
}

/** Excludes hidden and unscored semantic dots because neither can be dragged. */
export function semanticDragMembers(
  ids: string[],
  dimId: string,
  scores: ScoreMap,
  visible: Set<string>
): SemDragMember[] {
  const members: SemDragMember[] = []
  for (const id of ids) {
    if (!visible.has(id)) continue
    const s0 = scores[id]?.[dimId]
    if (s0 !== undefined) members.push({ id, s0 })
  }
  return members
}

/** Index of the axis within 6px of `y`, or -1. */
export function semanticHitRow(y: number, layout: SemanticLayout): number {
  return layout.axes.findIndex(axis => Math.abs(y - axis.y) <= 6)
}

export function cartesianHitEdge(
  x: number,
  y: number,
  width: number,
  height: number
): Edge | null {
  const { left, top, right, bottom } = cartesianPlot(width, height)
  const midX = (left + right) / 2
  const midY = (top + bottom) / 2

  if (Math.abs(y - midY) <= 6 && x >= left && x <= right) return x < midX ? 'left' : 'right'
  if (Math.abs(x - midX) <= 6 && y >= top && y <= bottom) return y < midY ? 'top' : 'bottom'
  if (x < left && Math.abs(y - midY) <= POLE_LABEL_HIT_SPAN) return 'left'
  if (x > right && Math.abs(y - midY) <= POLE_LABEL_HIT_SPAN) return 'right'
  if (y < top && Math.abs(x - midX) <= POLE_LABEL_HIT_SPAN) return 'top'
  if (y > bottom && Math.abs(x - midX) <= POLE_LABEL_HIT_SPAN) return 'bottom'
  return null
}

function cartesianProject(
  config: CartesianMapConfig,
  width: number,
  height: number,
  xScore: number,
  yScore: number
): { x: number; y: number } {
  const { left, top, right, bottom } = cartesianPlot(width, height)
  return {
    x: left + (config.xFlipped ? 1 - xScore : xScore) * (right - left),
    y: top + (1 - (config.yFlipped ? 1 - yScore : yScore)) * (bottom - top)
  }
}

export function cartesianHitDot(
  x: number,
  y: number,
  width: number,
  height: number,
  config: CartesianMapConfig,
  elements: Element[],
  collections: Collection[],
  scores: ScoreMap,
  defaultDotRadius?: number
): Pick<DragTarget, 'elementId' | 'xDimId' | 'yDimId'> | null {
  if (config.marks === 'none') return null

  const visible = [...cartesianElements(config, elements, collections)]
    .sort((a, b) => a.weight - b.weight)
  const weightRange = numericRange(elements.map(element => element.weight))

  for (const element of visible) {
    const point = cartesianProject(
      config,
      width,
      height,
      scores[element.id]?.[config.xDimensionId] ?? 0.5,
      scores[element.id]?.[config.yDimensionId] ?? 0.5
    )
    const hitRadius = Math.max(
      cartesianDotRadius(config, element.weight, weightRange, defaultDotRadius),
      8
    )
    if ((x - point.x) ** 2 + (y - point.y) ** 2 <= hitRadius ** 2) {
      return {
        elementId: element.id,
        xDimId: config.xDimensionId,
        yDimId: config.yDimensionId
      }
    }
  }
  return null
}

export function semanticHitDot(
  x: number,
  y: number,
  layout: SemanticLayout,
  config: SemanticMapConfig,
  elements: Element[],
  collections: Collection[],
  scores: ScoreMap,
  defaultDotRadius?: number
): Pick<SemanticDragTarget, 'elementId' | 'dimId'> | null {
  if (config.marks === 'none') return null

  const visible = semanticElements(config, elements, collections)
  const weightRange = numericRange(elements.map(element => element.weight))

  for (const axis of layout.axes) {
    const { dimension, y: axisY } = axis
    if (Math.abs(y - axisY) > Math.max(SEM_DOT_MAX_R, 8)) continue
    for (const element of visible) {
      const raw = scores[element.id]?.[dimension.id]
      if (raw === undefined) continue
      const dotX = axisX(layout, axis, raw)
      const hitRadius = Math.max(
        semDotRadius(config, element.weight, weightRange, defaultDotRadius),
        8
      )
      if ((x - dotX) ** 2 + (y - axisY) ** 2 <= hitRadius ** 2) {
        return { elementId: element.id, dimId: dimension.id }
      }
    }
  }
  return null
}

export function cartesianHitRect(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  width: number,
  height: number,
  config: CartesianMapConfig,
  elements: Element[],
  collections: Collection[],
  scores: ScoreMap
): string[] {
  const minX = Math.min(x1, x2)
  const maxX = Math.max(x1, x2)
  const minY = Math.min(y1, y2)
  const maxY = Math.max(y1, y2)

  return cartesianElements(config, elements, collections)
    .filter(element => {
      const point = cartesianProject(
        config,
        width,
        height,
        scores[element.id]?.[config.xDimensionId] ?? 0.5,
        scores[element.id]?.[config.yDimensionId] ?? 0.5
      )
      return point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY
    })
    .map(element => element.id)
}

export function semanticHitRect(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  layout: SemanticLayout,
  config: SemanticMapConfig,
  elements: Element[],
  collections: Collection[],
  scores: ScoreMap
): string[] {
  const minX = Math.min(x1, x2)
  const maxX = Math.max(x1, x2)
  const minY = Math.min(y1, y2)
  const maxY = Math.max(y1, y2)
  const visible = semanticElements(config, elements, collections)
  const hits = new Set<string>()

  for (const axis of layout.axes) {
    if (axis.y < minY || axis.y > maxY) continue
    for (const element of visible) {
      const raw = scores[element.id]?.[axis.dimension.id]
      if (raw === undefined) continue
      const dotX = axisX(layout, axis, raw)
      if (dotX >= minX && dotX <= maxX) hits.add(element.id)
    }
  }
  return [...hits]
}
