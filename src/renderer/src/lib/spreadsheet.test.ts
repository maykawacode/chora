// ── Spreadsheet round-trip ────────────────────────────────────────────────────
//
// Membership left the score matrix and became a Collections column on
// ##ELEMENTS. These check that the pair of changes is symmetric — every real
// session in Data/ survives export → import with the same elements in the same
// collections — and that a legacy ##TYPES + ##TYPE_SCORES file still converts at
// the same cutoff the .mtda reader uses.

import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { deserializeSession } from './parser'
import { exportSpreadsheet } from './exporter'
import { parseSpreadsheet } from './importer'

const DATA_DIR = resolve(process.cwd(), '../Data')
const files = existsSync(DATA_DIR)
  ? readdirSync(DATA_DIR).filter(f => f.endsWith('.mtda'))
  : []

describe('TSV round-trip', () => {
  if (files.length === 0) {
    it.skip('no .mtda files in Data/ to round-trip', () => {})
    return
  }

  for (const f of files) {
    it(f, () => {
      const state = deserializeSession(readFileSync(resolve(DATA_DIR, f), 'utf8'))
      const tsv = exportSpreadsheet(state as never)
      const back = parseSpreadsheet(tsv)

      expect(back.collections.map(c => c.name)).toEqual(state.collections!.map(c => c.name))

      const byName = new Map(back.elements.map(e => [e.name, e]))
      const backNames = (e: { collectionIds: string[] }) =>
        e.collectionIds.map(id => back.collections.find(c => c.id === id)!.name).sort()
      const origNames = (e: { collectionIds: string[] }) =>
        e.collectionIds.map(id => state.collections!.find(c => c.id === id)!.name).sort()

      for (const el of state.elements!) {
        const re = byName.get(el.name)!
        expect(re, el.name).toBeTruthy()
        expect(backNames(re), el.name).toEqual(origNames(el))
      }
      expect(back.warnings).toEqual([])
    })
  }
})

describe('legacy TSV', () => {
  it('preserves open-ended Element and Dimension weights', () => {
    const tsv = [
      '##ELEMENTS', 'Name\tDefinition\tColor\tWeight\tShape\tCollections',
      'Light\t""\t#111111\t0\tcircle\t',
      'Heavy\t""\t#222222\t275\tcircle\t', '',
      '##DIMENSIONS', 'Label\tPole A\tPole B\tDefinition\tWeight',
      'Minor–Major\tMinor\tMajor\t\t0',
      'Near–Far\tNear\tFar\t\t480'
    ].join('\n')

    const parsed = parseSpreadsheet(tsv)
    expect(parsed.elements.map(element => element.weight)).toEqual([0, 275])
    expect(parsed.dimensions.map(dimension => dimension.weight)).toEqual([0, 480])
  })

  it('reads ##TYPES + ##TYPE_SCORES at the 0.5 cutoff', () => {
    const legacy = [
      '##ELEMENTS', 'Name\tDefinition\tColor\tWeight\tShape',
      'Alpha\t""\t#111111\t5\tcircle', 'Beta\t""\t#222222\t5\tsquare', '',
      '##TYPES', 'Name\tDefinition\tColor',
      'Reds\t\t#ff0000', 'Blues\t\t#0000ff', '',
      '##TYPE_SCORES', '\tReds\tBlues',
      'Alpha\t1.000\t0.400',
      'Beta\t0.500\t0.000'
    ].join('\n')
    const r = parseSpreadsheet(legacy)
    const name = (id: string) => r.collections.find(c => c.id === id)!.name
    const alpha = r.elements.find(e => e.name === 'Alpha')!
    const beta  = r.elements.find(e => e.name === 'Beta')!
    expect(alpha.collectionIds.map(name)).toEqual(['Reds'])   // 0.4 Blues dropped
    expect(beta.collectionIds.map(name)).toEqual(['Reds'])    // 0.5 kept
  })

  it('lets a Collections cell name a collection with no ##COLLECTIONS row', () => {
    const tsv = [
      '##ELEMENTS', 'Name\tDefinition\tColor\tWeight\tShape\tCollections',
      'Alpha\t""\t#111111\t5\tcircle\tGhosts|Reds'
    ].join('\n')
    const r = parseSpreadsheet(tsv)
    expect(r.collections.map(c => c.name)).toEqual(['Ghosts', 'Reds'])
    expect(r.elements[0].collectionIds).toHaveLength(2)
  })
})

// ── Colors from an untrusted spreadsheet ──────────────────────────────────────
//
// The element column was already checked against '#rrggbb'; the collection
// column was not, and a spreadsheet is the easier of the two files to hand
// someone. Both now go through the same reader — see lib/color.ts for why a
// color is a place a remote request can hide.

describe('Colors are constrained to hex on import', () => {
  const tsv = (elementColor: string, collectionColor: string): string => [
    '##COLLECTIONS',
    'Name\tDefinition\tColor',
    `Group\t\t${collectionColor}`,
    '',
    '##ELEMENTS',
    'Name\tDefinition\tColor\tWeight\tShape\tCollections',
    `One\t\t${elementColor}\t1\tcircle\tGroup`
  ].join('\n')

  it('refuses a url() smuggled into either color column', () => {
    const result = parseSpreadsheet(tsv(
      'url(https://attacker.example/b.png)',
      'url(https://attacker.example/b.png)'
    ))
    expect(result.elements[0].color).toBe('#9d9d53')
    expect(result.collections[0].color).toBe('#808080')
  })

  it('refuses named and short-form CSS colors in the collection column', () => {
    for (const color of ['red', '#abc', 'rgb(1,2,3)']) {
      const result = parseSpreadsheet(tsv('#123456', color))
      expect(result.collections[0].color).toBe('#808080')
      // The valid element color alongside it is still kept.
      expect(result.elements[0].color).toBe('#123456')
    }
  })

  it('keeps real hex colors in both columns', () => {
    const result = parseSpreadsheet(tsv('#AbCdEf', '#4080c0'))
    expect(result.elements[0].color).toBe('#AbCdEf')
    expect(result.collections[0].color).toBe('#4080c0')
  })
})
