import { describe, expect, it } from 'vitest'
import type { MapConfig } from '../../lib/types'
import { MAP_TYPES, mapTypeInfo, newMapConfig } from './mapTypes'

const input = (maps: MapConfig[] = []) => ({
  dimensionIds: ['x', 'y', 'z'],
  maps,
  showLabels: true,
  marks: 'circle' as const
})

describe('map types', () => {
  it('describes each map type once', () => {
    expect(MAP_TYPES.map(t => t.type)).toEqual(['cartesian', 'semantic'])
    expect(mapTypeInfo('semantic').dimensions).toBe('several')
  })

  it('starts a cartesian map on the first two dimensions, sized by weight', () => {
    const map = newMapConfig('cartesian', input())
    expect(map).toMatchObject({
      type: 'cartesian', title: 'Map 1', xDimensionId: 'x', yDimensionId: 'y',
      sizeByWeight: true, colorMode: 'element', shownCollectionIds: []
    })
  })

  it('starts a semantic map on every chosen dimension, numbered among semantic maps', () => {
    const earlier = [newMapConfig('cartesian', input()), newMapConfig('semantic', input())]
    const map = newMapConfig('semantic', input(earlier))
    expect(map).toMatchObject({
      type: 'semantic', title: 'Semantic Map 2', dimensionIds: ['x', 'y', 'z'],
      elementIds: [], flippedDimensionIds: [], sizeByWeight: false
    })
  })
})
