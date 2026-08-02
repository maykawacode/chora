// ── Application undo / redo ───────────────────────────────────────────────────────────────────
//
// The Score Window is the only authoritative renderer. It starts this
// controller and records changes to the persistent slices of appStore. Map
// renderers import the same store but never start history, so their replica
// loads and fine-grained drawing updates do not create competing stacks.

import { serializeSession } from '../lib/parser'
import type { AppState, MapConfig } from '../lib/types'
import { useAppStore } from './appStore'

export const SCORE_HISTORY_OWNER = 'score'

const HISTORY_LIMIT = 50

export interface HistoryFrame {
  session: string
  filePath: string | null
}

export interface SaveToken {
  generation: number
  frame: HistoryFrame
}

export interface HistoryAvailability {
  canUndo: boolean
  canRedo: boolean
}

type HistoryOwner = string | number

interface ActiveTransaction {
  owner: HistoryOwner
  before: HistoryFrame
  touched: boolean
}

type AppStoreApi = typeof useAppStore
type StoreState = ReturnType<AppStoreApi['getState']>
type PersistentSession = Pick<
  AppState,
  'sessionMeta' | 'elements' | 'collections' | 'dimensions' | 'scores' | 'maps'
>

function sameFrame(a: HistoryFrame, b: HistoryFrame): boolean {
  return a.filePath === b.filePath && a.session === b.session
}

function persistentSlicesChanged(state: StoreState, previous: StoreState): boolean {
  return state.sessionMeta !== previous.sessionMeta ||
    state.elements !== previous.elements ||
    state.collections !== previous.collections ||
    state.dimensions !== previous.dimensions ||
    state.scores !== previous.scores ||
    state.maps !== previous.maps
}

function withCurrentGeometry(restored: MapConfig[], current: MapConfig[]): MapConfig[] {
  const currentById = new Map(current.map(map => [map.id, map]))

  return restored.map(map => {
    const live = currentById.get(map.id)
    if (!live) return map
    return {
      ...map,
      windowX: live.windowX,
      windowY: live.windowY,
      windowWidth: live.windowWidth,
      windowHeight: live.windowHeight
    } as MapConfig
  })
}

/**
 * Bounded, linear snapshot history for the authoritative Score Window store.
 * Constructing a controller is inert; start() attaches its store subscription.
 */
export class HistoryController {
  private readonly store: AppStoreApi
  private unsubscribeStore: (() => void) | null = null
  private past: HistoryFrame[] = []
  private future: HistoryFrame[] = []
  private active: ActiveTransaction | null = null
  private saved: HistoryFrame
  private documentGeneration = 0
  private recordingGuard = 0
  private suspensionDepth = 0
  private dirtySyncSequence = 0
  private readonly availabilityListeners = new Set<(availability: HistoryAvailability) => void>()
  private lastAvailability: HistoryAvailability = { canUndo: false, canRedo: false }

  constructor(store: AppStoreApi = useAppStore) {
    this.store = store
    this.saved = this.frameFromState(store.getState())
  }

  /** Attach history to the store. Safe to call more than once. */
  start(): void {
    if (this.unsubscribeStore) return

    // start() is the session baseline. In production it runs before the Score
    // Window can mutate the initial empty document.
    this.past = []
    this.future = []
    this.active = null
    this.saved = this.captureCurrent()
    this.dirtySyncSequence++
    this.setDirty(false)
    this.notifyAvailability()

    this.unsubscribeStore = this.store.subscribe((state, previous) => {
      if (this.recordingGuard > 0 || this.suspensionDepth > 0) return
      if (!persistentSlicesChanged(state, previous)) return

      if (this.active) {
        // Continuous gestures deliberately avoid serialization per update.
        if (!this.active.touched) {
          this.active.touched = true
          this.notifyAvailability()
        }
        this.setDirty(true)
        return
      }

      const before = this.frameFromState(previous)
      const after = this.frameFromState(state)
      if (sameFrame(before, after)) {
        this.scheduleDirtySync(after)
        return
      }

      this.pushPast(before)
      this.future = []
      this.scheduleDirtySync(after)
      this.notifyAvailability()
    })
  }

  /** Detach the subscription. History data is discarded on the next start(). */
  dispose(): void {
    this.unsubscribeStore?.()
    this.unsubscribeStore = null
    this.active = null
  }

  /** Begin one continuous or compound user action. */
  begin(owner: HistoryOwner): void {
    if (this.active?.owner === owner) return
    if (this.active) this.finishActive()
    this.active = { owner, before: this.captureCurrent(), touched: false }
  }

  /** End an action only when its owner still owns the active transaction. */
  end(owner: HistoryOwner): void {
    if (this.active?.owner !== owner) return
    this.finishActive()
  }

  /** Run a synchronous compound action without risking a leaked transaction. */
  run<T>(owner: HistoryOwner, fn: () => T): T {
    const alreadyOwned = this.active?.owner === owner
    this.begin(owner)
    try {
      return fn()
    } finally {
      // A nested helper using the same owner belongs to the outer boundary;
      // it must not close that boundary early.
      if (!alreadyOwned) this.end(owner)
    }
  }

  /** Restore the most recent prior frame. */
  undo(): boolean {
    this.finishActive()
    const target = this.past.pop()
    if (!target) {
      this.notifyAvailability()
      return false
    }

    this.future.push(this.captureCurrent())
    this.applyFrame(target)
    this.notifyAvailability()
    return true
  }

  /** Restore the most recently undone frame. */
  redo(): boolean {
    this.finishActive()
    const target = this.future.pop()
    if (!target) {
      this.notifyAvailability()
      return false
    }

    this.pushPast(this.captureCurrent())
    this.applyFrame(target)
    this.notifyAvailability()
    return true
  }

  /**
   * Replace the whole document for New, Open, or auto-reopen. The replacement
   * becomes a clean baseline and cannot be undone into the prior document.
   */
  replaceDocument<T>(fn: () => T): T {
    this.finishActive()
    const before = this.captureCurrent()
    let result!: T
    try {
      this.withRecordingGuard(() => { result = fn() })
    } catch (error) {
      // Lifecycle callbacks are currently single synchronous store writes, but
      // keep this generic API failure-safe: a partial replacement must not sit
      // outside history while the old stacks continue to describe another state.
      if (!sameFrame(before, this.captureCurrent())) this.applyFrame(before)
      throw error
    }

    this.documentGeneration++
    this.past = []
    this.future = []
    this.active = null
    this.saved = this.captureCurrent()
    this.syncDirty(this.saved)
    this.notifyAvailability()
    return result
  }

  /** Replace the whole document as one undoable action (spreadsheet Import). */
  replaceUndoable<T>(fn: () => T): T {
    this.finishActive()
    const before = this.captureCurrent()
    let completed = false

    try {
      const result = this.run(SCORE_HISTORY_OWNER, fn)
      completed = true
      return result
    } finally {
      // A successful replacement invalidates every pending save even when the
      // imported content happens to compare equal. A partial mutation followed
      // by an exception must invalidate it too.
      if (completed || !sameFrame(before, this.captureCurrent())) {
        this.documentGeneration++
      }
    }
  }

  /**
   * Perform non-historical maintenance such as save-time window geometry.
   * Any open user transaction is committed first.
   */
  suspend<T>(fn: () => T): T {
    if (this.suspensionDepth === 0) this.finishActive()
    this.suspensionDepth++
    try {
      return fn()
    } finally {
      this.suspensionDepth--
      if (this.suspensionDepth === 0) this.syncDirty(this.captureCurrent())
    }
  }

  /** Finalize the current action and capture exactly what should be written. */
  captureSave(): SaveToken {
    this.finishActive()
    return {
      generation: this.documentGeneration,
      frame: this.captureCurrent()
    }
  }

  /**
   * Establish a successful savepoint. Returns false for a completion belonging
   * to a document that has since been replaced.
   */
  markSaved(token: SaveToken, path: string): boolean {
    if (token.generation !== this.documentGeneration) return false

    const rebase = (frame: HistoryFrame): HistoryFrame => ({ ...frame, filePath: path })
    this.past = this.past.map(rebase)
    this.future = this.future.map(rebase)
    // A field or gesture may have begun while the asynchronous write was in
    // flight. Its before-frame belongs to the newly saved document too; leaving
    // the old/null path here would make ending or undoing that action revert
    // Save As, or create a bogus entry when the transaction changed nothing.
    if (this.active) {
      this.active = { ...this.active, before: rebase(this.active.before) }
    }
    this.saved = rebase(token.frame)

    const current = rebase(this.captureCurrent())
    const dirty = !sameFrame(current, this.saved)
    this.dirtySyncSequence++
    this.withRecordingGuard(() => {
      this.store.setState({ filePath: path, isDirty: dirty })
    })
    return true
  }

  /** Subscribe to menu availability. The callback fires immediately. */
  onAvailability(cb: (availability: HistoryAvailability) => void): () => void {
    this.availabilityListeners.add(cb)
    cb(this.availability)
    return () => { this.availabilityListeners.delete(cb) }
  }

  // Read-only inspection helpers used by focused controller tests.
  get availability(): HistoryAvailability {
    return {
      // Make Undo available during the first continuous edit. Calling undo()
      // finalizes that transaction before popping it.
      canUndo: this.past.length > 0 || this.active?.touched === true,
      // A touched transaction will invalidate Redo when it commits.
      canRedo: this.active?.touched !== true && this.future.length > 0
    }
  }

  get canUndo(): boolean { return this.availability.canUndo }
  get canRedo(): boolean { return this.availability.canRedo }
  get pastCount(): number { return this.past.length }
  get futureCount(): number { return this.future.length }
  get activeOwner(): HistoryOwner | null { return this.active?.owner ?? null }
  get generation(): number { return this.documentGeneration }
  get savedFrame(): HistoryFrame { return { ...this.saved } }

  captureCurrent(): HistoryFrame {
    return this.frameFromState(this.store.getState())
  }

  private frameFromState(state: StoreState): HistoryFrame {
    return {
      session: serializeSession(state),
      filePath: state.filePath
    }
  }

  private pushPast(frame: HistoryFrame): void {
    this.past.push(frame)
    if (this.past.length > HISTORY_LIMIT) {
      this.past.splice(0, this.past.length - HISTORY_LIMIT)
    }
  }

  private finishActive(): void {
    const transaction = this.active
    if (!transaction) return
    this.active = null

    const after = this.captureCurrent()
    if (!sameFrame(transaction.before, after)) {
      this.pushPast(transaction.before)
      this.future = []
    }
    this.syncDirty(after)
    this.notifyAvailability()
  }

  private applyFrame(frame: HistoryFrame): void {
    const current = this.store.getState()
    // Frames are trusted, current-format output from serializeSession. Parsing
    // them directly preserves object key order. Running them through the file
    // migration parser would rebuild MapConfig objects in a different order,
    // making semantically identical frames compare as different JSON strings.
    const restored = JSON.parse(frame.session) as PersistentSession
    const maps = withCurrentGeometry(restored.maps, current.maps)

    const elementIds = new Set(restored.elements.map(element => element.id))
    const dimensionIds = new Set(restored.dimensions.map(dimension => dimension.id))
    const collectionIds = new Set(restored.collections.map(collection => collection.id))

    const nextState: StoreState = {
      ...current,
      sessionMeta: restored.sessionMeta,
      elements: restored.elements,
      collections: restored.collections,
      dimensions: restored.dimensions,
      scores: restored.scores,
      maps,
      filePath: frame.filePath,
      selectedElementId: current.selectedElementId && elementIds.has(current.selectedElementId)
        ? current.selectedElementId : null,
      selectedDimensionId: current.selectedDimensionId && dimensionIds.has(current.selectedDimensionId)
        ? current.selectedDimensionId : null,
      selectedCollectionId: current.selectedCollectionId && collectionIds.has(current.selectedCollectionId)
        ? current.selectedCollectionId : null,
      selectedElementIds: current.selectedElementIds.filter(id => elementIds.has(id)),
      // isDirty is derived from the effective restored frame below.
      isDirty: current.isDirty
    }

    const effectiveFrame = this.frameFromState(nextState)
    nextState.isDirty = !sameFrame(effectiveFrame, this.saved)

    this.dirtySyncSequence++
    this.withRecordingGuard(() => { this.store.setState(nextState) })
  }

  private syncDirty(current: HistoryFrame): void {
    this.dirtySyncSequence++
    this.setDirty(!sameFrame(current, this.saved))
  }

  /**
   * Store subscribers are notified synchronously in registration order. A
   * nested setState here would let later subscribers receive the outer stale
   * isDirty value after receiving the correction. Queue it instead, and apply
   * only if no newer document frame superseded this request.
   */
  private scheduleDirtySync(expected: HistoryFrame): void {
    const sequence = ++this.dirtySyncSequence
    queueMicrotask(() => {
      if (sequence !== this.dirtySyncSequence) return
      const current = this.captureCurrent()
      if (!sameFrame(current, expected)) return
      this.setDirty(!sameFrame(current, this.saved))
    })
  }

  private setDirty(isDirty: boolean): void {
    if (this.store.getState().isDirty === isDirty) return
    this.withRecordingGuard(() => { this.store.setState({ isDirty }) })
  }

  private withRecordingGuard(fn: () => void): void {
    this.recordingGuard++
    try {
      fn()
    } finally {
      this.recordingGuard--
    }
  }

  private notifyAvailability(): void {
    const next = this.availability
    if (next.canUndo === this.lastAvailability.canUndo &&
        next.canRedo === this.lastAvailability.canRedo) return

    this.lastAvailability = next
    for (const listener of this.availabilityListeners) listener({ ...next })
  }
}

export const history = new HistoryController()
