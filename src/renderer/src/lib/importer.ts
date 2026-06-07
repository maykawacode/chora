// ── Spreadsheet importer ──────────────────────────────────────────────────────
//
// Parses a TSV or CSV file exported from Excel/Sheets into MapTool session data.
//
// Expected layout:
//   Row 0:  [ignored]    DimLabel1    DimLabel2   ...
//   Row 1+: ElementName  score        score       ...
//
// Scores can use any numeric scale (e.g. 1–7, 0–100).
// If any value exceeds 1.0, the entire score matrix is linearly normalized
// to the 0–1 range using the observed min/max. This means relative differences
// are preserved but absolute values shift.

import { v4 as uuid } from 'uuid'
import type { Element, Dimension, ScoreMap } from './types'
import { defaultCategories, parsePoles } from './types'

export interface ImportResult {
  elements: Element[]
  dimensions: Dimension[]
  scores: ScoreMap
  /** Human-readable description of the scale detected, e.g. "1–7 (normalized to 0–1)". */
  scaleNote: string
  /** Non-fatal warnings about cells that could not be parsed. */
  warnings: string[]
}

export function parseSpreadsheet(text: string): ImportResult {
  // Auto-detect delimiter: TSV takes priority over CSV
  const sep = text.includes('\t') ? '\t' : ','
  const rows = text.split(/\r?\n/).map(l => l.split(sep))

  // Find the header row: first row with more than one non-empty cell
  const headerIdx = rows.findIndex(r => r.filter(c => c.trim()).length > 1)
  if (headerIdx === -1) throw new Error('No header row found. The first row should contain dimension names.')

  const dimLabels = rows[headerIdx].slice(1).map(h => h.trim()).filter(h => h !== '')
  if (dimLabels.length === 0) throw new Error('No dimension names found in the header row.')

  const warnings: string[] = []
  const elementNames: string[] = []
  const rawScores: (number | null)[][] = []

  // Parse data rows — skip rows with no element name
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i]
    const name = row[0]?.trim()
    if (!name) continue

    const rowScores: (number | null)[] = []
    for (let j = 0; j < dimLabels.length; j++) {
      const cell = row[j + 1]?.trim() ?? ''
      // Treat empty, dash, and "na" as unscored
      if (cell === '' || cell === '-' || cell.toLowerCase() === 'na') {
        rowScores.push(null)
      } else {
        const n = parseFloat(cell)
        if (isNaN(n)) {
          warnings.push(`Row "${name}", column "${dimLabels[j]}": "${cell}" is not a number — skipped.`)
          rowScores.push(null)
        } else {
          rowScores.push(n)
        }
      }
    }
    elementNames.push(name)
    rawScores.push(rowScores)
  }

  if (elementNames.length === 0) {
    throw new Error('No elements found. Rows after the header should start with an element name.')
  }

  // Detect scale and normalize if needed
  const allValues = rawScores.flat().filter((v): v is number => v !== null)
  const maxVal = allValues.length > 0 ? Math.max(...allValues) : 1
  const minVal = allValues.length > 0 ? Math.min(...allValues) : 0

  let scaleNote: string
  let normalizedScores: (number | null)[][]

  if (maxVal <= 1.0 && minVal >= 0.0) {
    // Already in 0–1 range — use as-is
    scaleNote = '0–1 (used as-is)'
    normalizedScores = rawScores
  } else {
    const range = maxVal - minVal
    scaleNote = `${minVal}–${maxVal} (normalized to 0–1)`
    normalizedScores = rawScores.map(row =>
      // Guard against degenerate case where all values are identical
      row.map(v => v === null ? null : (range === 0 ? 0.5 : (v - minVal) / range))
    )
  }

  // Build typed objects with fresh UUIDs
  const elements: Element[] = elementNames.map(name => ({
    id: uuid(), name, weight: 1, color: '#808000', description: ''
  }))

  const dimensions: Dimension[] = dimLabels.map(label => {
    const { poleA, poleB } = parsePoles(label)
    return { id: uuid(), label, poleA, poleB, weight: 1, description: '', categories: defaultCategories() }
  })

  // Build score map: scores[elementId][dimensionId] = 0–1 or absent
  const scores: ScoreMap = {}
  for (let i = 0; i < elements.length; i++) {
    scores[elements[i].id] = {}
    for (let j = 0; j < dimensions.length; j++) {
      const v = normalizedScores[i]?.[j]
      if (v !== null && v !== undefined) {
        scores[elements[i].id][dimensions[j].id] = v
      }
    }
  }

  return { elements, dimensions, scores, scaleNote, warnings }
}
