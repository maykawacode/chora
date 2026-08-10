import { describe, expect, it, vi } from 'vitest'
import { BLOB_GAP, blobPadding, setBlobPath } from './blob'
import { hasVisibleScores } from './semantic/drawSemantic'

describe('blobPadding', () => {
  it('keeps a fixed visual gap beyond each rendered member', () => {
    expect(blobPadding(18)).toBe(18 + BLOB_GAP)
    expect(blobPadding(6)).toBe(6 + BLOB_GAP)
  })

  it('still contains the maximum Cartesian mark without over-padding smaller groups', () => {
    expect(blobPadding(76)).toBe(84)
    expect(blobPadding(6)).toBe(14)
  })

  it('pads each hull turn by that point’s own displayed size', () => {
    const moveTo = vi.fn()
    const ctx = {
      beginPath: vi.fn(), moveTo, bezierCurveTo: vi.fn(), closePath: vi.fn(),
      arc: vi.fn(), lineTo: vi.fn()
    } as unknown as CanvasRenderingContext2D

    setBlobPath(ctx, [
      { x: 0, y: 0, padding: 10 },
      { x: 100, y: 0, padding: 20 },
      { x: 0, y: 100, padding: 30 }
    ])

    const [x, y] = moveTo.mock.calls[0]
    expect(x).toBeCloseTo(-Math.SQRT1_2 * 10)
    expect(y).toBeCloseTo(-Math.SQRT1_2 * 10)
  })
})

describe('semantic score visibility', () => {
  it('counts zero as a visible score and ignores scores outside the map', () => {
    expect(hasVisibleScores(['element'], ['shown'], { element: { shown: 0 } })).toBe(true)
    expect(hasVisibleScores(['element'], ['shown'], { element: { hidden: 0.5 } })).toBe(false)
  })
})
