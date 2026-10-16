import { useState } from 'react'
import styles from './MenuBar.module.css'

// One-time notice for touch-first or narrow screens: the editor relies on
// precise pointer drags, right-click and keyboard shortcuts. Dismissal lasts
// for this tab.

const KEY = 'chora:device-notice-dismissed'
const NARROW_PX = 900

function shouldShow(): boolean {
  try { if (sessionStorage.getItem(KEY)) return false } catch { /* show it */ }
  return window.matchMedia('(pointer: coarse)').matches || window.innerWidth < NARROW_PX
}

export function DeviceNotice(): React.JSX.Element | null {
  const [visible, setVisible] = useState(shouldShow)
  if (!visible) return null
  return (
    <div className={styles.notice} role="note">
      <span>
        Chora works best with a mouse or trackpad on a larger screen. Touch input and narrow
        windows are not fully supported yet.
      </span>
      <button
        type="button"
        className={styles.noticeDismiss}
        onClick={() => {
          try { sessionStorage.setItem(KEY, '1') } catch { /* dismiss for now only */ }
          setVisible(false)
        }}
      >
        Dismiss
      </button>
    </div>
  )
}
