import { useEffect, useRef, type ReactNode } from 'react'
import { useAppStore } from '@renderer/store/appStore'
import { TAB_ACCESSIBLE_LABELS } from '@renderer/components/ScoreWindow/ScoreWindow'
import type { AppState } from '@renderer/lib/types'
import { DEFAULT_SHARE, MAP_AREA_MIN_WIDTH, SCORE_MIN_WIDTH, STRIP_WIDTH, useScoreLayout } from './scoreLayout'
import { Glyph } from './Glyph'
import { useStripMenus } from './StripCommands'
import styles from './ScoreDock.module.css'

// Browser Score column: an always-visible strip beside the Score Window, the
// page's anchor. One list from the top: File | Notes, Elements, Dimensions,
// Collections | Assess, Conversions, Maps | Help, Settings (commands in
// StripCommands.tsx). Choosing the tab already showing collapses Score and
// clears the highlight; any tab icon while collapsed opens Score on that tab. Collapsing hides the Score Window, still
// mounted so tab state and pending edits survive; choosing a tab icon opens
// Score on that tab. The strip is meant to replace the tab bar eventually.

type Tab = AppState['activeTab']

const TAB_GLYPHS: Record<Tab, ReactNode> = {
  notes: <>
    <rect x="3" y="1.5" width="10" height="13" rx="1.5" />
    <path d="M5.5 5h5M5.5 8h5M5.5 11h3" />
  </>,
  elements: <g fill="currentColor" stroke="none">
    <circle cx="4.5" cy="5" r="1.8" />
    <circle cx="11.5" cy="4" r="1.8" />
    <circle cx="7.5" cy="11.5" r="1.8" />
  </g>,
  dimensions: <path d="M3 1.5v11.5h11.5M1.5 3 3 1.5 4.5 3M13 11.5l1.5 1.5-1.5 1.5" />,
  collections: <>
    <rect x="1.5" y="1.5" width="8" height="8" rx="1.5" />
    <rect x="6.5" y="6.5" width="8" height="8" rx="1.5" />
  </>,
  scores: <>
    <path d="M1.5 8h13" />
    <circle cx="10" cy="8" r="2.5" fill="currentColor" />
  </>,
  conversions: <g fill="currentColor" stroke="none">
    <circle cx="3" cy="8" r="1.4" />
    <circle cx="8" cy="8" r="1.4" />
    <circle cx="13" cy="8" r="1.4" />
  </g>
}

/**
 * Score's open width before it has been measured (the page loaded collapsed):
 * the remembered width less the strip, or the default share, within the
 * splitter's limits (BrowserWorkspace.tsx).
 */
function estimatedOpenWidth(): number {
  const left = useScoreLayout.getState().scoreWidth ?? DEFAULT_SHARE * window.innerWidth + STRIP_WIDTH
  const max = window.innerWidth - MAP_AREA_MIN_WIDTH - STRIP_WIDTH
  return Math.round(Math.max(SCORE_MIN_WIDTH, Math.min(left - STRIP_WIDTH, max)))
}

export function ScoreDock({ children }: { children: ReactNode }): React.JSX.Element {
  const collapsed = useScoreLayout(s => s.collapsed)
  const animating = useScoreLayout(s => s.animating)
  const { collapse, expand } = useScoreLayout.getState()
  const scoreRef = useRef<HTMLDivElement>(null)
  // Score's settled open width. While collapsing or expanding, Score is held
  // at this width and slides behind the strip rather than reflowing.
  const openWidth = useRef(0)
  const activeTab = useAppStore(s => s.activeTab)
  const setActiveTab = useAppStore(s => s.setActiveTab)

  // A tab change from elsewhere (Import, a menu command) brings Score back into view.
  useEffect(() => useAppStore.subscribe((s, prev) => {
    if (s.activeTab !== prev.activeTab) useScoreLayout.getState().expand()
  }), [])

  useEffect(() => {
    const el = scoreRef.current
    if (!el) return
    const observer = new ResizeObserver(() => {
      const { collapsed, animating } = useScoreLayout.getState()
      if (!collapsed && !animating) openWidth.current = el.getBoundingClientRect().width
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const menus = useStripMenus()

  const tabButton = (tab: Tab): React.JSX.Element => {
    const label = TAB_ACCESSIBLE_LABELS[tab]
    // Only the tab Score is showing is highlighted; collapsed, none is.
    const showing = tab === activeTab && !collapsed
    return (
      <button
        key={tab}
        className={`${styles.stripButton} ${showing ? styles.stripButtonActive : ''}`}
        title={showing ? `${label} (click to collapse Score)` : label}
        aria-label={label}
        aria-pressed={showing}
        onClick={() => {
          if (showing) return collapse()
          setActiveTab(tab)
          expand()
        }}
      >
        <Glyph>{TAB_GLYPHS[tab]}</Glyph>
      </button>
    )
  }
  const divider = (key: string): React.JSX.Element => <div key={key} className={styles.stripDivider} />

  return (
    <>
      <nav className={styles.strip} data-strip aria-label="Score tabs and commands">
        {menus.menuButton('File')}
        {divider('a')}
        {(['notes', 'elements', 'dimensions', 'collections'] as const).map(tabButton)}
        {divider('b')}
        {(['scores', 'conversions'] as const).map(tabButton)}
        {menus.menuButton('Maps')}
        {divider('c')}
        {menus.menuButton('Help')}
        {menus.settingsButton}
        {menus.flyout}
      </nav>
      <div ref={scoreRef} className={styles.score} hidden={collapsed && !animating} inert={collapsed}>
        <div
          className={styles.scoreInner}
          style={animating ? { flex: `0 0 ${openWidth.current || estimatedOpenWidth()}px` } : undefined}
        >
          {children}
        </div>
      </div>
    </>
  )
}
