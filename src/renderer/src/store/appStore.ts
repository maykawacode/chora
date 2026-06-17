// ── Application state store ───────────────────────────────────────────────────
//
// Single source of truth for all session data: elements, types, dimensions,
// scores, and map configurations. Built with Zustand so any component can
// subscribe to exactly the slice it needs without prop drilling.
//
// Architecture note:
//   The Score Window (App.tsx) subscribes to this store and broadcasts the
//   full serialized state to all open map windows whenever it changes.
//   Map windows apply incoming state via loadSession() but do NOT write back
//   through this store — they send fine-grained IPC messages instead.
//   See App.tsx for the suppressBroadcast ref pattern that prevents loops.

import { create } from 'zustand'
import { v4 as uuid } from 'uuid'
import type {
  AppState, Element, Type, Dimension, DimensionCategories, SessionMeta,
  MapConfig, CartesianMapConfig, SemanticMapConfig, TypeProjectionMapConfig
} from '../lib/types'
import { defaultCategories, defaultSessionMeta, parsePoles } from '../lib/types'
import { usePrefsStore } from './prefsStore'

// ── Store interface ───────────────────────────────────────────────────────────

interface AppStore extends AppState {
  // Session metadata
  updateSessionMeta: (changes: Partial<SessionMeta>) => void

  // Elements
  addElement:       (name: string, color?: string) => void
  duplicateElement: (id: string) => void
  updateElement:    (id: string, changes: Partial<Element>) => void
  removeElement:    (id: string) => void

  // Types
  addType:    (name: string) => void
  updateType: (id: string, changes: Partial<Type>) => void
  removeType: (id: string) => void

  // Dimensions
  addDimension:    (label: string, categories?: DimensionCategories) => void
  updateDimension: (id: string, changes: Partial<Dimension>) => void
  removeDimension: (id: string) => void

  // Scores (covers both dimension scores and type membership scores)
  setScore:   (elementId: string, targetId: string, value: number) => void
  clearScore: (elementId: string, targetId: string) => void

  // Maps
  addMap:          (config: MapConfig) => void
  updateMapConfig: (id: string, changes: Partial<CartesianMapConfig> | Partial<SemanticMapConfig> | Partial<TypeProjectionMapConfig>) => void
  removeMap:       (id: string) => void

  // Advanced transforms (see descriptions in implementation below)
  // flip=true inverts the score direction so poleA maps to the "high" end instead of poleB
  dimensionToWeight: (dimensionId: string, flip?: boolean) => void
  weightToDimension: (dimensionId: string, flip?: boolean) => void
  dimensionToColor:  (dimensionId: string) => void
  randomizeScores:   (dimensionId: string) => void

  // Score Window navigation
  selectElement:   (id: string | null) => void
  selectDimension: (id: string | null) => void
  setActiveTab:    (tab: AppState['activeTab']) => void

  // Multi-select (map-window local; not persisted or synced via IPC)
  selectedElementIds:     string[]
  selectElements:          (ids: string[]) => void
  toggleElementSelection:  (id: string) => void
  clearElementSelection:   () => void
  bulkUpdateElements:      (ids: string[], changes: Partial<Element>) => void

  // Session lifecycle
  loadSession:  (state: AppState) => void
  markClean:    (filePath: string) => void
  resetToEmpty: () => void
}

// ── Initial empty state ───────────────────────────────────────────────────────

const emptyState: AppState = {
  filePath: null,
  isDirty: false,
  sessionMeta: defaultSessionMeta(),
  elements: [],
  types: [],
  dimensions: [],
  scores: {},
  maps: [],
  selectedElementId: null,
  selectedDimensionId: null,
  activeTab: 'elements'
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
    const resolvedColor = color ?? usePrefsStore.getState().prefs.defaultElementColor
    const el: Element = { id: uuid(), name, definition: '', weight: 1, color: resolvedColor, shape: 'circle' }
    return { elements: [...s.elements, el], isDirty: true }
  }),

  // Creates a copy of the element immediately after the original in the list.
  // The copy gets a new UUID, a " copy" name suffix, and all scores from the
  // original so it starts positioned identically on every map.
  duplicateElement: (id) => set((s) => {
    const original = s.elements.find(e => e.id === id)
    if (!original) return s
    const copy: Element = { ...original, id: uuid(), name: `${original.name} copy` }
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

  updateElement: (id, changes) => set((s) => ({
    elements: s.elements.map(e => e.id === id ? { ...e, ...changes } : e),
    isDirty: true
  })),

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

  // ── Types ────────────────────────────────────────────────────────────────────

  addType: (name) => set((s) => {
    const type: Type = { id: uuid(), name, definition: '' }
    return { types: [...s.types, type], isDirty: true }
  }),

  updateType: (id, changes) => set((s) => ({
    types: s.types.map(t => t.id === id ? { ...t, ...changes } : t),
    isDirty: true
  })),

  // Removes the type and prunes all type-membership scores from the ScoreMap.
  removeType: (id) => set((s) => {
    const remaining = s.types.filter(t => t.id !== id)
    const scores: typeof s.scores = {}
    for (const [elId, elScores] of Object.entries(s.scores)) {
      const { [id]: _removed, ...rest } = elScores
      scores[elId] = rest
    }
    return { types: remaining, scores, isDirty: true }
  }),

  // ── Dimensions ──────────────────────────────────────────────────────────────

  addDimension: (label, categories) => set((s) => {
    const { poleA, poleB } = parsePoles(label)
    const dim: Dimension = {
      id: uuid(),
      label,
      poleA,
      poleB,
      definition: '',
      weight: 1,
      categories: categories ?? defaultCategories()
    }
    return { dimensions: [...s.dimensions, dim], isDirty: true }
  }),

  updateDimension: (id, changes) => set((s) => ({
    dimensions: s.dimensions.map(d => d.id === id ? { ...d, ...changes } : d),
    isDirty: true
  })),

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
    elements: s.elements.map(el => {
      const raw = s.scores[el.id]?.[dimensionId]
      if (raw === undefined) return el
      const score = flip ? 1 - raw : raw
      return { ...el, weight: Math.round(score * 99 + 1) }
    }),
    isDirty: true
  })),

  // Writes each element's weight (1–100) back as its score on a dimension (0–1).
  // All elements are updated, even those not previously scored on this dimension.
  // flip=true: weight 100 → score 0.0 (poleA end); weight 1 → score 1.0 (poleB end)
  // flip=false (default): weight 100 → score 1.0 (poleB end)
  weightToDimension: (dimensionId, flip = false) => set((s) => {
    const newScores = { ...s.scores }
    for (const el of s.elements) {
      const raw = (el.weight - 1) / 99
      newScores[el.id] = { ...newScores[el.id], [dimensionId]: flip ? 1 - raw : raw }
    }
    return { scores: newScores, isDirty: true }
  }),

  // Sets each element's color by interpolating between dimColorLow (score 0) and
  // dimColorHigh (score 1), both read from the user's preferences at call time.
  // Unscored elements are left unchanged.
  dimensionToColor: (dimensionId) => set((s) => {
    const { dimColorLow, dimColorHigh } = usePrefsStore.getState().prefs

    // Parse a '#rrggbb' hex string into an [r, g, b] triple
    const hexToRgb = (hex: string): [number, number, number] => {
      const n = parseInt(hex.slice(1), 16)
      return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
    }

    const [lr, lg, lb] = hexToRgb(dimColorLow)
    const [hr, hg, hb] = hexToRgb(dimColorHigh)

    return {
      elements: s.elements.map(el => {
        const score = s.scores[el.id]?.[dimensionId]
        if (score === undefined) return el
        // Linear interpolation between the two preference colors
        const r = Math.round(lr + (hr - lr) * score)
        const g = Math.round(lg + (hg - lg) * score)
        const b = Math.round(lb + (hb - lb) * score)
        const hex = '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')
        return { ...el, color: hex }
      }),
      isDirty: true
    }
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

  // ── Navigation ───────────────────────────────────────────────────────────────

  selectElement:   (id) => set({ selectedElementId: id }),
  selectDimension: (id) => set({ selectedDimensionId: id }),
  setActiveTab:    (tab) => set({ activeTab: tab }),

  selectElements:         (ids) => set({ selectedElementIds: ids }),
  toggleElementSelection: (id) => set((s) => ({
    selectedElementIds: s.selectedElementIds.includes(id)
      ? s.selectedElementIds.filter(x => x !== id)
      : [...s.selectedElementIds, id]
  })),
  clearElementSelection:  () => set({ selectedElementIds: [] }),
  bulkUpdateElements:     (ids, changes) => set((s) => ({
    elements: s.elements.map(e => ids.includes(e.id) ? { ...e, ...changes } : e),
    isDirty: true
  })),

  // ── Session lifecycle ────────────────────────────────────────────────────────

  // Replaces the entire store state. Used by file open, import, and by
  // map windows when they receive a 'state:push' broadcast.
  loadSession: (state) => set({ ...state }),

  // Called after a successful save — clears isDirty and records the file path
  markClean: (filePath) => set({ filePath, isDirty: false }),

  // Resets to an empty session (File → New)
  resetToEmpty: () => set({ ...emptyState, sessionMeta: defaultSessionMeta(), selectedElementIds: [] })
}))
