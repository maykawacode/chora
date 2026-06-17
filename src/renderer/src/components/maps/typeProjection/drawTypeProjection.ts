// ── Type Projection Map renderer ──────────────────────────────────────────────
//
// Projects types into a 2D dimension space using the same cartesian layout.
// Each type is represented as a translucent halo centered on its "prototype" —
// the centroid of dimension scores for all elements with membership >= threshold.
//
// Element dots are plotted at their own dimension scores, identical to the
// cartesian renderer. Dragging an element from MapPanel updates its dimension
// scores and the halos recompute on the next frame.
//
// Drawing order: background → halos → element dots → labels
// This means dots always sit on top of halos, keeping individual elements readable.

import type { TypeProjectionMapConfig, Element, Dimension, Type, ScoreMap } from '../../../lib/types'
import { MARGIN, DOT_MIN_RADIUS, DOT_MAX_RADIUS, DOT_DEFAULT_RADIUS, labelFont, drawShape, SHAPE_INDEX } from '../cartesian/drawCartesian'

// Fallback color used for types whose members have no parseable colors,
// or when no elements meet the membership threshold.
const HALO_FALLBACK = '#aaaaaa'

// Parses a '#rrggbb' hex string into [r, g, b]. Returns null if unparseable.
function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex)
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('')
}

// Computes a membership-weighted average color from elements that qualify for a type.
// Weight = the element's membership score on this type (so 1.0 members dominate).
// Falls back to HALO_FALLBACK if no qualifying members have parseable colors.
function computeTypeColor(
  type: Type,
  elements: Element[],
  scores: ScoreMap,
  threshold: number
): string {
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

// Computes the prototype (centroid) for a type given its member elements.
// Returns null if no elements meet the threshold on both axes.
function computePrototype(
  type: Type,
  elements: Element[],
  scores: ScoreMap,
  xDimId: string,
  yDimId: string,
  threshold: number
): { x: number; y: number; memberCount: number } | null {
  let sumX = 0, sumY = 0, count = 0
  for (const el of elements) {
    const membership = scores[el.id]?.[type.id]
    if (membership === undefined || membership < threshold) continue
    const xScore = scores[el.id]?.[xDimId]
    const yScore = scores[el.id]?.[yDimId]
    if (xScore === undefined || yScore === undefined) continue
    sumX += xScore
    sumY += yScore
    count++
  }
  if (count === 0) return null
  return { x: sumX / count, y: sumY / count, memberCount: count }
}

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

  // ── Type halos ────────────────────────────────────────────────────────────────
  //
  // Halos are drawn before element dots so dots always sit on top.
  // Halo radius scales with the number of member elements: sqrt(memberCount) * baseRadius.
  // Types with no qualifying members are drawn as ghost rings at (0.5, 0.5).

  const BASE_HALO_RADIUS = Math.min(plotW, plotH) * 0.12

  for (let ti = 0; ti < types.length; ti++) {
    const type = types[ti]
    const color = computeTypeColor(type, elements, scores, config.threshold)
    const proto = computePrototype(type, elements, scores, config.xDimensionId, config.yDimensionId, config.threshold)

    let cx: number, cy: number, hasMembers: boolean

    if (proto) {
      const ex = config.xFlipped ? 1 - proto.x : proto.x
      const ey = config.yFlipped ? 1 - proto.y : proto.y
      cx = plotLeft + ex * plotW
      cy = plotTop  + (1 - ey) * plotH
      hasMembers = true
    } else {
      // Ghost: no members above threshold — draw faintly at canvas center
      cx = midX
      cy = midY
      hasMembers = false
    }

    const memberCount = proto?.memberCount ?? 0
    const r = BASE_HALO_RADIUS * (0.5 + Math.sqrt(memberCount) * 0.25)

    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)

    if (hasMembers) {
      ctx.fillStyle = color + '22'   // ~13% opacity fill
      ctx.fill()
      ctx.strokeStyle = color + '88' // ~53% opacity stroke
      ctx.lineWidth = 1.5
      ctx.stroke()
    } else {
      // Ghost ring: dashed, more transparent
      ctx.strokeStyle = color + '44'
      ctx.lineWidth = 1
      ctx.setLineDash([4, 4])
      ctx.stroke()
      ctx.setLineDash([])
    }
    ctx.restore()

    // Type name label at halo center
    ctx.save()
    ctx.font = `bold ${dimensionLabelSize + 1}px -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif`
    ctx.fillStyle = hasMembers ? color : color + '66'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    // Place label just above center of halo so element dots don't overlap it
    ctx.fillText(type.name, cx, cy - r * 0.55)
    ctx.restore()
  }

  // ── Element dots ──────────────────────────────────────────────────────────────
  //
  // Identical to drawCartesian: elements with missing axis score use 0.5 placeholder,
  // drawn with dashed red ring. Weight-based sizing when sizeByWeight is on.

  const sorted = config.sizeByWeight
    ? [...elements].sort((a, b) => b.weight - a.weight)
    : elements

  for (const el of sorted) {
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
