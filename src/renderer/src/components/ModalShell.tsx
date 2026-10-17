import { useEffect, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { useOverlay } from '../lib/overlayStack'

export const CANCEL_MODAL_EVENT = 'chora:cancel-modals'

interface Props {
  children: ReactNode
  overlayClassName: string
  dialogClassName: string
  onClose: () => void
  labelledBy?: string
  label?: string
  dismissOnEscape?: boolean
  dialogStyle?: CSSProperties
  dialogAnimationClassName?: string
  onDialogAnimationEnd?: () => void
  /** Nudge an absolutely positioned dialog back inside its overlay (click-anchored pickers). */
  clampToOverlay?: boolean
}

const CLAMP_INSET = 4

/** Shifts the dialog by the overflow on each axis, preferring its top-left edge in view. */
function clampInto(dialog: HTMLElement, overlay: HTMLElement): void {
  const d = dialog.getBoundingClientRect()
  const o = overlay.getBoundingClientRect()
  if (o.width <= 0 || o.height <= 0) return
  const dx = Math.max(o.left + CLAMP_INSET - d.left, Math.min(0, o.right - CLAMP_INSET - d.right))
  const dy = Math.max(o.top + CLAMP_INSET - d.top, Math.min(0, o.bottom - CLAMP_INSET - d.bottom))
  if (dx === 0 && dy === 0) return
  dialog.style.left   = `${dialog.offsetLeft + dx}px`
  dialog.style.top    = `${dialog.offsetTop + dy}px`
  dialog.style.right  = 'auto'
  dialog.style.bottom = 'auto'
}

/** Shared behavior for cancelable dialogs; each dialog keeps its own layout. */
export function ModalShell({
  children,
  overlayClassName,
  dialogClassName,
  onClose,
  labelledBy,
  label,
  dismissOnEscape = true,
  dialogStyle,
  dialogAnimationClassName = 'modalZoomEnter',
  onDialogAnimationEnd,
  clampToOverlay = false
}: Props): React.JSX.Element {
  const overlayRef = useRef<HTMLDivElement>(null)
  const dialogRef  = useRef<HTMLDivElement>(null)

  // Measured before paint, so a clamped picker never flashes at its raw position.
  useLayoutEffect(() => {
    if (clampToOverlay && dialogRef.current && overlayRef.current) clampInto(dialogRef.current, overlayRef.current)
  }, [clampToOverlay])

  // Escape goes to the topmost overlay only; a non-dismissable one swallows it.
  useOverlay(dismissOnEscape ? onClose : null)

  useEffect(() => {
    const closeOnAppQuit = (): void => onClose()
    window.addEventListener(CANCEL_MODAL_EVENT, closeOnAppQuit)
    return () => window.removeEventListener(CANCEL_MODAL_EVENT, closeOnAppQuit)
  }, [onClose])

  return (
    <div
      ref={overlayRef}
      className={overlayClassName}
      onClick={event => {
        event.stopPropagation()
        if (event.target === event.currentTarget) onClose()
      }}
      onMouseDown={event => event.stopPropagation()}
      onMouseMove={event => event.stopPropagation()}
      onMouseUp={event => event.stopPropagation()}
      onContextMenu={event => event.stopPropagation()}
    >
      <div
        ref={dialogRef}
        className={`${dialogClassName} ${dialogAnimationClassName}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-label={label}
        style={dialogStyle}
        onAnimationEnd={event => {
          if (event.target === event.currentTarget) onDialogAnimationEnd?.()
        }}
      >
        {children}
      </div>
    </div>
  )
}
