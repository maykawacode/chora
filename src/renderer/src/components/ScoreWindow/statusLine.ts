import { create } from 'zustand'
import type { AppState } from '../../lib/types'
import { useAppStore } from '../../store/appStore'

// The status line: a brief notice (browser downloads) when one is showing,
// otherwise the contextual hint for the current study. The Score Window shows
// it on the desktop. The browser's page banner shows only the notices
// (useStatusNotices), keeping that space for what matters.

const NOTICE_MS = 4000

const useStatusNotice = create<{ message: string | null }>(() => ({ message: null }))
let timer: ReturnType<typeof setTimeout> | undefined

/** Replaces the hint with `message` for a few seconds. */
export function showStatusNotice(message: string): void {
  clearTimeout(timer)
  useStatusNotice.setState({ message })
  timer = setTimeout(() => useStatusNotice.setState({ message: null }), NOTICE_MS)
}

/** The status line: the current notice, otherwise the study hint. */
export function useStatusLine(): string {
  const notice = useStatusNotice(s => s.message)
  const hint = useAppStore(resolveStatusMessage)
  return notice ?? hint
}

/** The current notice alone, without study hints. */
export function useStatusNotices(): string | null {
  return useStatusNotice(s => s.message)
}

// ── Study hints (desktop status bar) ──────────────────────────────────────────

// Edit status-bar wording here. The nested property names describe when each
// message appears; changing message text does not require changing any rules.
export const STATUS_MESSAGES = {
  notes: {
    ready: 'Capture the intent of this study and any running notes.'
  },

  elements: {
    empty: 'Add an element to begin.',
    noSelection: 'Select an element to edit.',
    selected: 'Edit the selected element in the detail panel.'
  },

  dimensions: {
    empty: 'Add a dimension to begin. Select the "..." to pull up a library of suggestions.',
    noSelection: 'Select a dimension to edit.',
    selected: 'Edit the selected dimension in the detail panel.'
  },

  collections: {
    empty: 'Add a collection to begin. Collections are not required for drawing maps.',
    noSelection: 'Select a collection to edit.',
    selected: 'Edit the selected collection in the detail panel.'
  },

  assess: {
    noElements: '[WARNING] You need at least one element before assessing. Create it in the elements panel.',
    noDimensions: '[WARNING] You need at least one dimension before assessing. Create it in the dimensions panel.',
    noElementSelection: 'Choose an element to assess.',
    noDimensionSelection: 'Choose a dimension for the selected element.',
    ready: 'Move the score indicator, or use the arrow keys.'
  },

  conversions: {
    ready: 'Choose a source and destination, then apply the conversion.'
  }
} as const

type StatusState = Pick<
  AppState,
  | 'activeTab'
  | 'elements'
  | 'dimensions'
  | 'collections'
  | 'selectedElementId'
  | 'selectedDimensionId'
  | 'selectedCollectionId'
>

export function resolveStatusMessage(state: StatusState): string {
  switch (state.activeTab) {
    case 'notes':
      return STATUS_MESSAGES.notes.ready

    case 'elements':
      if (state.elements.length === 0) return STATUS_MESSAGES.elements.empty
      return state.selectedElementId
        ? STATUS_MESSAGES.elements.selected
        : STATUS_MESSAGES.elements.noSelection

    case 'dimensions':
      if (state.dimensions.length === 0) return STATUS_MESSAGES.dimensions.empty
      return state.selectedDimensionId
        ? STATUS_MESSAGES.dimensions.selected
        : STATUS_MESSAGES.dimensions.noSelection

    case 'collections':
      if (state.collections.length === 0) return STATUS_MESSAGES.collections.empty
      return state.selectedCollectionId
        ? STATUS_MESSAGES.collections.selected
        : STATUS_MESSAGES.collections.noSelection

    case 'scores':
      if (state.elements.length === 0) return STATUS_MESSAGES.assess.noElements
      if (state.dimensions.length === 0) return STATUS_MESSAGES.assess.noDimensions
      if (!state.selectedElementId) return STATUS_MESSAGES.assess.noElementSelection
      if (!state.selectedDimensionId) return STATUS_MESSAGES.assess.noDimensionSelection
      return STATUS_MESSAGES.assess.ready

    case 'conversions':
      return STATUS_MESSAGES.conversions.ready
  }
}
