// ── ScoreWindow ───────────────────────────────────────────────────────────────
//
// Top-level shell of the main application window. Renders the tab bar and
// delegates to one of three tab components based on the active tab in the store.
// The onOpenStarterPicker prop bubbles up to App.tsx which owns the modal state.

import { useAppStore } from '../../store/appStore'
import { ElementsTab } from './ElementsTab'
import { DimensionsTab } from './DimensionsTab'
import { ScoresTab } from './ScoresTab'
import styles from './ScoreWindow.module.css'

interface Props {
  onOpenStarterPicker: () => void
}

export function ScoreWindow({ onOpenStarterPicker }: Props): React.JSX.Element {
  const activeTab    = useAppStore(s => s.activeTab)
  const setActiveTab = useAppStore(s => s.setActiveTab)

  return (
    <div className={styles.window}>
      <div className={styles.tabBar}>
        <span className={styles.windowTitle}>MapTool 2026</span>
        {(['elements', 'dimensions', 'scores'] as const).map(tab => (
          <button
            key={tab}
            className={`${styles.tab} ${activeTab === tab ? styles.tabActive : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      <div className={styles.tabContent}>
        {activeTab === 'elements'   && <ElementsTab />}
        {activeTab === 'dimensions' && <DimensionsTab onOpenStarterPicker={onOpenStarterPicker} />}
        {activeTab === 'scores'     && <ScoresTab />}
      </div>
    </div>
  )
}
