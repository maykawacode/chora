import { create } from 'zustand'
import { TABS, type Tab } from '@renderer/lib/types'

/** The tab strip's width, including its 1px right border (border-box; ScoreDock.module.css). */
export const STRIP_WIDTH = 40
/** The strip's width while it shows each icon's name beside it. */
const STRIP_WIDTH_LABELLED = 136

export const stripWidth = (labels: boolean): number => labels ? STRIP_WIDTH_LABELLED : STRIP_WIDTH

/** Line between two open views. */
const PANE_DIVIDER = 1

/**
 * Each view has two widths. It opens at its default, and returns to it when
 * reset, reopened after snapping closed, or shrunk to make room for a new map.
 * Its minimum is the narrowest it can be: a drag past it snaps the view
 * closed, and the arrow keys stop at it. The data views keep their detail
 * below the list (useDataViewLayout), and Assess and Conversions keep their
 * columns side by side however narrow, so each can go this narrow.
 */
const MIN_WIDTHS: Record<Tab, number> = {
  notes: 100, elements: 75, dimensions: 75, collections: 75, scores: 160, conversions: 75
}
export const paneMinWidth = (tab: Tab): number => MIN_WIDTHS[tab]

const DEFAULT_WIDTHS: Record<Tab, number> = {
  notes: 200, elements: 200, dimensions: 200, collections: 200, scores: 380, conversions: 380
}
const paneDefaultWidth = (tab: Tab): number => DEFAULT_WIDTHS[tab]

/** The map area keeps room for at least one tile. */
export const MAP_AREA_MIN_WIDTH = 360

/** A view dragged narrower than its minimum snaps closed. */
export const snapsClosed = (tab: Tab, width: number): boolean => width < paneMinWidth(tab)

// Browser layout of the Score column: which views are open side by side and
// each one's width, whether the column is collapsed to the icon strip, whether
// the strip shows each icon's name. The column is as wide as the strip plus
// its open views; closing the last view collapses it.
//
// Space between Score and the maps follows a priority rule, like VS Code's
// split views: with maps showing, the maps take priority, so each new map
// shrinks Score's wider views to their defaults and the maps take the rest. With
// no maps, Score's views fill the page (ScorePanes.tsx). A view dragged below
// its minimum snaps closed (snapsClosed), and views that cannot all fit
// at their minimums close from the right, sparing the one in use (tabsThatFit).
// It is remembered in localStorage across reloads and tabs; it is browser layout, not study content. `animating` holds while a
// collapse or expand plays, so only those changes animate (not drags or window
// resizes). The map area's transitionend ends it; the timer covers reduced
// motion and interrupted transitions, which fire no transitionend.

const MOTION_FALLBACK_MS = 400
const STORAGE_KEY = 'chora:layout'
const VERSION = 7

/**
 * The record version in which each view's default width last changed. A view
 * width saved by an older record is dropped once, so the view opens at its
 * new default: Elements, Dimensions and Collections at 200px (version 3),
 * Assess at 380px (version 4), Notes at 200px (version 5), Conversions at
 * 380px, as Assess (version 7).
 */
const WIDTH_RESET_AT: Record<Tab, number> = {
  notes: 5, elements: 3, dimensions: 3, collections: 3, scores: 4, conversions: 7
}

export interface StoredLayout {
  openTabs: Tab[]
  paneWidths: Partial<Record<Tab, number>>
  collapsed: boolean
  labels: boolean
}

const DEFAULT_LAYOUT: StoredLayout = { openTabs: ['notes'], paneWidths: {}, collapsed: false, labels: false }

const isTab = (v: unknown): v is Tab => TABS.includes(v as Tab)
const inStripOrder = (tabs: Tab[]): Tab[] => TABS.filter(t => tabs.includes(t))
const validWidth = (w: unknown): w is number => typeof w === 'number' && Number.isFinite(w) && w > 0

/** Reads a stored layout record; anything unreadable or foreign gives the defaults. */
export function parseLayout(raw: string | null): StoredLayout {
  if (!raw) return DEFAULT_LAYOUT
  try {
    const v = JSON.parse(raw)
    if (!Number.isInteger(v?.version) || v.version < 1 || v.version > VERSION) return DEFAULT_LAYOUT
    const paneWidths: StoredLayout['paneWidths'] = {}
    if (v.paneWidths && typeof v.paneWidths === 'object') {
      for (const [tab, w] of Object.entries(v.paneWidths)) {
        if (isTab(tab) && validWidth(w) && v.version >= WIDTH_RESET_AT[tab]) paneWidths[tab] = Math.round(w)
      }
    }
    const openTabs = Array.isArray(v.openTabs) ? inStripOrder(v.openTabs.filter(isTab)) : DEFAULT_LAYOUT.openTabs
    return {
      openTabs,
      paneWidths,
      // With no view open there is nothing to show beside the strip.
      collapsed: v.collapsed === true || openTabs.length === 0,
      // Added after version 1 shipped; older records have no names showing.
      labels: v.labels === true
    }
  } catch {
    return DEFAULT_LAYOUT
  }
}

function readLayout(): StoredLayout {
  try { return parseLayout(localStorage.getItem(STORAGE_KEY)) } catch { return DEFAULT_LAYOUT }
}

function writeLayout({ openTabs, paneWidths, collapsed, labels }: StoredLayout): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: VERSION, openTabs, paneWidths, collapsed, labels }))
  } catch { /* storage blocked or full: layout lasts for this page only */ }
}

/** A view's width: as last set, never below its minimum. */
export function paneWidth(layout: Pick<StoredLayout, 'paneWidths'>, tab: Tab): number {
  return Math.max(paneMinWidth(tab), layout.paneWidths[tab] ?? paneDefaultWidth(tab))
}

const dividers = (count: number): number => PANE_DIVIDER * Math.max(0, count - 1)

/** The strip plus every open view: how wide the column wants to be. */
export function columnWidth(layout: StoredLayout): number {
  const { openTabs } = layout
  return stripWidth(layout.labels) + openTabs.reduce((sum, t) => sum + paneWidth(layout, t), 0) + dividers(openTabs.length)
}

/** The strip plus every open view at its minimum; past this the column scrolls sideways. */
export function columnMinWidth(layout: StoredLayout): number {
  const { openTabs } = layout
  return stripWidth(layout.labels) + openTabs.reduce((sum, t) => sum + paneMinWidth(t), 0) + dividers(openTabs.length)
}

/**
 * The open views that fit in `room` (strip included) at their minimums,
 * closing from the right; `keep` is never closed, and one view always stays.
 */
export function tabsThatFit(layout: StoredLayout, room: number, keep: Tab): Tab[] {
  let tabs = layout.openTabs
  while (tabs.length > 1 && columnMinWidth({ ...layout, openTabs: tabs }) > room) {
    const drop = [...tabs].reverse().find(t => t !== keep)!
    tabs = tabs.filter(t => t !== drop)
  }
  return tabs
}

interface ScoreLayout extends StoredLayout {
  animating: boolean
  collapse: () => void
  /**
   * A tab icon chosen: an open view closes; a closed one opens alone, or with
   * `add` (⌘-click or right-click) beside those already open. While collapsed,
   * the column shows with that view alone.
   */
  toggleTab: (tab: Tab, add?: boolean) => void
  /** Shows the column with only this view open (a study just opened). */
  showOnly: (tab: Tab) => void
  /** Makes sure a view is open and showing (a tab chosen from elsewhere). */
  reveal: (tab: Tab) => void
  /** Closes an open view; closing the last one collapses the column. */
  closeTab: (tab: Tab) => void
  /** Closes a view dragged past its minimum; it reopens at its default width. */
  snapClose: (tab: Tab) => void
  setPaneWidth: (tab: Tab, width: number) => void
  /** Sets several views' widths at once (a drag between two views filling the page). */
  setPaneWidths: (widths: Partial<Record<Tab, number>>) => void
  /** Shrinks every open view wider than its default to its default: a new map takes the room. */
  squeeze: () => void
  /** Closes the views that no longer fit in `room` (strip included), sparing `keep`. */
  fit: (room: number, keep: Tab) => void
  /** Sets the column's width (strip included) by resizing its last view, which snaps closed below its minimum. */
  resizeColumn: (width: number) => void
  /** Returns every view to its default width. */
  resetWidths: () => void
  /** Shows or hides the strip's names; the views keep their widths. */
  toggleLabels: () => void
  endAnimation: () => void
}

let fallback: ReturnType<typeof setTimeout> | undefined

export const useScoreLayout = create<ScoreLayout>((set, get) => {
  const toggleTo = (collapsed: boolean): void => {
    if (get().collapsed === collapsed) return
    clearTimeout(fallback)
    fallback = setTimeout(() => get().endAnimation(), MOTION_FALLBACK_MS)
    set({ collapsed, animating: true })
  }
  const open = (tab: Tab): void => {
    const { openTabs } = get()
    if (!openTabs.includes(tab)) set({ openTabs: inStripOrder([...openTabs, tab]) })
  }
  return {
    ...readLayout(),
    animating: false,
    collapse: () => toggleTo(true),
    toggleTab: (tab, add = false) => {
      const { openTabs, collapsed } = get()
      if (!collapsed && openTabs.includes(tab)) return get().closeTab(tab)
      if (collapsed || !add) return get().showOnly(tab)
      open(tab)
      toggleTo(false)
    },
    showOnly: tab => {
      set({ openTabs: [] })
      open(tab)
      toggleTo(false)
    },
    snapClose: tab => {
      // Forgetting its width returns the view to its default.
      const { [tab]: _snapped, ...paneWidths } = get().paneWidths
      set({ paneWidths })
      get().closeTab(tab)
    },
    closeTab: tab => {
      const rest = get().openTabs.filter(t => t !== tab)
      set({ openTabs: rest })
      if (rest.length === 0) toggleTo(true)
    },
    reveal: tab => {
      open(tab)
      toggleTo(false)
    },
    setPaneWidth: (tab, width) => get().setPaneWidths({ [tab]: width }),
    setPaneWidths: widths => {
      const paneWidths = { ...get().paneWidths }
      for (const [tab, w] of Object.entries(widths) as [Tab, number][]) {
        paneWidths[tab] = Math.round(Math.max(paneMinWidth(tab), w))
      }
      set({ paneWidths })
    },
    squeeze: () => {
      const paneWidths = { ...get().paneWidths }
      const layout = get()
      for (const tab of layout.openTabs) paneWidths[tab] = Math.min(paneWidth(layout, tab), paneDefaultWidth(tab))
      set({ paneWidths })
    },
    fit: (room, keep) => {
      const layout = get()
      const tabs = tabsThatFit(layout, room, keep)
      if (tabs.length < layout.openTabs.length) set({ openTabs: tabs })
    },
    resizeColumn: width => {
      const layout = get()
      const last = layout.openTabs[layout.openTabs.length - 1]
      if (!last) return
      const next = paneWidth(layout, last) + width - columnWidth(layout)
      if (snapsClosed(last, next)) layout.snapClose(last)
      else layout.setPaneWidth(last, next)
    },
    resetWidths: () => set({ paneWidths: {} }),
    toggleLabels: () => set({ labels: !get().labels }),
    endAnimation: () => {
      clearTimeout(fallback)
      if (get().animating) set({ animating: false })
    }
  }
})

// Drags change widths every pointer move; write once they settle.
const WRITE_DELAY_MS = 300
let pendingWrite: ReturnType<typeof setTimeout> | undefined

const flush = (): void => {
  if (pendingWrite === undefined) return
  clearTimeout(pendingWrite)
  pendingWrite = undefined
  writeLayout(useScoreLayout.getState())
}

useScoreLayout.subscribe((s, prev) => {
  if (s.openTabs === prev.openTabs && s.paneWidths === prev.paneWidths &&
      s.collapsed === prev.collapsed && s.labels === prev.labels) return
  clearTimeout(pendingWrite)
  pendingWrite = setTimeout(flush, WRITE_DELAY_MS)
})

// A reload straight after a drag still keeps the new width.
if (typeof window !== 'undefined') window.addEventListener('pagehide', flush)
