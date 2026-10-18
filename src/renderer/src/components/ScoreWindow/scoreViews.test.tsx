// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { installDomStubs } from '../../../test/dom'
import { useAppStore } from '../../store/appStore'
import { usePrefsStore } from '../../store/prefsStore'
import { history } from '../../store/history'
import { DEFAULT_PREFERENCES } from '../../lib/preferences'
import type { Collection, Dimension, Element } from '../../lib/types'
import { defaultCategories } from '../../lib/types'
import { setHostCapabilities } from '../../lib/host'
import { ElementsTab } from './ElementsTab'
import { ConversionsTab } from './ConversionsTab'
import { AssessTab } from './AssessTab'
import { DimensionsTab } from './DimensionsTab'
import { CollectionsTab } from './CollectionsTab'

// Behaviour the Score views must keep through refactoring: list keyboard
// selection, one undo step per field edit or held key, and conversion results.

const element = (id: string, shape: Element['shape'] = 'circle'): Element =>
  ({ id, name: id.toUpperCase(), definition: '', weight: 1, color: '#9d9d53', shape, collectionIds: [] })
const dimension = (id: string): Dimension =>
  ({ id, label: 'Soft–Crisp', poleA: 'Soft', poleB: 'Crisp', definition: '', weight: 1, categories: defaultCategories() })

function study(elements: Element[], dimensions: Dimension[] = [], scores = {}): void {
  history.dispose()
  useAppStore.setState({
    elements, dimensions, scores, collections: [], maps: [],
    selectedElementId: elements[0]?.id ?? null, selectedElementIds: [],
    selectedDimensionId: dimensions[0]?.id ?? null, activeTab: 'elements'
  })
  history.start()
}

beforeAll(installDomStubs)
beforeEach(() => usePrefsStore.getState().setPrefs({ ...DEFAULT_PREFERENCES, confirmDeleteData: false }))
afterEach(cleanup)

describe('Elements list keys', () => {
  beforeEach(() => study([element('a'), element('b'), element('c')]))

  it('moves the selection, extends it with Shift, and deletes it', () => {
    render(<ElementsTab />)
    const list = screen.getByRole('listbox', { name: 'Elements' })
    fireEvent.keyDown(list, { key: 'ArrowDown' })
    expect(useAppStore.getState().selectedElementId).toBe('b')
    fireEvent.keyDown(list, { key: 'ArrowDown', shiftKey: true })
    expect(useAppStore.getState().selectedElementId).toBe('c')
    expect(useAppStore.getState().selectedElementIds).toEqual(['b', 'c'])
    act(() => { fireEvent.keyDown(list, { key: 'Delete' }) })
    expect(useAppStore.getState().elements.map(e => e.id)).toEqual(['a'])
  })
})

describe('Opening a list view', () => {
  const collection = (id: string): Collection => ({ id, name: id.toUpperCase(), definition: '', color: '#808080' })

  beforeEach(() => {
    study([element('b'), element('a')], [dimension('d'), dimension('e')])
    useAppStore.setState({
      collections: [collection('x'), collection('y')],
      selectedElementId: null, selectedDimensionId: null, selectedCollectionId: null
    })
  })

  it('selects the first row of each list when nothing is selected', () => {
    render(<><ElementsTab /><DimensionsTab onOpenStarterPicker={() => {}} /><CollectionsTab /></>)
    const state = useAppStore.getState()
    expect([state.selectedElementId, state.selectedDimensionId, state.selectedCollectionId]).toEqual(['b', 'd', 'x'])
  })

  it('keeps a selection already made, including a lasso from a map', () => {
    useAppStore.setState({ selectedDimensionId: 'e', selectedElementIds: ['a'] })
    render(<><ElementsTab /><DimensionsTab onOpenStarterPicker={() => {}} /></>)
    expect(useAppStore.getState().selectedElementId).toBeNull()
    expect(useAppStore.getState().selectedDimensionId).toBe('e')
  })

  it('leaves an empty list with nothing selected, ready to type the first name', () => {
    useAppStore.setState({ collections: [] })
    render(<CollectionsTab />)
    expect(useAppStore.getState().selectedCollectionId).toBeNull()
    expect(document.activeElement).toBe(screen.getByPlaceholderText('New collection…'))
  })

  it('leaves focus alone when the list has items', () => {
    render(<ElementsTab />)
    expect(document.activeElement).not.toBe(screen.getByPlaceholderText('New element…'))
  })
})

describe('Dimensions and Collections lists', () => {
  beforeEach(() => {
    study([element('a', 'circle')], [dimension('d'), { ...dimension('e'), poleA: 'Cold', poleB: 'Hot' }])
    history.dispose()
    useAppStore.setState({
      collections: [{ id: 'c1', name: 'One', definition: '', color: '#4080c0' }, { id: 'c2', name: 'Two', definition: '', color: '#c04040' }],
      selectedCollectionId: 'c1'
    })
    history.start()
  })

  it('steps with the arrow keys and deletes after confirming', () => {
    usePrefsStore.getState().setPrefs({ ...DEFAULT_PREFERENCES, confirmDeleteData: true })
    render(<DimensionsTab onOpenStarterPicker={() => {}} />)
    const list = screen.getByRole('list', { name: 'Dimensions' })
    fireEvent.keyDown(list, { key: 'ArrowUp' })
    expect(useAppStore.getState().selectedDimensionId).toBe('d')
    fireEvent.keyDown(list, { key: 'ArrowDown' })
    expect(useAppStore.getState().selectedDimensionId).toBe('e')
    fireEvent.keyDown(list, { key: 'Delete' })
    expect(useAppStore.getState().dimensions).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(useAppStore.getState().dimensions.map(d => d.id)).toEqual(['d'])
  })

  it('shows a dimension weight changed elsewhere, and does not write the old one back', () => {
    render(<DimensionsTab onOpenStarterPicker={() => {}} />)
    act(() => useAppStore.getState().updateDimension('d', { weight: 63 }))
    const weight = screen.getByRole('spinbutton') as HTMLInputElement
    expect(weight.value).toBe('63')
    fireEvent.blur(weight)
    expect(useAppStore.getState().dimensions[0].weight).toBe(63)
  })

  it('deletes at once without confirmation, and adds from the add row', () => {
    render(<CollectionsTab />)
    fireEvent.keyDown(screen.getByRole('list', { name: 'Collections' }), { key: 'ArrowDown' })
    fireEvent.keyDown(screen.getByRole('list', { name: 'Collections' }), { key: 'Backspace' })
    expect(useAppStore.getState().collections.map(c => c.id)).toEqual(['c1'])

    const add = screen.getByPlaceholderText('New collection…') as HTMLInputElement
    fireEvent.change(add, { target: { value: '  Three  ' } })
    fireEvent.keyDown(add, { key: 'Enter' })
    expect(useAppStore.getState().collections.map(c => c.name)).toEqual(['One', 'Three'])
    expect(add.value).toBe('')
  })
})

describe('Stacked list-and-detail views (browser)', () => {
  beforeEach(() => {
    setHostCapabilities({ narrowDataViews: true })
    study([element('a')], [{ ...dimension('d'), poleA: 'A very long first pole', poleB: 'An even longer second pole' }])
  })
  afterEach(() => setHostCapabilities({ narrowDataViews: false }))

  it('keeps the detail below the list at any width', () => {
    const { container } = render(<ElementsTab />)
    const view = container.firstElementChild as HTMLElement
    expect(view.style.gridTemplateColumns).toBe('minmax(0, 1fr)')
    expect(view.style.gridTemplateRows).not.toBe('')
  })

  it('shows a dimension on one line, with its full name on hover', () => {
    render(<DimensionsTab onOpenStarterPicker={() => {}} />)
    const label = screen.getByTitle('A very long first pole - An even longer second pole')
    expect(label.textContent).toBe('A very long first pole - An even longer second pole')
  })

  it('takes a weight as a whole number, without stepper arrows', () => {
    render(<ElementsTab />)
    expect(screen.queryByRole('spinbutton')).toBeNull()
    const weight = screen.getByRole('textbox', { name: 'Weight' }) as HTMLInputElement
    fireEvent.change(weight, { target: { value: '3.6' } })
    fireEvent.blur(weight)
    expect(useAppStore.getState().elements[0].weight).toBe(4)
    expect(weight.value).toBe('4')
  })

  it('stops at 1, and answers a non-number with the whole weight before it or 1', () => {
    const typeWeight = (value: string): number => {
      const weight = screen.getByRole('textbox', { name: 'Weight' }) as HTMLInputElement
      fireEvent.change(weight, { target: { value } })
      fireEvent.blur(weight)
      return useAppStore.getState().dimensions[0].weight
    }
    render(<DimensionsTab onOpenStarterPicker={() => {}} />)
    expect(typeWeight('-7')).toBe(1)
    expect(typeWeight('0.2')).toBe(1)
    expect(typeWeight('5')).toBe(5)
    expect(typeWeight('heavy')).toBe(5)
    expect(typeWeight('')).toBe(5)
    act(() => useAppStore.getState().updateDimension('d', { weight: 2.5 }))
    expect(typeWeight('heavy')).toBe(1)
  })

  it('selects the whole name or weight when either is entered', () => {
    const { container } = render(<ElementsTab />)
    const name = container.querySelector<HTMLInputElement>('input[value="A"]')!
    const weight = screen.getByRole('textbox', { name: 'Weight' }) as HTMLInputElement
    for (const field of [name, weight]) {
      act(() => field.focus())
      expect([field.selectionStart, field.selectionEnd]).toEqual([0, field.value.length])
    }
  })

  it('selects the whole of either pole when it is entered', () => {
    const { container } = render(<DimensionsTab onOpenStarterPicker={() => {}} />)
    for (const value of ['A very long first pole', 'An even longer second pole']) {
      const pole = container.querySelector<HTMLInputElement>(`input[value="${value}"]`)!
      act(() => pole.focus())
      expect([pole.selectionStart, pole.selectionEnd]).toEqual([0, value.length])
    }
  })

  it('keeps the Assess columns side by side, free to shrink, at any width', () => {
    const { container } = render(<AssessTab />)
    const columns = container.querySelector<HTMLElement>('[style*="grid-template-columns"]')!
    expect(columns.style.gridTemplateColumns).toMatch(/^minmax\(0(px)?, /)
    expect(columns.style.gridTemplateRows).toBe('minmax(0, 1fr)')
  })

  it('lets Dimensions and Collections share the Assess column by a line between them', () => {
    const { container } = render(<AssessTab />)
    const rail = [...container.querySelectorAll<HTMLElement>('[style*="grid-template-rows"]')]
      .find(el => el.style.gridTemplateColumns === 'minmax(0, 1fr)')!
    expect(rail.style.gridTemplateRows).toMatch(/^minmax\(0(px)?, \d+fr\) 0 minmax\(0(px)?, \d+fr\)$/)
    expect(rail.children).toHaveLength(3)
  })

  it('leaves list and detail side by side where the host does not stack them', () => {
    setHostCapabilities({ narrowDataViews: false })
    const { container } = render(<ElementsTab />)
    expect((container.firstElementChild as HTMLElement).style.gridTemplateRows).toBe('minmax(0, 1fr)')
  })
})

describe('Field undo steps', () => {
  beforeEach(() => study([element('a')]))

  it('records one undo step for a definition typed in several changes', () => {
    render(<ElementsTab />)
    const field = screen.getByPlaceholderText('Definition…')
    fireEvent.focus(field)
    fireEvent.change(field, { target: { value: 'C' } })
    fireEvent.change(field, { target: { value: 'Cr' } })
    fireEvent.change(field, { target: { value: 'Crisp' } })
    fireEvent.blur(field)
    expect(useAppStore.getState().elements[0].definition).toBe('Crisp')
    expect(history.pastCount).toBe(1)
    act(() => { history.undo() })
    expect(useAppStore.getState().elements[0].definition).toBe('')
  })

  it('records one undo step for an arrow key held in Assess', () => {
    study([element('a')], [dimension('d')], { a: { d: 0.5 } })
    useAppStore.setState({ activeTab: 'scores' })
    render(<AssessTab />)
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    fireEvent.keyUp(window, { key: 'ArrowRight' })
    expect(useAppStore.getState().scores.a?.d).toBe(0.6)
    expect(history.pastCount).toBe(1)
  })
})

describe('Conversions', () => {
  beforeEach(() => study([element('a', 'circle'), element('b', 'square')], [dimension('d')], { a: { d: 0 }, b: { d: 1 } }))

  const choose = (label: string, value: string): void => {
    fireEvent.change(screen.getByRole('combobox', { name: label }), { target: { value } })
  }

  it('colours elements by shape', () => {
    render(<ConversionsTab />)
    choose('Source', 'el-shape')
    choose('Destination', 'el-color')
    fireEvent.click(screen.getByRole('button', { name: 'Apply Conversion' }))
    expect(useAppStore.getState().elements.map(e => e.color)).toEqual(['#4080c0', '#c04040'])
    expect(screen.getByRole('button', { name: 'Applied' })).toBeTruthy()
  })

  it('sets weights from dimension scores, with the high end on either pole', () => {
    render(<ConversionsTab />)
    choose('Source', 'dim-scores')
    choose('Source dimension', 'd')
    choose('Destination', 'el-weight')
    fireEvent.click(screen.getByRole('button', { name: 'Soft' }))
    fireEvent.click(screen.getByRole('button', { name: 'Apply Conversion' }))
    expect(useAppStore.getState().elements.map(e => e.weight)).toEqual([100, 1])
  })
})

describe('Every conversion', () => {
  const c1: Collection = { id: 'c1', name: 'One', definition: '', color: '#4080c0' }
  const c2: Collection = { id: 'c2', name: 'Two', definition: '', color: '#c04040' }
  const a = { ...element('a', 'circle'), color: '#c04040', weight: 10, collectionIds: ['c2'] }
  const b = { ...element('b', 'square'), color: '#4080c0', weight: 20, collectionIds: ['c1', 'c2'] }

  beforeEach(() => {
    study([a, b], [dimension('d'), { ...dimension('e'), label: 'Low–High', poleA: 'Low', poleB: 'High' }],
      { a: { d: 0, e: 0.5 }, b: { d: 1 } })
    history.dispose()
    useAppStore.setState({ collections: [c1, c2] })
    history.start()
  })

  const choose = (label: string, value: string): void => {
    fireEvent.change(screen.getByRole('combobox', { name: label }), { target: { value } })
  }
  const apply = (): void => { fireEvent.click(screen.getByRole('button', { name: 'Apply Conversion' })) }
  const els = () => useAppStore.getState().elements
  const scores = () => useAppStore.getState().scores

  it('dimension scores → element weight', () => {
    render(<ConversionsTab />)
    choose('Source', 'dim-scores'); choose('Source dimension', 'd'); choose('Destination', 'el-weight'); apply()
    expect(els().map(e => e.weight)).toEqual([1, 100])
  })

  it('dimension scores → element colour, between the chosen colours', () => {
    const { container } = render(<ConversionsTab />)
    choose('Source', 'dim-scores'); choose('Source dimension', 'd'); choose('Destination', 'el-color')
    const [low, high] = container.querySelectorAll('input[type=color]')
    fireEvent.change(low, { target: { value: '#000000' } })
    fireEvent.change(high, { target: { value: '#ffffff' } })
    apply()
    expect(els().map(e => e.color)).toEqual(['#000000', '#ffffff'])
  })

  it('dimension scores → another dimension, scored elements only', () => {
    render(<ConversionsTab />)
    choose('Source', 'dim-scores'); choose('Source dimension', 'd'); choose('Destination', 'dim-scores')
    choose('Destination dimension', 'e'); apply()
    expect(scores()).toEqual({ a: { d: 0, e: 0 }, b: { d: 1, e: 1 } })
  })

  it('element weight → dimension scores across the weight range', () => {
    render(<ConversionsTab />)
    choose('Source', 'el-weight'); choose('Destination', 'dim-scores'); choose('Destination dimension', 'e'); apply()
    expect(scores().a.e).toBe(0)
    expect(scores().b.e).toBe(1)
  })

  it('collection membership → element colour, mixing every collection', () => {
    render(<ConversionsTab />)
    choose('Source', 'collection'); choose('Destination', 'el-color'); apply()
    expect(els().map(e => e.color)).toEqual(['#c04040', '#806080'])
  })

  it('collection membership → element shape, by first collection', () => {
    render(<ConversionsTab />)
    choose('Source', 'collection'); choose('Destination', 'el-shape'); apply()
    expect(els().map(e => e.shape)).toEqual(['square', 'circle'])
  })

  it('element shape → collection membership, replacing it', () => {
    render(<ConversionsTab />)
    choose('Source', 'el-shape'); choose('Destination', 'collection'); apply()
    expect(els().map(e => e.collectionIds)).toEqual([['c1'], ['c2']])
  })

  it('element colour → element shape, by hue', () => {
    render(<ConversionsTab />)
    choose('Source', 'el-color'); choose('Destination', 'el-shape'); apply()
    expect(els().map(e => e.shape)).toEqual(['circle', 'triangle'])
  })

  it('spreads a dimension to fill the range', () => {
    render(<ConversionsTab />)
    choose('Dimension to spread', 'd')
    fireEvent.click(screen.getByRole('button', { name: 'Apply Spread' }))
    expect(scores().a.d).toBeCloseTo(0.05)
    expect(scores().b.d).toBeCloseTo(0.95)
  })

  it('randomizes one dimension after confirming the overwrite', () => {
    render(<ConversionsTab />)
    choose('Randomize for', 'dimensions')
    choose('Dimension to randomize', 'd')
    choose('Attribute to randomize', 'scores')
    fireEvent.click(screen.getByRole('button', { name: 'Overwrite & Randomize' }))
    fireEvent.click(screen.getByRole('button', { name: 'Randomize' }))
    for (const id of ['a', 'b']) expect(scores()[id].d).toBeGreaterThanOrEqual(0)
    expect(history.pastCount).toBe(1)
  })

  it('randomizes every value in the study as one undoable change', () => {
    render(<ConversionsTab />)
    choose('Advanced conversion', 'randomize-all')
    fireEvent.click(screen.getByRole('button', { name: 'Randomize All Values' }))
    for (const id of ['a', 'b']) expect(scores()[id].d).toBeGreaterThanOrEqual(0)
    for (const el of els()) expect(el.weight).toBeGreaterThanOrEqual(1)
    expect(history.pastCount).toBe(1)
  })

  it('offers each kind of item only the attributes it can randomize', () => {
    render(<ConversionsTab />)
    const offered = (target: string): string[] => {
      choose('Randomize for', target)
      return [...screen.getByRole('combobox', { name: 'Attribute to randomize' }).querySelectorAll('option')].map(o => o.value)
    }
    expect(offered('elements')).toEqual(['', 'weights', 'colors', 'shapes'])
    expect(offered('collections')).toEqual(['', 'colors', 'members'])
    // A dimension is chosen first, then what to randomize on it.
    expect(offered('dimensions')).toEqual([''])
    choose('Dimension to randomize', 'd')
    expect([...screen.getByRole('combobox', { name: 'Attribute to randomize' }).querySelectorAll('option')].map(o => o.value))
      .toEqual(['', 'scores', 'weight'])
  })

  it('randomizes element weights without asking', () => {
    render(<ConversionsTab />)
    choose('Randomize for', 'elements')
    choose('Attribute to randomize', 'weights')
    fireEvent.click(screen.getByRole('button', { name: 'Apply Randomizer' }))
    for (const el of els()) expect(el.weight).toBeGreaterThanOrEqual(1)
    expect(screen.getByRole('button', { name: 'Applied' })).toBeTruthy()
  })

  it('offers only the destinations each source supports', () => {
    render(<ConversionsTab />)
    choose('Source', 'el-color')
    const options = [...screen.getByRole('combobox', { name: 'Destination' }).querySelectorAll('option')].map(o => o.value)
    expect(options).toEqual(['', 'el-shape'])
  })
})

