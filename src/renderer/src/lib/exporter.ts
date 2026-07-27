// ── Spreadsheet exporter ──────────────────────────────────────────────────────
//
// Writes the current session as a tab-separated (TSV) file using the full
// ##SECTION format. Covers all analysis data for a lossless round-trip:
//
//   ##SESSION        — name and definition of the analysis
//   ##ELEMENTS       — name, definition, color, weight, shape, collections
//   ##COLLECTIONS    — name, definition and color per collection
//   ##DIMENSIONS     — label, poles, definition, weight per dimension
//   ##DIMENSION_SCORES — element × dimension score matrix (0–1)
//
// Membership is a Collections column on ##ELEMENTS rather than a matrix of its
// own. It is binary and lives on the element, so a row of 0s and 1s would say
// the same thing as a list of names at far greater width — and a spreadsheet
// column can be edited by typing collection names, which the matrix could not.
//
// Application data (map configs, window positions, UUIDs) is intentionally
// excluded — it is not meaningful outside this session instance.
//
// The file can be re-imported via Import Spreadsheet. Any section may be
// omitted or partially edited; the importer fills missing fields with defaults.

import type { AppState, Element } from './types'

// Separates collection names inside the ##ELEMENTS Collections cell. Shared
// with the importer so one character defines the format on both sides.
export const COLLECTION_SEPARATOR = '|'

// Sanitize a plain text cell: collapse tabs and newlines to spaces.
function cell(s: string): string {
  return s.replace(/\t/g, ' ').replace(/\r?\n/g, ' ')
}

// Wrap a text value in double-quotes, escaping any embedded quotes as "".
// Used for definition fields so they survive round-trips through Excel/Numbers.
function quoted(s: string): string {
  return `"${cell(s).replace(/"/g, '""')}"`
}

// A collection name as it is written anywhere in the file. The separator is
// stripped because a name containing one would split into two on import; doing
// it here rather than only in the membership column keeps the ##COLLECTIONS
// spelling and the ##ELEMENTS spelling identical, which is what lets the
// importer match them by name.
function collectionName(s: string): string {
  return cell(s).split(COLLECTION_SEPARATOR).join('/')
}

export function exportSpreadsheet(state: AppState): string {
  const { sessionMeta, elements, collections, dimensions, scores } = state
  const sections: string[] = []

  // ── ##SESSION — header row then one data row ────────────────────────────────
  sections.push([
    '##SESSION',
    'Name\tPurpose of Analysis',
    `${cell(sessionMeta.name)}\t${cell(sessionMeta.definition)}`
  ].join('\n'))

  // ── ##ELEMENTS ─────────────────────────────────────────────────────────────
  // Collections are named, not id'd: the file is meant to be read and edited in
  // a spreadsheet, where a uuid is noise. Names are separated by '|' because a
  // comma is too likely to appear inside one.
  const collectionNames = new Map(collections.map(c => [c.id, collectionName(c.name)]))
  const membership = (e: Element): string =>
    e.collectionIds.map(id => collectionNames.get(id)).filter(Boolean).join(COLLECTION_SEPARATOR)

  sections.push([
    '##ELEMENTS',
    'Name\tDefinition\tColor\tWeight\tShape\tCollections',
    ...elements.map(e =>
      `${cell(e.name)}\t${quoted(e.definition)}\t${e.color}\t${e.weight}\t${e.shape}\t${membership(e)}`)
  ].join('\n'))

  // ── ##COLLECTIONS ──────────────────────────────────────────────────────────
  sections.push([
    '##COLLECTIONS',
    'Name\tDefinition\tColor',
    ...collections.map(c => `${collectionName(c.name)}\t${cell(c.definition)}\t${cell(c.color)}`)
  ].join('\n'))

  // ── ##DIMENSIONS ───────────────────────────────────────────────────────────
  sections.push([
    '##DIMENSIONS',
    'Label\tPole A\tPole B\tDefinition\tWeight',
    ...dimensions.map(d => `${cell(d.label)}\t${cell(d.poleA)}\t${cell(d.poleB)}\t${cell(d.definition)}\t${d.weight}`)
  ].join('\n'))

  // ── ##DIMENSION_SCORES ─────────────────────────────────────────────────────
  {
    const header = ['', ...dimensions.map(d => cell(d.label))].join('\t')
    const rows = elements.map(el => {
      const cells = [cell(el.name)]
      for (const dim of dimensions) {
        const v = scores[el.id]?.[dim.id]
        cells.push(v !== undefined ? v.toFixed(3) : '')
      }
      return cells.join('\t')
    })
    sections.push(['##DIMENSION_SCORES', header, ...rows].join('\n'))
  }

  return sections.join('\n\n')
}
