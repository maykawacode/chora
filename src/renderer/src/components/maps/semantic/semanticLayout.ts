// ── Semantic map layout ───────────────────────────────────────────────────────
//
// Where a semantic map's axes sit at a given canvas size. Drawing, hit-testing
// and dragging all read this one layout, so a click always lands on what was
// drawn. The side margins are sized from the measured pole labels: short labels
// keep the familiar 96px margin, longer ones widen it up to a share of the map,
// and anything longer still is shortened with an ellipsis so it stays on the map.

import type { Dimension, SemanticMapConfig } from '../../../lib/types'
import { labelFont } from '../cartesian/drawCartesian'

/** Narrowest side margin; labels that fit in it leave the axes where they always were. */
const MIN_MARGIN_H = 96
/** Widest side margin, as a share of the map's width (never below the minimum). */
const MAX_MARGIN_SHARE = 0.3

// Vertical margin — space reserved above the first and below the last axis.
// Top margin is sized to fit 45° element labels above the topmost axis dots.
export const SEM_MARGIN_V = 85

/** Gap between an axis end and its pole label. */
export const LABEL_GAP = 6
/** Space kept between any label and the map's edge. */
export const EDGE_PAD = 8

export interface SemanticAxis {
  dimension: Dimension
  y: number
  flipped: boolean
  /** Pole labels as drawn: swapped when flipped, shortened to fit their margin. */
  leftLabel: string
  rightLabel: string
}

export interface SemanticLayout {
  axisLeft: number
  axisRight: number
  axes: SemanticAxis[]
}

export type MeasureText = (text: string, font: string) => number

let scratch: CanvasRenderingContext2D | null = null
const measured = new Map<string, number>()

/** Text width in a font, measured once per pair (labels are re-measured every frame otherwise). */
export const measureText: MeasureText = (text, font) => {
  const key = `${font}\n${text}`
  let width = measured.get(key)
  if (width === undefined) {
    scratch ??= document.createElement('canvas').getContext('2d')!
    scratch.font = font
    width = scratch.measureText(text).width
    if (measured.size > 5000) measured.clear()
    measured.set(key, width)
  }
  return width
}

/** `text`, shortened with an ellipsis if needed to fit within `maxWidth`. */
export function fitText(text: string, maxWidth: number, font: string, measure: MeasureText = measureText): string {
  if (measure(text, font) <= maxWidth) return text
  let fitted = text
  while (fitted.length > 1 && measure(fitted + '…', font) > maxWidth) fitted = fitted.slice(0, -1)
  return fitted + '…'
}

/** Axis heights: evenly spread between the margins; a single axis is centered. */
export function axisYs(height: number, count: number): number[] {
  if (count === 0) return []
  if (count === 1) return [height / 2]
  return Array.from({ length: count }, (_, i) => SEM_MARGIN_V + i * (height - 2 * SEM_MARGIN_V) / (count - 1))
}

export function semanticLayout(
  width: number,
  height: number,
  config: SemanticMapConfig,
  dimensions: Dimension[],
  labelSize: number,
  measure: MeasureText = measureText
): SemanticLayout {
  const byId = new Map(dimensions.map(d => [d.id, d]))
  const flipped = new Set(config.flippedDimensionIds)
  const dims = config.dimensionIds.map(id => byId.get(id)).filter((d): d is Dimension => d !== undefined)
  const poles = dims.map(d => flipped.has(d.id) ? [d.poleB, d.poleA] : [d.poleA, d.poleB])

  const font = labelFont(labelSize)
  const maxMargin = Math.max(MIN_MARGIN_H, width * MAX_MARGIN_SHARE)
  const marginFor = (labels: string[]): number => {
    const widest = Math.max(0, ...labels.map(l => measure(l, font)))
    return Math.min(maxMargin, Math.max(MIN_MARGIN_H, widest + LABEL_GAP + EDGE_PAD))
  }
  const left = marginFor(poles.map(p => p[0]))
  const right = marginFor(poles.map(p => p[1]))
  const ys = axisYs(height, dims.length)

  return {
    axisLeft: left,
    axisRight: width - right,
    axes: dims.map((dimension, i) => ({
      dimension,
      y: ys[i],
      flipped: flipped.has(dimension.id),
      leftLabel: fitText(poles[i][0], left - LABEL_GAP - EDGE_PAD, font, measure),
      rightLabel: fitText(poles[i][1], right - LABEL_GAP - EDGE_PAD, font, measure)
    }))
  }
}

/** Canvas x of a raw score on an axis. */
export function axisX(layout: SemanticLayout, axis: SemanticAxis, raw: number): number {
  const score = axis.flipped ? 1 - raw : raw
  return layout.axisLeft + score * (layout.axisRight - layout.axisLeft)
}

/** Raw score at canvas x on an axis, clamped to the axis ends. */
export function scoreAtX(layout: SemanticLayout, axis: SemanticAxis, x: number): number {
  const { axisLeft, axisRight } = layout
  const score = (Math.max(axisLeft, Math.min(axisRight, x)) - axisLeft) / (axisRight - axisLeft)
  return axis.flipped ? 1 - score : score
}
