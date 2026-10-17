import { describe, expect, it } from 'vitest'
import { parseLayout } from './scoreLayout'

const record = (overrides: object = {}) =>
  JSON.stringify({ version: 1, scoreWidth: 512, collapsed: true, labels: true, ...overrides })

describe('stored Score layout', () => {
  it('reads a current-version record', () => {
    expect(parseLayout(record())).toEqual({ scoreWidth: 512, collapsed: true, labels: true })
    expect(parseLayout(record({ scoreWidth: null, collapsed: false, labels: false })))
      .toEqual({ scoreWidth: null, collapsed: false, labels: false })
  })

  it('reads a record written before strip names as names hidden', () => {
    expect(parseLayout(JSON.stringify({ version: 1, scoreWidth: 512, collapsed: false })))
      .toEqual({ scoreWidth: 512, collapsed: false, labels: false })
  })

  it('gives the defaults for missing, corrupt and foreign-version records', () => {
    const defaults = { scoreWidth: null, collapsed: false, labels: false }
    expect(parseLayout(null)).toEqual(defaults)
    expect(parseLayout('{not json')).toEqual(defaults)
    expect(parseLayout(record({ version: 2 }))).toEqual(defaults)
    expect(parseLayout('null')).toEqual(defaults)
  })

  it('drops malformed fields and rounds the width', () => {
    expect(parseLayout(record({ scoreWidth: 'wide', collapsed: 'yes', labels: 1 })))
      .toEqual({ scoreWidth: null, collapsed: false, labels: false })
    expect(parseLayout(record({ scoreWidth: -5 }))).toMatchObject({ scoreWidth: null })
    expect(parseLayout(record({ scoreWidth: 480.6 }))).toMatchObject({ scoreWidth: 481 })
  })
})
