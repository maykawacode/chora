import type { ReactNode } from 'react'
import { ModalShell } from './ModalShell'
import styles from './CenteredPopup.module.css'

// A temporary popup in the centre of the window, over a dimmed backdrop: a
// titled header with Close, a body that scrolls, and an optional footer.
// Escape, Close or a click outside dismisses it. The browser's Settings uses
// it.

interface Props {
  title: string
  /** Unique id for the title, which labels the popup. */
  titleId: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}

export function CenteredPopup({ title, titleId, onClose, children, footer }: Props): React.JSX.Element {
  return (
    <ModalShell
      overlayClassName={styles.overlay}
      dialogClassName={styles.popup}
      onClose={onClose}
      labelledBy={titleId}
    >
      <header className={styles.header}>
        <span id={titleId}>{title}</span>
        <button autoFocus onClick={onClose}>Close</button>
      </header>
      <div className={styles.body}>{children}</div>
      {footer && <footer className={styles.footer}>{footer}</footer>}
    </ModalShell>
  )
}
