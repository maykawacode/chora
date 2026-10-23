import { create } from 'zustand'

// Elements list order: creation/import order (the store's canonical order) or
// A–Z by name, view-only. Shared so the browser can show the toggle in the
// Score title while the desktop keeps it in the list header.

interface ElementSort {
  alpha: boolean
  toggle: () => void
}

export const useElementSort = create<ElementSort>(set => ({
  alpha: false,
  toggle: () => set(s => ({ alpha: !s.alpha }))
}))

export const sortToggleTitle = (alpha: boolean): string =>
  alpha ? 'Showing A–Z — click for creation order' : 'Showing creation order — click for A–Z'
