// @vitest-environment jsdom
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { installDomStubs } from '../test/dom'

// Starts the real browser entry (main.tsx) in a simulated DOM and fails on any
// error thrown or logged while starting, or while opening the example study.
// It catches what typecheck and the build cannot: code that breaks only when
// the page actually runs, such as reading window.api before it is installed.
// No browser is opened; jsdom lacks layout, so sizes are zero and maps draw
// nothing, which is enough to exercise every component's mount.

const errors: unknown[] = []

beforeAll(async () => {
  installDomStubs()
  vi.spyOn(console, 'error').mockImplementation((...args) => { errors.push(args) })
  window.addEventListener('error', e => errors.push(e.error ?? e.message))

  document.body.innerHTML = '<div id="root"></div>'
  await act(async () => { await import('./main') })
})

// Clearing the page while the DOM still exists lets the Notes editor's mutation
// observer settle before jsdom is torn down.
afterAll(async () => {
  document.body.innerHTML = ''
  await new Promise(resolve => setTimeout(resolve, 0))
  vi.restoreAllMocks()
})

describe('browser startup', () => {
  it('mounts the banner and the Welcome page without errors', async () => {
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Chora' })).toBeTruthy())
    expect(screen.getByText('Untitled')).toBeTruthy()
    expect(errors).toEqual([])
  })

  it('opens the example study into Score and the map area without errors', async () => {
    const welcome = screen.getByRole('dialog', { name: 'Chora' })
    await act(async () => {
      fireEvent.click(within(welcome).getAllByRole('button', { name: 'Open example data' })[0])
    })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Chora' })).toBeNull())
    expect(screen.getByRole('navigation', { name: 'Score tabs and commands' })).toBeTruthy()
    expect(errors).toEqual([])
  })
})
