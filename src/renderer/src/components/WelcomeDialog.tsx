// ── WelcomeDialog ─────────────────────────────────────────────────────────────
//
// Shown on startup when no file is being auto-reopened. Gives the user a clear
// choice between example data, a new file, and an existing file.

import styles from './WelcomeDialog.module.css'

interface Props {
  onExample: () => void
  onNew:     () => void
  onOpen:    () => void
}

export function WelcomeDialog({ onExample, onNew, onOpen }: Props): React.JSX.Element {
  return (
    <div className={styles.backdrop}>
      <div
        className={`${styles.disc} modalZoomEnter`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-dialog-title"
        aria-describedby="welcome-dialog-subtitle"
      >
        <div className={styles.copy}>
          <h1 className={styles.title} id="welcome-dialog-title">Chora</h1>
          <p className={styles.subtitle} id="welcome-dialog-subtitle">
            Spatial reasoning for<br />qualitative data
          </p>
        </div>

        <div className={styles.actions} role="group" aria-label="Start a workspace">
          <button
            type="button"
            className={`${styles.action} ${styles.exampleAction}`}
            aria-label="Open example data"
            onClick={onExample}
          >
            <span className={styles.actionCircle} aria-hidden="true">
              <svg className={styles.actionIcon} viewBox="0 0 36 24">
                <path d="M8 1V21H31" />
                <circle cx="19" cy="7" r="2.5" />
                <circle cx="25" cy="1" r="2.5" />
                <circle cx="30" cy="11" r="2.5" />
              </svg>
            </span>
            <span className={styles.actionLabel}>Example</span>
          </button>

          <button
            type="button"
            className={styles.action}
            aria-label="Create a new file"
            onClick={onNew}
          >
            <span className={styles.actionCircle} aria-hidden="true">
              <svg className={styles.actionIcon} viewBox="0 0 36 24">
                <path d="M7 12H29M18 1V23" />
              </svg>
            </span>
            <span className={styles.actionLabel}>New</span>
          </button>

          <button
            type="button"
            className={styles.action}
            aria-label="Open an existing file"
            onClick={onOpen}
          >
            <span className={styles.actionCircle} aria-hidden="true">
              <svg className={styles.actionIcon} viewBox="0 0 36 24">
                <path d="M4 12H30M21 4L30 12L21 20" />
              </svg>
            </span>
            <span className={styles.actionLabel}>Existing</span>
          </button>
        </div>
      </div>
    </div>
  )
}
