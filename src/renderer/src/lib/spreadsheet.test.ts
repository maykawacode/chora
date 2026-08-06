// ── Spreadsheet round-trip ────────────────────────────────────────────────────
//
// Membership left the score matrix and became a Collections column on
// ##ELEMENTS. These check that the pair of changes is symmetric — every real
// session in Data/ survives export → import with the same elements in the same
// collections — and that a legacy ##TYPES + ##TYPE_SCORES file still converts at
// the same cutoff the .mtda reader uses.

import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { deserializeSession } from './parser'
import { exportSpreadsheet } from './exporter'
import { parseSpreadsheet } from './importer'

const DATA_DIR = resolve(process.cwd(), '../Data')
const files = readdirSync(DATA_DIR).filter(f => f.endsWith('.mtda'))

describe('TSV round-trip', () => {
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
  it('preserves open-ended Element weights', () => {
    const tsv = [
      '##ELEMENTS', 'Name\tDefinition\tColor\tWeight\tShape\tCollections',
      'Light\t""\t#111111\t0\tcircle\t',
      'Heavy\t""\t#222222\t275\tcircle\t'
    ].join('\n')

    expect(parseSpreadsheet(tsv).elements.map(element => element.weight)).toEqual([0, 275])
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
