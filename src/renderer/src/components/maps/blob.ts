// ── Type blob geometry ────────────────────────────────────────────────────────
//
// Pure geometry for the type-cluster overlay drawn on cartesian maps. No React,
// no canvas state beyond setting a path — callers fill and stroke themselves so
// they control color and opacity.
//
// Extracted from the former drawTypeProjection renderer so the interesting math
// lives on its own rather than buried in a painter. Blob coloring used to live
// here too, which made "pure geometry" only half true; it now sits with every
// other color decision in ./color.ts.
//
// Blob shape pipeline (per type):
//   1. Collect canvas-space positions of qualifying members
//   2. Compute convex hull of those positions (Jarvis march, CCW order)
//   3. Pad each hull vertex outward along its bisector normal so that element
//      dots (up to 38px radius) sit inside the blob rather than on its edge
//   4. Fit a smooth closed Bézier spline through the padded hull vertices
//      using Catmull-Rom parameterisation
//
// Member-count edge cases:
//   0 members → caller draws a ghost ring (no path produced here)
//   1 member  → filled circle of radius BLOB_PADDING around that point
//   2 members → rounded capsule (stadium) connecting the two points
//   3+ members → full convex hull + spline pipeline

// How far (in canvas pixels) to push each hull vertex outward from the data
// point cloud. Must be larger than DOT_MAX_RADIUS so the largest dots fit inside.
export const BLOB_PADDING = 46

// 2D point in canvas coordinates
export type Pt = { x: number; y: number }

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

function dist2(a: Pt, b: Pt): number {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2
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

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Sets the current path on ctx to a blob containing every given point.
 * Does NOT fill or stroke — the caller does that so it can apply color and
 * opacity independently. A no-op for an empty point list.
 */
export function setBlobPath(ctx: CanvasRenderingContext2D, pts: Pt[]): void {
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
  setBlobPathFromHull(ctx, convexHull(pts))
}

function setBlobPathFromHull(ctx: CanvasRenderingContext2D, hull: Pt[]): void {
  // A hull can collapse to fewer than 3 vertices when all points are collinear;
  // fall back to the capsule/circle cases so we still draw something sensible.
  if (hull.length === 1) {
    ctx.beginPath()
    ctx.arc(hull[0].x, hull[0].y, BLOB_PADDING, 0, Math.PI * 2)
    return
  }
  if (hull.length === 2) {
    drawCapsule(ctx, hull[0], hull[1], BLOB_PADDING)
    return
  }
  smoothClosedPath(ctx, padHull(hull, BLOB_PADDING))
}
