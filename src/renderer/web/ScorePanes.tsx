import { Fragment, useRef, type ReactNode } from 'react'
import { useAppStore } from '@renderer/store/appStore'
import { TAB_NAMES, type Tab } from '@renderer/lib/types'
import {
  MAP_AREA_MIN_WIDTH, columnWidth, paneMinWidth, paneWidth, snapsClosed, useScoreLayout
} from './scoreLayout'
import styles from './ScorePanes.module.css'

// Browser Score views side by side, in the strip's order, each under its own
// title. With maps showing, a line between two views resizes the one on its
// left and the column grows or shrinks with it; with no maps the views fill
// the page in proportion to their widths, and the line trades width between
// its two neighbours. Drag, or focus a line and use the arrow keys;
// double-click returns every view to its default width. A drag past a view's
// minimum closes it, to reopen at its default width (scoreLayout.ts); the
// arrow keys stop at the minimum. Views that cannot all fit close from the right (ScoreDock.tsx); one
// that still cannot fit scrolls.
// Pressing or focusing in a view makes it the active tab, which the status
// line and keyboard shortcuts follow.

const KEY_STEP = 16

function focusTab(tab: Tab): void {
  const app = useAppStore.getState()
  if (app.activeTab !== tab) app.setActiveTab(tab)
}

interface Drag {
  pointerId: number
  startX: number
  startWidth: number
  maxWidth: number
  /** Filling the page: every view's shown width, and where `tab` sits among them. */
  shown?: { tabs: Tab[]; widths: number[]; index: number }
}

/** The open views' shown widths, read from the row this line sits in. */
function shownWidths(divider: Element): number[] {
  const panes = divider.parentElement?.querySelectorAll(':scope > section') ?? []
  return [...panes].map(p => p.getBoundingClientRect().width)
}

/** Line after `tab`'s view, resizing it, and with no maps its right-hand neighbour too. */
function PaneDivider({ tab, fill }: { tab: Tab; fill: boolean }): React.JSX.Element {
  const drag = useRef<Drag | null>(null)

  // A view may grow until the map area is down to its minimum.
  const maxWidth = (): number => {
    const layout = useScoreLayout.getState()
    return paneWidth(layout, tab) + window.innerWidth - MAP_AREA_MIN_WIDTH - columnWidth(layout)
  }
  const resizeTo = (width: number, max: number, snap: boolean): void => {
    const layout = useScoreLayout.getState()
    if (snap && snapsClosed(tab, width)) {
      drag.current = null
      layout.snapClose(tab)
    } else {
      layout.setPaneWidth(tab, Math.min(width, Math.max(max, paneMinWidth(tab))))
    }
  }

  // Filling the page: the two neighbours trade width, the row's total unchanged.
  const tradeTo = (d: Drag, width: number, snap: boolean): void => {
    const layout = useScoreLayout.getState()
    const { tabs, widths, index } = d.shown!
    const next = tabs[index + 1]
    const pair = widths[index] + widths[index + 1]
    if (snap && snapsClosed(tab, width)) { drag.current = null; return layout.snapClose(tab) }
    if (snap && snapsClosed(next, pair - width)) { drag.current = null; return layout.snapClose(next) }
    const left = Math.max(paneMinWidth(tab), Math.min(width, pair - paneMinWidth(next)))
    const all = Object.fromEntries(tabs.map((t, i) => [t, widths[i]]))
    layout.setPaneWidths({ ...all, [tab]: left, [next]: pair - left })
  }

  const begin = (el: Element, pointerId: number, startX: number): Drag => {
    const layout = useScoreLayout.getState()
    const widths = shownWidths(el)
    const index = layout.openTabs.indexOf(tab)
    return fill
      ? { pointerId, startX, startWidth: widths[index], maxWidth: Infinity, shown: { tabs: layout.openTabs, widths, index } }
      : { pointerId, startX, startWidth: paneWidth(layout, tab), maxWidth: maxWidth() }
  }

  const move = (d: Drag, width: number, snap: boolean): void =>
    d.shown ? tradeTo(d, width, snap) : resizeTo(width, d.maxWidth, snap)

  return (
    <div
      className={styles.divider}
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${TAB_NAMES[tab]}`}
      tabIndex={0}
      onPointerDown={(e) => {
        e.preventDefault()
        drag.current = begin(e.currentTarget, e.pointerId, e.clientX)
        e.currentTarget.setPointerCapture(e.pointerId)
      }}
      onPointerMove={(e) => {
        const d = drag.current
        if (d && d.pointerId === e.pointerId) move(d, d.startWidth + e.clientX - d.startX, true)
      }}
      onPointerUp={() => { drag.current = null }}
      onPointerCancel={() => { drag.current = null }}
      onDoubleClick={() => useScoreLayout.getState().resetWidths()}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
        e.preventDefault()
        // Keep the arrows from also nudging the selected score (Assess listens on window).
        e.stopPropagation()
        // The keys stop a view at its minimum rather than closing it.
        const d = begin(e.currentTarget, -1, 0)
        move(d, d.startWidth + (e.key === 'ArrowLeft' ? -KEY_STEP : KEY_STEP), false)
      }}
    />
  )
}

export function ScorePanes({ renderTab }: { renderTab: (tab: Tab) => ReactNode }): React.JSX.Element {
  const openTabs = useScoreLayout(s => s.openTabs)
  const paneWidths = useScoreLayout(s => s.paneWidths)
  // With no maps the views fill the page, each growing in proportion to its width.
  const fill = useAppStore(s => s.maps.length === 0)

  return (
    <div className={styles.row}>
      {openTabs.map((tab, i) => (
        <Fragment key={tab}>
          {i > 0 && <PaneDivider tab={openTabs[i - 1]} fill={fill} />}
          <section
            className={styles.pane}
            style={{
              flexBasis: paneWidth({ paneWidths }, tab),
              flexGrow: fill ? paneWidth({ paneWidths }, tab) : undefined,
              minWidth: paneMinWidth(tab)
            }}
            aria-label={TAB_NAMES[tab]}
            onPointerDownCapture={() => focusTab(tab)}
            onFocusCapture={() => focusTab(tab)}
          >
            {renderTab(tab)}
          </section>
        </Fragment>
      ))}
    </div>
  )
}
