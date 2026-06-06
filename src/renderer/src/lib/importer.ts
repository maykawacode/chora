import { v4 as uuid } from 'uuid'
import type { Element, Dimension, ScoreMap } from './types'
import { defaultCategories, parsePoles } from './types'

export interface ImportResult {
  elements: Element[]
  dimensions: Dimension[]
  scores: ScoreMap
  /** Human-readable description of the detected/applied scale, e.g. "1–7 (normalized to 0–1)" */
  scaleNote: string
  warnings: string[]
}

/**
 * Parse a TSV or CSV spreadsheet into MapTool data.
 *
 * Expected layout:
 *   Row 0:  [ignored]  Dim1Label  Dim2Label  ...
 *   Row 1+: ElementName  score  score  ...
 *
 * Scores can be any numeric scale. If max > 1 the entire matrix is
 * linearly normalized to 0–1 using the observed min/max.
 * Empty or non-numeric cells are treated as unscored.
 */
export function parseSpreadsheet(text: string): ImportResult {
  const sep = text.includes('\t') ? '\t' : ','
  const lines = text.split(/\r?\n/)
  const rows = lines.map(l => l.split(sep))

  // Find the header row — first row with more than 1 non-empty cell
  const headerIdx = rows.findIndex(r => r.filter(c => c.trim()).length > 1)
  if (headerIdx === -1) throw new Error('No header row found. The first row should contain dimension names.')

  const header = rows[headerIdx]
  const dimLabels = header.slice(1).map(h => h.trim()).filter(h => h !== '')
  if (dimLabels.length === 0) throw new Error('No dimension names found in the header row.')

  const warnings: string[] = []
  const elementNames: string[] = []
  const rawScores: (number | null)[][] = []

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i]
    const name = row[0]?.trim()
    if (!name) continue

    const scores: (number | null)[] = []
    for (let j = 0; j < dimLabels.length; j++) {
      const cell = row[j + 1]?.trim() ?? ''
      if (cell === '' || cell === '-' || cell.toLowerCase() === 'na') {
        scores.push(null)
      } else {
        const n = parseFloat(cell)
        if (isNaN(n)) {
          warnings.push(`Row "${name}", column "${dimLabels[j]}": "${cell}" is not a number — skipped.`)
          scores.push(null)
        } else {
          scores.push(n)
        }
      }
    }
    elementNames.push(name)
    rawScores.push(scores)
  }

  if (elementNames.length === 0) throw new Error('No elements found. Rows after the header should start with an element name.')

  // Auto-detect scale and normalize
  const allValues = rawScores.flat().filter((v): v is number => v !== null)
  const maxVal = allValues.length > 0 ? Math.max(...allValues) : 1
  const minVal = allValues.length > 0 ? Math.min(...allValues) : 0

  let scaleNote: string
  let normalizedScores: (number | null)[][]

  if (maxVal <= 1.0 && minVal >= 0.0) {
    scaleNote = '0–1 (used as-is)'
    normalizedScores = rawScores
  } else {
    const range = maxVal - minVal
    scaleNote = `${minVal}–${maxVal} (normalized to 0–1)`
    normalizedScores = rawScores.map(row =>
      row.map(v => v === null ? null : (range === 0 ? 0.5 : (v - minVal) / range))
    )
  }

  // Build elements
  const elements: Element[] = elementNames.map(name => ({
    id: uuid(),
    name,
    weight: 1,
    color: '#808000',
    description: ''
  }))

  // Build dimensions
  const dimensions: Dimension[] = dimLabels.map(label => {
    const { poleA, poleB } = parsePoles(label)
    return { id: uuid(), label, poleA, poleB, weight: 1, description: '', categories: defaultCategories() }
  })

  // Build score map
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
