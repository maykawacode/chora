import { useEffect, useRef, useState } from 'react'
import type { MenuAction } from '../../shared/contracts'
import { useOverlay } from '@renderer/lib/overlayStack'
import { dispatchMenuAction, historyAvailability } from './browserApi'
import { historyLocked } from './interaction'
import { isApple } from './shortcuts'
import { useAppStore } from '@renderer/store/appStore'
import { arrangeMapsInGrid } from './tileLayout'
import styles from './MenuBar.module.css'

// Browser menu bar: the desktop application menu's commands, dispatched
// through the same MenuAction path. Shortcuts shown are only those the browser
// leaves to the page (see shortcuts.ts).

const RELEASES_URL = 'https://github.com/maykawacode/chora/releases'
const FEEDBACK_URL = 'https://github.com/maykawacode/chora/discussions'

type Item =
  | { label: string; action: MenuAction; keys?: string; enabled?: () => boolean }
  | { label: string; href: string }
  /** Browser-only layout command, outside the shared MenuAction path. */
  | { label: string; run: () => void; enabled?: () => boolean }
  | 'separator'

const mod = isApple ? '⌘' : 'Ctrl+'
const shift = isApple ? '⇧' : 'Shift+'
const historyOpen = (key: 'canUndo' | 'canRedo') => () => !historyLocked() && historyAvailability()[key]

const MENUS: { label: string; items: Item[] }[] = [
  { label: 'File', items: [
    { label: 'New', action: 'new' },
    { label: 'Open…', action: 'open', keys: `${mod}O` },
    'separator',
    { label: 'Save (Download)', action: 'save', keys: `${mod}S` },
    'separator',
    { label: 'Import Spreadsheet…', action: 'import-spreadsheet' },
    { label: 'Export Spreadsheet', action: 'export-spreadsheet' }
  ] },
  { label: 'Edit', items: [
    { label: 'Undo', action: 'undo', keys: `${mod}Z`, enabled: historyOpen('canUndo') },
    { label: 'Redo', action: 'redo', keys: `${mod}${shift}Z`, enabled: historyOpen('canRedo') },
    'separator',
    { label: 'Settings…', action: 'preferences' }
  ] },
  { label: 'Maps', items: [
    { label: 'New Cartesian Map…', action: 'create-cartesian' },
    { label: 'New Semantic Map…', action: 'create-semantic' },
    'separator',
    { label: 'Arrange Maps in Grid', run: arrangeMapsInGrid, enabled: () => useAppStore.getState().maps.length > 1 }
  ] },
  { label: 'Help', items: [
    { label: 'Open Example Data', action: 'open-example' },
    { label: 'Chora Orientation', action: 'orientation' },
    'separator',
    { label: 'Get Chora for Mac…', href: RELEASES_URL },
    { label: 'Project & Feedback…', href: FEEDBACK_URL },
    'separator',
    { label: 'About Chora', action: 'about' }
  ] }
]

function openExternal(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer')
}

function MenuPopup({ menuIndex, onClose, onMove }: {
  menuIndex: number
  onClose: () => void
  onMove: (delta: number) => void
}): React.JSX.Element {
  const listRef = useRef<HTMLDivElement>(null)
  useOverlay(onClose)

  const items = () => [...(listRef.current?.querySelectorAll<HTMLButtonElement>('[role=menuitem]:not(:disabled)') ?? [])]
  useEffect(() => { items()[0]?.focus() }, [menuIndex])

  return (
    <div
      ref={listRef}
      className={styles.menu}
      role="menu"
      aria-label={MENUS[menuIndex].label}
      onKeyDown={(e) => {
        const all = items()
        const at = all.indexOf(document.activeElement as HTMLButtonElement)
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault()
          const step = e.key === 'ArrowDown' ? 1 : -1
          all[(at + step + all.length) % all.length]?.focus()
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault()
          onMove(e.key === 'ArrowRight' ? 1 : -1)
        } else if (e.key === 'Tab') {
          onClose()
        }
      }}
    >
      {MENUS[menuIndex].items.map((item, i) => {
        if (item === 'separator') return <div key={i} className={styles.separator} role="separator" />
        const run = 'href' in item
          ? () => openExternal(item.href)
          : 'run' in item ? item.run : () => dispatchMenuAction(item.action)
        const enabled = 'href' in item ? true : (item.enabled?.() ?? true)
        return (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            className={styles.item}
            disabled={!enabled}
            onClick={() => { onClose(); run() }}
          >
            <span>{item.label}</span>
            {'keys' in item && item.keys && <span className={styles.keys}>{item.keys}</span>}
          </button>
        )
      })}
    </div>
  )
}

export function MenuBar(): React.JSX.Element {
  const [open, setOpen] = useState<number | null>(null)
  const barRef = useRef<HTMLDivElement>(null)

  // A press anywhere outside the bar closes the open menu.
  useEffect(() => {
    if (open === null) return
    const onPointerDown = (e: PointerEvent): void => {
      if (!barRef.current?.contains(e.target as Node)) setOpen(null)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [open])

  return (
    <div ref={barRef} className={styles.bar} role="menubar" aria-label="Chora">
      {MENUS.map((menu, index) => (
        <div key={menu.label} className={styles.slot}>
          <button
            type="button"
            className={styles.title}
            aria-haspopup="menu"
            aria-expanded={open === index}
            onClick={() => setOpen(current => current === index ? null : index)}
            onPointerEnter={() => { if (open !== null) setOpen(index) }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(index) }
            }}
          >
            {menu.label}
          </button>
          {open === index && (
            <MenuPopup
              menuIndex={index}
              onClose={() => setOpen(null)}
              onMove={(delta) => setOpen((index + delta + MENUS.length) % MENUS.length)}
            />
          )}
        </div>
      ))}
    </div>
  )
}
