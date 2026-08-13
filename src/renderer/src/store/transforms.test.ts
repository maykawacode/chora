import { describe, expect, it } from 'vitest'
import type { Element } from '../lib/types'
import {
  dimensionScoresToColors,
  dimensionScoresToWeights,
  spreadScores,
  weightsToDimensionScores
} from './transforms'

const elements: Element[] = [
  { id: 'low', name: 'Low', definition: '', weight: 10, color: '#000000', shape: 'circle', collectionIds: [] },
  { id: 'high', name: 'High', definition: '', weight: 20, color: '#000000', shape: 'circle', collectionIds: [] },
  { id: 'missing', name: 'Missing', definition: '', weight: 15, color: '#123456', shape: 'circle', collectionIds: [] }
]

describe('store transforms', () => {
  it('maps dimension poles to the full element weight range in either direction', () => {
    const scores = { low: { dim: 0 }, high: { dim: 1 } }
    expect(dimensionScoresToWeights(elements, scores, 'dim', false).map(element => element.weight))
      .toEqual([1, 100, 15])
    expect(dimensionScoresToWeights(elements, scores, 'dim', true).map(element => element.weight))
      .toEqual([100, 1, 15])
  })

  it('normalizes the current weight range into dimension scores', () => {
    const scores = weightsToDimensionScores(elements, {}, 'dim', false)
    expect(scores.low.dim).toBe(0)
    expect(scores.high.dim).toBe(1)
    expect(scores.missing.dim).toBe(0.5)
  })

  it('interpolates colors while leaving unscored elements unchanged', () => {
    const changed = dimensionScoresToColors(
      elements,
      { low: { dim: 0 }, high: { dim: 1 } },
      'dim',
      '#000000',
      '#ffffff'
    )
    expect(changed.map(element => element.color)).toEqual(['#000000', '#ffffff', '#123456'])
  })

  it('spreads existing scores without creating missing scores', () => {
    const spread = spreadScores(elements, { low: { dim: 0.2 }, high: { dim: 0.6 } }, 'dim')
    expect(spread.low.dim).toBeCloseTo(0.05)
    expect(spread.high.dim).toBeCloseTo(0.95)
    expect(spread.missing).toBeUndefined()
  })
})
