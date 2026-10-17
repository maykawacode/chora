import { create } from 'zustand'
import { useAppStore } from '../../store/appStore'
import { resolveStatusMessage } from './statusRules'

// The status line: a brief notice (browser downloads) when one is showing,
// otherwise the contextual hint for the current study. The Score Window shows
// it on the desktop; the browser shows it in its page banner.

const NOTICE_MS = 4000

const useStatusNotice = create<{ message: string | null }>(() => ({ message: null }))
let timer: ReturnType<typeof setTimeout> | undefined

/** Replaces the hint with `message` for a few seconds. */
export function showStatusNotice(message: string): void {
  clearTimeout(timer)
  useStatusNotice.setState({ message })
  timer = setTimeout(() => useStatusNotice.setState({ message: null }), NOTICE_MS)
}

/** The status line; `contextHint` replaces the study hint (browser Settings). */
export function useStatusLine(contextHint?: string): string {
  const notice = useStatusNotice(s => s.message)
  const hint = useAppStore(resolveStatusMessage)
  return notice ?? contextHint ?? hint
}
