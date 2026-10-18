// ── ScoreWindow ───────────────────────────────────────────────────────────────
//
// Top-level shell of the main application window. The desktop renders the tab
// bar and one of six tab components, the active tab in the store. The browser
// passes a `panes` layout instead, which shows any of the views side by side,
// each under its own title; the active tab is then the one being worked in.
// Dialog callbacks bubble up to App.tsx, which owns all modal state. The
// internal `scores` key remains unchanged even though its user-facing label is
// Assess, avoiding unrelated runtime state and type churn.

import { Suspense, lazy, type ComponentType, type ReactNode } from 'react'
import { useAppStore } from '../../store/appStore'
import { ElementsTab } from './ElementsTab'
import { DimensionsTab } from './DimensionsTab'
import { AssessTab } from './ScoresTab'
import { CollectionsTab } from './CollectionsTab'
import { ConversionsTab } from './ConversionsTab'
import { TABS, TAB_NAMES, type Tab } from '../../lib/types'
import { useStatusLine } from './statusLine'
import { sortToggleTitle, useElementSort } from './elementSort'
import { hostCapabilities } from '../../lib/host'
import styles from './ScoreWindow.module.css'

// Notes loads its rich-text editor (Trix) on first show, keeping it out of startup.
const NotesTab = lazy(() => import('./NotesTab').then(m => ({ default: m.NotesTab })))

/** Host layout for several views at once; `renderTab` draws one view under its title. */
export type ScorePanesLayout = ComponentType<{ renderTab: (tab: Tab) => ReactNode }>

interface Props {
  onOpenStarterPicker: () => void
  panes?: ScorePanesLayout
}

function TabBody({ tab, onOpenStarterPicker }: { tab: Tab; onOpenStarterPicker: () => void }): React.JSX.Element {
  switch (tab) {
    case 'notes':       return <Suspense fallback={null}><NotesTab /></Suspense>
    case 'elements':    return <ElementsTab />
    case 'collections': return <CollectionsTab />
    case 'dimensions':  return <DimensionsTab onOpenStarterPicker={onOpenStarterPicker} />
    case 'scores':      return <AssessTab />
    case 'conversions': return <ConversionsTab />
  }
}

/** Browser: the current tab's name, with the list count where it has one. */
function PaneTitle({ tab }: { tab: Tab }): React.JSX.Element {
  const count = useAppStore(s =>
    tab === 'elements' ? s.elements.length
      : tab === 'dimensions' ? s.dimensions.length
        : tab === 'collections' ? s.collections.length
          : undefined)
  const sortAlpha = useElementSort(s => s.alpha)
  const toggleSort = useElementSort(s => s.toggle)
  return (
    <h2 className={styles.paneTitle}>
      <span>{TAB_NAMES[tab]}{count === undefined ? '' : ` (${count})`}</span>
      {tab === 'elements' && (
        <button type="button" className={styles.paneSort} onClick={toggleSort} title={sortToggleTitle(sortAlpha)}>
          {sortAlpha ? 'A–Z' : '⇅'}
        </button>
      )}
    </h2>
  )
}

export function ScoreWindow({ onOpenStarterPicker, panes: Panes }: Props): React.JSX.Element {
  const activeTab    = useAppStore(s => s.activeTab)
  const setActiveTab = useAppStore(s => s.setActiveTab)
  const filePath     = useAppStore(s => s.filePath)
  const isDirty      = useAppStore(s => s.isDirty)
  const status = useStatusLine()
  // The browser shows the title and status line in its page banner
  // (web/TitleBanner.tsx), and replaces the tab bar with its strip's icons
  // (web/ScoreDock.tsx) and a title for the current tab, set like a map title.
  const desktop = hostCapabilities().kind === 'desktop'

  const fileName = filePath ? (filePath.split('/').pop() ?? 'Untitled') : 'Untitled'

  if (!desktop && Panes) {
    return (
      <div className={styles.window}>
        <Panes renderTab={tab => (
          <>
            <PaneTitle tab={tab} />
            <div className={`${styles.tabContent} ${styles.tabContentUnderTitle}`} data-list-headers="hidden">
              <TabBody tab={tab} onOpenStarterPicker={onOpenStarterPicker} />
            </div>
          </>
        )} />
      </div>
    )
  }

  return (
    <div className={styles.window}>
      {desktop && <div className={styles.titleBar}>
        <div className={styles.titleLine}>
          <span className={styles.productName}>Chora</span>
          <span className={styles.titleDivider} aria-hidden="true">|</span>
          <div className={styles.titleGroup}>
            <span className={styles.windowTitle}>{fileName}</span>
            {isDirty && <span className="unsavedBadge">Unsaved</span>}
          </div>
        </div>
      </div>}

      {desktop && (
        <div
          className={styles.statusBar}
          role="status"
          aria-live="polite"
        >
          <span className={styles.statusMessage}>{status}</span>
        </div>
      )}

      {!desktop && <PaneTitle tab={activeTab} />}

      {desktop && <div className={styles.tabBar}>
        {TABS.map(tab => (
          <button
            key={tab}
            className={[
              styles.tab,
              tab === 'conversions' ? styles.tabIcon : '',
              activeTab === tab ? styles.tabActive : ''
            ].filter(Boolean).join(' ')}
            onClick={() => setActiveTab(tab)}
            aria-pressed={activeTab === tab}
            aria-label={TAB_NAMES[tab]}
            title={tab === 'conversions' ? 'Conversions' : undefined}
          >
            {tab === 'conversions' ? '…' : TAB_NAMES[tab]}
          </button>
        ))}
      </div>}

      <div
        className={`${styles.tabContent} ${desktop ? '' : styles.tabContentUnderTitle}`}
        data-list-headers={desktop ? 'shown' : 'hidden'}
      >
        <TabBody tab={activeTab} onOpenStarterPicker={onOpenStarterPicker} />
      </div>
    </div>
  )
}
