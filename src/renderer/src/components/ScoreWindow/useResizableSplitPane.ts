import { useRef, useState } from 'react'
import type { CSSProperties, PointerEventHandler, RefObject } from 'react'

const PANE_MIN_WIDTH = 200
const DIVIDER_HIT_WIDTH = 5
const GRID_FRACTION_SCALE = 1000

interface DividerProps {
  onPointerDown: PointerEventHandler<HTMLDivElement>
  onPointerMove: PointerEventHandler<HTMLDivElement>
  onPointerUp: PointerEventHandler<HTMLDivElement>
  onPointerCancel: PointerEventHandler<HTMLDivElement>
}

interface ResizableSplitPane {
  containerRef: RefObject<HTMLDivElement | null>
  containerStyle: CSSProperties
  leftPaneStyle: CSSProperties
  rightPaneStyle: CSSProperties
  dividerStyle: CSSProperties
  dividerProps: DividerProps
}

function clampDividerRatio(desiredRatio: number, containerWidth: number): number {
  if (containerWidth <= PANE_MIN_WIDTH * 2) return 0.5
  const minimum = PANE_MIN_WIDTH / containerWidth
  return Math.max(minimum, Math.min(1 - minimum, desiredRatio))
}

/**
 * One symmetric resize model for every two-column workspace in the Score
 * Window. React stores only the divider ratio; CSS Grid owns the pane widths
 * and responds to window resizing without an observer or pixel synchronization.
 */
export function useResizableSplitPane(): ResizableSplitPane {
  const containerRef = useRef<HTMLDivElement>(null)
  const activePointerId = useRef<number | null>(null)
  const lastClientX = useRef<number | null>(null)
  const dividerRatioRef = useRef(0.5)
  const [dividerRatio, setDividerRatio] = useState(0.5)

  const releasePointer = (target: HTMLDivElement, pointerId: number): void => {
    activePointerId.current = null
    lastClientX.current = null
    if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId)
  }

  const onPointerDown: PointerEventHandler<HTMLDivElement> = event => {
    event.preventDefault()
    const container = containerRef.current
    if (!container) return
    const bounds = container.getBoundingClientRect()
    const currentRatio = clampDividerRatio((event.clientX - bounds.left) / bounds.width, bounds.width)
    dividerRatioRef.current = currentRatio
    setDividerRatio(currentRatio)
    activePointerId.current = event.pointerId
    lastClientX.current = event.clientX
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onPointerMove: PointerEventHandler<HTMLDivElement> = event => {
    if (activePointerId.current !== event.pointerId) return
    const container = containerRef.current
    const previousClientX = lastClientX.current
    if (!container || previousClientX === null) return

    // Advance the pointer anchor even while clamped. Movement beyond an edge is
    // therefore discarded rather than stored as a dead zone, and reversing by
    // one pixel immediately moves the divider back into the valid range.
    const delta = event.clientX - previousClientX
    lastClientX.current = event.clientX
    const nextRatio = clampDividerRatio(
      dividerRatioRef.current + delta / container.clientWidth,
      container.clientWidth
    )
    dividerRatioRef.current = nextRatio
    setDividerRatio(nextRatio)
  }

  const finishPointer: PointerEventHandler<HTMLDivElement> = event => {
    if (activePointerId.current !== event.pointerId) return
    releasePointer(event.currentTarget, event.pointerId)
  }

  return {
    containerRef,
    containerStyle: {
      display: 'grid',
      // Keep both flexible factors above 1fr. Sub-1fr tracks represent partial
      // shares in CSS Grid; when their sibling hits its 200px minimum, that can
      // leave unused space instead of filling the container.
      gridTemplateColumns: `minmax(${PANE_MIN_WIDTH}px, ${dividerRatio * GRID_FRACTION_SCALE}fr) 0 minmax(${PANE_MIN_WIDTH}px, ${(1 - dividerRatio) * GRID_FRACTION_SCALE}fr)`,
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
