import { useRef, useState } from 'react'
import styles from './MapPanel.module.css'

interface Props {
  title: string
  filePath: string | null
  isDirty: boolean
  sidebarOpen: boolean
  onRename: (title: string) => void
  onToggleSidebar: () => void
}

type MapWindowAction = 'close' | 'minimize' | 'zoom'

interface MapChromeButtonProps {
  action: MapWindowAction
  label: string
  glyph: string
}

function MapChromeButton({ action, label, glyph }: MapChromeButtonProps): React.JSX.Element {
  return (
    <button
      className={styles.windowControl}
      onClick={() => window.api.controlMapWindow(action)}
      title={label}
      aria-label={`${label} window`}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
        <g fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
          <circle cx="6" cy="6" r="5" />
          <path d={glyph} />
        </g>
      </svg>
    </button>
  )
}

export function SidebarToggle({ open, onToggle }: { open: boolean; onToggle: () => void }): React.JSX.Element {
  const label = open ? 'Hide map controls' : 'Show map controls'
  return (
    <button
      className={styles.sidebarBtn}
      onClick={onToggle}
      title={label}
      aria-label={label}
      aria-pressed={open}
    >
      <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
        {open && <path d="M2 4a1 1 0 0 1 1-1h3v10H3a1 1 0 0 1-1-1z" fill="currentColor" />}
        <rect x="1.5" y="2.5" width="13" height="11" rx="2"
          fill="none" stroke="currentColor" strokeWidth="1.3" />
        <path d="M6 2.5v11" stroke="currentColor" strokeWidth="1.3" />
      </svg>
    </button>
  )
}

export function MapWindowChrome({
  title,
  filePath,
  isDirty,
  sidebarOpen,
  onRename,
  onToggleSidebar
}: Props): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  function startEditing(): void {
    setDraft(title)
    setEditing(true)
    setTimeout(() => inputRef.current?.select(), 0)
  }

  function commit(): void {
    const trimmed = draft.trim()
    if (trimmed && trimmed !== title) onRename(trimmed)
    setEditing(false)
  }

  return (
    <>
      <div className={styles.titleBar}>
        <div className={styles.windowControls} aria-label="Window controls">
          <MapChromeButton action="close" label="Close" glyph="M3.5 3.5 8.5 8.5M8.5 3.5 3.5 8.5" />
          <MapChromeButton action="minimize" label="Minimize" glyph="M3 6h6" />
          <MapChromeButton action="zoom" label="Zoom" glyph="M3 6h6M6 3v6" />
        </div>

        <div className={styles.titleGroup}>
          {editing ? (
            <input
              ref={inputRef}
              className={styles.titleInput}
              value={draft}
              onChange={event => setDraft(event.target.value)}
              onBlur={commit}
              onKeyDown={event => {
                if (event.key === 'Enter') { event.preventDefault(); commit() }
                if (event.key === 'Escape') { event.preventDefault(); setEditing(false) }
              }}
            />
          ) : (
            <span className={styles.title} onDoubleClick={startEditing} title="Double-click to rename">
              {title}
            </span>
          )}
          {isDirty && <span className="unsavedBadge">Unsaved</span>}
          {!editing && filePath && <span className={styles.titleFileName}>{filePath.split('/').pop()}</span>}
        </div>
      </div>

      <div className={styles.windowedSidebarToggle}>
        <SidebarToggle open={sidebarOpen} onToggle={onToggleSidebar} />
      </div>
    </>
  )
}
