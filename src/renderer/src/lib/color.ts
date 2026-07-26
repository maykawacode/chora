// ── Color math ────────────────────────────────────────────────────────────────
//
// Pure color arithmetic, shared by the map renderers and by the store's data
// conversions. It lives in lib/ rather than beside the painters because both
// layers need the same blend: a map colored by type computes it every frame,
// and the Type membership → Element color conversion bakes it into the data.
// Two implementations would be free to drift, and the whole point is that the
// baked result matches what the map showed.
//
// Rendering *policy* — what to draw when there is no color to compute — stays
// with the painters in components/maps/color.ts. This module only answers
// "what color is this", and says null when there isn't one.

import type { Element, Type, ScoreMap } from './types'

// ── Type palette ──────────────────────────────────────────────────────────────

// The color every type was created with before the palette existed. Still the
// fallback for a type carrying no color at all, and the marker for "the user
// has not chosen a color yet" — see assignPaletteToUncoloredTypes in the store.
export const DEFAULT_TYPE_COLOR = '#808080'

// Assigned round-robin as types are created, so a new session has visually
// distinct types without anyone opening a color picker. Mid-saturation tones
// matching the existing shape palette: they stay legible under the blob
// overlay's ~13% fill and behind white-outlined dots.
export const TYPE_PALETTE: readonly string[] = [
  '#4080c0', // blue
  '#c04040', // red
  '#40a040', // green
  '#a040a0', // purple
  '#c08040', // orange
  '#40a0a0', // teal
  '#a04080', // magenta
  '#808040'  // olive
]

/** Palette color for the nth type created, cycling once the palette runs out. */
export function paletteColor(index: number): string {
  return TYPE_PALETTE[index % TYPE_PALETTE.length]
}

// ── Hex arithmetic ────────────────────────────────────────────────────────────

// Parses a '#rrggbb' hex string into an [r, g, b] triple, or null if the string
// doesn't match that exact format.
function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex)
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('')
}

/**
 * Weighted mean of a set of hex colors, componentwise in RGB.
 *
 * Parts with an unparseable color or a non-positive weight contribute nothing.
 * Returns null when that leaves nothing to average, so each caller can decide
 * what "no color" means for it rather than being handed a misleading black.
 */
export function mixColors(parts: Array<{ color: string; weight: number }>): string | null {
  let r = 0, g = 0, b = 0, total = 0
  for (const { color, weight } of parts) {
    if (weight <= 0) continue
    const rgb = hexToRgb(color)
    if (!rgb) continue
    r += rgb[0] * weight
    g += rgb[1] * weight
    b += rgb[2] * weight
    total += weight
  }
  if (total === 0) return null
  return rgbToHex(r / total, g / total, b / total)
}

// ── Membership blends ─────────────────────────────────────────────────────────

/**
 * How strongly an element belongs to a type, or 0 if it doesn't qualify.
 *
 * `threshold` is what keeps map color honest: on a cartesian map it is the same
 * value that decides which blob an element is drawn inside, so a dot is never
 * tinted by a type it isn't shown as part of. Callers with no threshold of
 * their own — semantic maps, and the conversion — pass 0, which admits every
 * non-zero membership.
 */
function membershipWeight(el: Element, type: Type, scores: ScoreMap, threshold: number): number {
  const m = scores[el.id]?.[type.id]
  return m !== undefined && m >= threshold ? m : 0
}

/**
 * The color of the type(s) an element belongs to, blended by membership
 * strength, or null when it qualifies for none.
 *
 * An element leaning 0.9 into one type and 0.1 into another lands near the
 * first type's color rather than halfway between the two.
 */
export function blendTypeColors(
  el: Element,
  types: Type[],
  scores: ScoreMap,
  threshold: number
): string | null {
  return mixColors(types.map(t => ({
    color:  t.color,
    weight: membershipWeight(el, t, scores, threshold)
  })))
}

/**
 * The type an element belongs to most strongly, or null if it has no scored
 * membership at all. A membership of exactly 0 does not count as belonging.
 */
export function dominantType(el: Element, types: Type[], scores: ScoreMap): Type | null {
  let best: Type | null = null
  let bestScore = 0
  for (const t of types) {
    const score = scores[el.id]?.[t.id]
    if (score !== undefined && score > bestScore) { bestScore = score; best = t }
  }
  return best
}
