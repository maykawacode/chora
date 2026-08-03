import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, PointerEventHandler, RefObject } from 'react'

const PANE_MIN_WIDTH = 200
const DIVIDER_HIT_WIDTH = 5

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

function clampDividerPosition(desiredLeftWidth: number, containerWidth: number): number {
  const maximum = Math.max(PANE_MIN_WIDTH, containerWidth - PANE_MIN_WIDTH)
  return Math.max(PANE_MIN_WIDTH, Math.min(maximum, desiredLeftWidth))
}

/**
 * One symmetric resize model for every two-column workspace in the Score
 * Window. The divider position explicitly sizes both panes, so their contents
 * cannot influence either clamp. Its proportion is preserved when the window
 * resizes, making both panes scale with their container. The divider overlays
 * the pane boundary rather than consuming layout width.
 */
export function useResizableSplitPane(): ResizableSplitPane {
  const containerRef = useRef<HTMLDivElement>(null)
  const activePointerId = useRef<number | null>(null)
  const lastClientX = useRef<number | null>(null)
  const leftWidthRef = useRef<number | null>(null)
  const dividerRatioRef = useRef(0.5)
  const [leftWidth, setLeftWidth] = useState<number | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const fitToContainer = (): void => {
      const width = container.clientWidth
      if (width <= 0) return
      setLeftWidth(() => {
        const fitted = clampDividerPosition(width * dividerRatioRef.current, width)
        leftWidthRef.current = fitted
        return fitted
      })
    }

    fitToContainer()
    const observer = new ResizeObserver(fitToContainer)
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  const releasePointer = (target: HTMLDivElement, pointerId: number): void => {
    activePointerId.current = null
    lastClientX.current = null
    if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId)
  }

  const onPointerDown: PointerEventHandler<HTMLDivElement> = event => {
    event.preventDefault()
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
    const currentWidth = leftWidthRef.current ?? container.clientWidth / 2
    const nextWidth = clampDividerPosition(currentWidth + delta, container.clientWidth)
    leftWidthRef.current = nextWidth
    dividerRatioRef.current = nextWidth / container.clientWidth
    setLeftWidth(nextWidth)
  }

  const finishPointer: PointerEventHandler<HTMLDivElement> = event => {
    if (activePointerId.current !== event.pointerId) return
    releasePointer(event.currentTarget, event.pointerId)
  }

  return {
    containerRef,
    // Prevent the two fixed-width panes from establishing an intrinsic width
    // larger than their parent. The observed container then follows window
    // shrinkage, allowing fitToContainer() to move the divider as necessary.
    containerStyle: {
      width: '100%',
      maxWidth: '100%',
      minWidth: 0
    },
    leftPaneStyle: {
      width: leftWidth ?? '50%',
      minWidth: PANE_MIN_WIDTH,
      maxWidth: `calc(100% - ${PANE_MIN_WIDTH}px)`,
      flex: '0 0 auto'
    },
    rightPaneStyle: {
      width: leftWidth === null ? '50%' : `calc(100% - ${leftWidth}px)`,
      minWidth: PANE_MIN_WIDTH,
      maxWidth: `calc(100% - ${PANE_MIN_WIDTH}px)`,
      flex: '0 0 auto'
    },
    dividerStyle: {
      width: DIVIDER_HIT_WIDTH,
      marginRight: -DIVIDER_HIT_WIDTH / 2,
      marginLeft: -DIVIDER_HIT_WIDTH / 2,
      flex: '0 0 auto',
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
