import { useRef, useState } from 'react'
import type { CSSProperties, PointerEventHandler, RefObject } from 'react'

// Sized for the more demanding of the two panes this hook currently serves:
// Notes, whose label + Trix toolbar + one line of editor content need more
// room than Intent's label + one line of plain text (see NotesTab.module.css).
// Intent ends up with some slack above its one-line floor at minimum drag,
// which is a smaller tradeoff than a second constant for one call site.
// Each field also carries its own one-line CSS min-height as a second,
// content-level floor — see .intentField and trix-editor in
// NotesTab.module.css — so an under-estimate here still can't clip text.
const PANE_MIN_HEIGHT = 110
const DIVIDER_HIT_HEIGHT = 5
const GRID_FRACTION_SCALE = 1000

interface DividerProps {
  onPointerDown: PointerEventHandler<HTMLDivElement>
  onPointerMove: PointerEventHandler<HTMLDivElement>
  onPointerUp: PointerEventHandler<HTMLDivElement>
  onPointerCancel: PointerEventHandler<HTMLDivElement>
}

interface ResizableSplitPaneVertical {
  containerRef: RefObject<HTMLDivElement | null>
  containerStyle: CSSProperties
  topPaneStyle: CSSProperties
  bottomPaneStyle: CSSProperties
  dividerStyle: CSSProperties
  dividerProps: DividerProps
}

function clampDividerRatio(desiredRatio: number, containerHeight: number): number {
  if (containerHeight <= PANE_MIN_HEIGHT * 2) return 0.5
  const minimum = PANE_MIN_HEIGHT / containerHeight
  return Math.max(minimum, Math.min(1 - minimum, desiredRatio))
}

/**
 * The vertical counterpart to useResizableSplitPane (that one drives every
 * horizontal list/detail divider in the Score Window). Same CSS Grid +
 * pointer-capture model — a dragged row ratio instead of a column ratio —
 * for the one workspace that stacks its panes top/bottom: NotesTab's
 * Intent/Notes divide.
 */
export function useResizableSplitPaneVertical(): ResizableSplitPaneVertical {
  const containerRef = useRef<HTMLDivElement>(null)
  const activePointerId = useRef<number | null>(null)
  const lastClientY = useRef<number | null>(null)
  const dividerRatioRef = useRef(0.25)
  const [dividerRatio, setDividerRatio] = useState(0.25)

  const releasePointer = (target: HTMLDivElement, pointerId: number): void => {
    activePointerId.current = null
    lastClientY.current = null
    if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId)
  }

  const onPointerDown: PointerEventHandler<HTMLDivElement> = event => {
    event.preventDefault()
    const container = containerRef.current
    if (!container) return
    const bounds = container.getBoundingClientRect()
    const currentRatio = clampDividerRatio((event.clientY - bounds.top) / bounds.height, bounds.height)
    dividerRatioRef.current = currentRatio
    setDividerRatio(currentRatio)
    activePointerId.current = event.pointerId
    lastClientY.current = event.clientY
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onPointerMove: PointerEventHandler<HTMLDivElement> = event => {
    if (activePointerId.current !== event.pointerId) return
    const container = containerRef.current
    const previousClientY = lastClientY.current
    if (!container || previousClientY === null) return

    // Advance the pointer anchor even while clamped — see the horizontal
    // hook's identical comment for why: movement beyond an edge is discarded
    // rather than stored as a dead zone.
    const delta = event.clientY - previousClientY
    lastClientY.current = event.clientY
    const nextRatio = clampDividerRatio(
      dividerRatioRef.current + delta / container.clientHeight,
      container.clientHeight
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
      gridTemplateColumns: 'minmax(0, 1fr)',
      gridTemplateRows: `minmax(${PANE_MIN_HEIGHT}px, ${dividerRatio * GRID_FRACTION_SCALE}fr) 0 minmax(${PANE_MIN_HEIGHT}px, ${(1 - dividerRatio) * GRID_FRACTION_SCALE}fr)`,
      height: '100%',
      maxHeight: '100%',
      minHeight: 0
    },
    topPaneStyle: {
      gridRow: 1,
      height: '100%',
      minHeight: 0,
      maxHeight: '100%',
      alignSelf: 'stretch'
    },
    bottomPaneStyle: {
      gridRow: 3,
      height: '100%',
      minHeight: 0,
      maxHeight: '100%',
      alignSelf: 'stretch'
    },
    dividerStyle: {
      gridRow: 2,
      gridColumn: 1,
      height: DIVIDER_HIT_HEIGHT,
      alignSelf: 'center',
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
