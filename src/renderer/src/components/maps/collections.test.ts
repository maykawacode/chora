import { describe, expect, it } from 'vitest'
import type { CartesianMapConfig, Collection, Element } from '../../lib/types'
import { cartesianElements } from './collections'

const collections: Collection[] = [
  { id: 'a', name: 'A', definition: '', color: '#aa0000' },
  { id: 'b', name: 'B', definition: '', color: '#0000aa' }
]

const elements: Element[] = [
  { id: 'a-only', name: 'A only', definition: '', weight: 1, color: '#fff', shape: 'circle', collectionIds: ['a'] },
  { id: 'both', name: 'Both', definition: '', weight: 1, color: '#fff', shape: 'circle', collectionIds: ['a', 'b'] },
  { id: 'none', name: 'None', definition: '', weight: 1, color: '#fff', shape: 'circle', collectionIds: [] }
]

function config(changes: Partial<CartesianMapConfig> = {}): CartesianMapConfig {
  return {
    id: 'map', type: 'cartesian', title: 'Map',
    xDimensionId: 'x', yDimensionId: 'y', xFlipped: false, yFlipped: false,
    showLabels: true, marks: 'circle', sizeByWeight: false, colorMode: 'element',
    shownCollectionIds: ['a'], onlySelectedCollections: false,
    windowX: 0, windowY: 0, windowWidth: 600, windowHeight: 500,
    ...changes
  }
}

describe('cartesianElements', () => {
  it('does not filter when the option is off', () => {
    expect(cartesianElements(config(), elements, collections)).toEqual(elements)
  })

  it('returns the union of selected collection members', () => {
    const visible = cartesianElements(
      config({ onlySelectedCollections: true, shownCollectionIds: ['a', 'b'] }),
      elements,
      collections
    )
    expect(visible.map(element => element.id)).toEqual(['a-only', 'both'])
  })

  it('returns no Elements when filtering with no selected collections', () => {
    expect(cartesianElements(
      config({ onlySelectedCollections: true, shownCollectionIds: [] }), elements, collections
    )).toEqual([])
  })
})
