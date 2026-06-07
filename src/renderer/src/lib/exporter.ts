// ── Spreadsheet exporter ──────────────────────────────────────────────────────
//
// Writes the current session as a tab-separated (TSV) file.
// The layout mirrors the import format so files round-trip cleanly:
//
//   [blank]       Dim1Label   Dim2Label   ...
//   ElementName   0.750       0.333       ...
//
// Unscored cells are left empty. Scores are written to 3 decimal places
// (e.g. 0.750) to avoid floating-point noise while preserving enough
// precision that a re-import will produce visually identical results.

import type { AppState } from './types'

export function exportSpreadsheet(state: AppState): string {
  const { elements, dimensions, scores } = state

  const rows: string[][] = []

  // Header row: blank first cell, then one column per dimension
  rows.push(['', ...dimensions.map(d => d.label)])

  // Data rows: element name, then one score cell per dimension
  for (const el of elements) {
    const row = [el.name]
    for (const dim of dimensions) {
      const v = scores[el.id]?.[dim.id]
      row.push(v !== undefined ? v.toFixed(3) : '')
    }
    rows.push(row)
  }

  return rows.map(r => r.join('\t')).join('\n')
}
