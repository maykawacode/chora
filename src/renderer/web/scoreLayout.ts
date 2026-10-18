import { create } from 'zustand'
import type { AppState } from '@renderer/lib/types'
import { PANE_MIN_WIDTH } from '../src/components/ScoreWindow/useResizableSplitPane'

export type Tab = AppState['activeTab']

/** The tab strip's width, including its 1px right border (border-box; ScoreDock.module.css). */
export const STRIP_WIDTH = 40
/** The strip's width while it shows each icon's name beside it. */
export const STRIP_WIDTH_LABELLED = 136

export const stripWidth = (labels: boolean): number => labels ? STRIP_WIDTH_LABELLED : STRIP_WIDTH

/** The strip's order, which open views keep side by side. */
export const TAB_ORDER: readonly Tab[] = ['notes', 'elements', 'dimensions', 'collections', 'scores', 'conversions']

/** Line between two open views. */
export const PANE_DIVIDER = 1

/** Notes is one text field and can go thin; the others hold a list and its detail side by side. */
export const paneMinWidth = (tab: Tab): number => tab === 'notes' ? 160 : 2 * PANE_MIN_WIDTH
const paneDefaultWidth = (tab: Tab): number => tab === 'notes' ? 260 : 440

/** The map area keeps room for at least one tile. */
export const MAP_AREA_MIN_WIDTH = 360

/**
 * A view can be dragged narrower than its minimum, down to this share of it;
 * dragged past that, it snaps closed. Only drags go below the minimum: new
 * maps, fitting and resets use the minimum itself, and a view reopens at
 * its minimum or wider.
 */
const SNAP_SHARE = 0.5
export const paneSnapWidth = (tab: Tab): number => Math.round(paneMinWidth(tab) * SNAP_SHARE)
export const snapsClosed = (tab: Tab, width: number): boolean => width < paneSnapWidth(tab)

// Browser layout of the Score column: which views are open side by side and
// each one's width, whether the column is collapsed to the icon strip, whether
// the strip shows each icon's name. The column is as wide as the strip plus
// its open views; closing the last view collapses it.
//
// Space between Score and the maps follows a priority rule, like VS Code's
// split views: with maps showing, the maps take priority, so each new map
// shrinks Score's views to their minimums and the maps take the rest. With no
// maps, Score's views fill the page (ScorePanes.tsx). A view dragged well
// below its minimum snaps closed (snapsClosed), and views that cannot all fit
// at their minimums close from the right, sparing the one in use (tabsThatFit).
// It is remembered in localStorage across reloads and tabs; it is browser layout, not study content. `animating` holds while a
// collapse or expand plays, so only those changes animate (not drags or window
// resizes). The map area's transitionend ends it; the timer covers reduced
// motion and interrupted transitions, which fire no transitionend.

const MOTION_FALLBACK_MS = 400
const STORAGE_KEY = 'chora:layout'
const VERSION = 1

export interface StoredLayout {
  openTabs: Tab[]
  paneWidths: Partial<Record<Tab, number>>
  collapsed: boolean
  labels: boolean
}

const DEFAULT_LAYOUT: StoredLayout = { openTabs: ['notes'], paneWidths: {}, collapsed: false, labels: false }

const isTab = (v: unknown): v is Tab => TAB_ORDER.includes(v as Tab)
const inStripOrder = (tabs: Tab[]): Tab[] => TAB_ORDER.filter(t => tabs.includes(t))
const validWidth = (w: unknown): w is number => typeof w === 'number' && Number.isFinite(w) && w > 0

/** Reads a stored layout record; anything unreadable or foreign gives the defaults. */
export function parseLayout(raw: string | null): StoredLayout {
  if (!raw) return DEFAULT_LAYOUT
  try {
    const v = JSON.parse(raw)
    if (v?.version !== VERSION) return DEFAULT_LAYOUT
    const paneWidths: StoredLayout['paneWidths'] = {}
    if (v.paneWidths && typeof v.paneWidths === 'object') {
      for (const [tab, w] of Object.entries(v.paneWidths)) {
        if (isTab(tab) && validWidth(w)) paneWidths[tab] = Math.round(w)
      }
    } else if (validWidth(v.scoreWidth)) {
      // Written before views opened side by side: the one Score width,
      // strip included, becomes the width of each list-and-detail view.
      const strip = stripWidth(v.labels === true)
      for (const tab of TAB_ORDER) if (tab !== 'notes') paneWidths[tab] = Math.round(v.scoreWidth - strip)
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

/** A view's width: as last set, never below its snap width. */
export function paneWidth(layout: Pick<StoredLayout, 'paneWidths'>, tab: Tab): number {
  return Math.max(paneSnapWidth(tab), layout.paneWidths[tab] ?? paneDefaultWidth(tab))
}

/** How narrow the layout may squeeze a view: its minimum, or less if it was dragged narrower. */
export const paneFloor = (layout: Pick<StoredLayout, 'paneWidths'>, tab: Tab): number =>
  Math.min(paneMinWidth(tab), paneWidth(layout, tab))

const dividers = (count: number): number => PANE_DIVIDER * Math.max(0, count - 1)

/** The strip plus every open view: how wide the column wants to be. */
export function columnWidth(layout: StoredLayout): number {
  const { openTabs } = layout
  return stripWidth(layout.labels) + openTabs.reduce((sum, t) => sum + paneWidth(layout, t), 0) + dividers(openTabs.length)
}

/** The strip plus every open view at its minimum; past this the column scrolls sideways. */
export function columnMinWidth(layout: StoredLayout): number {
  const { openTabs } = layout
  return stripWidth(layout.labels) + openTabs.reduce((sum, t) => sum + paneFloor(layout, t), 0) + dividers(openTabs.length)
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
  /** Opens a closed view or closes an open one; while collapsed, shows the column with it open. */
  toggleTab: (tab: Tab) => void
  /** Makes sure a view is open and showing (a tab chosen from elsewhere). */
  reveal: (tab: Tab) => void
  /** Closes an open view; closing the last one collapses the column. */
  closeTab: (tab: Tab) => void
  setPaneWidth: (tab: Tab, width: number) => void
  /** Sets several views' widths at once (a drag between two views filling the page). */
  setPaneWidths: (widths: Partial<Record<Tab, number>>) => void
  /** Shrinks every open view to its minimum: a new map takes the room. */
  squeeze: () => void
  /** Closes the views that no longer fit in `room` (strip included), sparing `keep`. */
  fit: (room: number, keep: Tab) => void
  /** Sets the column's width (strip included) by resizing its last view, which snaps closed if dragged far enough. */
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
  // A view reopens at least at its minimum, though it was dragged narrower or snapped closed.
  const open = (tab: Tab): void => {
    const layout = get()
    if (layout.openTabs.includes(tab)) return
    const paneWidths = paneWidth(layout, tab) < paneMinWidth(tab)
      ? { ...layout.paneWidths, [tab]: paneMinWidth(tab) }
      : layout.paneWidths
    set({ openTabs: inStripOrder([...layout.openTabs, tab]), paneWidths })
  }
  return {
    ...readLayout(),
    animating: false,
    collapse: () => toggleTo(true),
    toggleTab: tab => {
      const { openTabs, collapsed } = get()
      if (collapsed || !openTabs.includes(tab)) {
        open(tab)
        toggleTo(false)
        return
      }
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
        paneWidths[tab] = Math.round(Math.max(paneSnapWidth(tab), w))
      }
      set({ paneWidths })
    },
    squeeze: () => {
      const paneWidths = { ...get().paneWidths }
      for (const tab of get().openTabs) paneWidths[tab] = paneMinWidth(tab)
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
      if (snapsClosed(last, next)) layout.closeTab(last)
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
