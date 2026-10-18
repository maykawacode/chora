// ── Study transforms ──────────────────────────────────────────────────────────
//
// Whole-study conversions, used by the Conversions view and Collections'
// palette repair. Each is a pure function from the study to the slices it
// changes, applied in one store update by appStore's transform(), so a new
// conversion is one function here. Randomizers read Math.random; everything
// else is deterministic.

import type { AppState, Element, ElementShape } from '../lib/types'
import { ELEMENT_SHAPES } from '../lib/types'
import { normalizeInRange, numericRange } from '../lib/numericRange'
import {
  DEFAULT_COLLECTION_COLOR, hexHue, mixCollectionColors, mixColors, paletteColor, randomReadableColor
} from '../lib/color'

export type Study = Pick<AppState, 'elements' | 'dimensions' | 'collections' | 'scores'>
export type Transform = (study: Study) => Partial<Study>

const randomWeight = (): number => Math.floor(Math.random() * 100) + 1

/** Updates each element that `change` returns a patch for; null leaves it unchanged. */
const eachElement = (change: (el: Element, study: Study) => Partial<Element> | null): Transform =>
  study => ({ elements: study.elements.map(el => { const patch = change(el, study); return patch ? { ...el, ...patch } : el }) })

const scoreOn = (study: Study, el: Element, dimensionId: string): number | undefined =>
  study.scores[el.id]?.[dimensionId]

// ── From dimension scores ─────────────────────────────────────────────────────

/** Weight 1–100 from the score; `flip` puts the high end at pole A. Unscored elements unchanged. */
export const weightFromScores = (dimensionId: string, flip: boolean): Transform => eachElement((el, study) => {
  const raw = scoreOn(study, el, dimensionId)
  return raw === undefined ? null : { weight: Math.round((flip ? 1 - raw : raw) * 99 + 1) }
})

/** Colour between `low` (score 0) and `high` (score 1). Unscored elements unchanged. */
export const colorFromScores = (dimensionId: string, low: string, high: string): Transform => eachElement((el, study) => {
  const score = scoreOn(study, el, dimensionId)
  if (score === undefined) return null
  const color = mixColors([{ color: low, weight: 1 - score }, { color: high, weight: score }])
  return color === null ? null : { color }
})

/** Copies scores from one dimension to another; elements unscored on the source are unchanged. */
export const copyScores = (fromId: string, toId: string): Transform => ({ elements, scores }) => {
  const next = { ...scores }
  for (const el of elements) {
    const score = next[el.id]?.[fromId]
    if (score !== undefined) next[el.id] = { ...next[el.id], [toId]: score }
  }
  return { scores: next }
}

/**
 * Rescales a dimension's scores so the lowest becomes 0.05 and the highest
 * 0.95, keeping their spacing; all-equal scores become 0.5. Unscored elements
 * unchanged, and nothing changes when nothing is scored.
 */
export const spreadScores = (dimensionId: string): Transform => ({ elements, scores }) => {
  const scored = elements
    .map(el => ({ id: el.id, value: scores[el.id]?.[dimensionId] }))
    .filter((entry): entry is { id: string; value: number } => entry.value !== undefined)
  if (scored.length === 0) return {}
  const values = scored.map(entry => entry.value)
  const min = Math.min(...values)
  const range = Math.max(...values) - min
  const next = { ...scores }
  for (const { id, value } of scored) {
    next[id] = { ...next[id], [dimensionId]: range === 0 ? 0.5 : 0.05 + ((value - min) / range) * 0.9 }
  }
  return { scores: next }
}

// ── From element weight ───────────────────────────────────────────────────────

/** Scores every element from its place in the current weight range; `flip` sends the heaviest to pole A. */
export const scoresFromWeights = (dimensionId: string, flip: boolean): Transform => ({ elements, scores }) => {
  const next = { ...scores }
  const range = numericRange(elements.map(el => el.weight))
  for (const el of elements) {
    const raw = normalizeInRange(el.weight, range)
    next[el.id] = { ...next[el.id], [dimensionId]: flip ? 1 - raw : raw }
  }
  return { scores: next }
}

// ── Between collections, shapes and colours ───────────────────────────────────

/**
 * Colour as the even mix of every collection an element belongs to, as a map
 * coloured by collection draws it. Elements in no collection keep theirs.
 */
export const colorFromCollections: Transform = eachElement((el, { collections }) => {
  const color = mixCollectionColors(el, collections)
  return color === null ? null : { color }
})

/**
 * Shape from the element's first collection in collection order: circle,
 * square, triangle, diamond, cycling. Elements in no collection unchanged.
 */
export const shapeFromCollections: Transform = eachElement((el, { collections }) => {
  const index = collections.findIndex(c => el.collectionIds.includes(c.id))
  return index === -1 ? null : { shape: ELEMENT_SHAPES[index % ELEMENT_SHAPES.length] }
})

/**
 * Membership from shape, mirroring shapeFromCollections: circle joins the 1st,
 * 5th… collection, square the 2nd, 6th…. Membership is replaced outright.
 */
export const collectionsFromShape: Transform = eachElement((el, { collections }) => ({
  collectionIds: collections
    .filter((_, i) => i % ELEMENT_SHAPES.length === ELEMENT_SHAPES.indexOf(el.shape))
    .map(c => c.id)
}))

const SHAPE_COLORS: Record<ElementShape, string> = {
  circle:   '#4080c0',
  square:   '#c04040',
  triangle: '#40a040',
  diamond:  '#a040a0'
}

export const colorFromShape: Transform = eachElement(el => ({ color: SHAPE_COLORS[el.shape] }))

/** Shape by hue: red → circle, yellow-green → square, blue → triangle, purple → diamond. */
export const shapeFromColor: Transform = eachElement(el => {
  const hue = hexHue(el.color)
  return {
    shape: hue < 30 || hue >= 330 ? 'circle'
      : hue < 150 ? 'square'
      : hue < 270 ? 'triangle'
      : 'diamond'
  }
})

/**
 * Palette colours for collections still on the legacy default gray, leaving
 * chosen colours alone; for sessions made before the palette existed.
 */
export const paletteForUncolored: Transform = ({ collections }) => ({
  collections: collections.map((c, i) => c.color === DEFAULT_COLLECTION_COLOR ? { ...c, color: paletteColor(i) } : c)
})

// ── Randomizers ───────────────────────────────────────────────────────────────

export const randomScores = (dimensionId: string): Transform => ({ elements, scores }) => {
  const next = { ...scores }
  for (const el of elements) next[el.id] = { ...next[el.id], [dimensionId]: Math.random() }
  return { scores: next }
}

export const randomElementWeights: Transform = eachElement(() => ({ weight: randomWeight() }))
export const randomElementColors: Transform = eachElement(() => ({ color: randomReadableColor() }))
export const randomElementShapes: Transform = eachElement(() => ({
  shape: ELEMENT_SHAPES[Math.floor(Math.random() * ELEMENT_SHAPES.length)]
}))

/** Each element joins each collection independently, with even odds. */
export const randomCollectionAssignments: Transform = eachElement((_, { collections }) => ({
  collectionIds: collections.filter(() => Math.random() < 0.5).map(c => c.id)
}))

export const randomDimensionWeight = (dimensionId: string): Transform => ({ dimensions }) => ({
  dimensions: dimensions.map(d => d.id === dimensionId ? { ...d, weight: randomWeight() } : d)
})

export const randomCollectionColors: Transform = ({ collections }) => ({
  collections: collections.map(c => ({ ...c, color: randomReadableColor() }))
})

/**
 * Every randomizer at once, as one change: each element's weight, color,
 * shape and collections, each dimension's weight, each collection's color,
 * and every element's score on every dimension. For filling a blank study
 * quickly, or scrambling one.
 */
export const randomizeAll: Transform = study => {
  const steps: Transform[] = [
    randomElementWeights, randomElementColors, randomElementShapes, randomCollectionAssignments,
    randomCollectionColors,
    ({ dimensions }) => ({ dimensions: dimensions.map(d => ({ ...d, weight: randomWeight() })) }),
    ...study.dimensions.map(d => randomScores(d.id))
  ]
  let next = study
  for (const step of steps) next = { ...next, ...step(next) }
  return { elements: next.elements, dimensions: next.dimensions, collections: next.collections, scores: next.scores }
}
