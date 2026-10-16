import { create } from 'zustand'

/** The tab strip's width, including its 1px right border (border-box; ScoreDock.module.css). */
export const STRIP_WIDTH = 40

// Browser layout of the Score column: collapsed to the icon strip or open.
// Session-only until layout persistence (phase 3d). `animating` holds while a
// collapse or expand plays, so only those changes animate (not splitter drags
// or window resizes). The map area's transitionend ends it; the timer covers
// reduced motion and the no-maps case, where nothing transitions.

const MOTION_FALLBACK_MS = 400

interface ScoreLayout {
  collapsed: boolean
  animating: boolean
  collapse: () => void
  expand: () => void
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
    collapsed: false,
    animating: false,
    collapse: () => toggleTo(true),
    expand: () => toggleTo(false),
    endAnimation: () => {
      clearTimeout(fallback)
      if (get().animating) set({ animating: false })
    }
  }
})
