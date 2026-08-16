// ── Application state store ───────────────────────────────────────────────────
//
// Single source of truth for all session data: elements, collections,
// dimensions, scores, and map configurations. Built with Zustand so any
// component can subscribe to exactly the slice it needs without prop drilling.
//
// Architecture note:
//   The Score Window (App.tsx) subscribes to this store and broadcasts the
//   full serialized state to all open map windows whenever it changes.
//   Map windows apply incoming state via loadSession() but do NOT write back
//   through this store — they send fine-grained IPC messages instead.
//   See App.tsx for the suppressBroadcast ref pattern that prevents loops.

import { create } from 'zustand'
import type {
  AppState, Element, Collection, Dimension, DimensionCategories, SessionMeta,
  MapConfig, CartesianMapConfig, SemanticMapConfig, ElementShape
} from '../lib/types'
import { DEFAULT_COLLECTION_COLOR, paletteColor, mixCollectionColors, randomReadableColor } from '../lib/color'
import { defaultCategories, defaultSessionMeta, ELEMENT_SHAPES, parsePoles } from '../lib/types'
import { usePrefsStore } from './prefsStore'
import { openWeight } from '../lib/numericRange'
import {
  dimensionScoresToColors,
  dimensionScoresToWeights,
  spreadScores,
  weightsToDimensionScores
} from './transforms'

// ── Store interface ───────────────────────────────────────────────────────────

/** One score write: element × dimension → value. */
export interface ScoreEntry {
  elementId: string
  targetId:  string
  value:     number
}

interface AppStore extends AppState {
  // Session metadata
  updateSessionMeta: (changes: Partial<SessionMeta>) => void

  // Elements
  addElement:       (name: string, color?: string) => void
  duplicateElement: (id: string) => void
  updateElement:    (id: string, changes: Partial<Element>) => void
  removeElement:    (id: string) => void

  // Collections
  addCollection:    (name: string, id?: string) => string
  updateCollection: (id: string, changes: Partial<Collection>) => void
  removeCollection: (id: string) => void
  assignPaletteToUncoloredCollections: () => void

  // Membership — binary, and an attribute of the element like its color or shape
  toggleElementCollection: (elementId: string, collectionId: string) => void
  setElementsCollection:   (elementIds: string[], collectionId: string, member: boolean) => void

  // Dimensions
  addDimension:    (label: string, categories?: DimensionCategories) => void
  updateDimension: (id: string, changes: Partial<Dimension>) => void
  removeDimension: (id: string) => void

  // Scores (dimension scores; membership is not a score — see above)
  setScore:   (elementId: string, targetId: string, value: number) => void
  setScores:  (entries: ScoreEntry[]) => void
  clearScore: (elementId: string, targetId: string) => void

  // Maps
  addMap:          (config: MapConfig) => void
  updateMapConfig: (id: string, changes: Partial<CartesianMapConfig> | Partial<SemanticMapConfig>) => void
  removeMap:       (id: string) => void

  // Advanced transforms (see descriptions in implementation below)
  // flip=true inverts the score direction so poleA maps to the "high" end instead of poleB
  dimensionToWeight: (dimensionId: string, flip?: boolean) => void
  weightToDimension: (dimensionId: string, flip?: boolean) => void
  dimensionToColor:  (dimensionId: string, colorLow?: string, colorHigh?: string) => void
  dimToDimScores:    (sourceDimId: string, targetDimId: string) => void
  randomizeScores:   (dimensionId: string) => void
  spreadDimensionScores: (dimensionId: string) => void
  randomizeElementWeights: () => void
  randomizeElementColors: () => void
  randomizeDimensionWeights: () => void
  randomizeCollectionColors: () => void
  randomizeElementShapes: () => void
  randomizeCollectionAssignments: () => void
  collectionToElementColor: () => void
  collectionToElementShape: () => void
  shapeToColor:             () => void
  colorToShape:             () => void
  shapeToCollection:        () => void

  // Score Window navigation
  selectElement:    (id: string | null) => void
  selectDimension:  (id: string | null) => void
  selectCollection: (id: string | null) => void
  setActiveTab:     (tab: AppState['activeTab']) => void

  // Multi-select (not persisted; synced across map windows via multiSelection:update IPC)
  selectedElementIds:     string[]
  selectElements:          (ids: string[]) => void
  toggleElementSelection:  (id: string) => void
  clearElementSelection:   () => void

  // Session lifecycle
  loadSession:  (state: AppState) => void
  resetToEmpty: () => void
}

function safeWeightChanges<T extends { weight: number }>(changes: Partial<T>): Partial<T> {
  return changes.weight === undefined
    ? changes
    : { ...changes, weight: openWeight(changes.weight) }
}

// ── Initial empty state ───────────────────────────────────────────────────────

const emptyState: AppState = {
  filePath: null,
  isDirty: false,
  sessionMeta: defaultSessionMeta(),
  elements: [],
  collections: [],
  dimensions: [],
  scores: {},
  maps: [],
  selectedElementId: null,
  selectedDimensionId: null,
  selectedCollectionId: null,
  activeTab: 'elements'
}

// ── Shape / color conversion helpers ─────────────────────────────────────────

function randomWeight(): number {
  return Math.floor(Math.random() * 100) + 1
}

const SHAPE_COLORS: Record<ElementShape, string> = {
  circle:   '#4080c0',
  square:   '#c04040',
  triangle: '#40a040',
  diamond:  '#a040a0',
}

function hexToHue(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  if (max === min) return 0
  const d = max - min
  let h: number
  if (max === r)      h = (g - b) / d + (g < b ? 6 : 0)
  else if (max === g) h = (b - r) / d + 2
  else                h = (r - g) / d + 4
  return (h / 6) * 360
}

function hueToShape(hue: number): ElementShape {
  if (hue < 30 || hue >= 330) return 'circle'
  if (hue < 150)              return 'square'
  if (hue < 270)              return 'triangle'
  return 'diamond'
}

// ── Store implementation ──────────────────────────────────────────────────────

export const useAppStore = create<AppStore>((set) => ({
  ...emptyState,
  selectedElementIds: [],

  // ── Session metadata ─────────────────────────────────────────────────────

  updateSessionMeta: (changes) => set((s) => ({
    sessionMeta: { ...s.sessionMeta, ...changes },
    isDirty: true
  })),

  // ── Elements ────────────────────────────────────────────────────────────────

  addElement: (name, color) => set((s) => {
    const prefs = usePrefsStore.getState().prefs
    const resolvedColor = color ?? prefs.defaultElementColor
    const el: Element = {
      id: crypto.randomUUID(), name, definition: '', weight: 1,
      color: resolvedColor, shape: prefs.defaultElementShape, collectionIds: []
    }
    return { elements: [...s.elements, el], isDirty: true }
  }),

  // Creates a copy of the element immediately after the original in the list.
  // The copy gets a new UUID, a " copy" name suffix, and all scores from the
  // original so it starts positioned identically on every map. Its memberships
  // ride along in the spread, so it also starts inside the same blobs.
  duplicateElement: (id) => set((s) => {
    const original = s.elements.find(e => e.id === id)
    if (!original) return s
    const copy: Element = { ...original, id: crypto.randomUUID(), name: `${original.name} copy` }
    // Insert the copy right after the original rather than appending to the end
    const idx = s.elements.findIndex(e => e.id === id)
    const elements = [
      ...s.elements.slice(0, idx + 1),
      copy,
      ...s.elements.slice(idx + 1)
    ]
    return {
      elements,
      scores: { ...s.scores, [copy.id]: { ...s.scores[id] } },
      selectedElementId: copy.id,   // select the new copy so the user can rename it immediately
      isDirty: true
    }
  }),

  updateElement: (id, changes) => set((s) => {
    const safeChanges = safeWeightChanges(changes)
    return {
      elements: s.elements.map(e => e.id === id ? { ...e, ...safeChanges } : e),
      isDirty: true
    }
  }),

  removeElement: (id) => set((s) => {
    const remaining = s.elements.filter(e => e.id !== id)
    const scores = { ...s.scores }
    delete scores[id]
    return {
      elements: remaining,
      scores,
      selectedElementId: s.selectedElementId === id ? null : s.selectedElementId,
      isDirty: true
    }
  }),

  // ── Collections ──────────────────────────────────────────────────────────────

  // New collections take the next palette color rather than a shared default
  // gray. A gray default made every collection identical, so coloring a map by
  // collection looked broken and — worse — dragged multi-collection mixes
  // toward gray.
  addCollection: (name, id) => {
    const newId = id ?? crypto.randomUUID()
    set((s) => ({
      collections: [...s.collections, { id: newId, name, definition: '', color: paletteColor(s.collections.length) }],
      isDirty: true
    }))
    return newId
  },

  // Fills in palette colors for collections still sitting on the legacy default
  // gray, leaving any deliberately chosen color alone. Idempotent, and the only
  // way to make collection coloring useful on a session created before the
  // palette existed without recoloring every collection by hand.
  assignPaletteToUncoloredCollections: () => set((s) => ({
    collections: s.collections.map((c, i) =>
      c.color === DEFAULT_COLLECTION_COLOR ? { ...c, color: paletteColor(i) } : c
    ),
    isDirty: true
  })),

  updateCollection: (id, changes) => set((s) => ({
    collections: s.collections.map(c => c.id === id ? { ...c, ...changes } : c),
    isDirty: true
  })),

  // Removes the collection and drops it from every element that belonged to it,
  // so no element is left pointing at a collection that no longer exists.
  removeCollection: (id) => set((s) => ({
    collections: s.collections.filter(c => c.id !== id),
    elements: s.elements.map(el => el.collectionIds.includes(id)
      ? { ...el, collectionIds: el.collectionIds.filter(cid => cid !== id) }
      : el),
    selectedCollectionId: s.selectedCollectionId === id ? null : s.selectedCollectionId,
    isDirty: true
  })),

  // ── Membership ───────────────────────────────────────────────────────────────
  //
  // Both actions go through updateElement's shape rather than a score write:
  // membership is an element attribute now, so assigning one is the same kind
  // of edit as recoloring, and it rides the same element:update IPC to the
  // other windows.

  toggleElementCollection: (elementId, collectionId) => set((s) => ({
    elements: s.elements.map(el => {
      if (el.id !== elementId) return el
      return {
        ...el,
        collectionIds: el.collectionIds.includes(collectionId)
          ? el.collectionIds.filter(id => id !== collectionId)
          : [...el.collectionIds, collectionId]
      }
    }),
    isDirty: true
  })),

  // Drives every listed element to the same membership state, rather than
  // flipping each independently — a mixed selection resolves to one answer.
  setElementsCollection: (elementIds, collectionId, member) => set((s) => ({
    elements: s.elements.map(el => {
      if (!elementIds.includes(el.id)) return el
      const has = el.collectionIds.includes(collectionId)
      if (has === member) return el
      return {
        ...el,
        collectionIds: member
          ? [...el.collectionIds, collectionId]
          : el.collectionIds.filter(id => id !== collectionId)
      }
    }),
    isDirty: true
  })),

  // ── Dimensions ──────────────────────────────────────────────────────────────

  addDimension: (label, categories) => set((s) => {
    const { poleA, poleB } = parsePoles(label)
    const dim: Dimension = {
      id: crypto.randomUUID(),
      label,
      poleA,
      poleB,
      definition: '',
      weight: 1,
      categories: categories ?? defaultCategories()
    }
    return { dimensions: [...s.dimensions, dim], isDirty: true }
  }),

  updateDimension: (id, changes) => set((s) => {
    const safeChanges = safeWeightChanges(changes)
    return {
      dimensions: s.dimensions.map(d => d.id === id ? { ...d, ...safeChanges } : d),
      isDirty: true
    }
  }),

  removeDimension: (id) => set((s) => {
    const remaining = s.dimensions.filter(d => d.id !== id)
    // Prune this dimension's scores from every element to keep the score map clean
    const scores: typeof s.scores = {}
    for (const [elId, dimScores] of Object.entries(s.scores)) {
      const { [id]: _removed, ...rest } = dimScores
      scores[elId] = rest
    }
    return {
      dimensions: remaining,
      scores,
      selectedDimensionId: s.selectedDimensionId === id ? null : s.selectedDimensionId,
      isDirty: true
    }
  }),

  // ── Scores ──────────────────────────────────────────────────────────────────

  setScore: (elementId, targetId, value) => set((s) => ({
    scores: {
      ...s.scores,
      [elementId]: { ...s.scores[elementId], [targetId]: value }
    },
    isDirty: true
  })),

  // Applies many score changes as one update. Dragging a multi-selection writes
  // two scores per selected element on every mouse-move; done one at a time that
  // is a store update — and so a re-render and a full state broadcast — per
  // element per frame. Callers pass at least one entry.
  setScores: (entries) => set((s) => {
    const scores = { ...s.scores }
    for (const { elementId, targetId, value } of entries) {
      scores[elementId] = { ...scores[elementId], [targetId]: value }
    }
    return { scores, isDirty: true }
  }),

  clearScore: (elementId, targetId) => set((s) => {
    const { [targetId]: _removed, ...rest } = s.scores[elementId] ?? {}
    return { scores: { ...s.scores, [elementId]: rest }, isDirty: true }
  }),

  // ── Maps ────────────────────────────────────────────────────────────────────

  addMap: (config) => set((s) => ({
    maps: [...s.maps, config],
    isDirty: true
  })),

  updateMapConfig: (id, changes) => set((s) => ({
    maps: s.maps.map(m => m.id === id ? { ...m, ...changes } as MapConfig : m),
    isDirty: true
  })),

  removeMap: (id) => set((s) => ({
    maps: s.maps.filter(m => m.id !== id),
    isDirty: true
  })),

  // ── Advanced transforms ──────────────────────────────────────────────────────
  //
  // These batch-modify elements or scores based on a chosen dimension.
  // They exist as store actions (not component logic) because they modify
  // multiple slices of state atomically.

  // Converts each element's score on a dimension to its weight (scaled 1–100).
  // Unscored elements are left unchanged.
  // flip=true: score 0.0 (poleA) → weight 100; score 1.0 (poleB) → weight 1
  // flip=false (default): score 1.0 (poleB) → weight 100; score 0.0 (poleA) → weight 1
  dimensionToWeight: (dimensionId, flip = false) => set((s) => ({
    elements: dimensionScoresToWeights(s.elements, s.scores, dimensionId, flip),
    isDirty: true
  })),

  // Writes each element's weight back as its score on a dimension (0–1), using
  // the current Element range rather than a fixed domain.
  // All elements are updated, even those not previously scored on this dimension.
  // flip=true sends the current maximum to poleA and minimum to poleB;
  // flip=false (default) sends the current minimum to poleA and maximum to poleB.
  weightToDimension: (dimensionId, flip = false) => set((s) => {
    return { scores: weightsToDimensionScores(s.elements, s.scores, dimensionId, flip), isDirty: true }
  }),

  // Sets each element's color by interpolating between dimColorLow (score 0) and
  // dimColorHigh (score 1), both read from the user's preferences at call time.
  // Unscored elements are left unchanged.
  dimensionToColor: (dimensionId, colorLow, colorHigh) => set((s) => {
    const prefs = usePrefsStore.getState().prefs
    const dimColorLow  = colorLow  ?? prefs.dimColorLow
    const dimColorHigh = colorHigh ?? prefs.dimColorHigh

    return {
      elements: dimensionScoresToColors(s.elements, s.scores, dimensionId, dimColorLow, dimColorHigh),
      isDirty: true
    }
  }),

  // Copies each element's score from sourceDimId to targetDimId.
  // Only elements that have a score on the source are updated; unscored elements
  // keep their existing target score (or remain unscored on the target).
  dimToDimScores: (sourceDimId, targetDimId) => set((s) => {
    const newScores = { ...s.scores }
    for (const el of s.elements) {
      const score = newScores[el.id]?.[sourceDimId]
      if (score !== undefined) {
        newScores[el.id] = { ...newScores[el.id], [targetDimId]: score }
      }
    }
    return { scores: newScores, isDirty: true }
  }),

  // Assigns a random score to every element on the chosen dimension.
  // Useful for seeding a new dataset before manual scoring begins.
  randomizeScores: (dimensionId) => set((s) => {
    const newScores = { ...s.scores }
    for (const el of s.elements) {
      newScores[el.id] = { ...newScores[el.id], [dimensionId]: Math.random() }
    }
    return { scores: newScores, isDirty: true }
  }),

  // Rescales a dimension's existing scores so the lowest value maps to 0.05
  // and the highest maps to 0.95, preserving relative spacing in between.
  // Unscored elements are left unchanged. If every scored element has the
  // same value, they're all set to 0.5 (no spread to derive a ratio from).
  spreadDimensionScores: (dimensionId) => set((s) => {
    const scores = spreadScores(s.elements, s.scores, dimensionId)
    return scores === s.scores ? s : { scores, isDirty: true }
  }),

  randomizeElementWeights: () => set((s) => ({
    elements: s.elements.map(el => ({ ...el, weight: randomWeight() })),
    isDirty: true
  })),

  randomizeElementColors: () => set((s) => ({
    elements: s.elements.map(el => ({ ...el, color: randomReadableColor() })),
    isDirty: true
  })),

  randomizeDimensionWeights: () => set((s) => ({
    dimensions: s.dimensions.map(dimension => ({
      ...dimension,
      weight: randomWeight()
    })),
    isDirty: true
  })),

  randomizeCollectionColors: () => set((s) => ({
    collections: s.collections.map(collection => ({
      ...collection,
      color: randomReadableColor()
    })),
    isDirty: true
  })),

  randomizeElementShapes: () => set((s) => ({
    elements: s.elements.map(element => ({
      ...element,
      shape: ELEMENT_SHAPES[Math.floor(Math.random() * ELEMENT_SHAPES.length)]
    })),
    isDirty: true
  })),

  randomizeCollectionAssignments: () => set((s) => ({
    elements: s.elements.map(element => ({
      ...element,
      collectionIds: s.collections
        .filter(() => Math.random() < 0.5)
        .map(collection => collection.id)
    })),
    isDirty: true
  })),

  // Bakes collection color into each element's own color attribute: the even
  // mix of every collection it belongs to, which is exactly what a map colored
  // by collection draws live.
  //
  // Elements belonging to no collection keep the color they have: there is
  // nothing to derive one from, and blanking them would destroy data the
  // conversion was never asked about.
  //
  // This overwrites element colors irreversibly (the app has no undo), matching
  // how the other → Element color conversions already behave.
  collectionToElementColor: () => set((s) => ({
    elements: s.elements.map(el => {
      const color = mixCollectionColors(el, s.collections)
      return color !== null ? { ...el, color } : el
    }),
    isDirty: true
  })),

  // Sets each element's shape from the first collection it belongs to,
  // assigning shapes by collection order (circle, square, triangle, diamond,
  // cycling). Elements in no collection are left unchanged.
  //
  // "First" is the tie-break a multi-collection element needs and membership no
  // longer supplies: with binary membership there is no strongest collection to
  // prefer, so this takes the earliest in the session's own ordering — the same
  // order the shape sequence is assigned in, which keeps the mapping readable.
  collectionToElementShape: () => set((s) => ({
    elements: s.elements.map(el => {
      const index = s.collections.findIndex(c => el.collectionIds.includes(c.id))
      return index === -1
        ? el
        : { ...el, shape: ELEMENT_SHAPES[index % ELEMENT_SHAPES.length] }
    }),
    isDirty: true
  })),

  // Sets each element's color using the fixed shape-to-color mapping.
  shapeToColor: () => set((s) => ({
    elements: s.elements.map(el => ({ ...el, color: SHAPE_COLORS[el.shape] })),
    isDirty: true
  })),

  // Sets each element's shape by mapping its color's hue to a shape bucket.
  colorToShape: () => set((s) => ({
    elements: s.elements.map(el => ({ ...el, shape: hueToShape(hexToHue(el.color)) })),
    isDirty: true
  })),

  // Sets membership from each element's shape, mirroring
  // collectionToElementShape: 1st collection=circle, 2nd=square, 3rd=triangle,
  // 4th=diamond (cycling).
  //
  // Membership is replaced outright rather than added to, so the result reads
  // straight off the shapes with no residue from whatever was assigned before.
  // With more than four collections a shape matches every fourth one, so an
  // element can come out of this in several at once.
  shapeToCollection: () => set((s) => ({
    elements: s.elements.map(el => {
      const shapeIdx = ELEMENT_SHAPES.indexOf(el.shape)
      return {
        ...el,
        collectionIds: s.collections
          .filter((_, i) => i % ELEMENT_SHAPES.length === shapeIdx)
          .map(c => c.id)
      }
    }),
    isDirty: true
  })),

  // ── Navigation ───────────────────────────────────────────────────────────────

  selectElement:    (id) => set({ selectedElementId: id }),
  selectDimension:  (id) => set({ selectedDimensionId: id }),
  selectCollection: (id) => set({ selectedCollectionId: id }),
  setActiveTab:     (tab) => set({ activeTab: tab }),

  selectElements:         (ids) => set({ selectedElementIds: ids }),
  toggleElementSelection: (id) => set((s) => ({
    selectedElementIds: s.selectedElementIds.includes(id)
      ? s.selectedElementIds.filter(x => x !== id)
      : [...s.selectedElementIds, id]
  })),
  clearElementSelection:  () => set({ selectedElementIds: [] }),

  // ── Session lifecycle ────────────────────────────────────────────────────────

  // Replaces the entire store state. Used by file open, import, and by
  // map windows when they receive a 'state:push' broadcast.
  loadSession: (state) => set({ ...state }),

  // Resets to an empty session (File → New)
  resetToEmpty: () => set({ ...emptyState, sessionMeta: defaultSessionMeta(), selectedElementIds: [] })
}))
