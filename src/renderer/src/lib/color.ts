// ── Color math ────────────────────────────────────────────────────────────────
//
// Pure color arithmetic, shared by the map renderers and by the store's data
// conversions. It lives in lib/ rather than beside the painters because both
// layers need the same mix: a map colored by collection computes it every
// frame, and the Collection → Element color conversion bakes it into the data.
// Two implementations would be free to drift, and the whole point is that the
// baked result matches what the map showed.
//
// Rendering *policy* — what to draw when there is no color to compute — stays
// with the painters in components/maps/color.ts. This module only answers
// "what color is this", and says null when there isn't one.

import type { Element, Collection } from './types'

// ── Collection palette ────────────────────────────────────────────────────────

// The color every collection was created with before the palette existed. Still
// the fallback for a collection carrying no color at all, and the marker for
// "the user has not chosen a color yet" — see
// assignPaletteToUncoloredCollections in the store.
export const DEFAULT_COLLECTION_COLOR = '#808080'

// Assigned round-robin as collections are created, so a new session has visually
// distinct collections without anyone opening a color picker. Mid-saturation
// tones matching the existing shape palette: they stay legible under the blob
// overlay's ~13% fill and behind white-outlined dots.
export const COLLECTION_PALETTE: readonly string[] = [
  '#4080c0', // blue
  '#c04040', // red
  '#40a040', // green
  '#a040a0', // purple
  '#c08040', // orange
  '#40a0a0', // teal
  '#a04080', // magenta
  '#808040'  // olive
]

/** Palette color for the nth collection created, cycling once it runs out. */
export function paletteColor(index: number): string {
  return COLLECTION_PALETTE[index % COLLECTION_PALETTE.length]
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

function linearChannel(value: number): number {
  const channel = value / 255
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
}

/** WCAG contrast ratio between a hex color and black text. */
export function blackTextContrast(hex: string): number {
  const rgb = hexToRgb(hex)
  if (!rgb) return 1
  const luminance = 0.2126 * linearChannel(rgb[0]) +
    0.7152 * linearChannel(rgb[1]) +
    0.0722 * linearChannel(rgb[2])
  return (luminance + 0.05) / 0.05
}

/**
 * Random element color that supports black normal-sized text at WCAG AA (4.5:1).
 * Rejection sampling retains the full readable RGB gamut; the fallback makes
 * the guarantee finite even with a deterministic or broken random source.
 */
export function randomReadableColor(random: () => number = Math.random): string {
  for (let attempt = 0; attempt < 64; attempt += 1) {
    const color = rgbToHex(
      Math.floor(random() * 256),
      Math.floor(random() * 256),
      Math.floor(random() * 256)
    )
    if (blackTextContrast(color) >= 4.5) return color
  }
  return '#ffffff'
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

// ── Membership mixes ──────────────────────────────────────────────────────────

/**
 * The color of the collection(s) an element belongs to, or null when it belongs
 * to none.
 *
 * Every collection an element is in contributes equally, because membership is
 * binary — there is no "belongs 0.9 to this one" left to lean the mix with. An
 * element in two collections lands exactly halfway between their colors.
 *
 * `collections` is the set allowed to contribute, not necessarily every
 * collection in the session: a cartesian map passes only the ones drawn as
 * blobs, so a dot is tinted by a collection precisely when it is drawn inside
 * it.
 */
export function mixCollectionColors(el: Element, collections: Collection[]): string | null {
  return mixColors(
    collections
      .filter(c => el.collectionIds.includes(c.id))
      .map(c => ({ color: c.color, weight: 1 }))
  )
}
