import { history } from '../src/store/history'

// Browser interaction state shared by the Score Window and the map tiles.
//
// One surface is active at a time: 'score' or a map ID. It follows pointer and
// focus entry. Changing surface ends the outgoing tile's history transaction,
// so a gesture cut short (pointer released outside, focus moved by Tab) cannot
// absorb later edits elsewhere. Editing-modal locks are kept per owner, as
// main/menu.ts does for desktop map windows, so one tile closing its modal
// cannot release another tile's lock.

export type Surface = 'score' | string

let active: Surface = 'score'
const openTransactions = new Set<string>()
const modalOwners = new Set<string>()

const ownerFor = (mapId: string): string => `map:${mapId}`

export function activeSurface(): Surface {
  return active
}

export function activateSurface(next: Surface): void {
  if (next === active) return
  if (active !== 'score') endTransaction(active)
  active = next
}

export function beginTransaction(mapId: string): void {
  openTransactions.add(mapId)
  history.begin(ownerFor(mapId))
}

export function endTransaction(mapId: string): void {
  if (!openTransactions.delete(mapId)) return
  history.end(ownerFor(mapId))
}

export function setModalLock(mapId: string, open: boolean): void {
  if (open) modalOwners.add(mapId)
  else modalOwners.delete(mapId)
}

/** Releases everything a removed tile held. */
export function releaseSurface(mapId: string): void {
  endTransaction(mapId)
  modalOwners.delete(mapId)
  if (active === mapId) active = 'score'
}

/** Mirrors the desktop menu: history keys are refused while any map modal is open. */
export function historyLocked(): boolean {
  return modalOwners.size > 0
}
