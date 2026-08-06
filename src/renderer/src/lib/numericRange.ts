export interface NumericRange {
  min: number
  max: number
}

/** Finite, non-negative Element weight with no artificial upper ceiling. */
export function elementWeight(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, value)
    : fallback
}

/** Actual finite range, or a stable single-value fallback for an empty list. */
export function numericRange(values: number[], fallback = 0): NumericRange {
  const finite = values.filter(Number.isFinite)
  return finite.length === 0
    ? { min: fallback, max: fallback }
    : { min: Math.min(...finite), max: Math.max(...finite) }
}

/** Maps a value into 0–1. An equal range has no relative size, so maps to 0. */
export function normalizeInRange(value: number, range: NumericRange): number {
  if (range.max <= range.min) return 0
  return Math.max(0, Math.min(1, (value - range.min) / (range.max - range.min)))
}

export function formatRange(range: NumericRange): string {
  return `(${range.min}–${range.max})`
}
