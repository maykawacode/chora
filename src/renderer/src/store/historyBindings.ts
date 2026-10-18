// ── History bindings ──────────────────────────────────────────────────────────
//
// The two ways an edit becomes one undo step, so fields and gestures don't
// bracket history by hand:
//   historyField      — a field: everything typed or picked while it has focus
//   useHistoryGesture — a drag or a held key: one continuous adjustment

import { useEffect, useMemo, useRef, type ChangeEvent } from 'react'
import type { ChoraApi } from '../../../shared/contracts'
import { history, SCORE_HISTORY_OWNER } from './history'

type HistoryBridge = Pick<ChoraApi, 'historyBegin' | 'historyEnd'>

const SCORE_BRIDGE: HistoryBridge = {
  historyBegin: () => history.begin(SCORE_HISTORY_OWNER),
  historyEnd: () => history.end(SCORE_HISTORY_OWNER)
}

/**
 * Focus, blur and change handlers for a Score field, spread onto its input or
 * textarea. Change reasserts the step: Undo, Redo or Save can close it while
 * the field keeps focus.
 */
export function historyField(apply: (value: string) => void): {
  onFocus: () => void
  onBlur: () => void
  onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void
} {
  return {
    onFocus: () => history.begin(SCORE_HISTORY_OWNER),
    onBlur: () => history.end(SCORE_HISTORY_OWNER),
    onChange: e => {
      history.begin(SCORE_HISTORY_OWNER)
      apply(e.target.value)
    }
  }
}

export interface HistoryGesture {
  /** Call before every write; repeats are harmless and reopen a step closed mid-gesture. */
  begin: () => void
  /** Closes the step if this gesture opened it. */
  end: () => void
}

/**
 * One undo step per continuous adjustment, through the Score's history or a
 * map's bridge to it. The step also ends when the window loses focus or the
 * component unmounts, since a gesture can end without its mouseup or keyup.
 */
export function useHistoryGesture(bridge: HistoryBridge = SCORE_BRIDGE): HistoryGesture {
  const open = useRef(false)
  const gesture = useMemo<HistoryGesture>(() => ({
    begin: () => {
      open.current = true
      bridge.historyBegin()
    },
    end: () => {
      if (!open.current) return
      open.current = false
      bridge.historyEnd()
    }
  }), [bridge])

  useEffect(() => {
    window.addEventListener('blur', gesture.end)
    return () => {
      window.removeEventListener('blur', gesture.end)
      gesture.end()
    }
  }, [gesture])

  return gesture
}
