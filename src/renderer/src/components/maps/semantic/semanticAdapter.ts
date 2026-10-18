// ── Semantic adapter ──────────────────────────────────────────────────────────
//
// How a semantic map answers MapPanel's pointer questions (see mapAdapter).
// Positions come from semanticLayout, the layout drawSemantic paints, so hits
// land where the dots are drawn. Dots move only along their own axis.

import type { SemanticMapConfig } from '../../../lib/types'
import { numericRange } from '../../../lib/numericRange'
import type { AxisControl, AxisHit, MapAdapter, MapData } from '../mapAdapter'
import { clampGroupDelta, dragGroupIds, inRect, onDot } from '../mapGeometry'
import { DOT_MAX_RADIUS, dotRadius } from '../shape'
import { semanticElements } from './drawSemantic'
import { axisX, scoreAtX, semanticLayout, type MeasureText } from './semanticLayout'

export function semanticAdapter(
  config: SemanticMapConfig,
  data: MapData,
  width: number,
  height: number,
  measure?: MeasureText
): MapAdapter {
  const { elements, collections, scores } = data
  const layout = semanticLayout(width, height, config, data.dimensions, data.dimensionLabelSize, measure)
  const visible = semanticElements(config, elements, collections)
  const visibleIds = new Set(visible.map(element => element.id))
  const weightRange = numericRange(elements.map(element => element.weight))

  return {
    grabSelects: true,
    visibleIds,

    // An element unscored on an axis has no dot there.
    dotAt(x, y) {
      if (config.marks === 'none') return null
      for (const axis of layout.axes) {
        if (Math.abs(y - axis.y) > Math.max(DOT_MAX_RADIUS.semantic, 8)) continue
        for (const element of visible) {
          const raw = scores[element.id]?.[axis.dimension.id]
          if (raw === undefined) continue
          if (onDot(x, y, axisX(layout, axis, raw), axis.y, dotRadius(config, element.weight, weightRange, data.defaultDotRadius))) {
            return { elementId: element.id, dimensionId: axis.dimension.id }
          }
        }
      }
      return null
    },

    dotsIn(rect) {
      const hits = new Set<string>()
      for (const axis of layout.axes) {
        for (const element of visible) {
          const raw = scores[element.id]?.[axis.dimension.id]
          if (raw !== undefined && inRect(axisX(layout, axis, raw), axis.y, rect)) hits.add(element.id)
        }
      }
      return [...hits]
    },

    axisAt(_x, y) {
      const index = layout.axes.findIndex(axis => Math.abs(y - axis.y) <= 6)
      return index < 0 ? null : { index, dimensionId: layout.axes[index].dimension.id }
    },

    // The group moves by one delta in score space: its members share the
    // grabbed dot's axis, and so its flip. Hidden and unscored members stay.
    startDrag(hit, _x, _y, selectedIds) {
      const { dimensionId } = hit
      const axis = layout.axes.find(a => a.dimension.id === dimensionId)
      const s0 = dimensionId === undefined ? undefined : scores[hit.elementId]?.[dimensionId]
      if (!axis || dimensionId === undefined || s0 === undefined) return null
      const group = dragGroupIds(hit.elementId, selectedIds).flatMap(id => {
        const start = scores[id]?.[dimensionId]
        return visibleIds.has(id) && start !== undefined ? [{ id, s0: start }] : []
      })
      return {
        elementId: hit.elementId,
        moveTo(px) {
          const ds = clampGroupDelta(group.map(m => m.s0), scoreAtX(layout, axis, px) - s0)
          return group.map(m => ({ elementId: m.id, targetId: dimensionId, value: m.s0 + ds }))
        }
      }
    }
  }
}

export function semanticAxisControl(config: SemanticMapConfig, axis: AxisHit): AxisControl {
  const { flippedDimensionIds: flipped } = config
  return {
    title: 'Dimension',
    currentId: axis.dimensionId,
    isFlipped: flipped.includes(axis.dimensionId),
    // The replaced dimension's flip goes with it.
    pick: id => ({
      dimensionIds: config.dimensionIds.map((d, i) => i === axis.index ? id : d),
      flippedDimensionIds: flipped.filter(d => d !== axis.dimensionId)
    }),
    flip: () => ({
      flippedDimensionIds: flipped.includes(axis.dimensionId)
        ? flipped.filter(d => d !== axis.dimensionId)
        : [...flipped, axis.dimensionId]
    })
  }
}
