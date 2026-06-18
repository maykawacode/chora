// ── ScoreWindow ───────────────────────────────────────────────────────────────
//
// Top-level shell of the main application window. Renders the tab bar and
// delegates to one of five tab components based on the active tab in the store.
// The onOpenStarterPicker prop bubbles up to App.tsx which owns the modal state.

import { useAppStore } from '../../store/appStore'
import { ElementsTab } from './ElementsTab'
import { DimensionsTab } from './DimensionsTab'
import { ScoresTab } from './ScoresTab'
import { TypesTab } from './TypesTab'
import { ConversionsTab } from './ConversionsTab'
import styles from './ScoreWindow.module.css'

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

        {(['elements', 'types', 'dimensions', 'scores', 'conversions'] as const).map(tab => (
          <button
            key={tab}
            className={`${styles.tab} ${activeTab === tab ? styles.tabActive : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}

        <div className={styles.titleActions}>
          {isDirty && <span className={styles.unsavedBadge}>Unsaved</span>}
        </div>
      </div>

      <div className={styles.tabContent}>
        {activeTab === 'elements'    && <ElementsTab />}
        {activeTab === 'types'       && <TypesTab />}
        {activeTab === 'dimensions'  && <DimensionsTab onOpenStarterPicker={onOpenStarterPicker} />}
        {activeTab === 'scores'      && <ScoresTab />}
        {activeTab === 'conversions' && <ConversionsTab />}
      </div>
    </div>
  )
}
