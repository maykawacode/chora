import { describe, expect, it } from 'vitest'
import { formatRange, normalizeInRange, numericRange, openWeight } from './numericRange'

describe('numeric ranges', () => {
  it('derives and formats the complete finite range', () => {
    const range = numericRange([250, 0, 75, Number.NaN])
    expect(range).toEqual({ min: 0, max: 250 })
    expect(formatRange(range)).toBe('(0–250)')
  })

  it('normalizes across the actual range and handles equal values', () => {
    const range = numericRange([10, 30])
    expect(normalizeInRange(10, range)).toBe(0)
    expect(normalizeInRange(20, range)).toBe(0.5)
    expect(normalizeInRange(30, range)).toBe(1)
    expect(normalizeInRange(10, numericRange([10, 10]))).toBe(0)
  })

  it('accepts open-ended non-negative weights', () => {
    expect(openWeight(0)).toBe(0)
    expect(openWeight(500)).toBe(500)
    expect(openWeight(-4)).toBe(0)
    expect(openWeight(Number.POSITIVE_INFINITY, 1)).toBe(1)
  })
})
