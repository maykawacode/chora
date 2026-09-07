// ── NotesTab ─────────────────────────────────────────────────────────────────
//
// The session-level tab: what this study is for (Intent, the long-dormant
// sessionMeta.definition field) and a running rich-text log (Notes, HTML).
// Both edit like every other field in the app — no save button, just
// history.begin/end bracketing each edit into one undo step.
//
// The Notes editor is a Trix custom element <trix-editor>, built imperatively
// via the DOM rather than JSX: Trix registers its own custom elements as a
// side effect of importing the package, and wrapping one in JSX would need
// speculative typing for elements React doesn't know about. Constructing it
// with refs + effects, like any third-party imperative widget, avoids that
// and keeps initial/external content set through the element's `.value`
// property rather than through an HTML string, so there is no HTML-escaping
// concern even though notes are user-authored rich text.

import { useEffect, useRef } from 'react'
import 'trix'
import 'trix/dist/trix.css'
import { useAppStore } from '../../store/appStore'
import { history, SCORE_HISTORY_OWNER } from '../../store/history'
import { useResizableSplitPaneVertical } from './useResizableSplitPaneVertical'
import styles from './NotesTab.module.css'

type TrixEditorElement = HTMLElement & { value: string }

// Trix auto-builds a toolbar with far more than this app wants (headings,
// quote, code, file attachments, its own undo/redo). This is Trix's own
// button markup, trimmed to the five attributes/actions this app exposes —
// not hand-built formatting logic, just fewer of Trix's built-in buttons.
// The link button needs its paired dialog (also Trix's own markup, verbatim
// from its default toolbar template) to prompt for a URL; Trix looks it up
// by data-trix-dialog="href" inside this same toolbar element.
const TOOLBAR_HTML = `
  <div class="trix-button-row">
    <span class="trix-button-group trix-button-group--text-tools">
      <button type="button" class="trix-button trix-button--icon trix-button--icon-bold" data-trix-attribute="bold" data-trix-key="b" title="Bold" tabindex="-1">Bold</button>
      <button type="button" class="trix-button trix-button--icon trix-button--icon-italic" data-trix-attribute="italic" data-trix-key="i" title="Italic" tabindex="-1">Italic</button>
      <button type="button" class="trix-button trix-button--icon trix-button--icon-link" data-trix-attribute="href" data-trix-action="link" data-trix-key="k" title="Link" tabindex="-1">Link</button>
    </span>
    <span class="trix-button-group trix-button-group--block-tools">
      <button type="button" class="trix-button trix-button--icon trix-button--icon-bullet-list" data-trix-attribute="bullet" title="Bulleted list" tabindex="-1">Bullets</button>
      <button type="button" class="trix-button trix-button--icon trix-button--icon-number-list" data-trix-attribute="number" title="Numbered list" tabindex="-1">Numbers</button>
    </span>
  </div>

  <div class="trix-dialogs" data-trix-dialogs>
    <div class="trix-dialog trix-dialog--link" data-trix-dialog="href" data-trix-dialog-attribute="href">
      <div class="trix-dialog__link-fields">
        <input type="url" name="href" class="trix-input trix-input--dialog" placeholder="Enter a URL…" aria-label="URL" data-trix-validate-href required data-trix-input>
        <div class="trix-button-group">
          <input type="button" class="trix-button trix-button--dialog" value="Link" data-trix-method="setAttribute">
          <input type="button" class="trix-button trix-button--dialog" value="Unlink" data-trix-method="removeAttribute">
        </div>
      </div>
    </div>
  </div>
`

export function NotesTab(): React.JSX.Element {
  const sessionMeta       = useAppStore(s => s.sessionMeta)
  const updateSessionMeta = useAppStore(s => s.updateSessionMeta)
  const mountRef          = useRef<HTMLDivElement>(null)
  const editorRef         = useRef<TrixEditorElement | null>(null)
  const lastEmittedRef    = useRef<string | null>(null)
  // Read once: the mount effect below must not re-run as sessionMeta changes.
  const initialNotesRef   = useRef(sessionMeta.notes)
  const splitPane         = useResizableSplitPaneVertical()

  // Mount the Trix editor once. Its own change events, not React props, are
  // its source of truth going forward — see the resync effect below for how
  // an external change (undo/redo, Import, opening a file) is reflected back.
  // updateSessionMeta is a stable zustand action reference, so this still
  // only runs once despite being listed as a dependency.
  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const toolbar = document.createElement('trix-toolbar')
    toolbar.id = 'notes-toolbar'
    toolbar.innerHTML = TOOLBAR_HTML

    const editor = document.createElement('trix-editor') as TrixEditorElement
    editor.setAttribute('toolbar', 'notes-toolbar')
    editor.setAttribute('placeholder', 'Notes…')

    mount.appendChild(toolbar)
    mount.appendChild(editor)
    editorRef.current = editor

    editor.value = initialNotesRef.current
    lastEmittedRef.current = editor.value

    function handleChange(e: Event): void {
      const html = (e.target as TrixEditorElement).value
      lastEmittedRef.current = html
      history.begin(SCORE_HISTORY_OWNER)
      updateSessionMeta({ notes: html })
    }
    function handleFocus(): void { history.begin(SCORE_HISTORY_OWNER) }
    function handleBlur(): void { history.end(SCORE_HISTORY_OWNER) }

    // Browsers suppress link-following inside contenteditable content by
    // default (so editing the text around a link stays possible) — this
    // restores a plain click, opening it in the OS browser via the app's
    // existing window.open → shell.openExternal path (windowSecurity.ts).
    // A side effect: clicking into a link's text to edit it now opens the
    // link instead of just placing the cursor there.
    function handleClick(e: MouseEvent): void {
      const anchor = (e.target as HTMLElement).closest('a')
      if (!anchor) return
      e.preventDefault()
      window.open(anchor.href, '_blank')
    }

    editor.addEventListener('trix-change', handleChange)
    editor.addEventListener('focus', handleFocus)
    editor.addEventListener('blur', handleBlur)
    editor.addEventListener('click', handleClick)

    return () => {
      editor.removeEventListener('trix-change', handleChange)
      editor.removeEventListener('focus', handleFocus)
      editor.removeEventListener('blur', handleBlur)
      editor.removeEventListener('click', handleClick)
      mount.removeChild(editor)
      mount.removeChild(toolbar)
      editorRef.current = null
    }
  }, [updateSessionMeta])

  // Reflect a change that did not originate from this editor's own
  // trix-change handler (undo/redo, Import, opening a different file).
  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    if (sessionMeta.notes !== lastEmittedRef.current) {
      editor.value = sessionMeta.notes
      lastEmittedRef.current = sessionMeta.notes
    }
  }, [sessionMeta.notes])

  return (
    <div className={styles.tab} ref={splitPane.containerRef} style={splitPane.containerStyle}>
      <div className={styles.section} style={splitPane.topPaneStyle}>
        <label className={styles.label} htmlFor="notes-intent">Intent</label>
        <textarea
          id="notes-intent"
          className={styles.intentField}
          placeholder="What is this study trying to find out?"
          value={sessionMeta.definition}
          onFocus={() => history.begin(SCORE_HISTORY_OWNER)}
          onBlur={() => history.end(SCORE_HISTORY_OWNER)}
          onChange={e => {
            history.begin(SCORE_HISTORY_OWNER)
            updateSessionMeta({ definition: e.target.value })
          }}
        />
      </div>
      <div className={styles.resizeHandle} style={splitPane.dividerStyle} {...splitPane.dividerProps} />
      <div className={styles.notesSection} style={splitPane.bottomPaneStyle}>
        <label className={styles.label}>Notes</label>
        <div className={styles.notesEditor} ref={mountRef} />
      </div>
    </div>
  )
}
