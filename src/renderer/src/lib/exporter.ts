import type { AppState } from './types'

/**
 * Serialize the current session as a tab-separated spreadsheet.
 *
 * Layout mirrors the import format so files round-trip cleanly:
 *   Row 0:  [blank]       Dim1Label  Dim2Label  ...
 *   Row 1+: ElementName   0.000      0.000      ...
 *
 * Unscored cells are left empty. Scores are written as 3-decimal
 * values (e.g. 0.750) to avoid floating-point noise while preserving
 * enough precision to round-trip without visible error.
 */
export function exportSpreadsheet(state: AppState): string {
  const { elements, dimensions, scores } = state

  const rows: string[][] = []

  // Header row
  rows.push(['', ...dimensions.map(d => d.label)])

  // One row per element
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
