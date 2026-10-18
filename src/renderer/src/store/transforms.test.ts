import { describe, expect, it } from 'vitest'
import type { Element, ScoreMap } from '../lib/types'
import { colorFromScores, scoresFromWeights, spreadScores, weightFromScores, type Study } from './transforms'

const elements: Element[] = [
  { id: 'low', name: 'Low', definition: '', weight: 10, color: '#000000', shape: 'circle', collectionIds: [] },
  { id: 'high', name: 'High', definition: '', weight: 20, color: '#000000', shape: 'circle', collectionIds: [] },
  { id: 'missing', name: 'Missing', definition: '', weight: 15, color: '#123456', shape: 'circle', collectionIds: [] }
]
const study = (scores: ScoreMap): Study => ({ elements, scores, dimensions: [], collections: [] })

describe('study transforms', () => {
  it('maps dimension poles to the full element weight range in either direction', () => {
    const scored = study({ low: { dim: 0 }, high: { dim: 1 } })
    expect(weightFromScores('dim', false)(scored).elements?.map(element => element.weight)).toEqual([1, 100, 15])
    expect(weightFromScores('dim', true)(scored).elements?.map(element => element.weight)).toEqual([100, 1, 15])
  })

  it('normalizes the current weight range into dimension scores', () => {
    const { scores } = scoresFromWeights('dim', false)(study({}))
    expect(scores?.low.dim).toBe(0)
    expect(scores?.high.dim).toBe(1)
    expect(scores?.missing.dim).toBe(0.5)
  })

  it('interpolates colors while leaving unscored elements unchanged', () => {
    const changed = colorFromScores('dim', '#000000', '#ffffff')(study({ low: { dim: 0 }, high: { dim: 1 } }))
    expect(changed.elements?.map(element => element.color)).toEqual(['#000000', '#ffffff', '#123456'])
  })

  it('spreads existing scores without creating missing scores', () => {
    const { scores } = spreadScores('dim')(study({ low: { dim: 0.2 }, high: { dim: 0.6 } }))
    expect(scores?.low.dim).toBeCloseTo(0.05)
    expect(scores?.high.dim).toBeCloseTo(0.95)
    expect(scores?.missing).toBeUndefined()
  })

  it('changes nothing when spreading a dimension nobody is scored on', () => {
    expect(spreadScores('dim')(study({}))).toEqual({})
  })
})
