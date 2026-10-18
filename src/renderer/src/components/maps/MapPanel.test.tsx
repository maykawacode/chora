// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { installDomStubs } from '../../../test/dom'
import { useAppStore } from '../../store/appStore'
import { usePrefsStore } from '../../store/prefsStore'
import { history } from '../../store/history'
import { DEFAULT_PREFERENCES } from '../../lib/preferences'
import type { CartesianMapConfig, Dimension, Element, MapConfig, SemanticMapConfig } from '../../lib/types'
import { defaultCategories } from '../../lib/types'
import { MapPanel } from './MapPanel'
import { MapHostContext, type MapHost } from './mapHost'
import { newMapConfig } from './mapTypes'
import { semanticLayout, axisX } from './semantic/semanticLayout'

// Pointer behaviour both map types must keep through the map adapter refactor:
// dragging dots and groups, lasso, shift-click, clicks on axes and open space,
// right-click editing, hover cursors and Escape. The map is laid out at 400×300.

const W = 400
const H = 300
const charWidth = 7

// Every canvas call is accepted and ignored; text measures 7px a character.
function stubContext(): CanvasRenderingContext2D {
  const ctx: CanvasRenderingContext2D = new Proxy({} as Record<string | symbol, unknown>, {
    get: (target, key) => key in target ? target[key]
      : key === 'measureText' ? (text: string) => ({ width: text.length * charWidth })
      : () => ctx,
    set: (target, key, value) => { target[key] = value; return true }
  }) as unknown as CanvasRenderingContext2D
  return ctx
}

const element = (id: string): Element =>
  ({ id, name: id.toUpperCase(), definition: '', weight: 1, color: '#9d9d53', shape: 'circle', collectionIds: [] })
const dimension = (id: string, poleA = 'Low', poleB = 'High'): Dimension =>
  ({ id, label: `${poleA}–${poleB}`, poleA, poleB, definition: '', weight: 1, categories: defaultCategories() })

const host: MapHost = {
  control: () => {},
  zoomLabel: '',
  history: { historyBegin: vi.fn(), historyEnd: vi.fn(), setHistoryModalOpen: () => {} },
  ensureRoom: () => {},
  isActive: () => true
}

function study(map: MapConfig, scores: Record<string, Record<string, number>>, dimensions: Dimension[]): void {
  history.dispose()
  useAppStore.setState({
    elements: [element('a'), element('b'), element('c')], dimensions, scores, collections: [], maps: [map],
    selectedElementId: null, selectedElementIds: []
  })
  history.start()
}

function renderMap(): HTMLElement {
  const { container } = render(<MapHostContext.Provider value={host}><MapPanel mapId="m" /></MapHostContext.Provider>)
  return container.querySelector('canvas')!.parentElement!
}

const at = (x: number, y: number, extra: object = {}) => ({ clientX: x, clientY: y, button: 0, ...extra })

function drag(surface: HTMLElement, from: [number, number], to: [number, number], extra: object = {}): void {
  fireEvent.mouseDown(surface, at(...from, extra))
  fireEvent.mouseMove(surface, at(...to, extra))
  fireEvent.mouseUp(surface, at(...to, extra))
  fireEvent.click(surface, at(...to, extra))
}

const state = () => useAppStore.getState()

beforeAll(() => {
  installDomStubs()
  HTMLCanvasElement.prototype.getContext = (() => stubContext()) as unknown as typeof HTMLCanvasElement.prototype.getContext
  HTMLElement.prototype.getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: W, bottom: H, x: 0, y: 0, width: W, height: H, toJSON: () => ({}) })
})
beforeEach(() => {
  usePrefsStore.getState().setPrefs({ ...DEFAULT_PREFERENCES })
  vi.mocked(host.history.historyBegin).mockClear()
  vi.mocked(host.history.historyEnd).mockClear()
})
afterEach(cleanup)

// ── Cartesian ─────────────────────────────────────────────────────────────────

describe('Cartesian map pointer', () => {
  // The plot spans x 58–342 and y 44–242; its axes cross at (200, 143).
  const px = (x: number, y: number): [number, number] => [58 + x * 284, 44 + (1 - y) * 198]
  const A = px(0.25, 0.75)
  const B = px(0.75, 0.25)
  const EMPTY: [number, number] = [100, 230]

  beforeEach(() => {
    const map = { ...newMapConfig('cartesian', { dimensionIds: ['x', 'y'], maps: [], elements: [], showLabels: true, marks: 'circle' }), id: 'm', sizeByWeight: false } as CartesianMapConfig
    study(map, { a: { x: 0.25, y: 0.75 }, b: { x: 0.75, y: 0.25 } }, [dimension('x'), dimension('y'), dimension('z', 'Cold', 'Hot')])
  })

  it('drags a dot to new scores as one history step, then drops the highlight', () => {
    const surface = renderMap()
    drag(surface, A, [A[0] + 28.4, A[1] - 19.8])
    expect(state().scores.a.x).toBeCloseTo(0.35)
    expect(state().scores.a.y).toBeCloseTo(0.85)
    expect(state().scores.b).toEqual({ x: 0.75, y: 0.25 })
    expect(host.history.historyBegin).toHaveBeenCalled()
    expect(host.history.historyEnd).toHaveBeenCalledTimes(1)
    expect(state().selectedElementId).toBeNull()
  })

  it('ignores a movement under 4px', () => {
    const surface = renderMap()
    drag(surface, A, [A[0] + 3, A[1]])
    expect(state().scores.a).toEqual({ x: 0.25, y: 0.75 })
  })

  it('locks a shift-drag to its main direction', () => {
    const surface = renderMap()
    fireEvent.mouseDown(surface, at(...A))
    fireEvent.mouseMove(surface, at(A[0] + 28.4, A[1] - 5, { shiftKey: true }))
    fireEvent.mouseUp(surface, at(A[0] + 28.4, A[1] - 5))
    expect(state().scores.a.x).toBeCloseTo(0.35)
    expect(state().scores.a.y).toBe(0.75)
  })

  it('moves a selected group together, clamped to the score range', () => {
    useAppStore.setState({ selectedElementIds: ['a', 'b'] })
    const surface = renderMap()
    drag(surface, A, [A[0] + 284, A[1]])
    expect(state().scores.a.x).toBeCloseTo(0.5)
    expect(state().scores.b.x).toBeCloseTo(1)
    expect(state().selectedElementIds).toEqual(['a', 'b'])
  })

  it('drags an unscored dot from the centre', () => {
    const surface = renderMap()
    drag(surface, [200, 143], [200 + 28.4, 143])
    expect(state().scores.c.x).toBeCloseTo(0.6)
    expect(state().scores.c.y).toBeCloseTo(0.5)
  })

  it('adds dots inside a shift-drag rectangle to the selection', () => {
    useAppStore.setState({ selectedElementIds: ['c'] })
    const surface = renderMap()
    drag(surface, [A[0] - 10, A[1] - 10], [A[0] + 10, A[1] + 10], { shiftKey: true })
    expect(state().selectedElementIds).toEqual(['c', 'a'])
  })

  it('toggles a dot in and out of the selection with shift-click', () => {
    const surface = renderMap()
    fireEvent.click(surface, at(...A, { shiftKey: true }))
    fireEvent.click(surface, at(...B, { shiftKey: true }))
    expect(state().selectedElementIds).toEqual(['a', 'b'])
    expect(state().selectedElementId).toBe('b')
    fireEvent.click(surface, at(...B, { shiftKey: true }))
    expect(state().selectedElementIds).toEqual(['a'])
    expect(state().selectedElementId).toBe('a')
  })

  it('clears the selection on a click in open space', () => {
    useAppStore.setState({ selectedElementIds: ['a', 'b'], selectedElementId: 'a' })
    const surface = renderMap()
    fireEvent.click(surface, at(...EMPTY))
    expect(state().selectedElementIds).toEqual([])
    expect(state().selectedElementId).toBeNull()
  })

  it('opens the axis picker from an axis, which changes and flips that axis', () => {
    const surface = renderMap()
    fireEvent.click(surface, at(300, 143))
    fireEvent.click(screen.getByText('Cold–Hot'))
    expect((state().maps[0] as CartesianMapConfig).xDimensionId).toBe('z')
    fireEvent.click(surface, at(200, 60))
    expect(screen.getByRole('dialog', { name: 'Y Axis options' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Flip poles' }))
    expect((state().maps[0] as CartesianMapConfig).yFlipped).toBe(true)
  })

  it('edits a dot, a selected group or an axis on right-click', () => {
    const surface = renderMap()
    fireEvent.contextMenu(surface, at(...A))
    expect(screen.getByRole('textbox', { name: 'Element name' })).toBeTruthy()
    cleanup()

    useAppStore.setState({ selectedElementIds: ['a', 'b'] })
    fireEvent.contextMenu(renderMap(), at(...A))
    expect(screen.getByText('Edit 2 Elements')).toBeTruthy()
    cleanup()

    fireEvent.contextMenu(renderMap(), at(100, 143))
    expect(screen.getByText('Low–High')).toBeTruthy()
  })

  it('applies an element dialog draft only through its arrow', () => {
    fireEvent.contextMenu(renderMap(), at(...A))
    fireEvent.change(document.querySelector('input[maxlength="7"]')!, { target: { value: '#123456' } })
    fireEvent.click(screen.getByTitle('Square'))
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '7' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply element changes' }))
    expect(state().elements[0]).toMatchObject({ color: '#123456', shape: 'square', weight: 7 })
  })

  it('applies a bulk dialog to every selected element, including a new collection', () => {
    useAppStore.setState({ selectedElementIds: ['a', 'b'] })
    fireEvent.contextMenu(renderMap(), at(...A))
    fireEvent.click(screen.getByTitle('Triangle'))
    fireEvent.change(screen.getByPlaceholderText('New collection…'), { target: { value: 'Warm' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    fireEvent.click(screen.getByRole('button', { name: 'Apply changes' }))
    const warm = state().collections.find(c => c.name === 'Warm')!
    for (const el of state().elements.slice(0, 2)) expect(el).toMatchObject({ shape: 'triangle', collectionIds: [warm.id] })
    expect(state().elements[2]).toMatchObject({ shape: 'circle', collectionIds: [] })
  })

  it('shows what the pointer is over through the cursor', () => {
    const surface = renderMap()
    fireEvent.mouseMove(surface, at(...A))
    expect(surface.style.cursor).toBe('grab')
    fireEvent.mouseMove(surface, at(...A, { shiftKey: true }))
    expect(surface.style.cursor).toBe('copy')
    fireEvent.mouseMove(surface, at(300, 143))
    expect(surface.style.cursor).toBe('pointer')
    fireEvent.mouseMove(surface, at(...EMPTY))
    expect(surface.style.cursor).toBe('default')
  })

  it('closes an open picker on Escape before clearing the selection', () => {
    useAppStore.setState({ selectedElementIds: ['a'] })
    const surface = renderMap()
    fireEvent.click(surface, at(300, 143))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(state().selectedElementIds).toEqual(['a'])
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(state().selectedElementIds).toEqual([])
  })
})

// ── Semantic ──────────────────────────────────────────────────────────────────

describe('Semantic map pointer', () => {
  let map: SemanticMapConfig
  const dims = [dimension('d'), dimension('e', 'Cold', 'Hot')]
  // Axes sit at y 85 (d) and 215 (e).
  const pos = (dimId: string, score: number): [number, number] => {
    const layout = semanticLayout(W, H, map, dims, DEFAULT_PREFERENCES.dimensionLabelSize, t => t.length * charWidth)
    const axis = layout.axes.find(a => a.dimension.id === dimId)!
    return [axisX(layout, axis, score), axis.y]
  }
  const axisUnit = (): number => Math.abs(pos('d', 1)[0] - pos('d', 0)[0])
  const EMPTY: [number, number] = [200, 150]

  beforeEach(() => {
    map = { ...newMapConfig('semantic', { dimensionIds: ['d', 'e'], maps: [], elements: [element('a'), element('b'), element('c')], showLabels: true, marks: 'circle' }), id: 'm' } as SemanticMapConfig
    study(map, { a: { d: 0.25, e: 0.5 }, b: { d: 0.75 } }, dims)
  })

  it('drags a dot along its axis as one history step, selecting it alone', () => {
    useAppStore.setState({ selectedElementIds: ['b'] })
    const surface = renderMap()
    const A = pos('d', 0.25)
    drag(surface, A, [A[0] + 0.1 * axisUnit(), A[1] + 20])
    expect(state().scores.a).toEqual({ d: expect.closeTo(0.35), e: 0.5 })
    expect(state().scores.b).toEqual({ d: 0.75 })
    expect(state().selectedElementIds).toEqual(['a'])
    expect(state().selectedElementId).toBe('a')
    expect(host.history.historyEnd).toHaveBeenCalledTimes(1)
  })

  it('moves the scored members of a selected group together', () => {
    useAppStore.setState({ selectedElementIds: ['a', 'b', 'c'] })
    const surface = renderMap()
    const A = pos('d', 0.25)
    drag(surface, A, [A[0] - axisUnit(), A[1]])
    expect(state().scores.a.d).toBeCloseTo(0)
    expect(state().scores.b.d).toBeCloseTo(0.5)
    expect(state().scores.c).toBeUndefined()
    expect(state().selectedElementIds).toEqual(['a', 'b', 'c'])
  })

  it('follows a flipped axis', () => {
    map = { ...map, flippedDimensionIds: ['d'] }
    useAppStore.setState({ maps: [map] })
    const surface = renderMap()
    const A = pos('d', 0.25)
    drag(surface, A, [A[0] - 0.1 * axisUnit(), A[1]])
    expect(state().scores.a.d).toBeCloseTo(0.35)
  })

  it('adds dots inside a shift-drag rectangle to the selection and drops the highlight', () => {
    useAppStore.setState({ selectedElementId: 'c' })
    const surface = renderMap()
    const B = pos('d', 0.75)
    drag(surface, [B[0] - 10, B[1] - 10], [B[0] + 10, B[1] + 10], { shiftKey: true })
    expect(state().selectedElementIds).toEqual(['b'])
    expect(state().selectedElementId).toBeNull()
  })

  it('toggles a dot in and out of the selection with shift-click', () => {
    const surface = renderMap()
    fireEvent.click(surface, at(...pos('d', 0.25), { shiftKey: true }))
    fireEvent.click(surface, at(...pos('d', 0.75), { shiftKey: true }))
    expect(state().selectedElementIds).toEqual(['a', 'b'])
    // The same element on another axis is the same dot to the selection.
    fireEvent.click(surface, at(...pos('e', 0.5), { shiftKey: true }))
    expect(state().selectedElementIds).toEqual(['b'])
    expect(state().selectedElementId).toBe('b')
  })

  it('clears the selection on a click in open space', () => {
    useAppStore.setState({ selectedElementIds: ['a'], selectedElementId: 'a' })
    const surface = renderMap()
    fireEvent.click(surface, at(...EMPTY))
    expect(state().selectedElementIds).toEqual([])
    expect(state().selectedElementId).toBeNull()
  })

  it('opens the dimension picker from an axis, which replaces and flips that axis', () => {
    const surface = renderMap()
    fireEvent.click(surface, at(pos('e', 0.9)[0], pos('e', 0.9)[1] + 4))
    expect(screen.getByRole('dialog', { name: 'Dimension options' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Flip poles' }))
    expect((state().maps[0] as SemanticMapConfig).flippedDimensionIds).toEqual(['e'])

    fireEvent.click(surface, at(pos('e', 0.9)[0], pos('e', 0.9)[1] + 4))
    fireEvent.click(screen.getAllByText('Low–High').at(-1)!)
    const changed = state().maps[0] as SemanticMapConfig
    expect(changed.dimensionIds).toEqual(['d', 'd'])
    expect(changed.flippedDimensionIds).toEqual([])
  })

  it('edits a dot, a selected group or an axis on right-click', () => {
    fireEvent.contextMenu(renderMap(), at(...pos('d', 0.25)))
    expect(screen.getByRole('textbox', { name: 'Element name' })).toBeTruthy()
    cleanup()

    useAppStore.setState({ selectedElementIds: ['a', 'b'] })
    fireEvent.contextMenu(renderMap(), at(...pos('d', 0.75)))
    expect(screen.getByText('Edit 2 Elements')).toBeTruthy()
    cleanup()

    fireEvent.contextMenu(renderMap(), at(pos('e', 0.9)[0], pos('e', 0.9)[1]))
    expect(screen.getByText('Cold–Hot')).toBeTruthy()
  })

  it('shows what the pointer is over through the cursor', () => {
    const surface = renderMap()
    fireEvent.mouseMove(surface, at(...pos('d', 0.25)))
    expect(surface.style.cursor).toBe('grab')
    fireEvent.mouseMove(surface, at(pos('d', 0.5)[0], pos('d', 0.5)[1]))
    expect(surface.style.cursor).toBe('pointer')
    fireEvent.mouseMove(surface, at(...EMPTY, { shiftKey: true }))
    expect(surface.style.cursor).toBe('crosshair')
  })

  it('closes an open picker on Escape before clearing the selection', () => {
    useAppStore.setState({ selectedElementIds: ['a'] })
    const surface = renderMap()
    fireEvent.click(surface, at(pos('d', 0.5)[0], pos('d', 0.5)[1]))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(state().selectedElementIds).toEqual(['a'])
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(state().selectedElementIds).toEqual([])
  })
})
