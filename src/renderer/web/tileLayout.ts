import { create } from 'zustand'

// Browser map-area arrangement: a tree of splits whose leaves are map tiles.
// A row split lays its children left to right, a column split top to bottom;
// `sizes` are the children's shares and sum to 1. The tree always fills the
// area. It is browser layout, not study content: changing it never marks the
// study dirty or enters history. Session-only until layout persistence (3d).

export type Dir = 'row' | 'column'
export type Side = 'left' | 'right' | 'top' | 'bottom'

export interface TileNode { kind: 'tile'; id: string }
export interface SplitNode { kind: 'split'; id: string; dir: Dir; children: LayoutNode[]; sizes: number[] }
export type LayoutNode = TileNode | SplitNode

export interface Rect { x: number; y: number; width: number; height: number }

export interface Divider {
  splitId: string
  /** The divider sits between children `index` and `index + 1`. */
  index: number
  dir: Dir
  rect: Rect
}

export interface Arrangement {
  tiles: Map<string, Rect>
  dividers: Divider[]
  /** Pixel length along `dir` of each split's children, for divider drags. */
  splits: Map<string, { dir: Dir; lengths: number[]; mins: number[] }>
}

/** Smallest tile that keeps a readable plot (two 58px margins + 160px plot) plus chrome. */
export const TILE_MIN = { width: 280, height: 280 }
/** Widest a tile may start; new maps start a new row rather than going narrower. */
export const TILE_TARGET_WIDTH = 360
export const MAX_COLUMNS = 3
export const DIVIDER = 1

let nextSplit = 0
const split = (dir: Dir, children: LayoutNode[], sizes?: number[]): SplitNode => ({
  kind: 'split',
  id: `split-${++nextSplit}`,
  dir,
  children,
  sizes: sizes ?? children.map(() => 1 / children.length)
})
const tile = (id: string): TileNode => ({ kind: 'tile', id })

const scaleTo1 = (sizes: number[]): number[] => {
  const total = sizes.reduce((a, b) => a + b, 0)
  return total > 0 ? sizes.map(s => s / total) : sizes.map(() => 1 / sizes.length)
}

/** Columns a new arrangement uses at this area width. */
export function columnsFor(width: number): number {
  return Math.max(1, Math.min(MAX_COLUMNS, Math.floor(width / TILE_TARGET_WIDTH)))
}

export function tileIds(node: LayoutNode | null): string[] {
  if (!node) return []
  return node.kind === 'tile' ? [node.id] : node.children.flatMap(tileIds)
}

/** Collapses one-child splits and merges a split into a parent of the same direction. */
export function normalize(node: LayoutNode | null): LayoutNode | null {
  if (!node || node.kind === 'tile') return node
  const children: LayoutNode[] = []
  const sizes: number[] = []
  node.children.forEach((child, i) => {
    const c = normalize(child)
    if (!c) return
    if (c.kind === 'split' && c.dir === node.dir) {
      c.children.forEach((g, j) => { children.push(g); sizes.push(node.sizes[i] * c.sizes[j]) })
    } else {
      children.push(c)
      sizes.push(node.sizes[i])
    }
  })
  if (children.length === 0) return null
  if (children.length === 1) return children[0]
  return { ...node, children, sizes: scaleTo1(sizes) }
}

export function removeTile(node: LayoutNode | null, id: string): LayoutNode | null {
  if (!node) return null
  if (node.kind === 'tile') return node.id === id ? null : node
  const kept = node.children.map((c, i) => [removeTile(c, id), node.sizes[i]] as const).filter(([c]) => c !== null)
  return normalize({ ...node, children: kept.map(([c]) => c!), sizes: scaleTo1(kept.map(([, s]) => s)) })
}

/** Appends a child with an equal share; existing children keep their proportions. */
function appendChild(node: SplitNode, child: LayoutNode): SplitNode {
  const n = node.children.length + 1
  return { ...node, children: [...node.children, child], sizes: [...node.sizes.map(s => s * (n - 1) / n), 1 / n] }
}

/**
 * Places a new map as the automatic grid would: into the last row while it has
 * fewer than `columns` tiles, otherwise as a new row beneath.
 */
export function addTile(root: LayoutNode | null, id: string, columns: number): LayoutNode {
  const leaf = tile(id)
  if (!root) return leaf
  const rowCount = (n: LayoutNode): number => n.kind === 'split' && n.dir === 'row' ? n.children.length : 1
  if (root.kind === 'split' && root.dir === 'column') {
    const last = root.children[root.children.length - 1]
    if (rowCount(last) < columns) {
      const row = last.kind === 'split' && last.dir === 'row' ? appendChild(last, leaf) : split('row', [last, leaf])
      return { ...root, children: [...root.children.slice(0, -1), row] }
    }
    return appendChild(root, leaf)
  }
  if (rowCount(root) < columns) {
    return root.kind === 'split' && root.dir === 'row' ? appendChild(root, leaf) : split('row', [root, leaf])
  }
  return split('column', [root, leaf])
}

/** Rows of up to `columns` maps in order; a short last row's tiles share its full width. */
export function arrangeGrid(ids: string[], columns: number): LayoutNode | null {
  const rows: LayoutNode[] = []
  for (let i = 0; i < ids.length; i += columns) {
    const row = ids.slice(i, i + columns).map(tile)
    rows.push(row.length === 1 ? row[0] : split('row', row))
  }
  if (rows.length === 0) return null
  return rows.length === 1 ? rows[0] : split('column', rows)
}

/** Keeps the tree's tiles in step with the study's maps: drops removed ones, places new ones. */
export function reconcile(root: LayoutNode | null, ids: string[], columns: number): LayoutNode | null {
  const wanted = new Set(ids)
  let next = root
  for (const id of tileIds(root)) if (!wanted.has(id)) next = removeTile(next, id)
  const present = new Set(tileIds(next))
  for (const id of ids) if (!present.has(id)) next = addTile(next, id, columns)
  return next
}

/** Moves tile `dragId` to `side` of tile `targetId`, splitting the target's space with it. */
export function moveTile(root: LayoutNode | null, dragId: string, targetId: string, side: Side): LayoutNode | null {
  if (!root || dragId === targetId) return root
  const ids = tileIds(root)
  if (!ids.includes(dragId) || !ids.includes(targetId)) return root
  const dir: Dir = side === 'left' || side === 'right' ? 'row' : 'column'
  const after = side === 'right' || side === 'bottom'
  const moved = tile(dragId)

  const place = (node: LayoutNode): LayoutNode => {
    if (node.kind === 'tile') {
      if (node.id !== targetId) return node
      return split(dir, after ? [node, moved] : [moved, node])
    }
    const i = node.children.findIndex(c => c.kind === 'tile' && c.id === targetId)
    if (i >= 0 && node.dir === dir) {
      // Same direction: the dragged tile takes half of the target's share.
      const half = node.sizes[i] / 2
      const at = after ? i + 1 : i
      const children = [...node.children]
      const sizes = [...node.sizes]
      children.splice(at, 0, moved)
      sizes.splice(i, 1, half)
      sizes.splice(at, 0, half)
      return { ...node, children, sizes }
    }
    return { ...node, children: node.children.map(place) }
  }

  return normalize(place(removeTile(root, dragId)!))
}

export function setSplitSizes(root: LayoutNode | null, splitId: string, sizes: number[]): LayoutNode | null {
  if (!root || root.kind === 'tile') return root
  if (root.id === splitId) return { ...root, sizes: scaleTo1(sizes) }
  return { ...root, children: root.children.map(c => setSplitSizes(c, splitId, sizes)!) }
}

export function minSize(node: LayoutNode): { width: number; height: number } {
  if (node.kind === 'tile') return TILE_MIN
  const mins = node.children.map(minSize)
  const gaps = DIVIDER * (node.children.length - 1)
  return node.dir === 'row'
    ? { width: mins.reduce((a, m) => a + m.width, 0) + gaps, height: Math.max(...mins.map(m => m.height)) }
    : { width: Math.max(...mins.map(m => m.width)), height: mins.reduce((a, m) => a + m.height, 0) + gaps }
}

/** Splits `length` by `shares`, giving each part at least its minimum. */
export function allocate(length: number, shares: number[], mins: number[]): number[] {
  const out = shares.map(() => 0)
  let free = shares.map((_, i) => i)
  let remaining = length
  // Pin parts that would fall below their minimum, then share the rest again.
  for (;;) {
    const share = free.reduce((a, i) => a + shares[i], 0)
    const short = free.filter(i => (share > 0 ? remaining * shares[i] / share : 0) < mins[i])
    if (short.length === 0) {
      free.forEach(i => { out[i] = share > 0 ? remaining * shares[i] / share : remaining / free.length })
      return out
    }
    short.forEach(i => { out[i] = mins[i]; remaining -= mins[i] })
    free = free.filter(i => !short.includes(i))
    if (free.length === 0) return out
  }
}

/** Pixel rects for every tile and divider in an area of the given size. */
export function computeArrangement(root: LayoutNode | null, area: Rect): Arrangement {
  const result: Arrangement = { tiles: new Map(), dividers: [], splits: new Map() }
  const walk = (node: LayoutNode, r: Rect): void => {
    if (node.kind === 'tile') { result.tiles.set(node.id, r); return }
    const horizontal = node.dir === 'row'
    const mins = node.children.map(c => horizontal ? minSize(c).width : minSize(c).height)
    const total = (horizontal ? r.width : r.height) - DIVIDER * (node.children.length - 1)
    const lengths = allocate(total, node.sizes, mins)
    result.splits.set(node.id, { dir: node.dir, lengths, mins })
    let at = horizontal ? r.x : r.y
    node.children.forEach((child, i) => {
      const len = lengths[i]
      walk(child, horizontal
        ? { x: at, y: r.y, width: len, height: r.height }
        : { x: r.x, y: at, width: r.width, height: len })
      at += len
      if (i < node.children.length - 1) {
        result.dividers.push({
          splitId: node.id, index: i, dir: node.dir,
          rect: horizontal
            ? { x: at, y: r.y, width: DIVIDER, height: r.height }
            : { x: r.x, y: at, width: r.width, height: DIVIDER }
        })
        at += DIVIDER
      }
    })
  }
  if (root) walk(root, area)
  return result
}

export function findSplit(node: LayoutNode | null, splitId: string): SplitNode | null {
  if (!node || node.kind === 'tile') return null
  if (node.id === splitId) return node
  for (const c of node.children) {
    const found = findSplit(c, splitId)
    if (found) return found
  }
  return null
}

interface TileLayoutStore {
  root: LayoutNode | null
  /** Column count at the area's current width; used when placing new maps. */
  columns: number
  set: (root: LayoutNode | null) => void
  setColumns: (columns: number) => void
}

export const useTileLayout = create<TileLayoutStore>(set => ({
  root: null,
  columns: 2,
  set: root => set({ root }),
  setColumns: columns => set({ columns })
}))

/** Maps › Arrange Maps in Grid: rebuilds the automatic arrangement in the current tile order. */
export function arrangeMapsInGrid(): void {
  const { root, columns, set } = useTileLayout.getState()
  set(arrangeGrid(tileIds(root), columns))
}
