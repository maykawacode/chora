// ── Map collection selection ──────────────────────────────────────────────────
//
// Reads a map's collection selection. Two small functions, shared by both
// painters and the sidebar, which is why they live here rather than beside
// either map type: every map is asked the same question in the same sidebar,
// and a semantic painter importing it from cartesian/ would say otherwise.
//
// What each map *does* with the answer stays with that map, because the two
// differ — drawCartesian draws blobs without changing element colors, while
// drawSemantic hides everything that isn't a member and tints only under
// colorMode 'none'.

import type { MapConfig, Collection, Element } from '../../lib/types'

/**
 * The collections this map has selected — exactly the ones checked in the
 * sidebar, so an empty selection returns none.
 */
export function shownCollections(config: MapConfig, collections: Collection[]): Collection[] {
  return collections.filter(c => config.shownCollectionIds.includes(c.id))
}

/**
 * How many elements belong to a collection.
 *
 * Used by the sidebar, which shows the count beside each collection. It counts
 * membership, not what any map ends up drawing: a cartesian member unscored on
 * either axis has nowhere to sit and is left out of the blob, and a semantic
 * member unscored on every displayed dimension draws no polyline. Both are
 * counted here — the number describes the collection, not a map's view of it.
 */
export function memberCount(collection: Collection, elements: Element[]): number {
  return elements.filter(el => el.collectionIds.includes(collection.id)).length
}
