import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { MenuAction } from '../../shared/contracts'
import { useOverlay } from '@renderer/lib/overlayStack'
import { dispatchMenuAction } from './browserApi'
import { isApple } from './shortcuts'
import { inPlaceSaving } from './fileAccess'
import { useAppStore } from '@renderer/store/appStore'
import { arrangeMapsInGrid } from './tileLayout'
import { Glyph } from './Glyph'
import { promptRename } from './documentName'
import dock from './ScoreDock.module.css'
import styles from './StripCommands.module.css'

// The browser's commands, as icons in the tab strip: File, Maps and Help open
// a menu beside the strip; the gear opens Settings. They dispatch through
// the desktop application menu's MenuAction path. Undo and Redo have no menu;
// they stay on their shortcuts (shortcuts.ts). Shortcuts shown are only those
// the browser leaves to the page.

const RELEASES_URL = 'https://github.com/maykawacode/chora/releases'
const FEEDBACK_URL = 'https://github.com/maykawacode/chora/discussions'

type Item =
  | { label: string; action: MenuAction; keys?: string; enabled?: () => boolean }
  | { label: string; href: string }
  /** Browser-only layout command, outside the shared MenuAction path. */
  | { label: string; run: () => void; enabled?: () => boolean }
  | 'separator'

interface Menu { label: string; glyph: ReactNode; items: Item[] }

const mod = isApple ? '⌘' : 'Ctrl+'
const shift = isApple ? '⇧' : 'Shift+'

const MENUS: Menu[] = [
  { label: 'File',
    glyph: <path d="M1.5 4a1 1 0 0 1 1-1h3.5l1.5 1.5h6a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z" />,
    items: [
      { label: 'New', action: 'new' },
      { label: 'Open…', action: 'open', keys: `${mod}O` },
      'separator',
      // Where Save writes in place, Save As and Download a Copy join it.
      ...(inPlaceSaving
        ? [
            { label: 'Save', action: 'save', keys: `${mod}S` },
            { label: 'Save As…', action: 'save-as', keys: `${mod}${shift}S` },
            { label: 'Download a Copy', action: 'download-copy' }
          ] satisfies Item[]
        : [{ label: 'Save (Download)', action: 'save', keys: `${mod}S` }] satisfies Item[]),
      { label: 'Rename…', run: () => { void promptRename() } },
      'separator',
      { label: 'Import Spreadsheet…', action: 'import-spreadsheet' },
      { label: 'Export Spreadsheet', action: 'export-spreadsheet' }
    ] },
  { label: 'Maps',
    glyph: <path d="M1.5 3.5 5.5 2l5 1.5 4-1.5v10.5l-4 1.5-5-1.5-4 1.5zM5.5 2v10.5M10.5 3.5V14" />,
    items: [
      { label: 'New Cartesian Map…', action: 'create-cartesian' },
      { label: 'New Semantic Map…', action: 'create-semantic' },
      'separator',
      { label: 'Arrange Maps in Grid', run: arrangeMapsInGrid, enabled: () => useAppStore.getState().maps.length > 1 }
    ] },
  { label: 'Help',
    glyph: <>
      <circle cx="8" cy="8" r="6.5" />
      <path d="M6.2 6.3a1.9 1.9 0 1 1 2.6 1.75c-.5.2-.8.6-.8 1.1v.4" />
      <circle cx="8" cy="11.3" r=".7" fill="currentColor" stroke="none" />
    </>,
    items: [
      { label: 'Open Example Data', action: 'open-example' },
      { label: 'Chora Orientation', action: 'orientation' },
      'separator',
      { label: 'Get Chora for Mac…', href: RELEASES_URL },
      { label: 'Project & Feedback…', href: FEEDBACK_URL },
      'separator',
      { label: 'About Chora', action: 'about' }
    ] }
]

const GEAR = 'M12.66 6.18 L14.50 6.84 L14.50 9.16 L12.66 9.82 L12.58 10.00 L13.41 11.77 L11.77 13.41 L10.00 12.58 ' +
  'L9.82 12.66 L9.16 14.50 L6.84 14.50 L6.18 12.66 L6.00 12.58 L4.23 13.41 L2.59 11.77 L3.42 10.00 L3.34 9.82 ' +
  'L1.50 9.16 L1.50 6.84 L3.34 6.18 L3.42 6.00 L2.59 4.23 L4.23 2.59 L6.00 3.42 L6.18 3.34 L6.84 1.50 ' +
  'L9.16 1.50 L9.82 3.34 L10.00 3.42 L11.77 2.59 L13.41 4.23 L12.58 6.00Z'

// Gap between the strip button and its menu, and the menu's inset from the page edges.
const OFFSET = 4

function openExternal(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer')
}

/**
 * A menu beside its strip button: top-aligned with the button, moved up when
 * it would run past the bottom of the page. Fixed positioning keeps it clear of
 * the strip's own scrolling.
 */
function MenuFlyout({ menu, anchor, onClose }: {
  menu: Menu
  anchor: HTMLElement
  onClose: () => void
}): React.JSX.Element {
  const listRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)
  useOverlay(onClose)

  useLayoutEffect(() => {
    const button = anchor.getBoundingClientRect()
    const height = listRef.current?.offsetHeight ?? 0
    const top = Math.max(OFFSET, Math.min(button.top, window.innerHeight - height - OFFSET))
    setPosition({ left: button.right + OFFSET, top })
  }, [anchor, menu])

  const items = () => [...(listRef.current?.querySelectorAll<HTMLButtonElement>('[role=menuitem]:not(:disabled)') ?? [])]
  useEffect(() => { items()[0]?.focus() }, [menu])

  return (
    <div
      ref={listRef}
      data-strip-menu
      className={styles.menu}
      style={position ?? { visibility: 'hidden' }}
      role="menu"
      aria-label={menu.label}
      onKeyDown={(e) => {
        const all = items()
        const at = all.indexOf(document.activeElement as HTMLButtonElement)
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault()
          const step = e.key === 'ArrowDown' ? 1 : -1
          all[(at + step + all.length) % all.length]?.focus()
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault()
          onClose()
        } else if (e.key === 'Tab') {
          onClose()
        }
      }}
    >
      <div className={styles.header} aria-hidden="true">{menu.label}</div>
      {menu.items.map((item, i) => {
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

export type MenuName = 'File' | 'Maps' | 'Help'

export interface StripMenus {
  /** The icon that opens the named menu. */
  menuButton: (name: MenuName) => React.JSX.Element
  settingsButton: React.JSX.Element
  /** The open menu, if any; render it once anywhere in the strip. */
  flyout: React.JSX.Element | null
}

/**
 * The strip's command icons, placed individually among the tab icons by
 * ScoreDock (whose strip carries data-strip). One menu is open at a time; a
 * press outside the menu icons and the open menu, or pointing at another strip
 * icon, closes it.
 */
export function useStripMenus(): StripMenus {
  const [open, setOpen] = useState<MenuName | null>(null)
  const buttons = useRef<Partial<Record<MenuName, HTMLButtonElement | null>>>({})

  useEffect(() => {
    if (open === null) return
    const onPointerDown = (e: PointerEvent): void => {
      if (!(e.target instanceof Element && e.target.closest('[data-strip-menu]'))) setOpen(null)
    }
    // Pointing at any other icon in the strip closes the menu too.
    const onPointerOver = (e: PointerEvent): void => {
      const icon = e.target instanceof Element ? e.target.closest('[data-strip] button') : null
      if (icon && icon !== buttons.current[open] && !icon.closest('[role=menu]')) setOpen(null)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('pointerover', onPointerOver, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('pointerover', onPointerOver, true)
    }
  }, [open])

  const menuButton = (name: MenuName): React.JSX.Element => {
    const menu = MENUS.find(m => m.label === name)!
    return (
      <button
        key={name}
        ref={el => { buttons.current[name] = el }}
        type="button"
        data-strip-menu
        className={`${dock.stripButton} ${open === name ? dock.stripButtonActive : ''}`}
        title={name}
        aria-label={name}
        aria-haspopup="menu"
        aria-expanded={open === name}
        onClick={() => setOpen(current => current === name ? null : name)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') { e.preventDefault(); setOpen(name) }
        }}
      >
        <Glyph>{menu.glyph}</Glyph>
      </button>
    )
  }

  const settingsButton = (
    <button
      type="button"
      className={dock.stripButton}
      title="Settings"
      aria-label="Settings"
      onClick={() => dispatchMenuAction('preferences')}
    >
      <Glyph>
        <path d={GEAR} />
        <circle cx="8" cy="8" r="2" />
      </Glyph>
    </button>
  )

  const anchor = open === null ? null : buttons.current[open]
  const flyout = open !== null && anchor
    ? <MenuFlyout menu={MENUS.find(m => m.label === open)!} anchor={anchor} onClose={() => setOpen(null)} />
    : null

  return { menuButton, settingsButton, flyout }
}
