import type { Element, ScoreMap } from '../lib/types'
import { normalizeInRange, numericRange } from '../lib/numericRange'

export function dimensionScoresToWeights(
  elements: Element[],
  scores: ScoreMap,
  dimensionId: string,
  flip: boolean
): Element[] {
  return elements.map(element => {
    const raw = scores[element.id]?.[dimensionId]
    if (raw === undefined) return element
    const score = flip ? 1 - raw : raw
    return { ...element, weight: Math.round(score * 99 + 1) }
  })
}

export function weightsToDimensionScores(
  elements: Element[],
  scores: ScoreMap,
  dimensionId: string,
  flip: boolean
): ScoreMap {
  const next = { ...scores }
  const range = numericRange(elements.map(element => element.weight))
  for (const element of elements) {
    const raw = normalizeInRange(element.weight, range)
    next[element.id] = { ...next[element.id], [dimensionId]: flip ? 1 - raw : raw }
  }
  return next
}

function hexToRgb(hex: string): [number, number, number] {
  const value = parseInt(hex.slice(1), 16)
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]
}

export function dimensionScoresToColors(
  elements: Element[],
  scores: ScoreMap,
  dimensionId: string,
  lowColor: string,
  highColor: string
): Element[] {
  const low = hexToRgb(lowColor)
  const high = hexToRgb(highColor)
  return elements.map(element => {
    const score = scores[element.id]?.[dimensionId]
    if (score === undefined) return element
    const channels = low.map((channel, index) =>
      Math.round(channel + (high[index] - channel) * score)
    )
    const color = `#${channels.map(channel => channel.toString(16).padStart(2, '0')).join('')}`
    return { ...element, color }
  })
}

export function spreadScores(
  elements: Element[],
  scores: ScoreMap,
  dimensionId: string
): ScoreMap {
  const scored = elements
    .map(element => ({ id: element.id, value: scores[element.id]?.[dimensionId] }))
    .filter((entry): entry is { id: string; value: number } => entry.value !== undefined)
  if (scored.length === 0) return scores

  const values = scored.map(entry => entry.value)
  const min = Math.min(...values)
  const range = Math.max(...values) - min
  const next = { ...scores }
  for (const { id, value } of scored) {
    const spread = range === 0 ? 0.5 : 0.05 + ((value - min) / range) * 0.9
    next[id] = { ...next[id], [dimensionId]: spread }
  }
  return next
}
