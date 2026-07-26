// ── Map color policy ──────────────────────────────────────────────────────────
//
// Decides what color a painter actually draws. The arithmetic lives in
// lib/color.ts, shared with the store's data conversions; what's here is the
// rendering-only half — which mode means what, and what to draw when there is
// no color to compute.
//
// Painters ask for a color and draw it; none of them branches on the mode
// itself, so adding a fourth mode later touches this file and the sidebar and
// nothing else.
//
// Three modes, chosen per map in the sidebar's Elements section:
//   'none'    — everything neutral gray, so the map reads as pure structure
//   'element' — each element's own color attribute
//   'type'    — the color of the type(s) it belongs to, blended by membership

import type { ColorMode, Element, Type, ScoreMap } from '../../lib/types'
import { blendTypeColors, blendMemberColors } from '../../lib/color'

// Substituted for every color in 'none' mode, and drawn when 'type' mode finds
// no type to color by. Mid-gray keeps both the white dot outline and the dark
// element label legible against it.
export const NEUTRAL_COLOR = '#9a9a9a'

// Drawn when a blob's members supply no usable color at all. Distinct from
// NEUTRAL_COLOR on purpose: it means "a blend was asked for and came back
// empty", not "color is switched off".
const BLEND_FALLBACK = '#aaaaaa'

/**
 * The color to draw one element in — cartesian dots, and semantic polylines
 * and dots alike.
 */
export function resolveElementColor(
  mode: ColorMode,
  el: Element,
  types: Type[],
  scores: ScoreMap,
  threshold: number
): string {
  switch (mode) {
    case 'none':
      return NEUTRAL_COLOR
    case 'element':
      return el.color
    case 'type':
      // An element qualifying for no type has nothing to blend. Neutral says
      // "no type" plainly, where falling back to el.color would silently
      // masquerade as 'element' mode and misreport the element as untyped-but-
      // colored.
      return blendTypeColors(el, types, scores, threshold) ?? NEUTRAL_COLOR
  }
}

/**
 * The color to draw one type's blob overlay in (cartesian maps only).
 *
 * Deliberately mode-aware so the overlay agrees with the dots inside it: in
 * 'type' mode a blob and its members share one color exactly, while in
 * 'element' mode the blob averages its members and so picks up the palette of
 * whatever it contains.
 */
export function resolveTypeColor(
  mode: ColorMode,
  type: Type,
  elements: Element[],
  scores: ScoreMap,
  threshold: number
): string {
  switch (mode) {
    case 'none':
      return NEUTRAL_COLOR
    case 'element':
      return blendMemberColors(type, elements, scores, threshold) ?? BLEND_FALLBACK
    case 'type':
      return type.color
  }
}
