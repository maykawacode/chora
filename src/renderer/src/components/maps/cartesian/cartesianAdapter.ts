// ── Cartesian adapter ─────────────────────────────────────────────────────────
//
// How a cartesian map answers MapPanel's pointer questions (see mapAdapter).
// Positions come from cartesianPlot, the plot drawCartesian paints, so hits
// land where the dots are drawn.

import type { CartesianMapConfig } from '../../../lib/types'
import type { ScoreEntry } from '../../../store/appStore'
import { numericRange } from '../../../lib/numericRange'
import type { AxisControl, AxisHit, MapAdapter, MapData } from '../mapAdapter'
import { clampGroupDelta, dragGroupIds, inRect, onDot } from '../mapGeometry'
import { cartesianElements } from '../collections'
import { dotRadius } from '../shape'
import { POLE_LABEL_HIT_SPAN, cartesianPlot } from './drawCartesian'

export type Edge = 'left' | 'right' | 'top' | 'bottom'

/** The axis half or pole label under (x, y): within 6px of an axis line, or beside its label. */
export function cartesianHitEdge(x: number, y: number, width: number, height: number): Edge | null {
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

export function cartesianAdapter(config: CartesianMapConfig, data: MapData, width: number, height: number): MapAdapter {
  const { elements, collections, scores } = data
  const { left, top, right, bottom } = cartesianPlot(width, height)
  const visible = cartesianElements(config, elements, collections)
  const visibleIds = new Set(visible.map(element => element.id))
  const weightRange = numericRange(elements.map(element => element.weight))

  // An unscored element is drawn, and dragged from, the centre placeholder.
  const scoresOf = (id: string): { x: number; y: number } => ({
    x: scores[id]?.[config.xDimensionId] ?? 0.5,
    y: scores[id]?.[config.yDimensionId] ?? 0.5
  })
  const project = ({ x, y }: { x: number; y: number }): { x: number; y: number } => ({
    x: left + (config.xFlipped ? 1 - x : x) * (right - left),
    y: top + (1 - (config.yFlipped ? 1 - y : y)) * (bottom - top)
  })
  /** Scores at a canvas point, clamped to the plot. */
  const scoresAt = (px: number, py: number): { x: number; y: number } => {
    const x = (Math.max(left, Math.min(right, px)) - left) / (right - left)
    const y = 1 - (Math.max(top, Math.min(bottom, py)) - top) / (bottom - top)
    return { x: config.xFlipped ? 1 - x : x, y: config.yFlipped ? 1 - y : y }
  }

  return {
    grabSelects: false,
    visibleIds,

    dotAt(x, y) {
      if (config.marks === 'none') return null
      const hit = [...visible].sort((a, b) => a.weight - b.weight).find(element => {
        const dot = project(scoresOf(element.id))
        return onDot(x, y, dot.x, dot.y, dotRadius(config, element.weight, weightRange, data.defaultDotRadius))
      })
      return hit ? { elementId: hit.id } : null
    },

    // A lasso can never pick up a dot that isn't on screen.
    dotsIn(rect) {
      return visible.filter(element => {
        const dot = project(scoresOf(element.id))
        return inRect(dot.x, dot.y, rect)
      }).map(element => element.id)
    },

    axisAt(x, y) {
      const edge = cartesianHitEdge(x, y, width, height)
      if (!edge) return null
      return edge === 'left' || edge === 'right'
        ? { index: 0, dimensionId: config.xDimensionId }
        : { index: 1, dimensionId: config.yDimensionId }
    },

    // The grabbed dot follows the pointer; the rest of its group moves by the
    // same amount. Holding Shift locks the drag to whichever direction it has
    // moved furthest once past 4px, until Shift is released.
    startDrag(hit, startX, startY, selectedIds) {
      const members = dragGroupIds(hit.elementId, selectedIds)
        .filter(id => visibleIds.has(id))
        .map(id => ({ id, ...scoresOf(id) }))
      const origin = scoresOf(hit.elementId)
      let locked: 'x' | 'y' | null = null

      return {
        elementId: hit.elementId,
        moveTo(px, py, shift) {
          if (!shift) locked = null
          else if (!locked) {
            const dx = Math.abs(px - startX)
            const dy = Math.abs(py - startY)
            if (dx > 4 || dy > 4) locked = dx >= dy ? 'x' : 'y'
          }
          const target = scoresAt(px, py)
          const updates: ScoreEntry[] = []
          if (locked !== 'y') {
            const dx = clampGroupDelta(members.map(m => m.x), target.x - origin.x)
            for (const m of members) updates.push({ elementId: m.id, targetId: config.xDimensionId, value: m.x + dx })
          }
          if (locked !== 'x') {
            const dy = clampGroupDelta(members.map(m => m.y), target.y - origin.y)
            for (const m of members) updates.push({ elementId: m.id, targetId: config.yDimensionId, value: m.y + dy })
          }
          return updates
        }
      }
    }
  }
}

export function cartesianAxisControl(config: CartesianMapConfig, axis: AxisHit): AxisControl {
  const isX = axis.index === 0
  return {
    title: isX ? 'X Axis' : 'Y Axis',
    currentId: isX ? config.xDimensionId : config.yDimensionId,
    isFlipped: isX ? config.xFlipped : config.yFlipped,
    pick: id => isX ? { xDimensionId: id } : { yDimensionId: id },
    flip: () => isX ? { xFlipped: !config.xFlipped } : { yFlipped: !config.yFlipped }
  }
}
