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
//   'none'       — every element neutral gray; the map reads as pure structure
//   'element'    — each element's own color attribute
//   'collection' — the color of the collection(s) it belongs to, mixed evenly
//
// The mode governs elements only. Collection blobs are never affected by it —
// see the note at the bottom of this file.

import type { ColorMode, Element, Collection } from '../../lib/types'
import { mixCollectionColors } from '../../lib/color'

// Substituted for every color in 'none' mode, and drawn when 'collection' mode
// finds no collection to color by. Mid-gray keeps both the white dot outline
// and the dark element label legible against it.
export const NEUTRAL_COLOR = '#9a9a9a'

/**
 * The color to draw one element in — cartesian dots, and semantic polylines
 * and dots alike.
 *
 * `shown` is the collections currently drawn as blobs, and it outranks the
 * mode: an element inside a drawn blob takes that collection's color whatever
 * the mode says, and an element inside two takes the mix of exactly those
 * two. Showing a collection is therefore one gesture, not two — the cluster
 * and its members light up together, and the dots keep saying which collection
 * they belong to even with color switched off.
 *
 * On a cartesian map `shown` is the blob selection, so the membership test is
 * the same one that decides what a blob encloses and a dot is tinted by a
 * collection precisely when it is drawn inside it. A semantic map has no blobs
 * and passes its selection only under 'none', where filling in the neutral
 * costs nothing; under the other modes it passes an empty list and everything
 * falls through. Either way this function just honours what it is handed —
 * which collections may claim is the caller's policy, not this one's.
 */
export function resolveElementColor(
  mode: ColorMode,
  el: Element,
  collections: Collection[],
  shown: Collection[]
): string {
  const claimed = mixCollectionColors(el, shown)
  if (claimed !== null) return claimed

  switch (mode) {
    case 'none':
      return NEUTRAL_COLOR
    case 'element':
      return el.color
    case 'collection':
      // An element in no collection has nothing to mix. Neutral says "no
      // collection" plainly, where falling back to el.color would silently
      // masquerade as 'element' mode and misreport the element as
      // uncollected-but-colored.
      return mixCollectionColors(el, collections) ?? NEUTRAL_COLOR
  }
}

// Blob overlay color is deliberately NOT resolved here: a blob is always drawn
// in its own collection's color, whatever the element color mode is. The mode
// governs how elements are colored, and a blob is not an element — it is the
// collection itself, wearing the color its sidebar swatch shows. Painters read
// collection.color directly; there is no policy left to apply.
