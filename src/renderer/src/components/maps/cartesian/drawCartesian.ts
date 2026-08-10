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
// Draw order: background → border → crosshair → pole labels → element dots →
// element labels → collection blobs. Blobs are overlays and remain visible on
// top of their members.
//
// This renderer absorbed the former Type Projection map: the overlay is now
// per-collection (config.shownCollectionIds) rather than a separate map type.
// Selecting a collection draws its blob. The optional members-only filter can
// also narrow plotted Elements to the union of those selected collections.

import type { CartesianMapConfig, Element, Dimension, Collection, ScoreMap } from '../../../lib/types'
import { blobPadding, setBlobPath, type BlobPoint, type Pt } from '../blob'
import { resolveElementColor } from '../color'
import { cartesianElements, shownCollections } from '../collections'
import { drawMark, markShapeIndex } from '../shape'
import { normalizeInRange, numericRange, type NumericRange } from '../../../lib/numericRange'

// Space reserved on each side of the canvas for pole labels
export const MARGIN = 58

// Dot radius range — the current lightest Element → min, heaviest → max.
export const DOT_MIN_RADIUS = 6
export const DOT_MAX_RADIUS = 76
// Uniform radius used when sizeByWeight is off — the same as the current
// lightest weighted dot.
export const DOT_DEFAULT_RADIUS = DOT_MIN_RADIUS

/** Shared by painting and hit-testing so large marks remain fully interactive. */
export function cartesianDotRadius(
  config: CartesianMapConfig, weight: number, range: NumericRange
): number {
  return config.sizeByWeight
    ? DOT_MIN_RADIUS + normalizeInRange(weight, range) * (DOT_MAX_RADIUS - DOT_MIN_RADIUS)
    : DOT_DEFAULT_RADIUS
}

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

export function drawCartesian(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  config: CartesianMapConfig,
  elements: Element[],
  collections: Collection[],
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

  if (elements.length === 0) {
    ctx.fillStyle = '#999'
    ctx.font = '13px -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('No elements to show.', midX, midY)
    return
  }

  const weightRange = numericRange(elements.map(element => element.weight))
  const visibleElements = cartesianElements(config, elements, collections)

  // Projects a 0–1 score pair into canvas coordinates, applying axis flips and
  // the Y inversion. Used for both element dots and blob members.
  const project = (xScore: number, yScore: number): Pt => ({
    x: plotLeft + (config.xFlipped ? 1 - xScore : xScore) * plotW,
    y: plotTop  + (1 - (config.yFlipped ? 1 - yScore : yScore)) * plotH
  })

  // ── Collection blob painter ───────────────────────────────────────────────────
  //
  // Defined here beside its projection data, then called after the Elements so
  // blobs behave as overlays.
  // Each selected collection becomes a freeform shape containing every member
  // that can be placed — an element belonging to the collection AND scored on
  // both chosen axes (otherwise it has no position in 2D space).
  //
  // Members are taken from the full element list. When the members-only filter
  // is active, every member of a selected collection is also a visible dot.
  //
  // A blob is drawn in its own collection's color, always — the element color
  // mode has no say, so switching elements to neutral gray leaves the
  // collections readable rather than flattening the whole map into one tone.
  // That color also matches the swatch beside the collection in the sidebar.
  //
  // The label sits at the centroid of the members. It used to be weighted by
  // membership strength to pull the name toward the densest part of the
  // cluster; with binary membership every member counts the same, so the plain
  // mean is the whole of it.
  //
  // Computed once for blob rendering. It does not affect element colors; those
  // continue to follow the Elements → Color setting independently.
  const shown = shownCollections(config, collections)

  const drawCollectionBlobs = (): void => {
    for (const collection of shown) {
      const color = collection.color

      const pts: BlobPoint[] = []
      let sumX = 0, sumY = 0
      for (const el of elements) {
        if (!el.collectionIds.includes(collection.id)) continue
        const xScore = scores[el.id]?.[xDim.id]
        const yScore = scores[el.id]?.[yDim.id]
        if (xScore === undefined || yScore === undefined) continue
        const pt = project(xScore, yScore)
        pts.push({
          ...pt,
          padding: blobPadding(cartesianDotRadius(config, el.weight, weightRange))
        })
        sumX += pt.x
        sumY += pt.y
      }

      ctx.save()

      if (pts.length === 0) {
        // Ghost ring: the collection exists but none of its members are scored on
        // both axes. Drawn faintly at canvas center as a placeholder so the
        // collection doesn't silently vanish from the map.
        ctx.beginPath()
        ctx.arc(midX, midY, blobPadding(DOT_DEFAULT_RADIUS), 0, Math.PI * 2)
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

      // Collection name at the centroid of its placed members
      ctx.save()
      ctx.font = `bold ${dimensionLabelSize + 1}px -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif`
      ctx.fillStyle    = color
      ctx.textAlign    = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(collection.name, sumX / pts.length, sumY / pts.length)
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
    ? [...visibleElements].sort((a, b) => b.weight - a.weight)
    : visibleElements

  for (const el of sorted) {
    const xScore = scores[el.id]?.[xDim.id]
    const yScore = scores[el.id]?.[yDim.id]

    // Unscored or partially scored: use 0.5 as placeholder for any missing axis
    const isPartial = xScore === undefined || yScore === undefined
    const { x: cx, y: cy } = project(xScore ?? 0.5, yScore ?? 0.5)
    const r = cartesianDotRadius(config, el.weight, weightRange)

    const shapeIndex = markShapeIndex(config.marks, el)
    if (shapeIndex !== null) {
      drawMark(ctx, shapeIndex, cx, cy, r)
      if (isPartial) {
        ctx.fillStyle = '#ffffff'
        ctx.fill()
        ctx.setLineDash([3, 3])
        ctx.strokeStyle = '#cc0000'
        ctx.lineWidth = 1.5
        ctx.stroke()
        ctx.setLineDash([])
      } else {
        ctx.fillStyle = resolveElementColor(config.colorMode, el, collections, [])
        ctx.fill()
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 1.5
        ctx.stroke()
      }

      if (el.id === selectedElementId && selectedElementIds.length === 0) {
        drawMark(ctx, shapeIndex, cx, cy, r + 3)
        ctx.strokeStyle = '#e8c040'
        ctx.lineWidth = 2
        ctx.stroke()
      }
      if (selectedElementIds.includes(el.id)) {
        drawMark(ctx, shapeIndex, cx, cy, r + 3)
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

  drawCollectionBlobs()
}
