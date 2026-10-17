import { describe, expect, it } from 'vitest'
import {
  cartesianDragStart,
  cartesianHitEdge,
  clampGroupDelta,
  dragGroupIds,
  semanticDragMembers,
  semanticHitDot,
  semanticHitRow
} from './mapGeometry'
import { axisYs, semanticLayout, type MeasureText } from './semantic/semanticLayout'
import type { Dimension, SemanticMapConfig } from '../../lib/types'

// Text measured at 7px a character, standing in for a canvas in tests.
const measure: MeasureText = text => text.length * 7

const dimension = (id: string, poleA: string, poleB: string): Dimension =>
  ({ id, label: id, poleA, poleB } as Dimension)

const semanticConfig = (dimensionIds: string[], flippedDimensionIds: string[] = []): SemanticMapConfig =>
  ({ type: 'semantic', elementIds: [], dimensionIds, flippedDimensionIds, marks: 'shapes', shownCollectionIds: [] } as unknown as SemanticMapConfig)

describe('map geometry', () => {
  it('clamps a group without changing the spacing between members', () => {
    expect(clampGroupDelta([0.2, 0.7], 0.5)).toBeCloseTo(0.3)
    expect(clampGroupDelta([0.2, 0.7], -0.5)).toBeCloseTo(-0.2)
  })

  it('starts unscored cartesian dots at their drawn center placeholder', () => {
    expect(cartesianDragStart('a', 'x', 'y', {})).toEqual({ id: 'a', x0: 0.5, y0: 0.5 })
  })

  it('moves a selection only when the grabbed element belongs to it', () => {
    expect(dragGroupIds('b', ['a', 'b'])).toEqual(['a', 'b'])
    expect(dragGroupIds('c', ['a', 'b'])).toEqual(['c'])
  })

  it('excludes hidden and unscored semantic elements from a drag', () => {
    const scores = { a: { dim: 0 }, b: { dim: 0.5 }, c: {} }
    expect(semanticDragMembers(['a', 'b', 'c'], 'dim', scores, new Set(['a', 'c'])))
      .toEqual([{ id: 'a', s0: 0 }])
  })

  it('lays out and hit-tests semantic axes consistently', () => {
    expect(axisYs(300, 1)).toEqual([150])
    const layout = semanticLayout(400, 300, semanticConfig(['d']), [dimension('d', 'Low', 'High')], 13, measure)
    expect(semanticHitRow(154, layout)).toBe(0)
    expect(semanticHitRow(157, layout)).toBe(-1)
  })

  it('keeps the usual semantic margins for short pole labels', () => {
    const layout = semanticLayout(600, 300, semanticConfig(['d']), [dimension('d', 'Low', 'High')], 13, measure)
    expect(layout.axisLeft).toBe(96)
    expect(layout.axisRight).toBe(600 - 96)
  })

  it('widens a semantic margin for a long pole label, then shortens it to stay on the map', () => {
    const long = 'Extremely consequential'           // 23 characters, 161px
    const wide = semanticLayout(1000, 300, semanticConfig(['d']), [dimension('d', long, 'High')], 13, measure)
    expect(wide.axisLeft).toBe(161 + 6 + 8)
    expect(wide.axes[0].leftLabel).toBe(long)
    expect(wide.axisRight).toBe(1000 - 96)

    const narrow = semanticLayout(400, 300, semanticConfig(['d']), [dimension('d', long, 'High')], 13, measure)
    expect(narrow.axisLeft).toBe(120)                // 30% of the width
    expect(measure(narrow.axes[0].leftLabel, '')).toBeLessThanOrEqual(120 - 6 - 8)
    expect(narrow.axes[0].leftLabel.endsWith('…')).toBe(true)
  })

  it('sizes margins from the pole each side shows when a dimension is flipped', () => {
    const long = 'Extremely consequential'
    const layout = semanticLayout(1000, 300, semanticConfig(['d'], ['d']), [dimension('d', long, 'High')], 13, measure)
    expect(layout.axes[0].rightLabel).toBe(long)
    expect(layout.axisRight).toBe(1000 - (161 + 6 + 8))
  })

  it('hits a semantic dot where the layout draws it', () => {
    const config = semanticConfig(['d'])
    const layout = semanticLayout(1000, 300, config, [dimension('d', 'Extremely consequential', 'High')], 13, measure)
    const element = { id: 'e', name: 'e', weight: 1, collectionIds: [] } as never
    const x = layout.axisLeft + 0.25 * (layout.axisRight - layout.axisLeft)
    expect(semanticHitDot(x, 150, layout, config, [element], [], { e: { d: 0.25 } }))
      .toEqual({ elementId: 'e', dimId: 'd' })
  })

  it('distinguishes all four cartesian axis halves', () => {
    expect(cartesianHitEdge(100, 150, 400, 300)).toBe('left')
    expect(cartesianHitEdge(300, 150, 400, 300)).toBe('right')
    expect(cartesianHitEdge(200, 100, 400, 300)).toBe('top')
    expect(cartesianHitEdge(200, 200, 400, 300)).toBe('bottom')
  })
})
