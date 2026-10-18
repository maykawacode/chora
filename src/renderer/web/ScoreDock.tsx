import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useAppStore } from '@renderer/store/appStore'
import { TAB_ACCESSIBLE_LABELS } from '@renderer/components/ScoreWindow/ScoreWindow'
import { MAP_AREA_MIN_WIDTH, columnWidth, stripWidth, useScoreLayout, type Tab } from './scoreLayout'
import { Glyph } from './Glyph'
import { useStripMenus } from './StripCommands'
import styles from './ScoreDock.module.css'

// Browser Score column: an always-visible strip beside the Score Window, the
// page's anchor. One list from the top: Info, File | Notes, Elements,
// Dimensions, Collections | Assess, Conversions, Maps, then Settings and the
// names toggle at its foot (commands in StripCommands.tsx). Each tab icon opens or closes its view; open views sit
// side by side (ScorePanes.tsx) and are highlighted. Closing the last one
// collapses Score; any tab icon while collapsed opens Score with that view.
// A new map shrinks the open views to their minimums; views that cannot all
// fit beside the maps (or, with none, on the page) close from the right,
// sparing the one in use (scoreLayout.ts).
// Collapsing hides the Score Window, still mounted so tab state and pending
// edits survive. In the browser the strip replaces Score's tab bar. The
// toggle at its foot widens it to show each icon's name; every button carries
// its name, which the strip's labelled style reveals.

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

/** The page width Score may take: all of it with no maps, else what one map tile and the splitter leave. */
const scoreRoom = (hasMaps: boolean): number => window.innerWidth - (hasMaps ? MAP_AREA_MIN_WIDTH + 1 : 0)

/**
 * Score's open width before it has been measured (the page loaded collapsed):
 * its open views' widths within the room the map area leaves, or the whole
 * page with no maps.
 */
function estimatedOpenWidth(): number {
  const layout = useScoreLayout.getState()
  const hasMaps = useAppStore.getState().maps.length > 0
  const strip = stripWidth(layout.labels)
  const width = hasMaps ? Math.min(columnWidth(layout), scoreRoom(true)) : scoreRoom(false)
  return Math.round(width - strip)
}

/** The window's width, kept current. */
function usePageWidth(): number {
  const [width, setWidth] = useState(window.innerWidth)
  useEffect(() => {
    const onResize = (): void => setWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return width
}

export function ScoreDock({ children }: { children: ReactNode }): React.JSX.Element {
  const collapsed = useScoreLayout(s => s.collapsed)
  const animating = useScoreLayout(s => s.animating)
  const labels = useScoreLayout(s => s.labels)
  const openTabs = useScoreLayout(s => s.openTabs)
  const { toggleTab, toggleLabels } = useScoreLayout.getState()
  const activeTab = useAppStore(s => s.activeTab)
  const hasMaps = useAppStore(s => s.maps.length > 0)
  const pageWidth = usePageWidth()
  const scoreRef = useRef<HTMLDivElement>(null)
  // Score's settled open width. While collapsing or expanding, Score is held
  // at this width and slides behind the strip rather than reflowing.
  const openWidth = useRef(0)

  // A tab chosen elsewhere (Import, a link in Assess, opening a study) opens its view.
  useEffect(() => useAppStore.subscribe((s, prev) => {
    if (s.activeTab !== prev.activeTab) useScoreLayout.getState().reveal(s.activeTab)
  }), [])

  // Maps take priority over Score: each new one shrinks Score's views to their minimums.
  useEffect(() => useAppStore.subscribe((s, prev) => {
    if (s.maps.length > prev.maps.length) useScoreLayout.getState().squeeze()
  }), [])

  // Views that no longer fit close from the right, sparing the one in use. Run
  // after render, so a view just opened is already the active tab.
  useEffect(() => {
    if (collapsed) return
    useScoreLayout.getState().fit(scoreRoom(hasMaps), activeTab)
  }, [openTabs, activeTab, hasMaps, pageWidth, labels, collapsed])

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
    // Open views are highlighted; collapsed, none is.
    const showing = openTabs.includes(tab) && !collapsed
    return (
      <button
        key={tab}
        className={`${styles.stripButton} ${showing ? styles.stripButtonActive : ''}`}
        title={showing ? `Close ${label}` : label}
        aria-label={label}
        aria-pressed={showing}
        onClick={() => {
          toggleTab(tab)
          if (useScoreLayout.getState().openTabs.includes(tab)) useAppStore.getState().setActiveTab(tab)
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
        {menus.settingsButton}
        <button
          type="button"
          className={styles.stripButton}
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
          <div className={styles.view}>{children}</div>
        </div>
      </div>
      {menus.settingsPopup}
    </>
  )
}
