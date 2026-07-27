// ── Session serialization ─────────────────────────────────────────────────────
//
// Converts AppState to/from JSON for file save/open and IPC broadcasts.
// FORMAT_VERSION must be bumped any time the saved schema changes in a
// backward-incompatible way. The deserializer always merges missing fields
// with safe defaults so that older files don't crash on load.
//
// Migration table:
//   3.0 → 4.0: element.description → element.definition
//               dimension.description → dimension.definition
//               added sessionMeta, types[]
//   within 4.0: map.showColors (boolean) → map.colorMode (enum) — see
//               readColorMode; old files still load unchanged.
//   within 4.0: map.showDots (boolean) → map.marks (enum) — see readMarkMode;
//               old files still load unchanged.
//   within 4.0: map.showTypes (boolean) + map.typeIds (element filter, empty =
//               all) → map.typeIds alone (blob selection, empty = none) — see
//               readShownCollectionIds. Genuinely reinterprets a saved field.
//   4.0 → 5.0: types[] → collections[], and membership stopped being a score.
//               The 0–1 values under collection IDs in scores[] become
//               element.collectionIds — see liftMemberships. map.threshold is
//               read and dropped; map.typeIds → map.shownCollectionIds;
//               colorMode 'type' → 'collection'.
//   within 5.0: map.shownCollectionIds became a field of every map, not just
//               cartesian ones — a semantic map now colors the members of its
//               selected collections. Additive: a file written before this has
//               no such field on its semantic maps and loads with none
//               selected, which draws exactly as it did.

import type { AppState, ColorMode, MarkMode, Element, Collection, Dimension, MapConfig, SessionMeta } from './types'
import { defaultCategories, defaultSessionMeta, parsePoles } from './types'

const FORMAT_VERSION = '5.0'

const SUPPORTED_VERSIONS = ['3.0', '4.0', FORMAT_VERSION]

const COLOR_MODES: ColorMode[] = ['none', 'element', 'collection']

/**
 * Reads a map's color mode, tolerating both older spellings.
 *
 * 'type' was this mode's name until collections were named collections, so it
 * maps straight across. Older still are files carrying only a showColors
 * boolean, where true (or a missing key) meant element colors and false meant
 * neutral gray — those two states map onto 'element' and 'none' with nothing
 * lost. An unrecognized value falls through to 'element', matching how every
 * other field here degrades to a safe default rather than throwing.
 */
function readColorMode(m: Record<string, unknown>): ColorMode {
  if (COLOR_MODES.includes(m.colorMode as ColorMode)) return m.colorMode as ColorMode
  if (m.colorMode === 'type') return 'collection'
  return m.showColors === false ? 'none' : 'element'
}

const MARK_MODES: MarkMode[] = ['none', 'circle', 'element']

/**
 * Reads a map's mark mode, tolerating the showDots boolean it replaced.
 *
 * showDots=true drew each element's own shape, so it migrates to 'element'
 * rather than to 'circle' — an old map opens looking exactly as it did, even
 * one whose elements were given squares or triangles. New maps start at
 * 'circle' instead; that default lives in preferences, not here.
 */
function readMarkMode(m: Record<string, unknown>): MarkMode {
  if (MARK_MODES.includes(m.marks as MarkMode)) return m.marks as MarkMode
  return m.showDots === false ? 'none' : 'element'
}

/**
 * Reads a cartesian map's collection selection, reinterpreting the older
 * pairing of a showTypes flag with a typeIds element filter.
 *
 * The meaning of an empty list inverted, so this is the one migration here that
 * cannot simply leave a field alone: it used to mean "every type", and now means
 * "no blobs". A map that was showing its overlay with no explicit selection is
 * expanded to the full collection list, which is what it was drawing.
 *
 * Collections created after the file was saved are deliberately not picked up by
 * that expansion — under the new rule a blob is drawn because it was chosen, and
 * nothing chose those.
 *
 * `wasCollectionMap` covers pre-merge type-projection maps, which drew every
 * blob but predate showTypes and so never stored it.
 *
 * Cartesian only, deliberately, even though the field is shared now: the
 * expansion branches turn an absent selection into every collection, which was
 * right for a map whose overlay was on, and would be wrong for a semantic map
 * that has no such history to reconstruct. The semantic branch reads the field
 * plainly instead.
 */
function readShownCollectionIds(
  m: Record<string, unknown>,
  collections: Collection[],
  wasCollectionMap: boolean
): string[] {
  const saved = Array.isArray(m.shownCollectionIds) ? m.shownCollectionIds as string[]
              : Array.isArray(m.typeIds)            ? m.typeIds            as string[]
              : []
  const expand = (): string[] => saved.length > 0 ? saved : collections.map(c => c.id)

  if (typeof m.showTypes === 'boolean') return m.showTypes ? expand() : []
  if (wasCollectionMap) return expand()

  // No showTypes to reconcile and not a type-projection map: either already
  // written under the new rule, or old enough to predate blobs entirely — in
  // which case saved is empty and "no blobs" is right either way.
  return saved
}

// The membership score at or above which a legacy element counts as a member.
// Every map shipped with its threshold slider defaulting to this value, so
// converting at the same cutoff brings an old session's blobs back the shape
// they were last seen in.
//
// Exported because the spreadsheet importer faces the same question when it
// reads a legacy ##TYPE_SCORES matrix, and the two must answer it identically —
// the same analysis exported as TSV and saved as .mtda has to come back the
// same either way.
export const MEMBERSHIP_CUTOFF = 0.5

/**
 * Moves pre-5.0 membership out of the score map and onto the elements.
 *
 * Through 4.0 a membership was a 0–1 score sharing the score map with dimension
 * scores, and each map decided who counted by comparing it against its own
 * threshold slider. Membership is binary now, so one cutoff replaces every
 * slider, and the collection keys are stripped from the score map as they are
 * lifted — leaving it holding dimension scores and nothing else.
 *
 * Score rows for elements that no longer exist are passed through untouched,
 * matching how this format has always tolerated orphaned keys.
 */
function liftMemberships(
  elements: Element[],
  collections: Collection[],
  scores: AppState['scores']
): { elements: Element[]; scores: AppState['scores'] } {
  const collectionIds = new Set(collections.map(c => c.id))
  const lifted: AppState['scores'] = {}

  const migrated = elements.map(el => {
    const row = scores[el.id]
    if (!row) return el

    const dimensionScores: Record<string, number | undefined> = {}
    for (const [key, value] of Object.entries(row)) {
      if (!collectionIds.has(key)) dimensionScores[key] = value
    }
    lifted[el.id] = dimensionScores

    // Built by walking `collections` rather than the score row so membership
    // order matches the order collections are displayed in everywhere else.
    return {
      ...el,
      collectionIds: collections
        .filter(c => (row[c.id] ?? 0) >= MEMBERSHIP_CUTOFF)
        .map(c => c.id)
    }
  })

  for (const [elementId, row] of Object.entries(scores)) {
    if (!(elementId in lifted)) lifted[elementId] = row
  }

  return { elements: migrated, scores: lifted }
}

/**
 * Serializes only the persistent parts of AppState to a JSON string.
 * Runtime fields (filePath, isDirty, selection, activeTab) are intentionally
 * excluded — they are always reset when a file is opened.
 */
export function serializeSession(state: AppState): string {
  return JSON.stringify({
    version: FORMAT_VERSION,
    sessionMeta: state.sessionMeta,
    elements: state.elements,
    collections: state.collections,
    dimensions: state.dimensions,
    scores: state.scores,
    maps: state.maps
  }, null, 2)
}

/**
 * Parses a JSON string back into a fresh AppState.
 * Accepts versions 3.0, 4.0 and 5.0 — see the migration table at the top of
 * this file. Throws if the JSON is malformed or the version is unrecognized.
 * All optional fields are filled with safe defaults to handle old files.
 */
export function deserializeSession(json: string): AppState {
  const raw = JSON.parse(json)

  if (!raw || typeof raw !== 'object') throw new Error('Invalid file format')
  const version = raw.version
  if (!SUPPORTED_VERSIONS.includes(version)) {
    throw new Error(`Unsupported file version: ${version}`)
  }

  // ── SessionMeta (new in 4.0) ─────────────────────────────────────────────
  const sessionMeta: SessionMeta = raw.sessionMeta
    ? {
        id:         raw.sessionMeta.id         ?? crypto.randomUUID(),
        name:       raw.sessionMeta.name        ?? '',
        definition: raw.sessionMeta.definition  ?? ''
      }
    : defaultSessionMeta()

  // ── Collections (added in 4.0 as 'types', renamed in 5.0) ────────────────
  // Read before elements: an element's memberships are validated against this
  // list, whether they were stored on it or lifted out of the score map below.
  const collections: Collection[] = (raw.collections ?? raw.types ?? []).map((c: Record<string, unknown>) => ({
    id:         requireString(c.id, 'collection.id'),
    name:       typeof c.name       === 'string' ? c.name       : '',
    definition: typeof c.definition === 'string' ? c.definition : '',
    color:      typeof c.color      === 'string' ? c.color      : '#808080'
  }))

  const knownCollectionIds = new Set(collections.map(c => c.id))

  // ── Elements ─────────────────────────────────────────────────────────────
  const elements: Element[] = (raw.elements ?? []).map((e: Record<string, unknown>) => ({
    id:         requireString(e.id, 'element.id'),
    name:       typeof e.name       === 'string' ? e.name       : '',
    // 3.0 files store 'description'; 4.0 files store 'definition'
    definition: typeof e.definition === 'string' ? e.definition
                : typeof e.description === 'string' ? e.description : '',
    weight:     typeof e.weight === 'number' ? e.weight : 1,
    color:      typeof e.color  === 'string' ? e.color  : '#9d9d53',
    shape:      (['circle', 'square', 'triangle', 'diamond'].includes(e.shape as string)
                  ? e.shape : 'circle') as Element['shape'],
    // Present only in 5.0 files; pre-5.0 elements get theirs from
    // liftMemberships below. IDs naming a collection that no longer exists are
    // dropped rather than carried as invisible cruft — nothing renders them,
    // and removeCollection prunes the same way.
    collectionIds: Array.isArray(e.collectionIds)
      ? (e.collectionIds as unknown[]).filter(
          (id): id is string => typeof id === 'string' && knownCollectionIds.has(id)
        )
      : []
  }))

  // ── Dimensions ───────────────────────────────────────────────────────────
  const dimensions: Dimension[] = (raw.dimensions ?? []).map((d: Record<string, unknown>) => {
    const label = typeof d.label === 'string' ? d.label : ''
    const poles = parsePoles(label)
    return {
      id:    requireString(d.id, 'dimension.id'),
      label,
      // poleA/poleB may be missing in very old files — re-derive from label
      poleA: typeof d.poleA === 'string' ? d.poleA : poles.poleA,
      poleB: typeof d.poleB === 'string' ? d.poleB : poles.poleB,
      // 3.0 files store 'description'; 4.0 files store 'definition'
      definition: typeof d.definition === 'string' ? d.definition
                  : typeof d.description === 'string' ? d.description : '',
      weight: typeof d.weight === 'number' ? d.weight : 1,
      // categories may be missing in old files — merge with empty defaults
      categories: { ...defaultCategories(), ...((d.categories as object) ?? {}) }
    }
  })

  // ── Maps ─────────────────────────────────────────────────────────────────
  //
  // 'typeprojection' was a separate map type through Phase 5. It is now a
  // cartesian map with every blob selected — see readTypeIds. Files written by
  // this version only ever contain 'cartesian' and 'semantic'.
  const maps: MapConfig[] = (raw.maps ?? []).map((m: Record<string, unknown>) => {
    // Settings shared by every map type, all sidebar-driven.
    const base = {
      id:           requireString(m.id, 'map.id'),
      showLabels:   m.showLabels   !== false,
      marks:        readMarkMode(m),
      sizeByWeight: m.sizeByWeight !== false,
      colorMode:    readColorMode(m),
      windowX:      typeof m.windowX      === 'number' ? m.windowX      : 100,
      windowY:      typeof m.windowY      === 'number' ? m.windowY      : 100,
      windowWidth:  typeof m.windowWidth  === 'number' ? m.windowWidth  : 600,
      windowHeight: typeof m.windowHeight === 'number' ? m.windowHeight : 500
    }

    if (m.type === 'cartesian' || m.type === 'typeprojection') {
      // A pre-merge type-projection map becomes a cartesian map with the
      // collection overlay already switched on, so it opens looking as it did
      // before. blobStyle is dropped — the merged map always draws freeform
      // blobs — as is threshold, which no longer has anything to threshold.
      const wasCollectionMap = m.type === 'typeprojection'
      return {
        ...base,
        type:         'cartesian' as const,
        title:        typeof m.title === 'string' ? m.title : (wasCollectionMap ? 'Collection Map' : 'Map'),
        xDimensionId: typeof m.xDimensionId === 'string' ? m.xDimensionId : '',
        yDimensionId: typeof m.yDimensionId === 'string' ? m.yDimensionId : '',
        xFlipped:     m.xFlipped === true,
        yFlipped:     m.yFlipped === true,
        shownCollectionIds: readShownCollectionIds(m, collections, wasCollectionMap)
      }
    }
    if (m.type === 'semantic') {
      return {
        ...base,
        type:         'semantic' as const,
        title:        typeof m.title === 'string' ? m.title : 'Semantic Map',
        // Semantic maps had no weight sizing before the merge, so default it
        // OFF here rather than inheriting base's on-by-default — otherwise
        // every existing semantic map would open with resized dots.
        sizeByWeight: m.sizeByWeight === true,
        // Read plainly, not through readShownCollectionIds: no semantic map has
        // ever written showTypes or typeIds, so there is no legacy pairing to
        // reinterpret, and running one anyway could only invent a selection a
        // file never had. Files predating the shared field get no selection,
        // which is exactly how they used to draw.
        shownCollectionIds:  Array.isArray(m.shownCollectionIds)  ? m.shownCollectionIds  as string[] : [],
        elementIds:          Array.isArray(m.elementIds)          ? m.elementIds          as string[] : [],
        dimensionIds:        Array.isArray(m.dimensionIds)        ? m.dimensionIds        as string[] : [],
        flippedDimensionIds: Array.isArray(m.flippedDimensionIds) ? m.flippedDimensionIds as string[] : []
      }
    }
    throw new Error(`Unknown map type: ${m.type}`)
  })

  // Pre-5.0 files carry membership as scores; 5.0 files already have it on the
  // elements, where re-running the lift would find no collection keys to move
  // and hand back empty memberships.
  const rawScores = (raw.scores as AppState['scores']) ?? {}
  const migrated = version === FORMAT_VERSION
    ? { elements, scores: rawScores }
    : liftMemberships(elements, collections, rawScores)

  return {
    filePath: null,           // always reset on open — caller sets it from the actual path
    isDirty: false,
    sessionMeta,
    elements: migrated.elements,
    collections,
    dimensions,
    scores: migrated.scores,
    maps,
    selectedElementId: null,
    selectedDimensionId: null,
    selectedCollectionId: null,
    activeTab: 'elements'
  }
}

// ── Private helpers ───────────────────────────────────────────────────────────

/** Throws a descriptive error if a required string field is missing or empty. */
function requireString(val: unknown, field: string): string {
  if (typeof val !== 'string' || !val) throw new Error(`Missing required field: ${field}`)
  return val
}
