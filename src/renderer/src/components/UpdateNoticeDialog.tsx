// ── UpdateNoticeDialog ────────────────────────────────────────────────────────
//
// Shows the message GitHub is carrying for this build. Simple rectangular
// chrome matching OrientationDialog: a titled header, the message, and the
// shared forward action.
//
// There is no visible cancel control — Escape and click-away dismiss it, as
// with every other cancelable dialog in the app. Both leaving and following
// the link count as having seen the notice; see App.tsx.

import { ForwardActionButton } from './ConfirmationDisc'
import { ModalShell } from './ModalShell'
import type { UpdateNotice } from '../../../shared/updateNotice'
import styles from './UpdateNoticeDialog.module.css'

interface Props {
  notice: UpdateNotice
  onOpen: () => void
  onDismiss: () => void
}

export function UpdateNoticeDialog({ notice, onOpen, onDismiss }: Props): React.JSX.Element {
  return (
    <ModalShell
      overlayClassName={styles.overlay}
      dialogClassName={styles.dialog}
      onClose={onDismiss}
      labelledBy="update-notice-title"
    >
      <header className={styles.header}>
        <span id="update-notice-title">{notice.title}</span>
      </header>

      <div className={styles.content}>
        {notice.detail && <p className={styles.detail}>{notice.detail}</p>}
      </div>

      <footer className={styles.footer}>
        <ForwardActionButton label="Open in browser" onClick={onOpen} />
      </footer>
    </ModalShell>
  )
}
