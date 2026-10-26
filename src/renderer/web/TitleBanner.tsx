import { useRef, useState } from 'react'
import { useAppStore } from '@renderer/store/appStore'
import { useStatusNotices } from '@renderer/components/ScoreWindow/statusLine'
import { CHORA_NAME } from '@renderer/lib/identity'
import { displayName, editableName, renameDocument } from './documentName'
import { NamePrompt } from './NamePrompt'
import styles from './TitleBanner.module.css'

// Banner across the top of the browser page: the study's file name and its
// Unsaved badge, important messages (downloads) centred, and the product name
// and version (the desktop shows these in the Score Window's title and status
// bars, which the browser leaves out; its status bar also carries study
// hints, which the browser omits). Double-click the file name to rename it in
// place (documentName.ts).

export function TitleBanner(): React.JSX.Element {
  const filePath = useAppStore(s => s.filePath)
  const isDirty = useAppStore(s => s.isDirty)
  const message = useStatusNotices()
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
      {/* Important messages only, centred in the window. */}
      <div className={styles.status} role="status" aria-live="polite">{message}</div>
      <div className={styles.product}>
        <span className={styles.productName}>{CHORA_NAME}</span>
        <span className={styles.version}>{window.api.getAppVersion()}</span>
      </div>
      <NamePrompt />
    </header>
  )
}
