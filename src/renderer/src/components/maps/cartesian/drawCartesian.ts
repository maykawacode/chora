// ── Cartesian map renderer ────────────────────────────────────────────────────
//
// Pure canvas drawing function — no React, no side effects.
// Called on every render pass from MapPanel's ResizeObserver and Zustand
// subscription. The canvas is sized to the wrapper div via devicePixelRatio
// scaling so it looks sharp on retina displays.
//
// Coordinate system:
//   - Score 0.0 maps to the left/bottom edge of the plot area
//   - Score 1.0 maps to the right/top edge
//   - Y axis is inverted (canvas y grows downward, scores grow upward)

import type { CartesianMapConfig, Element, Dimension, ScoreMap } from '../../../lib/types'

// Space reserved on each side of the canvas for pole labels
export const MARGIN = 58

// Dot radius range — weight 1 → DOT_MIN_RADIUS, weight 100 → DOT_MAX_RADIUS
export const DOT_MIN_RADIUS = 6
export const DOT_MAX_RADIUS = 38
// Uniform radius used when sizeByWeight is off — same as weight=1 so the smallest
// weighted dot and the uniform dot are the same visual size.
export const DOT_DEFAULT_RADIUS = DOT_MIN_RADIUS

// Gap between dot edge and element name label
const LABEL_OFFSET = 8

// Default label size used when callers don't supply an explicit size.
export const LABEL_SIZE_DEFAULT = 11

// Builds the canvas font string for any given pixel size.
// Exported so drawSemantic can share the same typeface without duplicating it.
// Called with a runtime size so P5-20 preference values flow through cleanly.
export function labelFont(size: number): string {
  return `${size}px -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif`
}

// Maps element.shape string to the numeric index expected by drawShape().
// Exported so drawSemantic can reuse it without duplicating the mapping.
export const SHAPE_INDEX: Record<string, number> = { circle: 0, square: 1, triangle: 2, diamond: 3 }

// Shape cycle: circle → square → triangle → diamond, keyed to element index
const SIN60 = Math.sin(Math.PI / 3)   // √3/2 ≈ 0.866
const COS60 = Math.cos(Math.PI / 3)   // 0.5

export function drawShape(ctx: CanvasRenderingContext2D, shapeIndex: number, cx: number, cy: number, r: number): void {
  const s = r / Math.SQRT2   // half-side of circumscribed square
  ctx.beginPath()
  switch (shapeIndex % 4) {
    case 0: // circle
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      break
    case 1: { // square (axis-aligned, corners at circumradius r) — 15% larger than circle
      const ss = s * 1.25
      ctx.rect(cx - ss, cy - ss, ss * 2, ss * 2)
      break
    }
    case 2: { // equilateral triangle, pointing up — 15% larger than other shapes
      const tr = r * 1.28
      ctx.moveTo(cx,               cy - tr)
      ctx.lineTo(cx + tr * SIN60,  cy + tr * COS60)
      ctx.lineTo(cx - tr * SIN60,  cy + tr * COS60)
      ctx.closePath()
      break
    }
    case 3: // diamond (square rotated 45°)
      ctx.moveTo(cx,     cy - r)
      ctx.lineTo(cx + r, cy)
      ctx.lineTo(cx,     cy + r)
      ctx.lineTo(cx - r, cy)
      ctx.closePath()
      break
  }
}

export function drawCartesian(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  config: CartesianMapConfig,
  elements: Element[],
  dimensions: Dimension[],
  scores: ScoreMap,
  selectedElementId?: string,
  elementLabelSize: number = LABEL_SIZE_DEFAULT,
  dimensionLabelSize: number = LABEL_SIZE_DEFAULT,
  selectedElementIds: string[] = []
): void {
  const plotLeft   = MARGIN
  const plotTop    = MARGIN
  const plotRight  = W - MARGIN
  const plotBottom = H - MARGIN
  const plotW      = plotRight - plotLeft
  const plotH      = plotBottom - plotTop

  const xDim = dimensions.find(d => d.id === config.xDimensionId)
  const yDim = dimensions.find(d => d.id === config.yDimensionId)

  // ── Background ───────────────────────────────────────────────────────────────

  ctx.clearRect(0, 0, W, H)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(plotLeft, plotTop, plotW, plotH)

  // ── Plot border ───────────────────────────────────────────────────────────────

  ctx.strokeStyle = '#444'
  ctx.lineWidth = 1
  ctx.strokeRect(plotLeft, plotTop, plotW, plotH)

  // ── Quadrant crosshair ────────────────────────────────────────────────────────

  const midX = plotLeft + plotW / 2
  const midY = plotTop  + plotH / 2

  ctx.strokeStyle = '#ccc'
  ctx.lineWidth = 1
  ctx.setLineDash([4, 4])

  ctx.beginPath()
  ctx.moveTo(midX, plotTop);   ctx.lineTo(midX, plotBottom)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(plotLeft, midY);  ctx.lineTo(plotRight, midY)
  ctx.stroke()

  ctx.setLineDash([])

  // ── Pole labels ───────────────────────────────────────────────────────────────
  //
  // Labels are drawn in the MARGIN region outside the plot border.
  // Flip flags swap which pole label appears on which end.

  ctx.font = labelFont(dimensionLabelSize)
  ctx.fillStyle = '#333'
  ctx.textBaseline = 'middle'

  if (xDim) {
    const leftLabel  = config.xFlipped ? xDim.poleB : xDim.poleA
    const rightLabel = config.xFlipped ? xDim.poleA : xDim.poleB
    ctx.textAlign = 'left';  ctx.fillText(leftLabel,  22,     midY)
    ctx.textAlign = 'right'; ctx.fillText(rightLabel, W - 22, midY)
  }

  if (yDim) {
    const topLabel    = config.yFlipped ? yDim.poleA : yDim.poleB
    const bottomLabel = config.yFlipped ? yDim.poleB : yDim.poleA
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top';    ctx.fillText(topLabel,    midX, 22)
    ctx.textBaseline = 'bottom'; ctx.fillText(bottomLabel, midX, H - 22)
  }

  // ── Elements ──────────────────────────────────────────────────────────────────
  //
  // Only elements with scores on BOTH axes are drawn.
  // When sizeByWeight=true: radius scales linearly with weight (DOT_MIN → DOT_MAX).
  // When sizeByWeight=false: all elements use DOT_DEFAULT_RADIUS uniformly.

  if (!xDim || !yDim) return

  // When sizing by weight, draw heaviest first so lighter (smaller) dots sit on top.
  // When uniform size, preserve store order (no visual reason to sort).
  const sorted = config.sizeByWeight
    ? [...elements].sort((a, b) => b.weight - a.weight)
    : elements

  for (const el of sorted) {
    const xScore = scores[el.id]?.[xDim.id]
    const yScore = scores[el.id]?.[yDim.id]

    // Unscored or partially scored: use 0.5 as placeholder for any missing axis
    const isPartial = xScore === undefined || yScore === undefined
    const rawX = xScore ?? 0.5
    const rawY = yScore ?? 0.5

    // Apply flip: flipped score = 1 - raw score
    const ex = config.xFlipped ? 1 - rawX : rawX
    const ey = config.yFlipped ? 1 - rawY : rawY

    const cx = plotLeft + ex * plotW
    const cy = plotTop  + (1 - ey) * plotH   // invert Y — higher score = higher on canvas
    const r  = config.sizeByWeight
      ? DOT_MIN_RADIUS + (el.weight - 1) / 99 * (DOT_MAX_RADIUS - DOT_MIN_RADIUS)
      : DOT_MIN_RADIUS

    if (config.showDots) {
      drawShape(ctx, SHAPE_INDEX[el.shape] ?? 0, cx, cy, r)
      if (isPartial) {
        ctx.fillStyle = '#ffffff'
        ctx.fill()
        ctx.setLineDash([3, 3])
        ctx.strokeStyle = '#cc0000'
        ctx.lineWidth = 1.5
        ctx.stroke()
        ctx.setLineDash([])
      } else {
        ctx.fillStyle = el.color
        ctx.fill()
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 1.5
        ctx.stroke()
      }

      if (el.id === selectedElementId && selectedElementIds.length === 0) {
        drawShape(ctx, SHAPE_INDEX[el.shape] ?? 0, cx, cy, r + 3)
        ctx.strokeStyle = '#e8c040'
        ctx.lineWidth = 2
        ctx.stroke()
      }
      if (selectedElementIds.includes(el.id)) {
        drawShape(ctx, SHAPE_INDEX[el.shape] ?? 0, cx, cy, r + 3)
        ctx.strokeStyle = '#e8c040'
        ctx.lineWidth = 2
        ctx.stroke()
      }
    }

    if (config.showLabels) {
      ctx.font = labelFont(elementLabelSize)
      ctx.fillStyle = isPartial ? '#cc0000' : '#222'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText(el.name, cx, cy)
    }
  }
}
