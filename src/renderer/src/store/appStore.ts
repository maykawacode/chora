// ── Application state store ───────────────────────────────────────────────────
//
// Single source of truth for all session data: elements, dimensions, scores,
// and map configurations. Built with Zustand so any component can subscribe
// to exactly the slice it needs without prop drilling.
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
  AppState, Element, Dimension, DimensionCategories,
  MapConfig, CartesianMapConfig, SemanticMapConfig
} from '../lib/types'
import { defaultCategories, parsePoles } from '../lib/types'
import { usePrefsStore } from './prefsStore'

// ── Store interface ───────────────────────────────────────────────────────────

interface AppStore extends AppState {
  // Elements
  addElement:       (name: string, color?: string) => void
  duplicateElement: (id: string) => void
  updateElement:    (id: string, changes: Partial<Element>) => void
  removeElement:    (id: string) => void

  // Dimensions
  addDimension:    (label: string, categories?: DimensionCategories) => void
  updateDimension: (id: string, changes: Partial<Dimension>) => void
  removeDimension: (id: string) => void

  // Scores
  setScore:   (elementId: string, dimensionId: string, value: number) => void
  clearScore: (elementId: string, dimensionId: string) => void

  // Maps
  addMap:          (config: MapConfig) => void
  updateMapConfig: (id: string, changes: Partial<CartesianMapConfig> | Partial<SemanticMapConfig>) => void
  removeMap:       (id: string) => void

  // Advanced transforms (see descriptions in implementation below)
  dimensionToWeight: (dimensionId: string) => void
  weightToDimension: (dimensionId: string) => void
  dimensionToGray:   (dimensionId: string) => void
  randomizeScores:   (dimensionId: string) => void

  // Score Window navigation
  selectElement:   (id: string | null) => void
  selectDimension: (id: string | null) => void
  setActiveTab:    (tab: AppState['activeTab']) => void

  // Session lifecycle
  loadSession:  (state: AppState) => void
  markClean:    (filePath: string) => void
  resetToEmpty: () => void
}

// ── Initial empty state ───────────────────────────────────────────────────────

const emptyState: AppState = {
  filePath: null,
  isDirty: false,
  elements: [],
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

  // ── Elements ────────────────────────────────────────────────────────────────

  addElement: (name, color) => set((s) => {
    const resolvedColor = color ?? usePrefsStore.getState().prefs.defaultElementColor
    const el: Element = { id: uuid(), name, weight: 1, color: resolvedColor, shape: 'circle', description: '' }
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

  // ── Dimensions ──────────────────────────────────────────────────────────────

  addDimension: (label, categories) => set((s) => {
    const { poleA, poleB } = parsePoles(label)
    const dim: Dimension = {
      id: uuid(),
      label,
      poleA,
      poleB,
      weight: 1,
      description: '',
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

  setScore: (elementId, dimensionId, value) => set((s) => ({
    scores: {
      ...s.scores,
      [elementId]: { ...s.scores[elementId], [dimensionId]: value }
    },
    isDirty: true
  })),

  clearScore: (elementId, dimensionId) => set((s) => {
    const { [dimensionId]: _removed, ...rest } = s.scores[elementId] ?? {}
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
  dimensionToWeight: (dimensionId) => set((s) => ({
    elements: s.elements.map(el => {
      const score = s.scores[el.id]?.[dimensionId]
      if (score === undefined) return el
      return { ...el, weight: Math.round(score * 99 + 1) }
    }),
    isDirty: true
  })),

  // Writes each element's weight (1–100) back as its score on a dimension (0–1).
  // All elements are updated, even those not previously scored on this dimension.
  weightToDimension: (dimensionId) => set((s) => {
    const newScores = { ...s.scores }
    for (const el of s.elements) {
      newScores[el.id] = { ...newScores[el.id], [dimensionId]: (el.weight - 1) / 99 }
    }
    return { scores: newScores, isDirty: true }
  }),

  // Sets each element's color to a gray shade based on its score (darker = lower score).
  // Range is clamped to #141414–#e6e6e6 to keep dots visible against the white background.
  // Unscored elements are left unchanged.
  dimensionToGray: (dimensionId) => set((s) => ({
    elements: s.elements.map(el => {
      const score = s.scores[el.id]?.[dimensionId]
      if (score === undefined) return el
      const v = Math.round(20 + score * 210).toString(16).padStart(2, '0')
      return { ...el, color: `#${v}${v}${v}` }
    }),
    isDirty: true
  })),

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

  // ── Session lifecycle ────────────────────────────────────────────────────────

  // Replaces the entire store state. Used by file open, import, and by
  // map windows when they receive a 'state:push' broadcast.
  loadSession: (state) => set({ ...state }),

  // Called after a successful save — clears isDirty and records the file path
  markClean: (filePath) => set({ filePath, isDirty: false }),

  // Resets to an empty session (File → New)
  resetToEmpty: () => set({ ...emptyState })
}))
