// ── ScoreWindow ───────────────────────────────────────────────────────────────
//
// Top-level shell of the main application window. Renders the tab bar and
// delegates to one of three tab components based on the active tab in the store.
// The onOpenStarterPicker prop bubbles up to App.tsx which owns the modal state.

import { useRef, useEffect, useState } from 'react'
import { useAppStore } from '../../store/appStore'
import { ElementsTab } from './ElementsTab'
import { DimensionsTab } from './DimensionsTab'
import { ScoresTab } from './ScoresTab'
import type { TransformMode } from '../maps/AdvancedTransform'
import styles from './ScoreWindow.module.css'

interface Props {
  onOpenStarterPicker: () => void
  onOpenTransform: (mode: TransformMode) => void
}

export function ScoreWindow({ onOpenStarterPicker, onOpenTransform }: Props): React.JSX.Element {
  const activeTab    = useAppStore(s => s.activeTab)
  const setActiveTab = useAppStore(s => s.setActiveTab)
  const filePath     = useAppStore(s => s.filePath)
  const isDirty      = useAppStore(s => s.isDirty)

  const fileName  = filePath ? (filePath.split('/').pop() ?? 'Untitled') : 'Untitled'
  const titleText = isDirty ? `${fileName} (unsaved)` : fileName

  const [showMenu, setShowMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showMenu) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showMenu])

  function openTransform(mode: TransformMode): void {
    onOpenTransform(mode)
    setShowMenu(false)
  }

  return (
    <div className={styles.window}>
      <div className={styles.tabBar}>
        <span className={styles.windowTitle}>{titleText}</span>

        {(['elements', 'dimensions', 'scores'] as const).map(tab => (
          <button
            key={tab}
            className={`${styles.tab} ${activeTab === tab ? styles.tabActive : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}

        <div className={styles.titleActions} ref={menuRef}>
          <button
            className={styles.menuBtn}
            onClick={() => setShowMenu(v => !v)}
            title="Advanced transforms"
          >
            ⋯
          </button>

          {showMenu && (
            <div className={styles.menuDropdown}>
              <div className={styles.menuItem} onClick={() => openTransform('dim-to-weight')}>
                Dimension → Weight…
              </div>
              <div className={styles.menuItem} onClick={() => openTransform('weight-to-dim')}>
                Weight → Dimension…
              </div>
              <div className={styles.menuItem} onClick={() => openTransform('dim-to-gray')}>
                Dimension → Gray…
              </div>
              <div className={styles.menuSeparator} />
              <div className={styles.menuItem} onClick={() => openTransform('randomize-scores')}>
                Randomize Scores…
              </div>
            </div>
          )}
        </div>
      </div>

      <div className={styles.tabContent}>
        {activeTab === 'elements'   && <ElementsTab />}
        {activeTab === 'dimensions' && <DimensionsTab onOpenStarterPicker={onOpenStarterPicker} />}
        {activeTab === 'scores'     && <ScoresTab />}
      </div>
    </div>
  )
}
