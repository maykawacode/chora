import { Context } from 'svgcanvas'

const EXPORT_FONT_FAMILY = 'Arial'

// PowerPoint reads SVG pixels at 96 per inch, so 16px lands at 12pt; scaling
// by 16/13 puts the default 13px label there.
export const EXPORT_SCALE = 16 / 13

// One slide point in layout pixels; added to every label so 13px reads as 13pt.
const TEXT_BOOST = (96 / 72) / EXPORT_SCALE

// A 16:9 slide is 1280×720px (13.33×7.5in); these are that size before scaling.
const MAX_LAYOUT_WIDTH = 1040
const MAX_LAYOUT_HEIGHT = 585

// Arial's ascent and descent in ems, used to move labels onto the alphabetic
// baseline, the only one every SVG reader places the same way.
const ARIAL_ASCENT = 0.905
const ARIAL_DESCENT = 0.212

/**
 * Starts a named group; close it with ctx.restore(). On screen this is a plain
 * save(); in export, svgcanvas opens a <g> that editors show as a layer.
 */
export function beginLayer(ctx: CanvasRenderingContext2D, name: string): void {
  ctx.save()
  // svgcanvas keeps the open <g> on this private field; a real canvas has none.
  const group = (ctx as unknown as { __currentElement?: Element }).__currentElement
  if (group?.nodeName === 'g') group.setAttribute('id', name)
}

/** Largest size with the on-screen proportions that fits the slide-sized layout. */
export function exportLayoutSize(width: number, height: number): { width: number; height: number } {
  const fit = Math.min(MAX_LAYOUT_WIDTH / width, MAX_LAYOUT_HEIGHT / height)
  return { width: Math.round(width * fit), height: Math.round(height * fit) }
}

/** Keeps a canvas font's weight, adds TEXT_BOOST to its size, and swaps its family for Arial. */
export function withExportFont(font: string): string {
  return font.replace(/(\d*\.?\d+)px\s.*$/, (_, size: string) =>
    `${Math.round((parseFloat(size) + TEXT_BOOST) * 1000) / 1000}px ${EXPORT_FONT_FAMILY}`)
}

/** Splits #rrggbbaa into #rrggbb plus an opacity; other colors return null. */
export function splitHexAlpha(value: string): { color: string; opacity: number } | null {
  const match = /^#([0-9a-f]{6})([0-9a-f]{2})$/i.exec(value)
  if (!match) return null
  return {
    color: `#${match[1]}`,
    opacity: Math.round((parseInt(match[2], 16) / 255) * 1000) / 1000
  }
}

/** Ems to move a label down to reach the alphabetic baseline; null leaves it. */
export function alphabeticShift(dominantBaseline: string): number | null {
  switch (dominantBaseline) {
    case 'central':         return (ARIAL_ASCENT - ARIAL_DESCENT) / 2
    case 'text-after-edge': return -ARIAL_DESCENT
    default:                return null
  }
}

// Rewrites svgcanvas output that PowerPoint and older SVG readers misread.
function tidy(root: SVGSVGElement): void {
  for (const node of Array.from(root.querySelectorAll('*'))) {
    if (node.getAttribute('text-decoration') === 'undefined') node.removeAttribute('text-decoration')
    if (node.getAttribute('transform') === 'matrix(1 0 0 1 0 0)') node.removeAttribute('transform')

    for (const paint of ['fill', 'stroke']) {
      const split = splitHexAlpha(node.getAttribute(paint) ?? '')
      if (!split) continue
      node.setAttribute(paint, split.color)
      node.setAttribute(`${paint}-opacity`, String(split.opacity))
    }

    const shift = alphabeticShift(node.getAttribute('dominant-baseline') ?? '')
    if (shift !== null) {
      const fontSize = parseFloat(node.getAttribute('font-size') ?? '0')
      const y = parseFloat(node.getAttribute('y') ?? '0')
      node.setAttribute('y', String(y + shift * fontSize))
      node.removeAttribute('dominant-baseline')
    }
  }
}

/**
 * Draws a map into an SVG that keeps the on-screen proportions, fits a 16:9
 * slide, and stays editable after PowerPoint's Convert to Shape.
 */
export function buildMapSvg(
  screenWidth: number,
  screenHeight: number,
  draw: (ctx: CanvasRenderingContext2D, width: number, height: number) => void
): string {
  const { width, height } = exportLayoutSize(screenWidth, screenHeight)
  const svgCtx = new Context(width, height)

  // Draw code sets its own font strings; swap the family as each one is set.
  let font = withExportFont(svgCtx.font)
  Object.defineProperty(svgCtx, 'font', {
    get: () => font,
    set: (value: string) => { font = withExportFont(value) }
  })

  draw(svgCtx as unknown as CanvasRenderingContext2D, width, height)

  const root = svgCtx.getSvg()
  root.setAttribute('viewBox', `0 0 ${width} ${height}`)
  root.setAttribute('width', String(Math.round(width * EXPORT_SCALE)))
  root.setAttribute('height', String(Math.round(height * EXPORT_SCALE)))
  tidy(root)
  return svgCtx.getSerializedSvg(true)
}
