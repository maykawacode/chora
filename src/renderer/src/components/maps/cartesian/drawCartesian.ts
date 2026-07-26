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
//
// Draw order: background → border → crosshair → pole labels → type blobs →
// element dots → element labels. Blobs go under the dots so dots stay readable.
//
// This renderer absorbed the former Type Projection map: the type overlay is
// now a toggle (config.showTypes) rather than a separate map type.

import type { CartesianMapConfig, Element, Dimension, Type, ScoreMap } from '../../../lib/types'
import { setBlobPath, BLOB_PADDING, type Pt } from '../blob'
import { resolveElementColor, resolveTypeColor } from '../color'

// Space reserved on each side of the canvas for pole labels
export const MARGIN = 58

// Dot radius range — weight 1 → DOT_MIN_RADIUS, weight 100 → DOT_MAX_RADIUS
export const DOT_MIN_RADIUS = 6
export const DOT_MAX_RADIUS = 38
// Uniform radius used when sizeByWeight is off — same as weight=1 so the smallest
// weighted dot and the uniform dot are the same visual size.
export const DOT_DEFAULT_RADIUS = DOT_MIN_RADIUS

// Gap between dot edge and element name label
const LABEL_OFFSET = 3

// Default label size used when callers don't supply an explicit size.
export const LABEL_SIZE_DEFAULT = 11

// Builds the canvas font string for any given pixel size.
// Exported so drawSemantic can share the same typeface without duplicating it.
// Called with a runtime size so P5-20 preference values flow through cleanly.
export function labelFont(size: number): string {
  return `${size}px -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif`
}

// ── Pole label geometry ───────────────────────────────────────────────────────
//
// All four pole labels are placed by one rule: centered on the midpoint of
// their plot edge, and centered within the MARGIN band between that edge and
// the canvas edge. Only the anchor point and, on the vertical edges, a quarter
// turn vary. That uniformity is the point — every label ends up the same
// distance from the plot border, and because each one now runs parallel to its
// own edge, none of them can grow inward and crowd the plot the way an
// unrotated horizontal label did.

// Distance from a plot edge out to the center line of its label. Half the
// margin puts the text midway between plot border and canvas edge on all sides.
const POLE_LABEL_OFFSET = MARGIN / 2

// Quarter turns for the vertical pair. Canvas rotation is clockwise (y grows
// downward), so TURN_CW points glyph tops to the right. The two turns are
// opposites, which mirrors the pair: the left label reads upward with its
// glyphs facing left, the right label reads downward with its glyphs facing
// right, so each leans away from the plot toward its own canvas edge.
const TURN_CW  =  Math.PI / 2
const TURN_CCW = -Math.PI / 2

/**
 * Half-length of a pole label's clickable band, measured parallel to its plot
 * edge. One value covers all four edges now that every label runs parallel to
 * its own; exported so MapPanel's axis hit-testing stays matched to what the
 * renderer actually draws.
 */
export const POLE_LABEL_HIT_SPAN = 50

/**
 * Draws a single pole label centered on (x, y), optionally turned a quarter
 * turn. Center alignment on both axes is what makes rotation safe: the text
 * pivots about its own middle, so a turned label occupies the same band as an
 * unturned one and needs no per-edge compensation.
 */
function drawPoleLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  rotation: number
): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(rotation)
  ctx.textAlign    = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 0, 0)
  ctx.restore()
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

/**
 * Returns the types this map is currently showing.
 * An empty config.typeIds means "all types" rather than "none".
 */
export function visibleTypes(config: CartesianMapConfig, types: Type[]): Type[] {
  return config.typeIds.length === 0 ? types : types.filter(t => config.typeIds.includes(t.id))
}

/**
 * Returns the elements this map is currently showing.
 *
 * An element is hidden only when every type it belongs to has been deselected.
 * Selection wins over deselection, so an element in both a selected and a
 * deselected type stays on the map — one surviving type is enough.
 *
 * An element belonging to no type at all is never hidden: it has no membership
 * that could be switched off, so it stays visible whatever the selection.
 *
 * Membership here means a score meeting config.threshold, so raising the
 * threshold can strand an element by dropping it out of the type that was
 * keeping it visible.
 *
 * This applies whether or not the blob overlay itself is switched on, so types
 * can be used purely as an element filter.
 *
 * Exported because MapPanel's hit-testing, dragging and lasso selection must
 * apply exactly the same rule — otherwise you could grab a dot you can't see.
 */
export function visibleElements(
  config: CartesianMapConfig,
  elements: Element[],
  types: Type[],
  scores: ScoreMap
): Element[] {
  if (config.typeIds.length === 0) return elements

  const isMember = (el: Element, t: Type): boolean => {
    const m = scores[el.id]?.[t.id]
    return m !== undefined && m >= config.threshold
  }

  const shown = visibleTypes(config, types)

  return elements.filter(el =>
    shown.some(t => isMember(el, t)) || !types.some(t => isMember(el, t))
  )
}

export function drawCartesian(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  config: CartesianMapConfig,
  elements: Element[],
  types: Type[],
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
  // Drawn in the MARGIN band outside the plot border, one per edge, all through
  // drawPoleLabel so the spacing is identical on all four sides by construction
  // rather than by four matching magic numbers. Flip flags swap which pole
  // label appears on which end.

  ctx.font = labelFont(dimensionLabelSize)
  ctx.fillStyle = '#333'

  if (xDim) {
    const leftLabel  = config.xFlipped ? xDim.poleB : xDim.poleA
    const rightLabel = config.xFlipped ? xDim.poleA : xDim.poleB
    drawPoleLabel(ctx, leftLabel,  plotLeft  - POLE_LABEL_OFFSET, midY, TURN_CCW)
    drawPoleLabel(ctx, rightLabel, plotRight + POLE_LABEL_OFFSET, midY, TURN_CW)
  }

  if (yDim) {
    const topLabel    = config.yFlipped ? yDim.poleA : yDim.poleB
    const bottomLabel = config.yFlipped ? yDim.poleB : yDim.poleA
    drawPoleLabel(ctx, topLabel,    midX, plotTop    - POLE_LABEL_OFFSET, 0)
    drawPoleLabel(ctx, bottomLabel, midX, plotBottom + POLE_LABEL_OFFSET, 0)
  }

  if (!xDim || !yDim) return

  // Projects a 0–1 score pair into canvas coordinates, applying axis flips and
  // the Y inversion. Used for both element dots and type blob members.
  const project = (xScore: number, yScore: number): Pt => ({
    x: plotLeft + (config.xFlipped ? 1 - xScore : xScore) * plotW,
    y: plotTop  + (1 - (config.yFlipped ? 1 - yScore : yScore)) * plotH
  })

  const shownElements = visibleElements(config, elements, types, scores)

  // ── Type blobs ────────────────────────────────────────────────────────────────
  //
  // Drawn before element dots so dots always render on top and stay readable.
  // Each type becomes a freeform shape containing every qualifying member —
  // an element whose membership score meets the threshold AND which has been
  // scored on both chosen axes (otherwise it can't be placed in 2D space).
  //
  // Members are taken from shownElements, not the full list, so a blob never
  // wraps around a dot the type filter has hidden.
  //
  // The blob color is the membership-weighted average of member element colors,
  // and its label sits at the membership-weighted centroid, so the name lands on
  // the densest part of the cluster rather than the bounding box middle.

  if (config.showTypes) {
    for (const type of visibleTypes(config, types)) {
      const color = resolveTypeColor(config.colorMode, type, shownElements, scores, config.threshold)

      // Collect member positions along with their membership strength, which
      // doubles as the weight for the label centroid below.
      const pts: Pt[] = []
      let sumX = 0, sumY = 0, totalWeight = 0
      for (const el of shownElements) {
        const membership = scores[el.id]?.[type.id]
        if (membership === undefined || membership < config.threshold) continue
        const xScore = scores[el.id]?.[xDim.id]
        const yScore = scores[el.id]?.[yDim.id]
        if (xScore === undefined || yScore === undefined) continue
        const pt = project(xScore, yScore)
        pts.push(pt)
        sumX += pt.x * membership
        sumY += pt.y * membership
        totalWeight += membership
      }

      ctx.save()

      if (pts.length === 0) {
        // Ghost ring: the type exists but no members meet the threshold on both
        // axes. Drawn faintly at canvas center as a placeholder so the type
        // doesn't silently vanish from the map.
        ctx.beginPath()
        ctx.arc(midX, midY, BLOB_PADDING, 0, Math.PI * 2)
        ctx.strokeStyle = color + '44'
        ctx.lineWidth = 1
        ctx.setLineDash([4, 4])
        ctx.stroke()
        ctx.setLineDash([])
        ctx.restore()
        continue
      }

      setBlobPath(ctx, pts)
      ctx.fillStyle   = color + '22'   // ~13% opacity — translucent fill
      ctx.fill()
      ctx.strokeStyle = color + '99'   // ~60% opacity — visible but soft border
      ctx.lineWidth   = 1.5
      ctx.stroke()
      ctx.restore()

      // Type name at the membership-weighted centroid
      ctx.save()
      ctx.font = `bold ${dimensionLabelSize + 1}px -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif`
      ctx.fillStyle    = color
      ctx.textAlign    = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(type.name, sumX / totalWeight, sumY / totalWeight)
      ctx.restore()
    }
  }

  // ── Elements ──────────────────────────────────────────────────────────────────
  //
  // Elements missing a score on either axis use 0.5 as a placeholder and are
  // drawn with a dashed red ring to flag that their position isn't real.
  // When sizeByWeight=true: radius scales linearly with weight (DOT_MIN → DOT_MAX).
  // When sizeByWeight=false: all elements use DOT_DEFAULT_RADIUS uniformly.

  // When sizing by weight, draw heaviest first so lighter (smaller) dots sit on top.
  // When uniform size, preserve store order (no visual reason to sort).
  const sorted = config.sizeByWeight
    ? [...shownElements].sort((a, b) => b.weight - a.weight)
    : shownElements

  for (const el of sorted) {
    const xScore = scores[el.id]?.[xDim.id]
    const yScore = scores[el.id]?.[yDim.id]

    // Unscored or partially scored: use 0.5 as placeholder for any missing axis
    const isPartial = xScore === undefined || yScore === undefined
    const { x: cx, y: cy } = project(xScore ?? 0.5, yScore ?? 0.5)
    const r  = config.sizeByWeight
      ? DOT_MIN_RADIUS + (el.weight - 1) / 99 * (DOT_MAX_RADIUS - DOT_MIN_RADIUS)
      : DOT_DEFAULT_RADIUS

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
        ctx.fillStyle = resolveElementColor(config.colorMode, el, types, scores, config.threshold)
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
      // Label offset is pinned to the DEFAULT dot radius, not the actual one.
      // At default size the label sits just clear of the dot; as weight grows
      // the dot expands past the label, which then reads as sitting on top of
      // it. That keeps labels vertically aligned regardless of dot size.
      ctx.font = labelFont(elementLabelSize)
      ctx.fillStyle = isPartial ? '#cc0000' : '#222'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText(el.name, cx + DOT_DEFAULT_RADIUS + LABEL_OFFSET, cy)
    }
  }
}
