import { useEffect, useRef, type ReactNode } from 'react'
import { useAppStore } from '@renderer/store/appStore'
import { TAB_ACCESSIBLE_LABELS, TAB_ORDER } from '@renderer/components/ScoreWindow/ScoreWindow'
import type { AppState } from '@renderer/lib/types'
import { useScoreLayout } from './scoreLayout'
import styles from './ScoreDock.module.css'

// Browser Score column: an always-visible strip (collapse toggle plus one icon
// per tab) beside the Score Window. Collapsing hides the Score Window, still
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

function Glyph({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </g>
    </svg>
  )
}

/** Panel outline, Score side filled while open (as the map sidebar toggle). */
function PanelGlyph({ filled }: { filled: boolean }): React.JSX.Element {
  return (
    <Glyph>
      {filled && <path d="M2 4a1 1 0 0 1 1-1h3v10H3a1 1 0 0 1-1-1z" fill="currentColor" stroke="none" />}
      <rect x="1.5" y="2.5" width="13" height="11" rx="2" />
      <path d="M6 2.5v11" />
    </Glyph>
  )
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

  const toggleLabel = collapsed ? 'Expand Score' : 'Collapse Score'

  return (
    <>
      <nav className={styles.strip} aria-label="Score tabs">
        <button
          className={styles.stripButton}
          title={toggleLabel}
          aria-label={toggleLabel}
          aria-expanded={!collapsed}
          onClick={collapsed ? expand : collapse}
        >
          <PanelGlyph filled={!collapsed} />
        </button>
        <div className={styles.stripDivider} />
        {TAB_ORDER.map(tab => (
          <button
            key={tab}
            className={`${styles.stripButton} ${tab === activeTab ? styles.stripButtonActive : ''}`}
            title={TAB_ACCESSIBLE_LABELS[tab]}
            aria-label={TAB_ACCESSIBLE_LABELS[tab]}
            aria-pressed={tab === activeTab}
            onClick={() => {
              setActiveTab(tab)
              expand()
            }}
          >
            <Glyph>{TAB_GLYPHS[tab]}</Glyph>
          </button>
        ))}
      </nav>
      <div ref={scoreRef} className={styles.score} hidden={collapsed && !animating} inert={collapsed}>
        <div
          className={styles.scoreInner}
          style={animating && openWidth.current > 0 ? { flex: `0 0 ${openWidth.current}px` } : undefined}
        >
          {children}
        </div>
      </div>
    </>
  )
}
