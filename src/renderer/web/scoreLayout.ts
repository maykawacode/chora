import { create } from 'zustand'
import { PANE_MIN_WIDTH } from '../src/components/ScoreWindow/useResizableSplitPane'

/** The tab strip's width, including its 1px right border (border-box; ScoreDock.module.css). */
export const STRIP_WIDTH = 40
/** The strip's width while it shows each icon's name beside it. */
export const STRIP_WIDTH_LABELLED = 136

export const stripWidth = (labels: boolean): number => labels ? STRIP_WIDTH_LABELLED : STRIP_WIDTH
/** Score's two side-by-side panes (list and detail) at their own minimums. */
export const SCORE_MIN_WIDTH = 2 * PANE_MIN_WIDTH
/** Everything left of the splitter at its narrowest: the strip plus Score. */
export const leftMinWidth = (labels: boolean): number => stripWidth(labels) + SCORE_MIN_WIDTH
/** The map area keeps room for at least one tile. */
export const MAP_AREA_MIN_WIDTH = 360
/** Score's default share of the page width (BrowserWorkspace.module.css: 23%). */
export const DEFAULT_SHARE = 0.23

// Browser layout of the Score column: its width (strip included; null keeps
// the default share), whether it is collapsed to the icon strip, whether the
// strip shows each icon's name, and which
// view it shows (Score, or Settings in Score's place; the view always starts
// as Score). Width, collapse and names are remembered in localStorage across reloads
// and tabs; they are browser layout,
// not study content. `animating` holds while a collapse or expand plays, so
// only those changes animate (not splitter drags or window resizes). The map
// area's transitionend ends it; the timer covers reduced motion and
// interrupted transitions, which fire no transitionend.

const MOTION_FALLBACK_MS = 400
const STORAGE_KEY = 'chora:layout'
const VERSION = 1

export interface StoredLayout { scoreWidth: number | null; collapsed: boolean; labels: boolean }

const DEFAULT_LAYOUT: StoredLayout = { scoreWidth: null, collapsed: false, labels: false }

/** Reads a stored layout record; anything unreadable or foreign gives the defaults. */
export function parseLayout(raw: string | null): StoredLayout {
  if (!raw) return DEFAULT_LAYOUT
  try {
    const v = JSON.parse(raw)
    if (v?.version !== VERSION) return DEFAULT_LAYOUT
    const width = v.scoreWidth
    return {
      scoreWidth: typeof width === 'number' && Number.isFinite(width) && width > 0 ? Math.round(width) : null,
      collapsed: v.collapsed === true,
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

function writeLayout({ scoreWidth, collapsed, labels }: StoredLayout): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: VERSION, scoreWidth, collapsed, labels }))
  } catch { /* storage blocked or full: layout lasts for this page only */ }
}

export type ColumnView = 'score' | 'settings'

interface ScoreLayout extends StoredLayout {
  view: ColumnView
  animating: boolean
  collapse: () => void
  expand: () => void
  /** Shows the view, expanding the column if it is collapsed. */
  show: (view: ColumnView) => void
  setScoreWidth: (width: number | null) => void
  /** Shows or hides the strip's names; Score keeps its own width. */
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
  return {
    ...readLayout(),
    view: 'score',
    animating: false,
    collapse: () => toggleTo(true),
    expand: () => toggleTo(false),
    show: view => {
      if (get().view !== view) set({ view })
      toggleTo(false)
    },
    setScoreWidth: scoreWidth => set({ scoreWidth }),
    toggleLabels: () => {
      const { labels, scoreWidth } = get()
      const grow = stripWidth(!labels) - stripWidth(labels)
      set({ labels: !labels, scoreWidth: scoreWidth === null ? null : scoreWidth + grow })
    },
    endAnimation: () => {
      clearTimeout(fallback)
      if (get().animating) set({ animating: false })
    }
  }
})

// Splitter drags change the width every pointer move; write once they settle.
const WRITE_DELAY_MS = 300
let pendingWrite: ReturnType<typeof setTimeout> | undefined

const flush = (): void => {
  if (pendingWrite === undefined) return
  clearTimeout(pendingWrite)
  pendingWrite = undefined
  const { scoreWidth, collapsed, labels } = useScoreLayout.getState()
  writeLayout({ scoreWidth, collapsed, labels })
}

useScoreLayout.subscribe((s, prev) => {
  if (s.scoreWidth === prev.scoreWidth && s.collapsed === prev.collapsed && s.labels === prev.labels) return
  clearTimeout(pendingWrite)
  pendingWrite = setTimeout(flush, WRITE_DELAY_MS)
})

// A reload straight after a drag still keeps the new width.
if (typeof window !== 'undefined') window.addEventListener('pagehide', flush)
