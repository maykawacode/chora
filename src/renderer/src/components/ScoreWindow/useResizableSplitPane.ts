import { useCallback, useRef, useState } from 'react'
import type { CSSProperties, PointerEventHandler } from 'react'

const PANE_MIN_WIDTH = 200
/** Kept side by side at any width ('beside'), each pane can be dragged down to this. */
const BESIDE_PANE_MIN_WIDTH = 48
/** Narrower than two panes side by side, the list stacks above its detail. */
const STACK_BELOW_WIDTH = 2 * PANE_MIN_WIDTH
/** Each pane's least height while stacked. */
const PANE_MIN_HEIGHT = 120
const DIVIDER_HIT_WIDTH = 5
const GRID_FRACTION_SCALE = 1000

interface DividerProps {
  onPointerDown: PointerEventHandler<HTMLDivElement>
  onPointerMove: PointerEventHandler<HTMLDivElement>
  onPointerUp: PointerEventHandler<HTMLDivElement>
  onPointerCancel: PointerEventHandler<HTMLDivElement>
}

interface ResizableSplitPane {
  /** Attach to the container; it is watched for when to stack. */
  containerRef: (el: HTMLDivElement | null) => void
  /** The list sits above its detail rather than beside it. */
  stacked: boolean
  containerStyle: CSSProperties
  leftPaneStyle: CSSProperties
  rightPaneStyle: CSSProperties
  dividerStyle: CSSProperties
  dividerProps: DividerProps
}

function clampDividerRatio(desiredRatio: number, length: number, paneMin: number): number {
  if (length <= paneMin * 2) return 0.5
  const minimum = paneMin / length
  return Math.max(minimum, Math.min(1 - minimum, desiredRatio))
}

/**
 * One symmetric resize model for every two-pane workspace in the Score
 * Window. React stores only the divider ratio; CSS Grid owns the pane sizes
 * and responds to window resizing without pixel synchronization. Narrower
 * than two panes side by side, the panes stack, list above detail, and the
 * divider resizes their heights; an observer watches the width for that.
 * `layout` 'stacked' keeps them stacked at every width; 'beside' keeps them
 * side by side at every width, each free to shrink well below its usual
 * minimum.
 */
export type SplitLayout = 'responsive' | 'stacked' | 'beside'

export function useResizableSplitPane(layout: SplitLayout = 'responsive'): ResizableSplitPane {
  const containerEl = useRef<HTMLDivElement | null>(null)
  const observer = useRef<ResizeObserver | null>(null)
  const activePointerId = useRef<number | null>(null)
  const lastClient = useRef<number | null>(null)
  const dividerRatioRef = useRef(0.5)
  const [dividerRatio, setDividerRatio] = useState(0.5)
  const [narrow, setNarrow] = useState(false)
  const stacked = layout === 'stacked' || (layout === 'responsive' && narrow)
  const sideMin = layout === 'beside' ? BESIDE_PANE_MIN_WIDTH : PANE_MIN_WIDTH

  const containerRef = useCallback((el: HTMLDivElement | null) => {
    observer.current?.disconnect()
    observer.current = null
    containerEl.current = el
    if (!el) return
    const check = (): void => {
      // A hidden container (Score collapsed) measures 0; keep its last layout.
      if (el.clientWidth > 0) setNarrow(el.clientWidth < STACK_BELOW_WIDTH)
    }
    check()
    observer.current = new ResizeObserver(check)
    observer.current.observe(el)
  }, [])

  // Along the axis the panes share: across while side by side, down while stacked.
  const axis = (container: HTMLDivElement): { length: number; start: number; paneMin: number } => {
    const bounds = container.getBoundingClientRect()
    return stacked
      ? { length: container.clientHeight, start: bounds.top, paneMin: PANE_MIN_HEIGHT }
      : { length: container.clientWidth, start: bounds.left, paneMin: sideMin }
  }
  const pointerAt = (event: { clientX: number; clientY: number }): number => stacked ? event.clientY : event.clientX

  const releasePointer = (target: HTMLDivElement, pointerId: number): void => {
    activePointerId.current = null
    lastClient.current = null
    if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId)
  }

  const onPointerDown: PointerEventHandler<HTMLDivElement> = event => {
    event.preventDefault()
    const container = containerEl.current
    if (!container) return
    const { length, start, paneMin } = axis(container)
    const currentRatio = clampDividerRatio((pointerAt(event) - start) / length, length, paneMin)
    dividerRatioRef.current = currentRatio
    setDividerRatio(currentRatio)
    activePointerId.current = event.pointerId
    lastClient.current = pointerAt(event)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onPointerMove: PointerEventHandler<HTMLDivElement> = event => {
    if (activePointerId.current !== event.pointerId) return
    const container = containerEl.current
    const previous = lastClient.current
    if (!container || previous === null) return

    // Advance the pointer anchor even while clamped. Movement beyond an edge is
    // therefore discarded rather than stored as a dead zone, and reversing by
    // one pixel immediately moves the divider back into the valid range.
    const delta = pointerAt(event) - previous
    lastClient.current = pointerAt(event)
    const { length, paneMin } = axis(container)
    const nextRatio = clampDividerRatio(dividerRatioRef.current + delta / length, length, paneMin)
    dividerRatioRef.current = nextRatio
    setDividerRatio(nextRatio)
  }

  const finishPointer: PointerEventHandler<HTMLDivElement> = event => {
    if (activePointerId.current !== event.pointerId) return
    releasePointer(event.currentTarget, event.pointerId)
  }

  const first = dividerRatio * GRID_FRACTION_SCALE
  const second = (1 - dividerRatio) * GRID_FRACTION_SCALE

  if (stacked) {
    return {
      containerRef,
      stacked,
      containerStyle: {
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr)',
        // As across: factors above 1fr, and shrinkable rows so lists scroll.
        gridTemplateRows: `minmax(0, ${first}fr) 0 minmax(0, ${second}fr)`,
        width: '100%',
        maxWidth: '100%',
        minWidth: 0
      },
      leftPaneStyle: { gridColumn: 1, gridRow: 1, minWidth: 0, minHeight: 0, width: '100%', maxWidth: '100%' },
      rightPaneStyle: { gridColumn: 1, gridRow: 3, minWidth: 0, minHeight: 0, width: '100%', maxWidth: '100%' },
      dividerStyle: {
        gridColumn: 1,
        gridRow: 2,
        width: 'auto',
        height: DIVIDER_HIT_WIDTH,
        alignSelf: 'center',
        position: 'relative',
        zIndex: 1,
        touchAction: 'none',
        cursor: 'row-resize',
        borderLeft: 'none',
        borderTop: '1px solid var(--color-border-control)'
      },
      dividerProps: {
        onPointerDown,
        onPointerMove,
        onPointerUp: finishPointer,
        onPointerCancel: finishPointer
      }
    }
  }

  return {
    containerRef,
    stacked,
    containerStyle: {
      display: 'grid',
      // Keep both flexible factors above 1fr. Sub-1fr tracks represent partial
      // shares in CSS Grid; when their sibling hits its 200px minimum, that can
      // leave unused space instead of filling the container.
      // Kept beside at any width, the panes may shrink to nothing in CSS; drags stop at sideMin.
      gridTemplateColumns: layout === 'beside'
        ? `minmax(0, ${first}fr) 0 minmax(0, ${second}fr)`
        : `minmax(${PANE_MIN_WIDTH}px, ${first}fr) 0 minmax(${PANE_MIN_WIDTH}px, ${second}fr)`,
      // A shrinkable grid row is required for descendant lists to become
      // scroll containers. The default auto row otherwise follows their
      // min-content height and can grow beyond the visible tab workspace.
      gridTemplateRows: 'minmax(0, 1fr)',
      width: '100%',
      maxWidth: '100%',
      minWidth: 0
    },
    leftPaneStyle: {
      gridColumn: 1,
      width: '100%',
      minWidth: 0,
      maxWidth: '100%',
      justifySelf: 'stretch'
    },
    rightPaneStyle: {
      gridColumn: 3,
      width: '100%',
      minWidth: 0,
      maxWidth: '100%',
      justifySelf: 'stretch'
    },
    dividerStyle: {
      gridColumn: 2,
      gridRow: 1,
      width: DIVIDER_HIT_WIDTH,
      justifySelf: 'center',
      position: 'relative',
      zIndex: 1,
      touchAction: 'none'
    },
    dividerProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: finishPointer,
      onPointerCancel: finishPointer
    }
  }
}
