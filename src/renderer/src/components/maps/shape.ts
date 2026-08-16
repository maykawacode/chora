// ── Element marks ─────────────────────────────────────────────────────────────
//
// The symbol drawn at an element's position, and the policy deciding which one.
// Both painters need it, so it lives here rather than in either of them — the
// semantic map used to import its shape drawing from the cartesian painter,
// which had one map type depending on another for no reason.
//
// Three modes, chosen per map in the sidebar's Elements section:
//   'none'    — no mark at all
//   'circle'  — every element a circle, whatever shape it carries
//   'element' — each element's own shape attribute
//
// Shapes are addressed by index rather than by name because the store's
// conversions think in cycles — "1st type circle, 2nd square, …" — and an index
// wraps naturally. ELEMENT_SHAPES in lib/types.ts fixes that order.

import type { Element, MarkMode } from '../../lib/types'
import { uiTheme } from '../../design/theme'

// Element.shape → the index drawMark expects.
export const SHAPE_INDEX: Record<string, number> = { circle: 0, square: 1, triangle: 2, diamond: 3 }

const CIRCLE = SHAPE_INDEX.circle

/**
 * Which shape to draw for one element, or null to draw no mark at all.
 *
 * Returning null rather than exposing the mode lets a painter ask once and
 * branch once; neither of them knows what the modes are.
 */
export function markShapeIndex(mode: MarkMode, el: Element): number | null {
  switch (mode) {
    case 'none':    return null
    case 'circle':  return CIRCLE
    case 'element': return SHAPE_INDEX[el.shape] ?? CIRCLE
  }
}

// ── Geometry ──────────────────────────────────────────────────────────────────

const SIN60 = Math.sin(Math.PI / 3)   // √3/2 ≈ 0.866
const COS60 = Math.cos(Math.PI / 3)   // 0.5

/**
 * Traces one mark centered on (cx, cy) at radius r. Only builds the path —
 * the caller fills and strokes it, which is what lets the same call serve a
 * dot, its selection ring, and the dashed ring on an unscored element.
 *
 * Square and triangle are drawn slightly large on purpose: matched to a circle
 * by circumradius they read as smaller, because less of the area near the
 * radius is filled.
 */
export function drawMark(
  ctx: CanvasRenderingContext2D,
  shapeIndex: number,
  cx: number,
  cy: number,
  r: number
): void {
  const s = r / Math.SQRT2   // half-side of circumscribed square
  ctx.beginPath()
  switch (shapeIndex % 4) {
    case 0: // circle
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      break
    case 1: { // square, axis-aligned
      const ss = s * 1.25
      ctx.rect(cx - ss, cy - ss, ss * 2, ss * 2)
      break
    }
    case 2: { // equilateral triangle, pointing up
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

/** White halo plus graphite outline shared by both map renderers. */
export function drawSelectionRing(
  ctx: CanvasRenderingContext2D,
  shapeIndex: number,
  cx: number,
  cy: number,
  r: number
): void {
  drawMark(ctx, shapeIndex, cx, cy, r + 3)
  ctx.strokeStyle = uiTheme.map.outline
  ctx.lineWidth = 4
  ctx.stroke()

  drawMark(ctx, shapeIndex, cx, cy, r + 3)
  ctx.strokeStyle = uiTheme.map.selection
  ctx.lineWidth = 2
  ctx.stroke()
}
