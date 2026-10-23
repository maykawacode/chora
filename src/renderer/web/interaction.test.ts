import { beforeEach, describe, expect, it, vi } from 'vitest'

const calls: string[] = []
vi.mock('../src/store/history', () => ({
  history: {
    begin: (owner: string) => calls.push(`begin ${owner}`),
    end:   (owner: string) => calls.push(`end ${owner}`)
  }
}))

import * as m from './interaction'

describe('browser interaction ownership', () => {
  beforeEach(() => {
    for (const id of ['a', 'b']) m.releaseSurface(id)
    calls.length = 0
  })

  it('ends the outgoing tile transaction on surface change', () => {
    m.activateSurface('a')
    m.beginTransaction('a')
    m.activateSurface('score')
    expect(calls).toEqual(['begin map:a', 'end map:a'])
  })

  it('ends a transaction only once', () => {
    m.beginTransaction('a')
    m.endTransaction('a')
    m.endTransaction('a')
    expect(calls).toEqual(['begin map:a', 'end map:a'])
  })

  it('keeps modal locks per owner', () => {
    m.setModalLock('a', true)
    m.setModalLock('b', true)
    m.setModalLock('a', false)
    expect(m.historyLocked()).toBe(true)
    m.setModalLock('b', false)
    expect(m.historyLocked()).toBe(false)
  })

  it('releases everything a removed tile held', () => {
    m.activateSurface('a')
    m.beginTransaction('a')
    m.setModalLock('a', true)
    m.releaseSurface('a')
    expect(m.historyLocked()).toBe(false)
    expect(m.activeSurface()).toBe('score')
    expect(calls).toEqual(['begin map:a', 'end map:a'])
  })
})
