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
import styles from './ScoreWindow.module.css'

// Keep runtime keys decoupled from presentation labels. In particular, the
// long-standing `scores` key now presents the broader Assess workspace.
const TAB_LABELS: Record<AppState['activeTab'], string> = {
  elements:    'Elements',
  collections: 'Collections',
  dimensions:  'Dimensions',
  scores:      'Assess',
  conversions: 'Conversions'
}

interface Props {
  onOpenStarterPicker: () => void
}

export function ScoreWindow({ onOpenStarterPicker }: Props): React.JSX.Element {
  const activeTab    = useAppStore(s => s.activeTab)
  const setActiveTab = useAppStore(s => s.setActiveTab)
  const filePath     = useAppStore(s => s.filePath)
  const isDirty      = useAppStore(s => s.isDirty)

  const fileName = filePath ? (filePath.split('/').pop() ?? 'Untitled') : 'Untitled'

  return (
    <div className={styles.window}>
      <div className={styles.tabBar}>
        <span className={styles.windowTitle}>{fileName}</span>

        {(['elements', 'dimensions', 'collections', 'scores', 'conversions'] as const).map(tab => (
          <button
            key={tab}
            className={[
              styles.tab,
              activeTab === tab ? styles.tabActive : '',
              activeTab === tab && tab === 'scores' ? styles.tabActiveAssess : ''
            ].filter(Boolean).join(' ')}
            onClick={() => setActiveTab(tab)}
            aria-pressed={activeTab === tab}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}

        <div className={styles.titleActions}>
          {isDirty && <span className={styles.unsavedBadge}>Unsaved</span>}
        </div>
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
