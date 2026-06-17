// ── Spreadsheet exporter ──────────────────────────────────────────────────────
//
// Writes the current session as a tab-separated (TSV) file using the full
// ##SECTION format. Covers all analysis data for a lossless round-trip:
//
//   ##SESSION        — name and definition of the analysis
//   ##ELEMENTS       — name, definition, color, weight, shape per element
//   ##TYPES          — name and definition per type
//   ##DIMENSIONS     — label, poles, definition, weight per dimension
//   ##TYPE_SCORES    — element × type membership matrix (0–1)
//   ##DIMENSION_SCORES — element × dimension score matrix (0–1)
//
// Application data (map configs, window positions, UUIDs) is intentionally
// excluded — it is not meaningful outside this session instance.
//
// The file can be re-imported via Import Spreadsheet. Any section may be
// omitted or partially edited; the importer fills missing fields with defaults.

import type { AppState } from './types'

// Sanitize a plain text cell: collapse tabs and newlines to spaces.
function cell(s: string): string {
  return s.replace(/\t/g, ' ').replace(/\r?\n/g, ' ')
}

// Wrap a text value in double-quotes, escaping any embedded quotes as "".
// Used for definition fields so they survive round-trips through Excel/Numbers.
function quoted(s: string): string {
  return `"${cell(s).replace(/"/g, '""')}"`
}

export function exportSpreadsheet(state: AppState): string {
  const { sessionMeta, elements, types, dimensions, scores } = state
  const sections: string[] = []

  // ── ##SESSION — header row then one data row ────────────────────────────────
  sections.push([
    '##SESSION',
    'Name\tPurpose of Analysis',
    `${cell(sessionMeta.name)}\t${cell(sessionMeta.definition)}`
  ].join('\n'))

  // ── ##ELEMENTS ─────────────────────────────────────────────────────────────
  sections.push([
    '##ELEMENTS',
    'Name\tDefinition\tColor\tWeight\tShape',
    ...elements.map(e => `${cell(e.name)}\t${quoted(e.definition)}\t${e.color}\t${e.weight}\t${e.shape}`)
  ].join('\n'))

  // ── ##TYPES ────────────────────────────────────────────────────────────────
  sections.push([
    '##TYPES',
    'Name\tDefinition',
    ...types.map(t => `${cell(t.name)}\t${cell(t.definition)}`)
  ].join('\n'))

  // ── ##DIMENSIONS ───────────────────────────────────────────────────────────
  sections.push([
    '##DIMENSIONS',
    'Label\tPole A\tPole B\tDefinition\tWeight',
    ...dimensions.map(d => `${cell(d.label)}\t${cell(d.poleA)}\t${cell(d.poleB)}\t${cell(d.definition)}\t${d.weight}`)
  ].join('\n'))

  // ── ##TYPE_SCORES ──────────────────────────────────────────────────────────
  {
    const header = ['', ...types.map(t => cell(t.name))].join('\t')
    const rows = elements.map(el => {
      const cells = [cell(el.name)]
      for (const t of types) {
        const v = scores[el.id]?.[t.id]
        cells.push(v !== undefined ? v.toFixed(3) : '')
      }
      return cells.join('\t')
    })
    sections.push(['##TYPE_SCORES', header, ...rows].join('\n'))
  }

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
