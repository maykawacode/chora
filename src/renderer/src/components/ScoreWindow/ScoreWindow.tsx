import { useAppStore } from '../../store/appStore'
import { ElementsTab } from './ElementsTab'
import { DimensionsTab } from './DimensionsTab'
import { ScoresTab } from './ScoresTab'
import styles from './ScoreWindow.module.css'

export function ScoreWindow(): React.JSX.Element {
  const activeTab = useAppStore(s => s.activeTab)
  const setActiveTab = useAppStore(s => s.setActiveTab)

  return (
    <div className={styles.window}>
      <div className={styles.tabBar}>
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
        {activeTab === 'dimensions' && <DimensionsTab />}
        {activeTab === 'scores'     && <ScoresTab />}
      </div>
    </div>
  )
}
