// ── Map geometry ──────────────────────────────────────────────────────────────
//
// Pointer geometry every map type shares. Each type's own hit-testing lives in
// its adapter (cartesian/cartesianAdapter.ts, semantic/semanticAdapter.ts).

/** Corners of a lasso, in either order. */
export interface Rect { x1: number; y1: number; x2: number; y2: number }

/** Keeps a rigid drag group inside the 0–1 score range. */
export function clampGroupDelta(starts: number[], delta: number): number {
  let lo = -Infinity
  let hi = Infinity
  for (const start of starts) {
    lo = Math.max(lo, -start)
    hi = Math.min(hi, 1 - start)
  }
  return Math.min(hi, Math.max(lo, delta))
}

/** A grabbed dot moves its selection with it only when it belongs to that selection. */
export function dragGroupIds(draggedId: string, selectedIds: string[]): string[] {
  return selectedIds.includes(draggedId) ? selectedIds : [draggedId]
}

/** Whether (x, y) is within a dot drawn at `radius`; small dots keep an 8px reach. */
export function onDot(x: number, y: number, dotX: number, dotY: number, radius: number): boolean {
  return (x - dotX) ** 2 + (y - dotY) ** 2 <= Math.max(radius, 8) ** 2
}

export function inRect(x: number, y: number, { x1, y1, x2, y2 }: Rect): boolean {
  return x >= Math.min(x1, x2) && x <= Math.max(x1, x2) && y >= Math.min(y1, y2) && y <= Math.max(y1, y2)
}
