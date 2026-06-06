import type { SemanticMapConfig, Element, Dimension, ScoreMap } from '../../../lib/types'

export const SEM_MARGIN_H = 96
export const SEM_MARGIN_V = 20
const MARGIN_H  = SEM_MARGIN_H
const MARGIN_V  = SEM_MARGIN_V
const LABEL_GAP = 6
const DOT_R     = 4

export function drawSemantic(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  config: SemanticMapConfig,
  elements: Element[],
  dimensions: Dimension[],
  scores: ScoreMap
): void {
  const dims = config.dimensionIds
    .map(id => dimensions.find(d => d.id === id))
    .filter((d): d is Dimension => d !== undefined)

  const els = config.elementIds.length > 0
    ? config.elementIds.map(id => elements.find(e => e.id === id)).filter((e): e is Element => e !== undefined)
    : elements

  ctx.clearRect(0, 0, W, H)

  // Background
  ctx.fillStyle = '#fafaf8'
  ctx.fillRect(0, 0, W, H)

  if (dims.length === 0) {
    ctx.fillStyle = '#999'
    ctx.font = '13px -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('No dimensions selected.', W / 2, H / 2)
    return
  }

  const axisLeft  = MARGIN_H
  const axisRight = W - MARGIN_H
  const axisWidth = axisRight - axisLeft

  const axisYs: number[] = dims.length === 1
    ? [H / 2]
    : dims.map((_, i) => MARGIN_V + i * (H - 2 * MARGIN_V) / (dims.length - 1))

  // ── Axes ────────────────────────────────────────────────────────────────────
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

    // End ticks
    ctx.beginPath()
    ctx.moveTo(axisLeft,  y - 4); ctx.lineTo(axisLeft,  y + 4)
    ctx.moveTo(axisRight, y - 4); ctx.lineTo(axisRight, y + 4)
    ctx.stroke()

    const isFlipped = config.flippedDimensionIds.includes(dim.id)
    const leftLabel  = isFlipped ? dim.poleB : dim.poleA
    const rightLabel = isFlipped ? dim.poleA : dim.poleB

    ctx.fillStyle = '#333'
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    ctx.fillText(leftLabel,  axisLeft  - LABEL_GAP, y)
    ctx.textAlign = 'left'
    ctx.fillText(rightLabel, axisRight + LABEL_GAP, y)
  }

  // ── Element lines ────────────────────────────────────────────────────────────
  for (const el of els) {
    const points: Array<{ x: number; y: number }> = []

    for (let i = 0; i < dims.length; i++) {
      const raw = scores[el.id]?.[dims[i].id]
      if (raw === undefined) continue
      const score = config.flippedDimensionIds.includes(dims[i].id) ? 1 - raw : raw
      points.push({ x: axisLeft + score * axisWidth, y: axisYs[i] })
    }

    if (points.length === 0) continue

    // Polyline
    ctx.strokeStyle = el.color
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(points[0].x, points[0].y)
    for (let p = 1; p < points.length; p++) {
      ctx.lineTo(points[p].x, points[p].y)
    }
    ctx.stroke()

    // Dots
    for (const pt of points) {
      ctx.beginPath()
      ctx.arc(pt.x, pt.y, DOT_R, 0, Math.PI * 2)
      ctx.fillStyle = el.color
      ctx.fill()
      ctx.strokeStyle = 'rgba(0,0,0,0.3)'
      ctx.lineWidth = 1
      ctx.stroke()
    }

    // Name label at rightmost point
    if (config.showLabels) {
      const last = points[points.length - 1]
      ctx.font = '11px -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif'
      ctx.fillStyle = '#222'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText(el.name, last.x + DOT_R + 4, last.y)
    }
  }
}
