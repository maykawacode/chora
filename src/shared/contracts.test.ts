import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PREFERENCES,
  decodeMapStateEnvelope,
  encodeMapStateEnvelope,
  mergePreferences,
  type MapStateEnvelope
} from './contracts'

describe('shared contracts', () => {
  it('fills newly added preference fields from defaults', () => {
    expect(mergePreferences({ elementLabelSize: 14 })).toEqual({
      ...DEFAULT_PREFERENCES,
      elementLabelSize: 14
    })
  })

  it('round-trips a map state envelope', () => {
    const envelope: MapStateEnvelope = {
      isDirty: true,
      filePath: '/tmp/session.chora',
      session: '{"maps":[]}',
      selectedElementId: 'element-1',
      selectedElementIds: ['element-1', 'element-2']
    }
    expect(decodeMapStateEnvelope(encodeMapStateEnvelope(envelope))).toEqual(envelope)
  })

  it('supplies runtime defaults for older envelopes', () => {
    expect(decodeMapStateEnvelope('{"session":"{}"}')).toEqual({
      isDirty: false,
      filePath: null,
      session: '{}',
      selectedElementId: null,
      selectedElementIds: []
    })
  })

  it('rejects payloads without a serialized session', () => {
    expect(() => decodeMapStateEnvelope('{}')).toThrow('missing its session')
  })
})
