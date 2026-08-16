import { useEffect, type CSSProperties, type ReactNode } from 'react'

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
  onDialogAnimationEnd
}: Props): React.JSX.Element {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    const closeOnAppQuit = (): void => onClose()

    if (dismissOnEscape) window.addEventListener('keydown', closeOnEscape)
    window.addEventListener(CANCEL_MODAL_EVENT, closeOnAppQuit)
    return () => {
      if (dismissOnEscape) window.removeEventListener('keydown', closeOnEscape)
      window.removeEventListener(CANCEL_MODAL_EVENT, closeOnAppQuit)
    }
  }, [dismissOnEscape, onClose])

  return (
    <div
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
