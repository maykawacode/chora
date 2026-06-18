// ── Type Projection Map renderer ──────────────────────────────────────────────
//
// Projects types into a 2D dimension space using the same cartesian layout.
// Each type is drawn as a freeform blob that contains all qualifying member
// elements — those whose membership score meets the threshold and who have
// been scored on both chosen axes.
//
// Blob shape pipeline (per type):
//   1. Collect canvas-space positions of qualifying members
//   2. Compute convex hull of those positions (Jarvis march, CCW order)
//   3. Pad each hull vertex outward along its bisector normal so that element
//      dots (up to 38px radius) sit inside the blob rather than on its edge
//   4. Fit a smooth closed Bézier spline through the padded hull vertices
//      using Catmull-Rom parameterisation
//   5. Fill (low opacity) + stroke (higher opacity) with a color derived from
//      the membership-weighted blend of member element colors
//
// Edge cases:
//   0 members → ghost dashed ring at canvas center
//   1 member  → filled circle of radius BLOB_PADDING around that point
//   2 members → rounded capsule (stadium) connecting the two points
//   3+ members → full convex hull + spline pipeline
//
// Element dots are drawn after all blobs so dots always sit on top.
// Drawing order: background → grid → blobs → element dots → element labels

import type { TypeProjectionMapConfig, Element, Dimension, Type, ScoreMap } from '../../../lib/types'
import { MARGIN, DOT_MIN_RADIUS, DOT_MAX_RADIUS, DOT_DEFAULT_RADIUS, labelFont, drawShape, SHAPE_INDEX } from '../cartesian/drawCartesian'

// How far (in canvas pixels) to push each hull vertex outward from the data
// point cloud. Must be larger than DOT_MAX_RADIUS so the largest dots fit inside.
const BLOB_PADDING = 46

// ── Color helpers ─────────────────────────────────────────────────────────────

const HALO_FALLBACK = '#aaaaaa'

// Parses a '#rrggbb' hex string into an [r, g, b] triple. Returns null if the
// string doesn't match the expected format.
function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex)
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('')
}

// Returns a single hex color that is the membership-weighted average of all
// qualifying member element colors. Higher-membership elements pull the color
// more strongly. Falls back to HALO_FALLBACK if no members have valid colors.
function computeTypeColor(type: Type, elements: Element[], scores: ScoreMap, threshold: number): string {
  let sumR = 0, sumG = 0, sumB = 0, totalWeight = 0
  for (const el of elements) {
    const membership = scores[el.id]?.[type.id]
    if (membership === undefined || membership < threshold) continue
    const rgb = hexToRgb(el.color)
    if (!rgb) continue
    sumR += rgb[0] * membership
    sumG += rgb[1] * membership
    sumB += rgb[2] * membership
    totalWeight += membership
  }
  if (totalWeight === 0) return HALO_FALLBACK
  return rgbToHex(sumR / totalWeight, sumG / totalWeight, sumB / totalWeight)
}

// ── Prototype (centroid) ──────────────────────────────────────────────────────
//
// Used only for label placement. Position is the membership-weighted mean of
// the member elements' dimension scores — so the label gravitates toward the
// purest members rather than the simple average of all qualifying ones.

function computePrototype(
  type: Type,
  elements: Element[],
  scores: ScoreMap,
  xDimId: string,
  yDimId: string,
  threshold: number
): { x: number; y: number; memberCount: number } | null {
  let sumX = 0, sumY = 0, totalWeight = 0, count = 0
  for (const el of elements) {
    const membership = scores[el.id]?.[type.id]
    if (membership === undefined || membership < threshold) continue
    const xScore = scores[el.id]?.[xDimId]
    const yScore = scores[el.id]?.[yDimId]
    if (xScore === undefined || yScore === undefined) continue
    sumX += xScore * membership
    sumY += yScore * membership
    totalWeight += membership
    count++
  }
  if (totalWeight === 0) return null
  return { x: sumX / totalWeight, y: sumY / totalWeight, memberCount: count }
}

// ── 2D point type (canvas coordinates) ───────────────────────────────────────

type Pt = { x: number; y: number }

// ── Convex hull — Jarvis march (gift wrapping) ────────────────────────────────
//
// Produces vertices in counter-clockwise order. O(n·h) where h is the number
// of hull vertices — fast enough for the small point counts we deal with here.
// Requires at least 3 non-collinear points; caller handles smaller cases.
//
// The cross product of vectors (o→a) and (o→b) is positive when b is to the
// left of o→a (CCW turn), negative for a CW turn, and zero for collinear.
function cross(o: Pt, a: Pt, b: Pt): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
}

function convexHull(pts: Pt[]): Pt[] {
  const n = pts.length
  if (n < 3) return [...pts]

  // Start from the leftmost point (lowest x; break ties by lowest y).
  let startIdx = 0
  for (let i = 1; i < n; i++) {
    if (pts[i].x < pts[startIdx].x || (pts[i].x === pts[startIdx].x && pts[i].y < pts[startIdx].y)) {
      startIdx = i
    }
  }

  const hull: Pt[] = []
  let current = startIdx

  // Each iteration picks the point that makes the most counter-clockwise turn
  // from the current edge direction, until we wrap back to the start.
  do {
    hull.push(pts[current])
    let next = 0
    for (let i = 1; i < n; i++) {
      if (next === current) { next = i; continue }
      const c = cross(pts[current], pts[next], pts[i])
      // c < 0 → pts[i] is more CCW than pts[next]; keep it.
      // c === 0 → collinear: prefer the farther point so we don't include
      //           intermediate collinear points as hull vertices.
      if (c < 0 || (c === 0 && dist2(pts[current], pts[i]) > dist2(pts[current], pts[next]))) {
        next = i
      }
    }
    current = next
  } while (current !== startIdx)

  return hull
}

function dist2(a: Pt, b: Pt): number {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2
}

// ── Outward padding ───────────────────────────────────────────────────────────
//
// Moves each hull vertex outward by `r` pixels so that element dots (which can
// be up to DOT_MAX_RADIUS wide) sit inside the blob rather than on its edge.
//
// For each vertex v[i], we compute the outward-facing bisector:
//   - d_in  = unit vector along the incoming edge  (v[i-1] → v[i])
//   - d_out = unit vector along the outgoing edge  (v[i]   → v[i+1])
//   - For a CCW hull, the outward normal of an edge with direction d is (d.y, -d.x)
//   - The bisector is the average of the two edge outward normals, normalised
//
// If the two normals nearly cancel (very sharp reflex vertex — impossible in
// a convex hull), we fall back to the average of the two edge normals as-is.
function padHull(hull: Pt[], r: number): Pt[] {
  const n = hull.length
  return hull.map((v, i) => {
    const prev = hull[(i - 1 + n) % n]
    const next = hull[(i + 1) % n]

    // Incoming edge direction (normalised)
    const inLen  = Math.hypot(v.x - prev.x, v.y - prev.y) || 1
    const inDx   = (v.x - prev.x) / inLen
    const inDy   = (v.y - prev.y) / inLen

    // Outgoing edge direction (normalised)
    const outLen = Math.hypot(next.x - v.x, next.y - v.y) || 1
    const outDx  = (next.x - v.x) / outLen
    const outDy  = (next.y - v.y) / outLen

    // Outward normals for CCW hull: rotate each direction 90° clockwise → (dy, -dx)
    const nInX  =  inDy;  const nInY  = -inDx
    const nOutX =  outDy; const nOutY = -outDx

    // Average the two normals to get the bisector direction
    let bx = nInX + nOutX
    let by = nInY + nOutY
    const bLen = Math.hypot(bx, by)

    // Guard against near-zero bisector (would only occur at a 180° interior angle,
    // impossible in a convex hull, but defensive programming is cheap)
    if (bLen < 0.001) { bx = nOutX; by = nOutY } else { bx /= bLen; by /= bLen }

    return { x: v.x + bx * r, y: v.y + by * r }
  })
}

// ── Smooth closed Bézier spline (Catmull-Rom) ─────────────────────────────────
//
// Connects the given points with cubic Bézier curves that pass through every
// point and have continuous first derivatives (no kinks at joints).
//
// Catmull-Rom → cubic Bézier conversion:
//   For segment P[i] → P[i+1], the two Bézier control points are:
//     CP1 = P[i]   + (P[i+1] - P[i-1]) * tension / 6
//     CP2 = P[i+1] - (P[i+2] - P[i])   * tension / 6
//
// tension=1 gives standard Catmull-Rom. Lower values tighten the curve toward
// straight lines between hull vertices. We use 0.5 for a shape that stays
// close to the padded hull without aggressive rounding.
function smoothClosedPath(ctx: CanvasRenderingContext2D, pts: Pt[], tension = 0.5): void {
  const n = pts.length
  ctx.beginPath()
  ctx.moveTo(pts[0].x, pts[0].y)

  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n]  // previous point (wraps)
    const p1 = pts[i]                 // current point
    const p2 = pts[(i + 1) % n]       // next point (wraps)
    const p3 = pts[(i + 2) % n]       // point after next (wraps)

    // Bézier control points derived from Catmull-Rom parameterisation
    const cp1x = p1.x + (p2.x - p0.x) * tension / 6
    const cp1y = p1.y + (p2.y - p0.y) * tension / 6
    const cp2x = p2.x - (p3.x - p1.x) * tension / 6
    const cp2y = p2.y - (p3.y - p1.y) * tension / 6

    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y)
  }

  ctx.closePath()
}

// ── Capsule (stadium) shape ───────────────────────────────────────────────────
//
// Draws a rounded rectangle connecting two points — used when exactly two
// member elements are present. The capsule is the union of a rectangle and
// two semicircles of radius r, one at each endpoint.
//
// Winding order explanation (important for correct arcs):
//   The perpendicular (px, py) = (-dy/len, dx/len) points "left" when facing
//   a→b. In canvas coordinates (y-down), this means:
//     a1 = a + perp*r  is at angle (angle + π/2) from a's centre
//     a2 = a - perp*r  is at angle (angle - π/2) from a's centre
//     (same for b1, b2 relative to b)
//
//   The path travels CCW: a1 → b1 → arc-at-b (outer end) → b2 → a2 → arc-at-a (back end).
//
//   Arc at b: start at (angle + π/2) where we arrive from lineTo(b1), sweep
//     counter-clockwise (anticlockwise=true) to (angle - π/2). This passes
//     through `angle` — the outward direction — giving the outer semicircle.
//
//   Arc at a: start at (angle - π/2) where we arrive from lineTo(a2), sweep
//     counter-clockwise to (angle + π/2). This passes through (angle ± π) —
//     the backward direction — giving the back-end semicircle.
//
//   Both arcs use anticlockwise=true. Using the default (clockwise) or swapping
//   the angle arguments causes canvas to draw a stray chord across the centre
//   of each endpoint before the arc, twisting the shape.
function drawCapsule(ctx: CanvasRenderingContext2D, a: Pt, b: Pt, r: number): void {
  const dx  = b.x - a.x
  const dy  = b.y - a.y
  const len = Math.hypot(dx, dy) || 1

  // Unit perpendicular to the a→b axis ("left" when facing a→b)
  const px = -dy / len
  const py =  dx / len

  // Side points: offset perpendicularly from each endpoint
  const a1 = { x: a.x + px * r, y: a.y + py * r }  // left of a  (angle + π/2 from a)
  const a2 = { x: a.x - px * r, y: a.y - py * r }  // right of a (angle - π/2 from a)
  const b1 = { x: b.x + px * r, y: b.y + py * r }  // left of b  (angle + π/2 from b)

  const angle = Math.atan2(dy, dx)

  ctx.beginPath()
  ctx.moveTo(a1.x, a1.y)
  ctx.lineTo(b1.x, b1.y)
  // Outer end cap at b: CCW from (angle + π/2) through angle to (angle - π/2)
  ctx.arc(b.x, b.y, r, angle + Math.PI / 2, angle - Math.PI / 2, true)
  // canvas is now at b2; draw the other long side back to a2
  ctx.lineTo(a2.x, a2.y)
  // Back end cap at a: CCW from (angle - π/2) through (angle ± π) to (angle + π/2)
  ctx.arc(a.x, a.y, r, angle - Math.PI / 2, angle + Math.PI / 2, true)
  ctx.closePath()
}

// ── Main blob dispatcher ──────────────────────────────────────────────────────
//
// Chooses the appropriate drawing strategy based on member count and sets the
// current path on ctx. Does NOT fill or stroke — caller does that so it can
// apply color and opacity independently.
function setBlobPath(ctx: CanvasRenderingContext2D, pts: Pt[]): void {
  if (pts.length === 0) return

  if (pts.length === 1) {
    // Single member: simple circle
    ctx.beginPath()
    ctx.arc(pts[0].x, pts[0].y, BLOB_PADDING, 0, Math.PI * 2)
    return
  }

  if (pts.length === 2) {
    // Two members: rounded capsule connecting the two points
    drawCapsule(ctx, pts[0], pts[1], BLOB_PADDING)
    return
  }

  // Three or more members: convex hull → outward padding → smooth spline
  const hull   = convexHull(pts)
  const padded = padHull(hull, BLOB_PADDING)
  smoothClosedPath(ctx, padded)
}

// ── Main export ───────────────────────────────────────────────────────────────

export function drawTypeProjection(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  config: TypeProjectionMapConfig,
  elements: Element[],
  types: Type[],
  dimensions: Dimension[],
  scores: ScoreMap,
  selectedElementId?: string,
  elementLabelSize: number = 11,
  dimensionLabelSize: number = 11,
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
  ctx.beginPath(); ctx.moveTo(midX, plotTop);  ctx.lineTo(midX, plotBottom); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(plotLeft, midY); ctx.lineTo(plotRight, midY);  ctx.stroke()
  ctx.setLineDash([])

  // ── Pole labels ───────────────────────────────────────────────────────────────

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

  if (!xDim || !yDim) return

  // ── Type groups ───────────────────────────────────────────────────────────────
  //
  // Drawn before element dots so dots always render on top and stay readable.
  // Two styles are available, switchable via the map's dropdown menu:
  //
  //   'circle' (default) — a single translucent circle centered on the
  //      membership-weighted centroid of qualifying members. Radius scales
  //      with sqrt(memberCount) so larger types get larger circles.
  //
  //   'blob' — a freeform convex-hull spline that contains all qualifying
  //      member positions, padded outward so dots sit inside the shape.
  //
  // The group color is the membership-weighted average of member element colors.

  // Base radius for the 'circle' style — 12% of the shorter plot dimension.
  const BASE_HALO_RADIUS = Math.min(plotW, plotH) * 0.12

  // typeIds = [] means "show all"; a non-empty list restricts to that subset.
  const visibleTypes = config.typeIds.length === 0
    ? types
    : types.filter(t => config.typeIds.includes(t.id))

  for (const type of visibleTypes) {
    const color = computeTypeColor(type, elements, scores, config.threshold)

    // Compute the membership-weighted centroid for label placement and circle mode.
    const proto = computePrototype(type, elements, scores, config.xDimensionId, config.yDimensionId, config.threshold)

    ctx.save()

    if (!proto) {
      // Ghost ring: type exists but no members meet the threshold on both axes.
      // Drawn faintly at canvas center as a visual placeholder.
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

    // Project the centroid from score-space to canvas-space
    const protoEx = config.xFlipped ? 1 - proto.x : proto.x
    const protoEy = config.yFlipped ? 1 - proto.y : proto.y
    const protoCx = plotLeft + protoEx * plotW
    const protoCy = plotTop  + (1 - protoEy) * plotH

    if (config.blobStyle === 'blob') {
      // ── Blob style: convex hull + smooth spline ─────────────────────────────
      // Collect canvas-space positions of all qualifying members. An element
      // qualifies if its membership score >= threshold AND it has scores on
      // both chosen axes (otherwise it can't be placed in 2D space).
      const memberPts: Pt[] = []
      for (const el of elements) {
        const membership = scores[el.id]?.[type.id]
        if (membership === undefined || membership < config.threshold) continue
        const xScore = scores[el.id]?.[xDim.id]
        const yScore = scores[el.id]?.[yDim.id]
        if (xScore === undefined || yScore === undefined) continue
        const ex = config.xFlipped ? 1 - xScore : xScore
        const ey = config.yFlipped ? 1 - yScore : yScore
        memberPts.push({ x: plotLeft + ex * plotW, y: plotTop + (1 - ey) * plotH })
      }

      setBlobPath(ctx, memberPts)
    } else {
      // ── Circle style (default): single circle at the centroid ───────────────
      // Radius grows with sqrt(memberCount) to reflect group size without
      // letting large types visually dominate the entire map.
      const r = BASE_HALO_RADIUS * (0.5 + Math.sqrt(proto.memberCount) * 0.25)
      ctx.beginPath()
      ctx.arc(protoCx, protoCy, r, 0, Math.PI * 2)
    }

    ctx.fillStyle   = color + '22'   // ~13% opacity — translucent fill
    ctx.fill()
    ctx.strokeStyle = color + '99'   // ~60% opacity — visible but soft border
    ctx.lineWidth   = 1.5
    ctx.stroke()

    ctx.restore()

    // Type name label at the membership-weighted centroid (same position for
    // both styles so the label always marks the densest part of the cluster)
    ctx.save()
    ctx.font = `bold ${dimensionLabelSize + 1}px -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif`
    ctx.fillStyle    = color
    ctx.textAlign    = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(type.name, protoCx, protoCy)
    ctx.restore()
  }

  // ── Element dots ──────────────────────────────────────────────────────────────
  //
  // Identical to drawCartesian: elements with a missing axis score use 0.5 as
  // a placeholder and are shown with a dashed red ring. Weight-based dot sizing
  // is applied when config.sizeByWeight is on.

  const sorted = config.sizeByWeight
    ? [...elements].sort((a, b) => b.weight - a.weight)
    : elements

  // When any type is deselected, hide elements that don't qualify for at least
  // one visible type. typeIds=[] means all types are visible so no filtering.
  const visibleElements = config.typeIds.length === 0
    ? sorted
    : sorted.filter(el =>
        visibleTypes.some(t => {
          const m = scores[el.id]?.[t.id]
          return m !== undefined && m >= config.threshold
        })
      )

  for (const el of visibleElements) {
    const xScore = scores[el.id]?.[xDim.id]
    const yScore = scores[el.id]?.[yDim.id]

    const isPartial = xScore === undefined || yScore === undefined
    const rawX = xScore ?? 0.5
    const rawY = yScore ?? 0.5

    const ex = config.xFlipped ? 1 - rawX : rawX
    const ey = config.yFlipped ? 1 - rawY : rawY

    const cx = plotLeft + ex * plotW
    const cy = plotTop  + (1 - ey) * plotH
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
        ctx.fillStyle = el.color
        ctx.fill()
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 1.5
        ctx.stroke()
      }

      // Selection highlight ring — gold, drawn slightly outside the dot
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
      ctx.fillText(el.name, cx + r + 4, cy)
    }
  }
}
