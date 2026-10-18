import { Fragment, useEffect, useRef } from 'react'
import { StartActions, type StartHandlers } from '@renderer/components/WelcomeDialog'
import { useOverlay } from '@renderer/lib/overlayStack'
import {
  ANIMATION_CAPTION, WELCOME_LEAD, WELCOME_LINKS, WELCOME_SECTIONS, WELCOME_SUBTITLE, WELCOME_TITLE,
  type WelcomeItem
} from './welcomeContent'
import styles from './BrowserWelcome.module.css'

// Browser Welcome: a full page that scrolls like a long web page, over the
// workspace. A hero with the ways to start, a frame for an animated
// walk-through, then text sections (welcomeContent.ts) and the ways to start
// again. It shows on load and from Info › Welcome; Escape or Close returns to
// the workspace, and focus moves to the strip. The desktop keeps its disc.

function Item({ item }: { item: WelcomeItem }): React.JSX.Element {
  return <li>{item.term && <strong>{item.term}: </strong>}{item.text}</li>
}

export function BrowserWelcome({ onClose, ...start }: StartHandlers & { onClose: () => void }): React.JSX.Element {
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
      aria-labelledby="browser-welcome-title"
      tabIndex={-1}
    >
      <div className={styles.bar}>
        <button type="button" className={styles.close} onClick={onClose}>Close</button>
      </div>

      <article className={styles.column}>
        <header className={styles.hero}>
          <h1 id="browser-welcome-title" className={styles.title}>{WELCOME_TITLE}</h1>
          <p className={styles.subtitle}>{WELCOME_SUBTITLE}</p>
          {WELCOME_LEAD.map((text, i) => <p key={i} className={styles.lead}>{text}</p>)}
          <StartActions className={styles.start} {...start} />
        </header>

        {/* Reserved for an animation; whatever fills it must honour reduced motion. */}
        <figure className={styles.animation}>
          <div className={styles.frame} aria-hidden="true" />
          <figcaption className={styles.caption}>{ANIMATION_CAPTION}</figcaption>
        </figure>

        {WELCOME_SECTIONS.map(section => (
          <section key={section.heading} className={styles.section}>
            <h2 className={styles.heading}>{section.heading}</h2>
            {section.paragraphs?.map((text, i) => <p key={i}>{text}</p>)}
            {section.items && (section.numbered
              ? <ol>{section.items.map((item, i) => <Item key={i} item={item} />)}</ol>
              : <ul>{section.items.map((item, i) => <Item key={i} item={item} />)}</ul>)}
            {section.closing && <p>{section.closing}</p>}
          </section>
        ))}

        <footer className={styles.end}>
          <h2 className={styles.heading}>Start</h2>
          <StartActions className={styles.start} {...start} />
          <p className={styles.links}>
            {WELCOME_LINKS.map((link, i) => (
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
