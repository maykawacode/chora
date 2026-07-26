// ── Map color policy ──────────────────────────────────────────────────────────
//
// Decides what color a painter draws an element in. The arithmetic lives in
// lib/color.ts, shared with the store's data conversions; what's here is the
// rendering-only half — which mode means what, and what to draw when there is
// no color to compute.
//
// Painters ask for a color and draw it; none of them branches on the mode
// itself, so adding a fourth mode later touches this file and the sidebar and
// nothing else.
//
// Three modes, chosen per map in the sidebar's Elements section:
//   'none'    — every element neutral gray, so the map reads as pure structure
//   'element' — each element's own color attribute
//   'type'    — the color of the type(s) it belongs to, blended by membership
//
// The mode governs elements only. Type blobs are never affected by it — see the
// note at the bottom of this file.

import type { ColorMode, Element, Type, ScoreMap } from '../../lib/types'
import { blendTypeColors } from '../../lib/color'

// Substituted for every color in 'none' mode, and drawn when 'type' mode finds
// no type to color by. Mid-gray keeps both the white dot outline and the dark
// element label legible against it.
export const NEUTRAL_COLOR = '#9a9a9a'

/**
 * The color to draw one element in — cartesian dots, and semantic polylines
 * and dots alike.
 *
 * `shown` is the collections currently drawn as blobs, and it outranks the
 * mode: an element inside a drawn blob takes that collection's color whatever
 * the mode says, and an element inside two takes the blend of exactly those
 * two. Showing a collection is therefore one gesture, not two — the cluster
 * and its members light up together, and the dots keep saying which collection
 * they belong to even with color switched off.
 *
 * The membership test is the same one that decides what the blob encloses, so a
 * dot is tinted by a collection precisely when it is drawn inside it. Elements
 * in no drawn blob — and every element on a semantic map, which has no blobs at
 * all and passes an empty list — fall through to the mode.
 */
export function resolveElementColor(
  mode: ColorMode,
  el: Element,
  types: Type[],
  shown: Type[],
  scores: ScoreMap,
  threshold: number
): string {
  const claimed = blendTypeColors(el, shown, scores, threshold)
  if (claimed !== null) return claimed

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

// Blob overlay color is deliberately NOT resolved here: a blob is always drawn
// in its own type's color, whatever the element color mode is. The mode governs
// how elements are colored, and a blob is not an element — it is the collection
// itself, wearing the color its sidebar swatch shows. Painters read type.color
// directly; there is no policy left to apply.
