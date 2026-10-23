import { describe, expect, it } from 'vitest'
import {
  addTile, allocate, arrangeGrid, columnsFor, computeArrangement, moveTile, reconcile, removeTile,
  resolveRect, tileIds, TILE_MIN, type LayoutNode
} from './tileLayout'

// Shape without generated split ids: tiles as ids, splits as { row|column: [...] }.
type Shape = string | { row: Shape[] } | { column: Shape[] }
const shape = (n: LayoutNode | null): Shape | null =>
  n === null ? null : n.kind === 'tile' ? n.id : { [n.dir]: n.children.map(c => shape(c)!) } as Shape

describe('tile layout', () => {
  it('fills rows up to the column count; a short last row stretches', () => {
    let root: LayoutNode | null = null
    for (const id of ['a', 'b', 'c']) root = addTile(root, id, 2)
    expect(shape(root)).toEqual({ column: [{ row: ['a', 'b'] }, 'c'] })
    root = addTile(root, 'd', 2)
    expect(shape(root)).toEqual({ column: [{ row: ['a', 'b'] }, { row: ['c', 'd'] }] })
    expect(shape(arrangeGrid(['a', 'b', 'c', 'd'], 3))).toEqual({ column: [{ row: ['a', 'b', 'c'] }, 'd'] })
  })

  it('caps columns at three and keeps tiles at least the target width', () => {
    expect(columnsFor(300)).toBe(1)
    expect(columnsFor(800)).toBe(2)
    expect(columnsFor(3000)).toBe(3)
  })

  it('removing a tile collapses its split and keeps other shares', () => {
    const root = arrangeGrid(['a', 'b', 'c'], 2)
    expect(shape(removeTile(root, 'c'))).toEqual({ row: ['a', 'b'] })
    expect(shape(removeTile(root, 'a'))).toEqual({ column: ['b', 'c'] })
  })

  it('reconcile drops removed maps and places new ones', () => {
    const root = arrangeGrid(['a', 'b'], 2)
    expect(shape(reconcile(root, ['b', 'x'], 2))).toEqual({ row: ['b', 'x'] })
  })

  it('moving to a side splits the target, sharing its space', () => {
    const root = arrangeGrid(['a', 'b', 'c'], 2)
    // c beside a in the first row: the row now holds a, c, b; c took half of a's share.
    const moved = moveTile(root, 'c', 'a', 'right')
    expect(shape(moved)).toEqual({ row: ['a', 'c', 'b'] })
    if (moved?.kind !== 'split') throw new Error('expected split')
    expect(moved.sizes.map(s => Math.round(s * 100))).toEqual([25, 25, 50])
    // b below a: once b leaves, a sits directly in the column, so b joins it there.
    expect(shape(moveTile(root, 'b', 'a', 'bottom'))).toEqual({ column: ['a', 'b', 'c'] })
  })

  it('makes a tall tile by dropping onto the top or bottom of a neighbour', () => {
    const root = arrangeGrid(['a', 'b', 'c'], 3)
    expect(shape(moveTile(root, 'c', 'b', 'bottom'))).toEqual({ row: ['a', { column: ['b', 'c'] }] })
    expect(tileIds(moveTile(root, 'a', 'a', 'left'))).toEqual(['a', 'b', 'c'])
  })

  it('allocates lengths by share without going below minimums', () => {
    expect(allocate(1000, [0.5, 0.5], [280, 280])).toEqual([500, 500])
    expect(allocate(1000, [0.9, 0.1], [280, 280])).toEqual([720, 280])
  })

  it('computes tile rects and dividers that fill the area', () => {
    const root = arrangeGrid(['a', 'b', 'c'], 2)
    const { tiles, dividers } = computeArrangement(root, { x: 0, y: 0, width: 801, height: 601 })
    expect(tiles.get('a')).toEqual({ x: 0, y: 0, width: 400, height: 300 })
    expect(tiles.get('b')).toEqual({ x: 401, y: 0, width: 400, height: 300 })
    expect(tiles.get('c')).toEqual({ x: 0, y: 301, width: 801, height: 300 })
    expect(dividers).toHaveLength(2)
    expect(TILE_MIN.width).toBeLessThanOrEqual(400)
  })

  it('places tiles in lengths that follow the area as it resizes', () => {
    const root = arrangeGrid(['a', 'b', 'c'], 2)
    const measured = computeArrangement(root, { x: 0, y: 0, width: 801, height: 601 })
    const larger = { x: 0, y: 0, width: 1201, height: 901 }
    const exact = computeArrangement(root, larger)
    for (const id of ['a', 'b', 'c']) {
      expect(resolveRect(measured.fluid.get(id)!, larger)).toEqual(exact.tiles.get(id))
    }
    expect(measured.dividers.map(d => resolveRect(d.fluid, larger))).toEqual(exact.dividers.map(d => d.rect))
  })

  it('holds a tile at its minimum width while its neighbour follows the area', () => {
    const root: LayoutNode = {
      kind: 'split', id: 'r', dir: 'row', sizes: [0.9, 0.1],
      children: [{ kind: 'tile', id: 'a' }, { kind: 'tile', id: 'b' }]
    }
    const { fluid } = computeArrangement(root, { x: 0, y: 0, width: 1001, height: 400 })
    expect(fluid.get('b')!.width).toEqual({ frac: 0, px: TILE_MIN.width })
    expect(fluid.get('a')!.width).toEqual({ frac: 1, px: -1 - TILE_MIN.width })
  })
})
