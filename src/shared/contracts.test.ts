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

  it('migrates the element deletion preference to the global data setting', () => {
    const merged = mergePreferences({ confirmDeleteElement: false })

    expect(merged.confirmDeleteData).toBe(false)
    expect(merged).not.toHaveProperty('confirmDeleteElement')
    expect(mergePreferences({
      confirmDeleteData: true,
      confirmDeleteElement: false
    }).confirmDeleteData).toBe(true)
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

// preferences.json is an ordinary user-writable file. A partial write, a hand
// edit or an older build can leave any field holding the wrong type, and the
// values are used without further checking — geometry goes to setBounds, the
// colors reach CSS, lastFilePath is handed to readFile at startup. Merging used
// to spread whatever was on disk over the defaults, so a wrong type travelled
// all the way to the point of use.
describe('preferences are read defensively', () => {
  const badTypes = {
    rememberWindowPositions: 'yes',
    defaultShowLabels: 1,
    reopenLastFile: null,
    elementLabelSize: '14',
    dimensionLabelSize: NaN,
    dotDefaultSize: Infinity,
    mainWindowWidth: {},
    mainWindowHeight: [],
    lastFilePath: 42
  }

  it('falls back to the default for every mistyped field', () => {
    expect(mergePreferences(badTypes as never)).toEqual(DEFAULT_PREFERENCES)
  })

  it('refuses a preference color that is not hex', () => {
    const merged = mergePreferences({
      defaultElementColor: 'url(https://attacker.example/b.png)',
      dimColorLow: 'red',
      dimColorHigh: '#abc'
    } as never)

    expect(merged.defaultElementColor).toBe(DEFAULT_PREFERENCES.defaultElementColor)
    expect(merged.dimColorLow).toBe(DEFAULT_PREFERENCES.dimColorLow)
    expect(merged.dimColorHigh).toBe(DEFAULT_PREFERENCES.dimColorHigh)
  })

  it('refuses an unknown mark mode or element shape', () => {
    const merged = mergePreferences({
      defaultMarks: 'sparkles',
      defaultElementShape: 'hexagon'
    } as never)

    expect(merged.defaultMarks).toBe(DEFAULT_PREFERENCES.defaultMarks)
    expect(merged.defaultElementShape).toBe(DEFAULT_PREFERENCES.defaultElementShape)
  })

  it('keeps null window coordinates, which mean "never positioned"', () => {
    const merged = mergePreferences({ mainWindowX: null, mainWindowY: null })
    expect(merged.mainWindowX).toBeNull()
    expect(merged.mainWindowY).toBeNull()
  })

  it('keeps every well-formed value untouched', () => {
    const good = {
      ...DEFAULT_PREFERENCES,
      rememberWindowPositions: false,
      defaultMarks: 'element' as const,
      defaultElementShape: 'diamond' as const,
      defaultElementColor: '#123456',
      lastFilePath: '/tmp/session.chora',
      mainWindowX: 12,
      mainWindowY: 34,
      elementLabelSize: 18
    }
    expect(mergePreferences(good)).toEqual(good)
  })

  it('ignores a prototype-polluting key', () => {
    const merged = mergePreferences(JSON.parse('{"__proto__":{"polluted":true}}'))
    expect(merged).toEqual(DEFAULT_PREFERENCES)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })
})
