import { create } from 'zustand'
import { v4 as uuid } from 'uuid'
import type { AppState, Element, Dimension, MapConfig, CartesianMapConfig, SemanticMapConfig } from '../lib/types'
import { defaultCategories, parsePoles } from '../lib/types'

interface AppStore extends AppState {
  // Elements
  addElement: (name: string) => void
  updateElement: (id: string, changes: Partial<Element>) => void
  removeElement: (id: string) => void

  // Dimensions
  addDimension: (label: string) => void
  updateDimension: (id: string, changes: Partial<Dimension>) => void
  removeDimension: (id: string) => void

  // Scores
  setScore: (elementId: string, dimensionId: string, value: number) => void
  clearScore: (elementId: string, dimensionId: string) => void

  // Maps
  addMap: (config: MapConfig) => void
  updateMapConfig: (id: string, changes: Partial<CartesianMapConfig> | Partial<SemanticMapConfig>) => void
  removeMap: (id: string) => void

  // Score window navigation
  selectElement: (id: string | null) => void
  selectDimension: (id: string | null) => void
  setActiveTab: (tab: AppState['activeTab']) => void

  // Session
  loadSession: (state: AppState) => void
  markClean: (filePath: string) => void
  resetToEmpty: () => void
}

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

export const useAppStore = create<AppStore>((set) => ({
  ...emptyState,

  addElement: (name) => set((s) => {
    const el: Element = { id: uuid(), name, weight: 1, color: '#808000', description: '' }
    return {
      elements: [...s.elements, el],
      selectedElementId: el.id,
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
      selectedElementId: remaining[0]?.id ?? null,
      isDirty: true
    }
  }),

  addDimension: (label) => set((s) => {
    const { poleA, poleB } = parsePoles(label)
    const dim: Dimension = {
      id: uuid(),
      label,
      poleA,
      poleB,
      weight: 1,
      description: '',
      categories: defaultCategories()
    }
    return {
      dimensions: [...s.dimensions, dim],
      selectedDimensionId: dim.id,
      isDirty: true
    }
  }),

  updateDimension: (id, changes) => set((s) => ({
    dimensions: s.dimensions.map(d => d.id === id ? { ...d, ...changes } : d),
    isDirty: true
  })),

  removeDimension: (id) => set((s) => {
    const remaining = s.dimensions.filter(d => d.id !== id)
    const scores: typeof s.scores = {}
    for (const [elId, dimScores] of Object.entries(s.scores)) {
      const { [id]: _, ...rest } = dimScores
      scores[elId] = rest
    }
    return {
      dimensions: remaining,
      scores,
      selectedDimensionId: remaining[0]?.id ?? null,
      isDirty: true
    }
  }),

  setScore: (elementId, dimensionId, value) => set((s) => ({
    scores: {
      ...s.scores,
      [elementId]: { ...s.scores[elementId], [dimensionId]: value }
    },
    isDirty: true
    // Phase 4: window.api.broadcastScore(elementId, dimensionId, value)
  })),

  clearScore: (elementId, dimensionId) => set((s) => {
    const { [dimensionId]: _, ...rest } = s.scores[elementId] ?? {}
    return { scores: { ...s.scores, [elementId]: rest }, isDirty: true }
  }),

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

  selectElement: (id) => set({ selectedElementId: id }),
  selectDimension: (id) => set({ selectedDimensionId: id }),
  setActiveTab: (tab) => set({ activeTab: tab }),

  loadSession: (state) => set({ ...state }),

  markClean: (filePath) => set({ filePath, isDirty: false }),

  resetToEmpty: () => set({ ...emptyState })
}))
