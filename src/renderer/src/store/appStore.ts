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
  MapConfig, CartesianMapConfig, SemanticMapConfig, Tab
} from '../lib/types'
import { paletteColor } from '../lib/color'
import { defaultSessionMeta, newCollection, newDimension, newElement } from '../lib/types'
import { usePrefsStore } from './prefsStore'
import { openWeight } from '../lib/numericRange'
import type { Transform } from './transforms'

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

  // Membership — binary, and an attribute of the element like its color or shape
  setElementsCollection:   (elementIds: string[], collectionId: string, member: boolean) => void

  // Dimensions
  addDimension:    (label: string, categories?: DimensionCategories) => void
  updateDimension: (id: string, changes: Partial<Dimension>) => void
  removeDimension: (id: string) => void

  // Scores (dimension scores; membership is not a score — see above)
  setScore:   (elementId: string, targetId: string, value: number) => void
  setScores:  (entries: ScoreEntry[]) => void

  // Maps
  addMap:          (config: MapConfig) => void
  updateMapConfig: (id: string, changes: Partial<CartesianMapConfig> | Partial<SemanticMapConfig>) => void
  removeMap:       (id: string) => void

  /** Applies a whole-study conversion (store/transforms.ts) as one update. */
  transform: (fn: Transform) => void

  // Score Window navigation
  selectElement:    (id: string | null) => void
  selectDimension:  (id: string | null) => void
  selectCollection: (id: string | null) => void
  setActiveTab:     (tab: Tab) => void

  // Multi-select (not persisted; synced across map windows via multiSelection:update IPC)
  selectedElementIds:     string[]
  selectElements:          (ids: string[]) => void
  toggleElementSelection:  (id: string) => void
  clearElementSelection:   () => void

  // Session lifecycle
  loadSession:  (state: AppState) => void
  resetToEmpty: () => void
  /** Counts studies loaded or started (open, import, New); not part of the study. */
  studyLoads: number
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
  activeTab: 'notes'
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
    const el = newElement(name, { color: color ?? prefs.defaultElementColor, shape: prefs.defaultElementShape })
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
    const collection = newCollection(name, id ? { id } : {})
    set((s) => ({
      collections: [...s.collections, { ...collection, color: paletteColor(s.collections.length) }],
      isDirty: true
    }))
    return collection.id
  },

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
  // Membership goes through updateElement's shape rather than a score write:
  // membership is an element attribute now, so assigning one is the same kind
  // of edit as recoloring, and it rides the same element:update IPC to the
  // other windows.

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

  addDimension: (label, categories) => set((s) => ({
    dimensions: [...s.dimensions, newDimension(label, categories ? { categories } : {})],
    isDirty: true
  })),

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

  // Conversions batch-modify several slices at once, so they apply here as one
  // update; an empty result changes nothing and leaves the study clean.
  transform: (fn) => set((s) => {
    const changes = fn(s)
    return Object.keys(changes).length === 0 ? s : { ...changes, isDirty: true }
  }),

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
  loadSession: (state) => set(s => ({ ...state, studyLoads: s.studyLoads + 1 })),

  // Resets to an empty session (File → New)
  resetToEmpty: () => set(s => ({ ...emptyState, sessionMeta: defaultSessionMeta(), selectedElementIds: [], studyLoads: s.studyLoads + 1 })),
  studyLoads: 0
}))
