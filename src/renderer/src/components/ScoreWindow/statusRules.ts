import type { AppState } from '../../lib/types'
import { STATUS_MESSAGES } from './statusMessages'

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
