import { describe, expect, it, vi } from 'vitest'

vi.mock('../src/store/appStore', () => ({ useAppStore: { getState: () => ({}), subscribe: () => () => {} } }))
vi.mock('../src/store/history', () => ({ history: {} }))
vi.mock('../src/lib/parser', () => ({ deserializeSession: () => ({}), serializeSession: () => '' }))

import { parseEnvelope } from './recovery'

const now = 1_000_000_000_000
const record = (overrides: object = {}) =>
  JSON.stringify({ version: 1, savedAt: now - 1000, session: '{}', filePath: null, isDirty: true, ...overrides })

describe('recovery envelope', () => {
  it('accepts a recent current-version record', () => {
    expect(parseEnvelope(record(), now)).toMatchObject({ session: '{}', isDirty: true, filePath: null })
  })

  it('rejects missing, corrupt, foreign-version and malformed records', () => {
    expect(parseEnvelope(null, now)).toBeNull()
    expect(parseEnvelope('{not json', now)).toBeNull()
    expect(parseEnvelope(record({ version: 2 }), now)).toBeNull()
    expect(parseEnvelope(record({ session: 42 }), now)).toBeNull()
  })

  it('expires after 12 hours and rejects future timestamps', () => {
    expect(parseEnvelope(record({ savedAt: now - 12 * 60 * 60 * 1000 - 1 }), now)).toBeNull()
    expect(parseEnvelope(record({ savedAt: now + 60_000 }), now)).toBeNull()
  })

  it('normalizes optional fields', () => {
    expect(parseEnvelope(record({ filePath: 7, isDirty: 'yes' }), now)).toMatchObject({ filePath: null, isDirty: false })
  })
})
