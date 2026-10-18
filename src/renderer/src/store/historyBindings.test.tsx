// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import type { ChangeEvent } from 'react'
import { useAppStore } from './appStore'
import { history } from './history'
import { historyField, useHistoryGesture } from './historyBindings'
import { defaultCategories } from '../lib/types'

// Both bindings against the real history controller: each edit, however many
// writes it makes, is one undo step, and nothing is left open afterwards.

const store = () => useAppStore.getState()
const typed = (value: string) => ({ target: { value } }) as ChangeEvent<HTMLInputElement>

beforeEach(() => {
  history.dispose()
  useAppStore.setState({
    elements: [{ id: 'a', name: 'A', definition: '', weight: 1, color: '#9d9d53', shape: 'circle', collectionIds: [] }],
    dimensions: [{ id: 'd', label: 'Soft–Crisp', poleA: 'Soft', poleB: 'Crisp', definition: '', weight: 1, categories: defaultCategories() }],
    scores: {}, collections: [], maps: []
  })
  history.start()
})
afterEach(cleanup)

describe('historyField', () => {
  const field = historyField(value => store().updateElement('a', { definition: value }))

  it('records everything typed between focus and blur as one step', () => {
    field.onFocus()
    for (const value of ['C', 'Cr', 'Crisp']) field.onChange(typed(value))
    field.onBlur()
    expect(history.pastCount).toBe(1)
    history.undo()
    expect(store().elements[0].definition).toBe('')
  })

  it('starts a new step when typing resumes after an Undo', () => {
    field.onFocus()
    field.onChange(typed('Soft'))
    history.undo()
    field.onChange(typed('Hard'))
    field.onBlur()
    expect(history.pastCount).toBe(1)
    expect(store().elements[0].definition).toBe('Hard')
  })
})

describe('useHistoryGesture', () => {
  const nudge = (value: number): void => store().setScore('a', 'd', value)

  it('records a continuous adjustment as one step', () => {
    const { result } = renderHook(() => useHistoryGesture())
    for (const value of [0.1, 0.2, 0.3]) { result.current.begin(); nudge(value) }
    result.current.end()
    expect(history.pastCount).toBe(1)
  })

  it('ends only a step it opened', () => {
    const { result } = renderHook(() => useHistoryGesture())
    history.begin('other')
    nudge(0.4)
    result.current.end()
    nudge(0.5)
    history.end('other')
    expect(history.pastCount).toBe(1)
  })

  it('ends its step when the window loses focus or the component unmounts', () => {
    const { result, unmount } = renderHook(() => useHistoryGesture())
    result.current.begin(); nudge(0.1)
    act(() => { window.dispatchEvent(new Event('blur')) })
    nudge(0.2)
    expect(history.pastCount).toBe(2)

    result.current.begin(); nudge(0.3)
    unmount()
    nudge(0.4)
    expect(history.pastCount).toBe(4)
  })
})
