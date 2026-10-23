import { describe, expect, it, vi } from 'vitest'

vi.mock('./browserApi', () => ({ dispatchMenuAction: vi.fn() }))

import { useAppStore } from '../src/store/appStore'
import { answerNamePrompt, displayName, nameUntitledDocument, toFileName, useNamePrompt } from './documentName'

describe('file names', () => {
  it('adds .chora and keeps a typed extension from doubling', () => {
    expect(toFileName('Vegetables')).toBe('Vegetables.chora')
    expect(toFileName('  Vegetables.chora ')).toBe('Vegetables.chora')
    expect(toFileName('Old study.MTDA')).toBe('Old study.chora')
  })

  it('replaces characters file systems refuse and collapses spaces', () => {
    expect(toFileName('a/b\\c:d*e?f"g<h>i|j')).toBe('a-b-c-d-e-f-g-h-i-j.chora')
    expect(toFileName('two   words')).toBe('two words.chora')
  })

  it('refuses an empty name', () => {
    expect(toFileName('')).toBeNull()
    expect(toFileName('   ')).toBeNull()
    expect(toFileName('.chora')).toBeNull()
  })
})

describe('naming an untitled study before its first download', () => {
  it('names the document, or reports a cancel', async () => {
    useAppStore.setState({ filePath: null })
    const named = nameUntitledDocument()
    expect(useNamePrompt.getState().request?.purpose).toBe('first-save')
    answerNamePrompt('Roots')
    expect(await named).toBe(true)
    expect(useAppStore.getState().filePath).toMatch(/\/Roots\.chora$/)

    useAppStore.setState({ filePath: null })
    const cancelled = nameUntitledDocument()
    answerNamePrompt(null)
    expect(await cancelled).toBe(false)
    expect(useAppStore.getState().filePath).toBeNull()
  })

  it('does not ask when the study already has a name', async () => {
    useAppStore.setState({ filePath: 'browser:/1/Leaves.chora' })
    expect(await nameUntitledDocument()).toBe(true)
    expect(useNamePrompt.getState().request).toBeNull()
  })
})

describe('display name', () => {
  it('drops the extension and falls back to Untitled', () => {
    expect(displayName('browser:/1/Roots.chora')).toBe('Roots')
    expect(displayName('browser:/2/Old.mtda')).toBe('Old')
    expect(displayName(null)).toBe('Untitled')
  })
})
