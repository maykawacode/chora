// ── ScoreWindow ───────────────────────────────────────────────────────────────
//
// Top-level shell of the main application window. Renders the tab bar and
// delegates to one of five tab components based on the active tab in the store.
// Dialog callbacks bubble up to App.tsx, which owns all modal state. The
// internal `scores` key remains unchanged even though its user-facing label is
// Assess, avoiding unrelated runtime state and type churn.

import { useAppStore } from '../../store/appStore'
import { ElementsTab } from './ElementsTab'
import { DimensionsTab } from './DimensionsTab'
import { AssessTab } from './ScoresTab'
import { CollectionsTab } from './CollectionsTab'
import { ConversionsTab } from './ConversionsTab'
import type { AppState } from '../../lib/types'
import { resolveStatusMessage } from './statusRules'
import styles from './ScoreWindow.module.css'

// Keep runtime keys decoupled from presentation labels. In particular, the
// long-standing `scores` key now presents the broader Assess workspace.
const TAB_LABELS: Record<AppState['activeTab'], string> = {
  elements:    'Elements',
  collections: 'Collections',
  dimensions:  'Dimensions',
  scores:      'Assess',
  conversions: '…'
}

const TAB_ACCESSIBLE_LABELS: Record<AppState['activeTab'], string> = {
  elements:    'Elements',
  collections: 'Collections',
  dimensions:  'Dimensions',
  scores:      'Assess',
  conversions: 'Conversions'
}

interface Props {
  onOpenStarterPicker: () => void
  statusOverride?: string | null
}

export function ScoreWindow({ onOpenStarterPicker, statusOverride }: Props): React.JSX.Element {
  const activeTab    = useAppStore(s => s.activeTab)
  const setActiveTab = useAppStore(s => s.setActiveTab)
  const filePath     = useAppStore(s => s.filePath)
  const isDirty      = useAppStore(s => s.isDirty)
  const defaultStatus = useAppStore(resolveStatusMessage)

  const fileName = filePath ? (filePath.split('/').pop() ?? 'Untitled') : 'Untitled'
  const status = statusOverride ?? defaultStatus

  return (
    <div className={styles.window}>
      <div className={styles.titleBar}>
        <div className={styles.titleGroup}>
          <span className={styles.windowTitle}>{fileName}</span>
          {isDirty && <span className={styles.unsavedBadge}>Unsaved</span>}
        </div>
      </div>

      <div
        className={styles.statusBar}
        role="status"
        aria-live="polite"
      >
        <span className={styles.statusMessage}>{status}</span>
      </div>

      <div className={styles.tabBar}>
        {(['elements', 'dimensions', 'collections', 'scores', 'conversions'] as const).map(tab => (
          <button
            key={tab}
            className={[
              styles.tab,
              tab === 'conversions' ? styles.tabIcon : '',
              tab === 'scores' || tab === 'conversions' ? styles.tabTool : '',
              activeTab === tab ? styles.tabActive : '',
              activeTab === tab && (tab === 'scores' || tab === 'conversions') ? styles.tabActiveTool : ''
            ].filter(Boolean).join(' ')}
            onClick={() => setActiveTab(tab)}
            aria-pressed={activeTab === tab}
            aria-label={TAB_ACCESSIBLE_LABELS[tab]}
            title={tab === 'conversions' ? 'Conversions' : undefined}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      <div className={styles.tabContent}>
        {activeTab === 'elements'    && <ElementsTab />}
        {activeTab === 'collections' && <CollectionsTab />}
        {activeTab === 'dimensions'  && <DimensionsTab onOpenStarterPicker={onOpenStarterPicker} />}
        {activeTab === 'scores'      && <AssessTab />}
        {activeTab === 'conversions' && <ConversionsTab />}
      </div>
    </div>
  )
}
