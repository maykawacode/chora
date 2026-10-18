import { describe, expect, it } from 'vitest'
import { clampGroupDelta, dragGroupIds } from './mapGeometry'
import { cartesianHitEdge } from './cartesian/cartesianAdapter'
import { semanticAdapter } from './semantic/semanticAdapter'
import { axisYs, semanticLayout, type MeasureText } from './semantic/semanticLayout'
import type { Dimension, Element, ScoreMap, SemanticMapConfig } from '../../lib/types'

// Text measured at 7px a character, standing in for a canvas in tests.
const measure: MeasureText = text => text.length * 7

const dimension = (id: string, poleA: string, poleB: string): Dimension =>
  ({ id, label: id, poleA, poleB } as Dimension)

const semanticConfig = (dimensionIds: string[], flippedDimensionIds: string[] = []): SemanticMapConfig =>
  ({ type: 'semantic', elementIds: [], dimensionIds, flippedDimensionIds, marks: 'circle', shownCollectionIds: [] } as unknown as SemanticMapConfig)

const semanticMap = (config: SemanticMapConfig, dimensions: Dimension[], elements: Element[], scores: ScoreMap, width = 400) =>
  semanticAdapter(config, { elements, collections: [], dimensions, scores, defaultDotRadius: 6, elementLabelSize: 13, dimensionLabelSize: 13 }, width, 300, measure)

describe('map geometry', () => {
  it('clamps a group without changing the spacing between members', () => {
    expect(clampGroupDelta([0.2, 0.7], 0.5)).toBeCloseTo(0.3)
    expect(clampGroupDelta([0.2, 0.7], -0.5)).toBeCloseTo(-0.2)
  })

  it('moves a selection only when the grabbed element belongs to it', () => {
    expect(dragGroupIds('b', ['a', 'b'])).toEqual(['a', 'b'])
    expect(dragGroupIds('c', ['a', 'b'])).toEqual(['c'])
  })

  it('leaves hidden and unscored semantic elements out of a drag', () => {
    const elements = ['a', 'b', 'c'].map(id => ({ id, weight: 1, collectionIds: [] }) as unknown as Element)
    const config = { ...semanticConfig(['dim']), elementIds: ['a', 'c'] }
    const map = semanticMap(config, [dimension('dim', 'Low', 'High')], elements, { a: { dim: 0 }, b: { dim: 0.5 }, c: {} })
    const drag = map.startDrag({ elementId: 'a', dimensionId: 'dim' }, 0, 0, ['a', 'b', 'c'])!
    expect(drag.moveTo(10_000, 150, false)).toEqual([{ elementId: 'a', targetId: 'dim', value: 1 }])
  })

  it('lays out and hit-tests semantic axes consistently', () => {
    expect(axisYs(300, 1)).toEqual([150])
    const map = semanticMap(semanticConfig(['d']), [dimension('d', 'Low', 'High')], [], {})
    expect(map.axisAt(0, 154)).toEqual({ index: 0, dimensionId: 'd' })
    expect(map.axisAt(0, 157)).toBeNull()
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
    const dimensions = [dimension('d', 'Extremely consequential', 'High')]
    const layout = semanticLayout(1000, 300, config, dimensions, 13, measure)
    const element = { id: 'e', name: 'e', weight: 1, collectionIds: [] } as unknown as Element
    const x = layout.axisLeft + 0.25 * (layout.axisRight - layout.axisLeft)
    expect(semanticMap(config, dimensions, [element], { e: { d: 0.25 } }, 1000).dotAt(x, 150))
      .toEqual({ elementId: 'e', dimensionId: 'd' })
  })

  it('distinguishes all four cartesian axis halves', () => {
    // The plot's middle sits at y 143: a 44px top margin, 58px elsewhere.
    expect(cartesianHitEdge(100, 143, 400, 300)).toBe('left')
    expect(cartesianHitEdge(300, 143, 400, 300)).toBe('right')
    expect(cartesianHitEdge(200, 100, 400, 300)).toBe('top')
    expect(cartesianHitEdge(200, 200, 400, 300)).toBe('bottom')
  })
})
