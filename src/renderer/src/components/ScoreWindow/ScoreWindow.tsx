// ── ScoreWindow ───────────────────────────────────────────────────────────────
//
// Top-level shell of the main application window. Renders the tab bar and
// delegates to one of five tab components based on the active tab in the store.
// The onOpenStarterPicker prop bubbles up to App.tsx which owns the modal state.

import { useAppStore } from '../../store/appStore'
import { ElementsTab } from './ElementsTab'
import { DimensionsTab } from './DimensionsTab'
import { ScoresTab } from './ScoresTab'
import { CollectionsTab } from './CollectionsTab'
import { ConversionsTab } from './ConversionsTab'
import type { AppState } from '../../lib/types'
import styles from './ScoreWindow.module.css'

// Labels are spelled out rather than derived by capitalizing the tab key. Every
// one happens to match its key today, so deriving them would work — right up
// until a tab needs two words, at which point the derivation quietly produces
// the wrong label instead of a compile error.
const TAB_LABELS: Record<AppState['activeTab'], string> = {
  elements:    'Elements',
  collections: 'Collections',
  dimensions:  'Dimensions',
  scores:      'Scores',
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

        {(['elements', 'collections', 'dimensions', 'scores', 'conversions'] as const).map(tab => (
          <button
            key={tab}
            className={`${styles.tab} ${activeTab === tab ? styles.tabActive : ''}`}
            onClick={() => setActiveTab(tab)}
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
        {activeTab === 'scores'      && <ScoresTab />}
        {activeTab === 'conversions' && <ConversionsTab />}
      </div>
    </div>
  )
}
