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

import { ELEMENT_SHAPES, type Element, type MapConfig, type MarkMode } from '../../lib/types'
import { normalizeInRange, type NumericRange } from '../../lib/numericRange'
import { uiTheme } from '../../design/theme'

const CIRCLE = 0

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
    case 'element': return Math.max(CIRCLE, ELEMENT_SHAPES.indexOf(el.shape))
  }
}

// ── Size ──────────────────────────────────────────────────────────────────────
//
// Every mark starts at the default radius (a preference, kept within range).
// With config.sizeByWeight it grows with the element's weight across the
// current Element range, up to a ceiling per map type. The semantic ceiling is
// far below the cartesian one: its axes sit only ~110px apart in a default
// window, so full-size dots would collide across rows and bury the axis lines.

export const DOT_DEFAULT_RADIUS = 6
const DOT_DEFAULT_RADIUS_MIN = 3
const DOT_DEFAULT_RADIUS_MAX = 16
export const DOT_MAX_RADIUS: Record<MapConfig['type'], number> = { cartesian: 76, semantic: 18 }

/** Keeps saved or hand-edited preferences inside the range supported by maps. */
export function normalizeDefaultDotRadius(radius: number = DOT_DEFAULT_RADIUS): number {
  if (!Number.isFinite(radius)) return DOT_DEFAULT_RADIUS
  return Math.max(DOT_DEFAULT_RADIUS_MIN, Math.min(DOT_DEFAULT_RADIUS_MAX, radius))
}

/** An element's mark radius, shared by painting and hit-testing so large marks stay fully interactive. */
export function dotRadius(
  config: MapConfig,
  weight: number,
  range: NumericRange,
  defaultRadius: number = DOT_DEFAULT_RADIUS
): number {
  const base = normalizeDefaultDotRadius(defaultRadius)
  return config.sizeByWeight
    ? base + normalizeInRange(weight, range) * (DOT_MAX_RADIUS[config.type] - base)
    : base
}

// ── Geometry ──────────────────────────────────────────────────────────────────

const SIN60 = Math.sin(Math.PI / 3)   // √3/2 ≈ 0.866
const COS60 = Math.cos(Math.PI / 3)   // 0.5

// Each shape's size against r for an area of πr². Square half-side √π/2;
// triangle circumradius √(4π / 3√3); diamond half-diagonal √(π/2). The
// triangle is then trimmed 4% by eye: its long points make it read larger
// than its area.
const SQUARE_HALF_SIDE = Math.sqrt(Math.PI) / 2        // ≈ 0.886
const TRIANGLE_RADIUS  = Math.sqrt(4 * Math.PI / (3 * Math.sqrt(3))) * 0.96  // ≈ 1.493
const DIAMOND_RADIUS   = Math.sqrt(Math.PI / 2)        // ≈ 1.253

/**
 * One mark's outline at radius r around the origin: a circle, or the corners
 * of a polygon. Map painters and the dialogs' shape buttons both draw from it,
 * so a button looks exactly like the dot it sets.
 *
 * Every shape covers the same area as the circle of radius r, so all four
 * carry the same visual weight: matched by circumradius instead, the corners
 * reach the radius but less of the area inside it is filled, and they read
 * as smaller.
 */
export function markOutline(shapeIndex: number, r: number): 'circle' | [number, number][] {
  switch (shapeIndex % 4) {
    case 1: { // square, axis-aligned
      const h = r * SQUARE_HALF_SIDE
      return [[-h, -h], [h, -h], [h, h], [-h, h]]
    }
    case 2: { // equilateral triangle, pointing up
      const t = r * TRIANGLE_RADIUS
      return [[0, -t], [t * SIN60, t * COS60], [-t * SIN60, t * COS60]]
    }
    case 3: { // diamond (square rotated 45°)
      const d = r * DIAMOND_RADIUS
      return [[0, -d], [d, 0], [0, d], [-d, 0]]
    }
    default:
      return 'circle'
  }
}

/**
 * Traces one mark centered on (cx, cy) at radius r. Only builds the path —
 * the caller fills and strokes it, which is what lets the same call serve a
 * dot, its selection ring, and the dashed ring on an unscored element.
 */
export function drawMark(
  ctx: CanvasRenderingContext2D,
  shapeIndex: number,
  cx: number,
  cy: number,
  r: number
): void {
  const outline = markOutline(shapeIndex, r)
  ctx.beginPath()
  if (outline === 'circle') {
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    return
  }
  outline.forEach(([x, y], i) => i === 0 ? ctx.moveTo(cx + x, cy + y) : ctx.lineTo(cx + x, cy + y))
  ctx.closePath()
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

// ── Layers ────────────────────────────────────────────────────────────────────

/**
 * Starts a named group; close it with ctx.restore(). On screen this is a plain
 * save(); in export, svgcanvas opens a <g> that editors show as a layer.
 */
export function beginLayer(ctx: CanvasRenderingContext2D, name: string): void {
  ctx.save()
  // svgcanvas keeps the open <g> on this private field; a real canvas has none.
  const group = (ctx as unknown as { __currentElement?: SVGElement }).__currentElement
  if (group?.nodeName === 'g') group.setAttribute('id', name)
}
