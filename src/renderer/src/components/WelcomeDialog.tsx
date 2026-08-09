// ── WelcomeDialog ─────────────────────────────────────────────────────────────
//
// Shown on startup when no file is being auto-reopened. Gives the user a clear
// choice between starting a new session and opening an existing file.

import styles from './WelcomeDialog.module.css'

interface Props {
  onNew:  () => void
  onOpen: () => void
}

export function WelcomeDialog({ onNew, onOpen }: Props): React.JSX.Element {
  return (
    <div className={styles.backdrop}>
      <div className={styles.card}>
        <h1 className={styles.title}>Chora</h1>
        <p className={styles.subtitle}>Spatial reasoning for qualitative data</p>
        <div className={styles.buttons}>
          <button className={styles.btnPrimary} onClick={onOpen}>Open File…</button>
          <button className={styles.btnSecondary} onClick={onNew}>New Session</button>
        </div>
      </div>
    </div>
  )
}
