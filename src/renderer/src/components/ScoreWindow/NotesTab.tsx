// ── NotesTab ─────────────────────────────────────────────────────────────────
//
// The study-level tab: one rich-text field (sessionMeta.notes, HTML) for what
// the study is looking to do and a running log of the work. It edits like
// every other field in the app — no save button, just history.begin/end
// bracketing each edit into one undo step. A study's older Intent text is
// moved into Notes when it loads (lib/sessionIntent.ts).
//
// The editor is a Trix custom element <trix-editor>, built imperatively via
// the DOM rather than JSX: Trix registers its own custom elements as a side
// effect of importing the package, and wrapping one in JSX would need
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
import styles from './NotesTab.module.css'

type TrixEditorElement = HTMLElement & { value: string }

// Trix builds a full toolbar unless given one. This one is Trix's own button
// markup for bold and italic only, and it is never shown: it exists so ⌘B and
// ⌘I (its data-trix-key shortcuts) still work in a field with no visible
// controls. Existing lists and links still display, and links still open.
const TOOLBAR_HTML = `
  <div class="trix-button-row">
    <span class="trix-button-group trix-button-group--text-tools">
      <button type="button" class="trix-button" data-trix-attribute="bold" data-trix-key="b" tabindex="-1">Bold</button>
      <button type="button" class="trix-button" data-trix-attribute="italic" data-trix-key="i" tabindex="-1">Italic</button>
    </span>
  </div>
`

const PLACEHOLDER = 'This study is looking to...'

export function NotesTab(): React.JSX.Element {
  const sessionMeta       = useAppStore(s => s.sessionMeta)
  const updateSessionMeta = useAppStore(s => s.updateSessionMeta)
  const mountRef          = useRef<HTMLDivElement>(null)
  const editorRef         = useRef<TrixEditorElement | null>(null)
  const lastEmittedRef    = useRef<string | null>(null)
  // Read once: the mount effect below must not re-run as sessionMeta changes.
  const initialNotesRef   = useRef(sessionMeta.notes)

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
    toolbar.hidden = true
    toolbar.innerHTML = TOOLBAR_HTML

    const editor = document.createElement('trix-editor') as TrixEditorElement
    editor.setAttribute('toolbar', 'notes-toolbar')
    editor.setAttribute('placeholder', PLACEHOLDER)
    editor.setAttribute('aria-label', 'Notes')

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
    <div className={styles.tab}>
      <div className={styles.notesEditor} ref={mountRef} />
    </div>
  )
}
