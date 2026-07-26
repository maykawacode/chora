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
// SHAPE_INDEX, labelFont, LABEL_SIZE_DEFAULT and NEUTRAL_COLOR are defined once
// in drawCartesian and shared here so there is a single source of truth.
import { drawShape, SHAPE_INDEX, labelFont, LABEL_SIZE_DEFAULT, NEUTRAL_COLOR } from '../cartesian/drawCartesian'

// Horizontal margin — space reserved on each side for pole labels
export const SEM_MARGIN_H = 96

// Vertical margin — space reserved above the first and below the last axis.
// Top margin is sized to fit 45° element labels above the topmost axis dots.
export const SEM_MARGIN_V = 85

// Radius of the score dot drawn at each element × dimension intersection,
// and the ceiling when config.sizeByWeight scales dots by element weight.
//
// The weighted ceiling is deliberately far below the cartesian map's 38px:
// semantic axes are stacked only ~110px apart in a default window, so full-size
// dots would collide across neighbouring rows and bury the axis lines.
export const SEM_DOT_R     = 6
export const SEM_DOT_MAX_R = 18

/**
 * Radius of an element's dot, honouring the weight-sizing toggle.
 * Exported so MapPanel's hit-testing matches what's actually painted.
 */
export function semDotRadius(config: SemanticMapConfig, weight: number): number {
  return config.sizeByWeight
    ? SEM_DOT_R + (weight - 1) / 99 * (SEM_DOT_MAX_R - SEM_DOT_R)
    : SEM_DOT_R
}

// Gap between axis end and pole label text
const LABEL_GAP = 6

export function drawSemantic(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  config: SemanticMapConfig,
  elements: Element[],
  dimensions: Dimension[],
  scores: ScoreMap,
  draggingElementId?: string,
  selectedElementId?: string,
  elementLabelSize: number = LABEL_SIZE_DEFAULT,
  dimensionLabelSize: number = LABEL_SIZE_DEFAULT,
  selectedElementIds: string[] = []
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

  ctx.font = labelFont(dimensionLabelSize)

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

  // Heaviest first when sizing by weight, so lighter (smaller) dots and their
  // polylines stay visible on top — same ordering rule as the cartesian map.
  const drawOrder = config.sizeByWeight
    ? [...els].sort((a, b) => b.weight - a.weight)
    : els

  for (const el of drawOrder) {
    const shapeIndex = SHAPE_INDEX[el.shape] ?? 0
    const color      = config.showColors ? el.color : NEUTRAL_COLOR
    const dotR       = semDotRadius(config, el.weight)
    const points: Array<{ x: number; y: number }> = []

    for (let i = 0; i < dims.length; i++) {
      const raw = scores[el.id]?.[dims[i].id]
      if (raw === undefined) continue   // element not scored on this dimension — skip
      const score = config.flippedDimensionIds.includes(dims[i].id) ? 1 - raw : raw
      points.push({ x: axisLeft + score * axisWidth, y: axisYs[i] })
    }

    if (points.length === 0) continue   // element has no scores — nothing to draw

    // Polyline — 2x weight while this element is being dragged
    ctx.strokeStyle = color
    ctx.lineWidth = draggingElementId === el.id ? 4 : 2
    ctx.beginPath()
    ctx.moveTo(points[0].x, points[0].y)
    for (let p = 1; p < points.length; p++) ctx.lineTo(points[p].x, points[p].y)
    ctx.stroke()

    // Score dots at each scored position
    if (config.showDots) {
      const isSelected = selectedElementIds.includes(el.id)
        || (el.id === selectedElementId && selectedElementIds.length === 0)

      for (const pt of points) {
        drawShape(ctx, shapeIndex, pt.x, pt.y, dotR)
        ctx.fillStyle = color
        ctx.fill()
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 1.5
        ctx.stroke()

        if (isSelected) {
          drawShape(ctx, shapeIndex, pt.x, pt.y, dotR + 3)
          ctx.strokeStyle = '#e8c040'
          ctx.lineWidth = 2
          ctx.stroke()
        }
      }
    }

    // Element name label — 45° upward from the topmost scored dot
    if (config.showLabels) {
      const top = points[0]
      // Scale the truncation budget proportionally with font size so labels
      // don't get clipped more aggressively just because the user made them
      // larger. Base budget of 88px is calibrated for the default 11px size.
      const MAX_LABEL_W = 88 * (elementLabelSize / LABEL_SIZE_DEFAULT)
      ctx.font = labelFont(elementLabelSize)

      let label = el.name
      if (ctx.measureText(label).width > MAX_LABEL_W) {
        while (label.length > 1 && ctx.measureText(label + '…').width > MAX_LABEL_W) {
          label = label.slice(0, -1)
        }
        label += '…'
      }

      ctx.save()
      ctx.translate(top.x, top.y - dotR - 3)
      ctx.rotate(-Math.PI / 4)
      ctx.fillStyle = '#222'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'bottom'
      ctx.fillText(label, 0, 0)
      ctx.restore()
    }
  }
}
