import { useEffect, useRef, type ReactNode } from 'react'
import { useAppStore } from '@renderer/store/appStore'
import { TAB_ACCESSIBLE_LABELS } from '@renderer/components/ScoreWindow/ScoreWindow'
import type { AppState } from '@renderer/lib/types'
import { DEFAULT_SHARE, MAP_AREA_MIN_WIDTH, SCORE_MIN_WIDTH, stripWidth, useScoreLayout } from './scoreLayout'
import { Glyph } from './Glyph'
import { useStripMenus } from './StripCommands'
import { SettingsPanel } from './SettingsPanel'
import styles from './ScoreDock.module.css'

// Browser Score column: an always-visible strip beside the Score Window, the
// page's anchor. One list from the top: Info, File | Notes, Elements,
// Dimensions, Collections | Assess, Conversions, Maps | Settings (commands in
// StripCommands.tsx). Choosing the tab already showing collapses Score and
// clears the highlight; any tab icon while collapsed opens Score on that tab.
// The gear works the same way for Settings, which shows in Score's place.
// Collapsing hides the Score Window, still mounted so tab state and pending
// edits survive. In the browser the strip replaces Score's tab bar. The
// toggle at its foot widens it to show each icon's name; every button carries
// its name, which the strip's labelled style reveals.

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
  const { scoreWidth, labels } = useScoreLayout.getState()
  const strip = stripWidth(labels)
  const left = scoreWidth ?? DEFAULT_SHARE * window.innerWidth + strip
  const max = window.innerWidth - MAP_AREA_MIN_WIDTH - strip
  return Math.round(Math.max(SCORE_MIN_WIDTH, Math.min(left - strip, max)))
}

export function ScoreDock({ children }: { children: ReactNode }): React.JSX.Element {
  const collapsed = useScoreLayout(s => s.collapsed)
  const animating = useScoreLayout(s => s.animating)
  const view = useScoreLayout(s => s.view)
  const labels = useScoreLayout(s => s.labels)
  const { collapse, show, toggleLabels } = useScoreLayout.getState()
  const scoreRef = useRef<HTMLDivElement>(null)
  // Score's settled open width. While collapsing or expanding, Score is held
  // at this width and slides behind the strip rather than reflowing.
  const openWidth = useRef(0)
  const activeTab = useAppStore(s => s.activeTab)
  const setActiveTab = useAppStore(s => s.setActiveTab)

  // A tab change from elsewhere (Import, a menu command) brings Score back into view.
  useEffect(() => useAppStore.subscribe((s, prev) => {
    if (s.activeTab !== prev.activeTab) useScoreLayout.getState().show('score')
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
    // Only the tab Score is showing is highlighted; collapsed or with
    // Settings in its place, none is.
    const showing = tab === activeTab && !collapsed && view === 'score'
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
          show('score')
        }}
      >
        <Glyph>{TAB_GLYPHS[tab]}</Glyph>
        <span className={styles.stripLabel}>{label}</span>
      </button>
    )
  }
  const divider = (key: string): React.JSX.Element => <div key={key} className={styles.stripDivider} />

  return (
    <>
      <nav
        className={`${styles.strip} ${labels ? styles.stripLabelled : ''}`}
        style={{ flexBasis: stripWidth(labels) }}
        data-strip
        aria-label="Score tabs and commands"
      >
        {menus.menuButton('Info')}
        {menus.menuButton('File')}
        {divider('a')}
        {(['notes', 'elements', 'dimensions', 'collections'] as const).map(tabButton)}
        {divider('b')}
        {(['scores', 'conversions'] as const).map(tabButton)}
        {menus.menuButton('Maps')}
        {divider('c')}
        {menus.settingsButton}
        <button
          type="button"
          className={`${styles.stripButton} ${styles.stripFoot}`}
          title={labels ? 'Hide names' : 'Show names'}
          aria-label={labels ? 'Hide names' : 'Show names'}
          aria-pressed={labels}
          onClick={toggleLabels}
        >
          <Glyph><path d={labels ? 'M10 4 6 8l4 4' : 'M6 4l4 4-4 4'} /></Glyph>
          <span className={styles.stripLabel}>Hide names</span>
        </button>
        {menus.flyout}
      </nav>
      <div ref={scoreRef} className={styles.score} hidden={collapsed && !animating} inert={collapsed}>
        <div
          className={styles.scoreInner}
          style={animating ? { flex: `0 0 ${openWidth.current || estimatedOpenWidth()}px` } : undefined}
        >
          {/* Score stays mounted under Settings, so its tab state and pending edits survive. */}
          <div className={styles.view} hidden={view !== 'score'}>{children}</div>
          {view === 'settings' && <div className={styles.view}><SettingsPanel /></div>}
        </div>
      </div>
    </>
  )
}
