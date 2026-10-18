// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { installDomStubs } from '../../../test/dom'
import { useAppStore } from '../../store/appStore'
import { usePrefsStore } from '../../store/prefsStore'
import { history } from '../../store/history'
import { DEFAULT_PREFERENCES } from '../../lib/preferences'
import type { Dimension, Element } from '../../lib/types'
import { defaultCategories } from '../../lib/types'
import { ElementsTab } from './ElementsTab'
import { ConversionsTab } from './ConversionsTab'
import { AssessTab } from './ScoresTab'

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
