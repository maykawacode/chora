import { useState } from 'react'
import { useAppStore } from '@renderer/store/appStore'
import styles from './TitleBanner.module.css'

// Banner across the top of the browser page: the product name, the study's
// file name and its Unsaved badge (the desktop shows these in the Score
// Window's title bar, which the browser leaves out). On touch-first or narrow
// screens it also carries a one-time notice, since the editor relies on
// precise pointer drags, right-click and keyboard shortcuts. Dismissal lasts
// for this tab.

const NOTICE_KEY = 'chora:device-notice-dismissed'
const NARROW_PX = 900

function shouldShowNotice(): boolean {
  try { if (sessionStorage.getItem(NOTICE_KEY)) return false } catch { /* show it */ }
  return window.matchMedia('(pointer: coarse)').matches || window.innerWidth < NARROW_PX
}

export function TitleBanner(): React.JSX.Element {
  const filePath = useAppStore(s => s.filePath)
  const isDirty = useAppStore(s => s.isDirty)
  const [notice, setNotice] = useState(shouldShowNotice)

  const fileName = filePath ? (filePath.split('/').pop() ?? 'Untitled') : 'Untitled'

  return (
    <header className={styles.banner}>
      <div className={styles.title}>
        <span className={styles.productName}>Chora</span>
        <span className={styles.divider} aria-hidden="true">|</span>
        <span className={styles.fileName}>{fileName}</span>
        {isDirty && <span className="unsavedBadge">Unsaved</span>}
      </div>
      {notice && (
        <div className={styles.notice} role="note">
          <span>
            Chora works best with a mouse or trackpad on a larger screen. Touch input and narrow
            windows are not fully supported yet.
          </span>
          <button
            type="button"
            className={styles.dismiss}
            onClick={() => {
              try { sessionStorage.setItem(NOTICE_KEY, '1') } catch { /* dismiss for now only */ }
              setNotice(false)
            }}
          >
            Dismiss
          </button>
        </div>
      )}
    </header>
  )
}
