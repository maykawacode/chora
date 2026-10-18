import { useRef, useState } from 'react'
import { useAppStore } from '@renderer/store/appStore'
import { useStatusLine } from '@renderer/components/ScoreWindow/statusLine'
import { displayName, editableName, renameDocument } from './documentName'
import { NamePrompt } from './NamePrompt'
import styles from './TitleBanner.module.css'

// Banner across the top of the browser page: the product name, the study's
// file name, its Unsaved badge and the status line (the desktop shows these in
// the Score Window's title and status bars, which the browser leaves out). Double-click the file
// name to rename it in place (documentName.ts). On touch-first or narrow
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
  const status = useStatusLine()
  const [notice, setNotice] = useState(shouldShowNotice)
  const [draft, setDraft] = useState<string | null>(null)
  // Escape cancels; the blur that follows must not then commit.
  const cancelled = useRef(false)

  const startEditing = (): void => {
    cancelled.current = false
    setDraft(editableName())
  }
  const finishEditing = (): void => {
    if (draft !== null && !cancelled.current) renameDocument(draft)
    setDraft(null)
  }

  // Shown without its .chora/.mtda extension, as it is edited.
  const fileName = displayName(filePath)

  return (
    <header className={styles.banner}>
      <div className={styles.title}>
        <span className={styles.productName}>Chora</span>
        <span className={styles.divider} aria-hidden="true">|</span>
        {draft === null ? (
          <span className={styles.fileName} title="Double-click to rename" onDoubleClick={startEditing}>
            {fileName}
          </span>
        ) : (
          <input
            className={styles.fileNameInput}
            value={draft}
            aria-label="File name"
            autoFocus
            onFocus={e => e.currentTarget.select()}
            onChange={e => setDraft(e.target.value)}
            onBlur={finishEditing}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() }
              if (e.key === 'Escape') {
                e.preventDefault()
                cancelled.current = true
                e.currentTarget.blur()
              }
            }}
          />
        )}
        {isDirty && <span className="unsavedBadge">Unsaved</span>}
      </div>
      <div className={styles.status} role="status" aria-live="polite">{status}</div>
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
      <NamePrompt />
    </header>
  )
}
