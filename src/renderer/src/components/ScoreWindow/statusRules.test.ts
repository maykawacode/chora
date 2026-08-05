import { describe, expect, it } from 'vitest'
import type { AppState, Collection, Dimension, Element } from '../../lib/types'
import { STATUS_MESSAGES } from './statusMessages'
import { resolveStatusMessage } from './statusRules'

type StatusState = Parameters<typeof resolveStatusMessage>[0]

const element = { id: 'element-1' } as Element
const dimension = { id: 'dimension-1' } as Dimension
const collection = { id: 'collection-1' } as Collection

function state(changes: Partial<StatusState> = {}): StatusState {
  return {
    activeTab: 'elements' as AppState['activeTab'],
    elements: [],
    dimensions: [],
    collections: [],
    selectedElementId: null,
    selectedDimensionId: null,
    selectedCollectionId: null,
    ...changes
  }
}

describe('resolveStatusMessage', () => {
  it('resolves Element states', () => {
    expect(resolveStatusMessage(state())).toBe(STATUS_MESSAGES.elements.empty)
    expect(resolveStatusMessage(state({ elements: [element] }))).toBe(STATUS_MESSAGES.elements.noSelection)
    expect(resolveStatusMessage(state({ elements: [element], selectedElementId: element.id })))
      .toBe(STATUS_MESSAGES.elements.selected)
  })

  it('resolves Dimension states', () => {
    const base = { activeTab: 'dimensions' as const, dimensions: [dimension] }
    expect(resolveStatusMessage(state({ activeTab: 'dimensions' }))).toBe(STATUS_MESSAGES.dimensions.empty)
    expect(resolveStatusMessage(state(base))).toBe(STATUS_MESSAGES.dimensions.noSelection)
    expect(resolveStatusMessage(state({ ...base, selectedDimensionId: dimension.id })))
      .toBe(STATUS_MESSAGES.dimensions.selected)
  })

  it('resolves Collection states', () => {
    const base = { activeTab: 'collections' as const, collections: [collection] }
    expect(resolveStatusMessage(state({ activeTab: 'collections' }))).toBe(STATUS_MESSAGES.collections.empty)
    expect(resolveStatusMessage(state(base))).toBe(STATUS_MESSAGES.collections.noSelection)
    expect(resolveStatusMessage(state({ ...base, selectedCollectionId: collection.id })))
      .toBe(STATUS_MESSAGES.collections.selected)
  })

  it('resolves Assess states in priority order', () => {
    const tab = { activeTab: 'scores' as const }
    expect(resolveStatusMessage(state(tab))).toBe(STATUS_MESSAGES.assess.noElements)
    expect(resolveStatusMessage(state({ ...tab, elements: [element] })))
      .toBe(STATUS_MESSAGES.assess.noDimensions)
    expect(resolveStatusMessage(state({ ...tab, elements: [element], dimensions: [dimension] })))
      .toBe(STATUS_MESSAGES.assess.noElementSelection)
    expect(resolveStatusMessage(state({
      ...tab,
      elements: [element],
      dimensions: [dimension],
      selectedElementId: element.id
    }))).toBe(STATUS_MESSAGES.assess.noDimensionSelection)
    expect(resolveStatusMessage(state({
      ...tab,
      elements: [element],
      dimensions: [dimension],
      selectedElementId: element.id,
      selectedDimensionId: dimension.id
    }))).toBe(STATUS_MESSAGES.assess.ready)
  })

  it('resolves the Conversions state', () => {
    expect(resolveStatusMessage(state({ activeTab: 'conversions' })))
      .toBe(STATUS_MESSAGES.conversions.ready)
  })
})
