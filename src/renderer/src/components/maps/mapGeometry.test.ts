import { describe, expect, it } from 'vitest'
import {
  cartesianDragStart,
  cartesianHitEdge,
  clampGroupDelta,
  dragGroupIds,
  semAxisYs,
  semanticDragMembers,
  semanticHitRow
} from './mapGeometry'

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
    expect(semAxisYs(300, 1)).toEqual([150])
    expect(semanticHitRow(154, 300, 1)).toBe(0)
    expect(semanticHitRow(157, 300, 1)).toBe(-1)
  })

  it('distinguishes all four cartesian axis halves', () => {
    expect(cartesianHitEdge(100, 150, 400, 300)).toBe('left')
    expect(cartesianHitEdge(300, 150, 400, 300)).toBe('right')
    expect(cartesianHitEdge(200, 100, 400, 300)).toBe('top')
    expect(cartesianHitEdge(200, 200, 400, 300)).toBe('bottom')
  })
})
