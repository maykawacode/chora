// ── Semantic map renderer ─────────────────────────────────────────────────────
//
// Pure canvas drawing function — no React, no side effects.
// A semantic (differential) map shows multiple horizontal axes stacked
// vertically. Each axis represents one dimension; each element is drawn as
// a colored polyline connecting its score positions across all axes.
//
// Coordinate system:
//   - Score 0.0 maps to the left end of each axis (after applying flip)
//   - Score 1.0 maps to the right end
//   - Axes are evenly spaced vertically within the canvas

import type { SemanticMapConfig, Element, Dimension, ScoreMap } from '../../../lib/types'
import { drawShape } from '../cartesian/drawCartesian'

// Horizontal margin — space reserved on each side for pole labels
export const SEM_MARGIN_H = 96

// Vertical margin — space reserved above the first and below the last axis
export const SEM_MARGIN_V = 50

// Radius of the score dot drawn at each element × dimension intersection
export const SEM_DOT_R = 6

// Gap between axis end and pole label text
const LABEL_GAP = 6

export function drawSemantic(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  config: SemanticMapConfig,
  elements: Element[],
  dimensions: Dimension[],
  scores: ScoreMap
): void {
  // Resolve dimension IDs to full objects, preserving config order
  const dims = config.dimensionIds
    .map(id => dimensions.find(d => d.id === id))
    .filter((d): d is Dimension => d !== undefined)

  // If elementIds is populated, draw only those elements in that order;
  // otherwise fall back to the full element list
  const els = config.elementIds.length > 0
    ? config.elementIds
        .map(id => elements.find(e => e.id === id))
        .filter((e): e is Element => e !== undefined)
    : elements

  // Global element index → shape, so shape is consistent across all maps
  const elementIndexMap = new Map(elements.map((el, i) => [el.id, i]))

  ctx.clearRect(0, 0, W, H)

  ctx.fillStyle = '#fafaf8'
  ctx.fillRect(0, 0, W, H)

  if (dims.length === 0) {
    // Placeholder when no dimensions are selected
    ctx.fillStyle = '#999'
    ctx.font = '13px -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('No dimensions selected.', W / 2, H / 2)
    return
  }

  const axisLeft  = SEM_MARGIN_H
  const axisRight = W - SEM_MARGIN_H
  const axisWidth = axisRight - axisLeft

  // Evenly distribute axes vertically; single dimension gets centered
  const axisYs: number[] = dims.length === 1
    ? [H / 2]
    : dims.map((_, i) => SEM_MARGIN_V + i * (H - 2 * SEM_MARGIN_V) / (dims.length - 1))

  // ── Draw axes ─────────────────────────────────────────────────────────────────

  ctx.font = '11px -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif'

  for (let i = 0; i < dims.length; i++) {
    const dim = dims[i]
    const y   = axisYs[i]

    // Axis line
    ctx.strokeStyle = '#aaa'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(axisLeft, y)
    ctx.lineTo(axisRight, y)
    ctx.stroke()

    // End ticks — short vertical marks at each end of the axis
    ctx.beginPath()
    ctx.moveTo(axisLeft,  y - 4); ctx.lineTo(axisLeft,  y + 4)
    ctx.moveTo(axisRight, y - 4); ctx.lineTo(axisRight, y + 4)
    ctx.stroke()

    // Pole labels — swap sides when the dimension is flipped
    const isFlipped  = config.flippedDimensionIds.includes(dim.id)
    const leftLabel  = isFlipped ? dim.poleB : dim.poleA
    const rightLabel = isFlipped ? dim.poleA : dim.poleB

    ctx.fillStyle = '#333'
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle'
    ctx.fillText(leftLabel,  axisLeft  - LABEL_GAP, y)
    ctx.textAlign = 'left'
    ctx.fillText(rightLabel, axisRight + LABEL_GAP, y)
  }

  // ── Draw element polylines ────────────────────────────────────────────────────
  //
  // For each element we collect the (x, y) canvas position for every dimension
  // it has been scored on, then connect them with a polyline in the element's
  // color. Unscored dimensions create a gap — the polyline segment simply skips
  // that axis rather than connecting to an arbitrary midpoint.

  for (const el of els) {
    const shapeIndex = elementIndexMap.get(el.id) ?? 0
    const points: Array<{ x: number; y: number }> = []

    for (let i = 0; i < dims.length; i++) {
      const raw = scores[el.id]?.[dims[i].id]
      if (raw === undefined) continue   // element not scored on this dimension — skip
      const score = config.flippedDimensionIds.includes(dims[i].id) ? 1 - raw : raw
      points.push({ x: axisLeft + score * axisWidth, y: axisYs[i] })
    }

    if (points.length === 0) continue   // element has no scores — nothing to draw

    // Polyline
    ctx.strokeStyle = el.color
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(points[0].x, points[0].y)
    for (let p = 1; p < points.length; p++) ctx.lineTo(points[p].x, points[p].y)
    ctx.stroke()

    // Score dots at each scored position
    if (config.showDots) {
      for (const pt of points) {
        drawShape(ctx, shapeIndex, pt.x, pt.y, SEM_DOT_R)
        ctx.fillStyle = el.color
        ctx.fill()
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 1.5
        ctx.stroke()
      }
    }

    // Element name label — placed just to the right of the last scored point
    if (config.showLabels) {
      const last = points[points.length - 1]
      ctx.font = '11px -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif'
      ctx.fillStyle = '#222'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText(el.name, last.x + SEM_DOT_R + 4, last.y)
    }
  }
}
