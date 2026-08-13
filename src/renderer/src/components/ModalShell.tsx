import { useEffect, type CSSProperties, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  overlayClassName: string
  dialogClassName: string
  onClose: () => void
  labelledBy?: string
  label?: string
  dismissOnEscape?: boolean
  dialogStyle?: CSSProperties
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
  dialogStyle
}: Props): React.JSX.Element {
  useEffect(() => {
    if (!dismissOnEscape) return
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
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
        className={`${dialogClassName} modalZoomEnter`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-label={label}
        style={dialogStyle}
      >
        {children}
      </div>
    </div>
  )
}
