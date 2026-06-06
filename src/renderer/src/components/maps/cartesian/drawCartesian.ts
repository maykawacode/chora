import type { CartesianMapConfig, Element, Dimension, ScoreMap } from '../../../lib/types'

const MARGIN = 48          // space for axis pole labels
const DOT_MIN_RADIUS = 4
const DOT_MAX_RADIUS = 24
const LABEL_OFFSET = 8

export function drawCartesian(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  config: CartesianMapConfig,
  elements: Element[],
  dimensions: Dimension[],
  scores: ScoreMap
): void {

  const plotLeft   = MARGIN
  const plotTop    = MARGIN
  const plotRight  = W - MARGIN
  const plotBottom = H - MARGIN
  const plotW      = plotRight - plotLeft
  const plotH      = plotBottom - plotTop

  const xDim = dimensions.find(d => d.id === config.xDimensionId)
  const yDim = dimensions.find(d => d.id === config.yDimensionId)

  // Clear
  ctx.clearRect(0, 0, W, H)

  // Background
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(plotLeft, plotTop, plotW, plotH)

  // Border
  ctx.strokeStyle = '#444'
  ctx.lineWidth = 1
  ctx.strokeRect(plotLeft, plotTop, plotW, plotH)

  // Quadrant crosshair lines
  ctx.strokeStyle = '#ccc'
  ctx.lineWidth = 1
  ctx.setLineDash([4, 4])

  const midX = plotLeft + plotW / 2
  const midY = plotTop  + plotH / 2

  ctx.beginPath()
  ctx.moveTo(midX, plotTop)
  ctx.lineTo(midX, plotBottom)
  ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(plotLeft,  midY)
  ctx.lineTo(plotRight, midY)
  ctx.stroke()

  ctx.setLineDash([])

  // Pole labels
  ctx.font = '11px -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif'
  ctx.fillStyle = '#333'
  ctx.textBaseline = 'middle'

  if (xDim) {
    ctx.textAlign = 'left'
    ctx.fillText(xDim.poleA, 4, midY)
    ctx.textAlign = 'right'
    ctx.fillText(xDim.poleB, W - 4, midY)
  }

  if (yDim) {
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(yDim.poleB, midX, 4)
    ctx.textBaseline = 'bottom'
    ctx.fillText(yDim.poleA, midX, H - 4)
  }

  // Elements
  if (!xDim || !yDim) return

  for (const el of elements) {
    const xScore = scores[el.id]?.[xDim.id]
    const yScore = scores[el.id]?.[yDim.id]
    if (xScore === undefined || yScore === undefined) continue

    const cx = plotLeft + xScore * plotW
    const cy = plotTop  + (1 - yScore) * plotH   // invert: high score = top
    const r  = DOT_MIN_RADIUS + (el.weight - 1) / 99 * (DOT_MAX_RADIUS - DOT_MIN_RADIUS)

    // Dot
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fillStyle = el.color
    ctx.fill()
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'
    ctx.lineWidth = 1
    ctx.stroke()

    // Label
    if (config.showLabels) {
      ctx.font = '11px -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif'
      ctx.fillStyle = '#222'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText(el.name, cx + r + LABEL_OFFSET, cy)
    }
  }
}
