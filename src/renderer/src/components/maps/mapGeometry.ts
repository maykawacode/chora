import type {
  CartesianMapConfig,
  Collection,
  Dimension,
  Element,
  ScoreMap,
  SemanticMapConfig
} from '../../lib/types'
import { numericRange } from '../../lib/numericRange'
import { cartesianElements } from './collections'
import { MARGIN, POLE_LABEL_HIT_SPAN, cartesianDotRadius } from './cartesian/drawCartesian'
import {
  SEM_DOT_MAX_R,
  SEM_MARGIN_H,
  SEM_MARGIN_V,
  semDotRadius,
  semanticElements
} from './semantic/drawSemantic'

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

export function semAxisYs(height: number, count: number): number[] {
  if (count === 0) return []
  if (count === 1) return [height / 2]
  return Array.from({ length: count }, (_, index) =>
    SEM_MARGIN_V + index * (height - 2 * SEM_MARGIN_V) / (count - 1)
  )
}

export function semanticHitRow(y: number, height: number, dimCount: number): number {
  const ys = semAxisYs(height, dimCount)
  return ys.findIndex(axisY => Math.abs(y - axisY) <= 6)
}

export function cartesianHitEdge(
  x: number,
  y: number,
  width: number,
  height: number
): Edge | null {
  const midX = width / 2
  const midY = height / 2
  const right = width - MARGIN
  const bottom = height - MARGIN

  if (Math.abs(y - midY) <= 6 && x >= MARGIN && x <= right) return x < midX ? 'left' : 'right'
  if (Math.abs(x - midX) <= 6 && y >= MARGIN && y <= bottom) return y < midY ? 'top' : 'bottom'
  if (x < MARGIN && Math.abs(y - midY) <= POLE_LABEL_HIT_SPAN) return 'left'
  if (x > right && Math.abs(y - midY) <= POLE_LABEL_HIT_SPAN) return 'right'
  if (y < MARGIN && Math.abs(x - midX) <= POLE_LABEL_HIT_SPAN) return 'top'
  if (y > bottom && Math.abs(x - midX) <= POLE_LABEL_HIT_SPAN) return 'bottom'
  return null
}

export function cartesianProject(
  config: CartesianMapConfig,
  width: number,
  height: number,
  xScore: number,
  yScore: number
): { x: number; y: number } {
  const plotWidth = width - 2 * MARGIN
  const plotHeight = height - 2 * MARGIN
  return {
    x: MARGIN + (config.xFlipped ? 1 - xScore : xScore) * plotWidth,
    y: MARGIN + (1 - (config.yFlipped ? 1 - yScore : yScore)) * plotHeight
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
  scores: ScoreMap
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
    const hitRadius = Math.max(cartesianDotRadius(config, element.weight, weightRange), 8)
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
  width: number,
  height: number,
  config: SemanticMapConfig,
  elements: Element[],
  collections: Collection[],
  dimensions: Dimension[],
  scores: ScoreMap
): Pick<SemanticDragTarget, 'elementId' | 'dimId'> | null {
  if (config.marks === 'none') return null

  const axisWidth = width - 2 * SEM_MARGIN_H
  const dims = config.dimensionIds
    .map(id => dimensions.find(dimension => dimension.id === id))
    .filter((dimension): dimension is Dimension => dimension !== undefined)
  const visible = semanticElements(config, elements, collections)
  const axisYs = semAxisYs(height, dims.length)
  const weightRange = numericRange(elements.map(element => element.weight))

  for (let index = 0; index < dims.length; index++) {
    const dimension = dims[index]
    const axisY = axisYs[index]
    if (Math.abs(y - axisY) > Math.max(SEM_DOT_MAX_R, 8)) continue
    for (const element of visible) {
      const raw = scores[element.id]?.[dimension.id]
      if (raw === undefined) continue
      const score = config.flippedDimensionIds.includes(dimension.id) ? 1 - raw : raw
      const dotX = SEM_MARGIN_H + score * axisWidth
      const hitRadius = Math.max(semDotRadius(config, element.weight, weightRange), 8)
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
  width: number,
  height: number,
  config: SemanticMapConfig,
  elements: Element[],
  collections: Collection[],
  dimensions: Dimension[],
  scores: ScoreMap
): string[] {
  const minX = Math.min(x1, x2)
  const maxX = Math.max(x1, x2)
  const minY = Math.min(y1, y2)
  const maxY = Math.max(y1, y2)
  const axisWidth = width - 2 * SEM_MARGIN_H
  const dims = config.dimensionIds
    .map(id => dimensions.find(dimension => dimension.id === id))
    .filter((dimension): dimension is Dimension => dimension !== undefined)
  const visible = semanticElements(config, elements, collections)
  const axisYs = semAxisYs(height, dims.length)
  const hits = new Set<string>()

  for (let index = 0; index < dims.length; index++) {
    const axisY = axisYs[index]
    if (axisY < minY || axisY > maxY) continue
    const dimension = dims[index]
    for (const element of visible) {
      const raw = scores[element.id]?.[dimension.id]
      if (raw === undefined) continue
      const score = config.flippedDimensionIds.includes(dimension.id) ? 1 - raw : raw
      const dotX = SEM_MARGIN_H + score * axisWidth
      if (dotX >= minX && dotX <= maxX) hits.add(element.id)
    }
  }
  return [...hits]
}
