import { useEffect, useId, useRef, type ReactNode } from 'react'
import { useOverlay } from '../lib/overlayStack'
import { CANCEL_MODAL_EVENT } from './ModalShell'

interface ConfirmationDiscProps {
  title: ReactNode
  detail: ReactNode
  actionLabel: ReactNode
  onAction: () => void
  onCancel: () => void
  fixed?: boolean
}

interface ForwardActionButtonProps {
  label: string
  onClick: () => void
  disabled?: boolean
  autoFocus?: boolean
  /** Red instead of green, for actions that replace a lot of work. */
  destructive?: boolean
}

function ForwardArrow(): React.JSX.Element {
  return (
    <svg className="forwardActionArrow" viewBox="0 0 36 24" aria-hidden="true">
      <path d="M4 12H30M21 4L30 12L21 20" />
    </svg>
  )
}

/** Primary forward action used inside conventional rectangular task dialogs. */
export function ForwardActionButton({
  label,
  onClick,
  disabled = false,
  autoFocus = false,
  destructive = false
}: ForwardActionButtonProps): React.JSX.Element {
  return (
    <button
      type="button"
      className={destructive ? 'forwardActionButton forwardActionButtonDestructive' : 'forwardActionButton'}
      aria-label={label}
      title={label}
      disabled={disabled}
      autoFocus={autoFocus}
      onClick={onClick}
    >
      <ForwardArrow />
    </button>
  )
}

/**
 * Shared confirmation surface with one visible forward action.
 *
 * The forward action deliberately prioritizes pointer input: it is not in the
 * Tab order and nothing receives focus when the disc opens. Escape remains a
 * fast, non-destructive dismissal path.
 */
export function ConfirmationDisc({
  title,
  detail,
  actionLabel,
  onAction,
  onCancel,
  fixed = false
}: ConfirmationDiscProps): React.JSX.Element {
  const id = useId()
  const titleId = `${id}-title`
  const detailId = `${id}-detail`
  const discRef = useRef<HTMLDivElement>(null)

  // Focus lands on the disc itself, never the action, so Enter cannot confirm
  // a destructive choice the moment it appears.
  useOverlay(onCancel, discRef)

  useEffect(() => {
    window.api?.setModalOpen?.(true)
    const closeOnAppQuit = (): void => onCancel()
    window.addEventListener(CANCEL_MODAL_EVENT, closeOnAppQuit)
    return () => window.removeEventListener(CANCEL_MODAL_EVENT, closeOnAppQuit)
  }, [onCancel])

  return (
    <div
      className={`confirmationOverlay${fixed ? ' confirmationOverlayFixed' : ''}`}
      onClick={onCancel}
    >
      <div
        ref={discRef}
        tabIndex={-1}
        className="confirmationDisc modalZoomEnter"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={detailId}
        onClick={event => event.stopPropagation()}
      >
        <div className="confirmationCopy">
          <p className="confirmationTitle" id={titleId}>{title}</p>
          <p className="confirmationDetail" id={detailId}>{detail}</p>
        </div>
        <button className="confirmationAction" tabIndex={-1} onClick={onAction}>
          <span className="confirmationActionLabelVisuallyHidden">{actionLabel}</span>
          <ForwardArrow />
        </button>
      </div>
    </div>
  )
}
