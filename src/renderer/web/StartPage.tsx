import { Fragment, useEffect, useRef } from 'react'
import { StartActions, type StartHandlers } from '@renderer/components/WelcomeDialog'
import { useOverlay } from '@renderer/lib/overlayStack'
import {
  LICENSE_LINK, START_COPYRIGHT, START_LABELS, START_LEAD, START_LINKS, START_PRONUNCIATION,
  START_SUBTITLE, START_TITLE
} from './startPageContent'
import styles from './StartPage.module.css'

// Browser start page: a short full page over the workspace with the wordmark,
// a subtitle and privacy line, the ways to start, and the credit and links
// (startPageContent.ts).
// It shows on load and from Info › Start Page; Escape or Close returns to the
// workspace, and focus moves to the strip. The desktop keeps its Welcome disc;
// the landing page (App/site/) does the introducing.

export function StartPage({ onClose, ...start }: StartHandlers & { onClose: () => void }): React.JSX.Element {
  const pageRef = useRef<HTMLDivElement>(null)
  useOverlay(onClose)

  // The page takes focus so the keyboard scrolls it; closing hands focus to the strip.
  useEffect(() => {
    pageRef.current?.focus()
    return () => document.querySelector<HTMLElement>('[data-strip] button')?.focus()
  }, [])

  return (
    <div
      ref={pageRef}
      className={styles.page}
      role="dialog"
      aria-modal="true"
      aria-labelledby="start-page-title"
      tabIndex={-1}
    >
      <div className={styles.bar}>
        <button type="button" className={styles.close} onClick={onClose}>Close</button>
      </div>

      <article className={styles.column}>
        <header className={styles.hero}>
          <h1 id="start-page-title" className={styles.title}>
            {START_TITLE}
            <span className={styles.say} aria-label={START_PRONUNCIATION.label}>{START_PRONUNCIATION.text}</span>
          </h1>
          <p className={styles.subtitle}>{START_SUBTITLE}</p>
          {START_LEAD.map((text, i) => <p key={i} className={styles.lead}>{text}</p>)}
          <StartActions className={styles.start} labels={START_LABELS} {...start} />
        </header>

        <footer className={styles.end}>
          <p className={styles.credit}>
            {START_COPYRIGHT} · <a href={LICENSE_LINK.href} target="_blank" rel="noopener noreferrer">{LICENSE_LINK.label}</a>
            <br />
            Version {__CHORA_VERSION__}
          </p>
          <p className={styles.links}>
            {START_LINKS.map((link, i) => (
              <Fragment key={link.href}>
                {i > 0 && ' · '}
                <a href={link.href} target="_blank" rel="noopener noreferrer">{link.label}</a>
              </Fragment>
            ))}
          </p>
        </footer>
      </article>
    </div>
  )
}
