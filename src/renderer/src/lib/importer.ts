// ── Spreadsheet importer ──────────────────────────────────────────────────────
//
// Parses a TSV file into MapTool session data. Supports two formats:
//
// FULL FORMAT (##SECTION markers) — produced by Export Spreadsheet.
// Supports all analysis data for a lossless round-trip. Any section may be
// omitted or partially edited; missing fields get safe defaults. Entities
// referenced in score sections but absent from their entity section are
// created automatically with defaults.
//
//   ##SESSION        — Name, Definition (key/value rows)
//   ##ELEMENTS       — Name, Definition, Color, Weight, Shape
//   ##TYPES          — Name, Definition
//   ##DIMENSIONS     — Label, Pole A, Pole B, Definition, Weight
//   ##TYPE_SCORES    — element × type matrix (blank cell = unscored)
//   ##DIMENSION_SCORES — element × dimension matrix (blank cell = unscored)
//
// SIMPLE FORMAT (no ##markers) — backward-compatible with existing files.
// First row is headers (blank, then dimension labels). Optional second column
// named "Definition" holds element definitions. Scores are auto-normalized to
// 0–1 if any value exceeds 1.0.
//
//   [blank]      [Definition]   DimLabel1   DimLabel2   ...
//   ElementName  [def text]     score       score       ...

import { v4 as uuid } from 'uuid'
import type { Element, Dimension, ScoreMap, SessionMeta, Type } from './types'
import { defaultCategories, defaultSessionMeta, parsePoles } from './types'

// Strip surrounding double-quotes and unescape "" → " (standard TSV/CSV quoting).
function stripQuotes(s: string): string {
  if (s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1).replace(/""/g, '"')
  return s
}

// Trim whitespace then strip surrounding quotes from a raw cell value.
function tc(raw: string | undefined): string {
  return stripQuotes((raw ?? '').trim())
}

export interface ImportResult {
  sessionMeta: SessionMeta
  elements:    Element[]
  types:       Type[]
  dimensions:  Dimension[]
  scores:      ScoreMap
  /** Human-readable description of the scale detected, e.g. "1–7 (normalized to 0–1)". */
  scaleNote:   string
  /** Non-fatal warnings about cells that could not be parsed. */
  warnings:    string[]
}

export function parseSpreadsheet(text: string): ImportResult {
  return text.trimStart().startsWith('##')
    ? parseFullSpreadsheet(text)
    : parseSimpleSpreadsheet(text)
}

// ── Full format parser ────────────────────────────────────────────────────────

function parseFullSpreadsheet(text: string): ImportResult {
  const sections  = splitSections(text)
  const warnings: string[] = []

  // ── Session ────────────────────────────────────────────────────────────────
  // Format: header row (Name | <definition label>) then one data row.
  const sessionRows = sections['SESSION'] ?? []
  const sessionMeta: SessionMeta = { id: crypto.randomUUID(), name: '', definition: '' }
  if (sessionRows.length >= 2) {
    const hdr  = sessionRows[0].map(h => h.trim().toLowerCase())
    const data = sessionRows[1]
    const nameCol = Math.max(0, hdr.indexOf('name'))
    // definition lives in the first column that isn't 'name'
    const defCol  = hdr.findIndex((h, i) => i !== nameCol && h !== '')
    sessionMeta.name       = tc(data[nameCol])
    sessionMeta.definition = defCol >= 0 ? tc(data[defCol]) : ''
  }

  // ── Elements ───────────────────────────────────────────────────────────────
  const elementsByName = new Map<string, Element>()

  const elemRows = sections['ELEMENTS'] ?? []
  if (elemRows.length >= 2) {
    const hdr = elemRows[0].map(h => h.trim().toLowerCase())
    const nameCol   = Math.max(0, hdr.indexOf('name'))
    const defCol    = hdr.indexOf('definition')
    const colorCol  = hdr.indexOf('color')
    const weightCol = hdr.indexOf('weight')
    const shapeCol  = hdr.indexOf('shape')

    for (const row of elemRows.slice(1)) {
      const name = tc(row[nameCol])
      if (!name) continue
      const rawColor = tc(row[colorCol])
      const rawShape = tc(row[shapeCol])
      elementsByName.set(name, {
        id:         uuid(),
        name,
        definition: defCol >= 0 ? tc(row[defCol]) : '',
        color:      /^#[0-9a-fA-F]{6}$/.test(rawColor) ? rawColor : '#9d9d53',
        weight:     weightCol >= 0 ? Math.max(1, Math.min(100, parseInt(row[weightCol] ?? '') || 1)) : 1,
        shape:      (['circle', 'square', 'triangle', 'diamond'] as const).includes(rawShape as Element['shape'])
                      ? rawShape as Element['shape'] : 'circle'
      })
    }
  }

  // ── Types ──────────────────────────────────────────────────────────────────
  const typesByName = new Map<string, Type>()

  const typeRows = sections['TYPES'] ?? []
  if (typeRows.length >= 2) {
    const hdr = typeRows[0].map(h => h.trim().toLowerCase())
    const nameCol  = Math.max(0, hdr.indexOf('name'))
    const defCol   = hdr.indexOf('definition')
    const colorCol = hdr.indexOf('color')

    for (const row of typeRows.slice(1)) {
      const name = tc(row[nameCol])
      if (!name) continue
      typesByName.set(name, {
        id:         uuid(),
        name,
        definition: defCol   >= 0 ? tc(row[defCol])   : '',
        color:      colorCol >= 0 ? tc(row[colorCol]) || '#808080' : '#808080'
      })
    }
  }

  // ── Dimensions ─────────────────────────────────────────────────────────────
  const dimensionsByName = new Map<string, Dimension>()

  const dimRows = sections['DIMENSIONS'] ?? []
  if (dimRows.length >= 2) {
    const hdr = dimRows[0].map(h => h.trim().toLowerCase())
    const labelCol  = Math.max(0, hdr.indexOf('label'))
    const poleACol  = hdr.indexOf('pole a')
    const poleBCol  = hdr.indexOf('pole b')
    const defCol    = hdr.indexOf('definition')
    const weightCol = hdr.indexOf('weight')

    for (const row of dimRows.slice(1)) {
      const label = tc(row[labelCol])
      if (!label) continue
      const derived = parsePoles(label)
      dimensionsByName.set(label, {
        id:         uuid(),
        label,
        poleA:      (poleACol >= 0 ? tc(row[poleACol]) : '') || derived.poleA,
        poleB:      (poleBCol >= 0 ? tc(row[poleBCol]) : '') || derived.poleB,
        definition: defCol    >= 0 ? tc(row[defCol])         : '',
        weight:     weightCol >= 0 ? Math.max(1, Math.min(100, parseInt(row[weightCol] ?? '') || 1)) : 1,
        categories: defaultCategories()
      })
    }
  }

  const scores: ScoreMap = {}

  function ensureElement(name: string): Element {
    if (!elementsByName.has(name)) {
      elementsByName.set(name, { id: uuid(), name, definition: '', color: '#9d9d53', weight: 1, shape: 'circle' })
    }
    return elementsByName.get(name)!
  }

  // ── Type scores ────────────────────────────────────────────────────────────
  // When ##TYPES was present, columns are matched to types by position (N→N).
  // Column headers are treated as human-readable labels only.
  // When ##TYPES was absent, fall back to name-based find-or-create.
  const typeScoreRows = sections['TYPE_SCORES'] ?? []
  if (typeScoreRows.length >= 2) {
    const colHeaders = typeScoreRows[0].slice(1).map(h => h.trim())
    const typeList = [...typesByName.values()]
    const usePositional = sections['TYPES'] !== undefined

    const colTypes: (Type | null)[] = colHeaders.map((header, i) => {
      if (!header) return null
      if (usePositional) return typeList[i] ?? null
      if (!typesByName.has(header)) typesByName.set(header, { id: uuid(), name: header, definition: '', color: '#808080' })
      return typesByName.get(header)!
    })

    for (const row of typeScoreRows.slice(1)) {
      const elName = tc(row[0])
      if (!elName) continue
      const el = ensureElement(elName)
      scores[el.id] = scores[el.id] ?? {}

      for (let j = 0; j < colHeaders.length; j++) {
        const t = colTypes[j]
        if (!t) continue
        const cellVal = row[j + 1]?.trim()
        if (!cellVal) continue
        const v = parseFloat(cellVal)
        if (isNaN(v)) warnings.push(`Type scores: "${elName}" × "${colHeaders[j]}": "${cellVal}" is not a number — skipped.`)
        else scores[el.id][t.id] = Math.max(0, Math.min(1, v))
      }
    }
  }

  // ── Dimension scores ───────────────────────────────────────────────────────
  // When ##DIMENSIONS was present, columns are matched to dimensions by position
  // (N→N). Column headers are treated as human-readable labels only, so the user
  // can use short names in the score matrix without breaking the import.
  // When ##DIMENSIONS was absent, fall back to name-based find-or-create.
  const dimScoreRows = sections['DIMENSION_SCORES'] ?? []
  if (dimScoreRows.length >= 2) {
    const colHeaders = dimScoreRows[0].slice(1).map(h => h.trim())
    const dimList = [...dimensionsByName.values()]
    const usePositional = sections['DIMENSIONS'] !== undefined

    const colDims: (Dimension | null)[] = colHeaders.map((header, i) => {
      if (!header) return null
      if (usePositional) return dimList[i] ?? null
      if (!dimensionsByName.has(header)) {
        const derived = parsePoles(header)
        const dim: Dimension = {
          id: uuid(), label: header, poleA: derived.poleA, poleB: derived.poleB,
          definition: '', weight: 1, categories: defaultCategories()
        }
        dimensionsByName.set(header, dim)
      }
      return dimensionsByName.get(header)!
    })

    for (const row of dimScoreRows.slice(1)) {
      const elName = tc(row[0])
      if (!elName) continue
      const el = ensureElement(elName)
      scores[el.id] = scores[el.id] ?? {}

      for (let j = 0; j < colHeaders.length; j++) {
        const dim = colDims[j]
        if (!dim) continue
        const cellVal = row[j + 1]?.trim()
        if (!cellVal) continue
        const v = parseFloat(cellVal)
        if (isNaN(v)) warnings.push(`Dimension scores: "${elName}" × "${colHeaders[j]}": "${cellVal}" is not a number — skipped.`)
        else scores[el.id][dim.id] = Math.max(0, Math.min(1, v))
      }
    }
  }

  return {
    sessionMeta,
    elements:   [...elementsByName.values()],
    types:      [...typesByName.values()],
    dimensions: [...dimensionsByName.values()],
    scores,
    scaleNote:  '0–1 (used as-is)',
    warnings
  }
}

// ── Simple format parser ──────────────────────────────────────────────────────
//
// Legacy layout — element rows × dimension columns, optional Definition column.
// Scores are auto-normalized if any value exceeds 1.0.

function parseSimpleSpreadsheet(text: string): ImportResult {
  const sep  = text.includes('\t') ? '\t' : ','
  const rows = text.split(/\r?\n/).map(l => l.split(sep))

  const headerIdx = rows.findIndex(r => r.filter(c => c.trim()).length > 1)
  if (headerIdx === -1) throw new Error('No header row found. The first row should contain dimension names.')

  const hasDefinition  = rows[headerIdx][1]?.trim().toLowerCase() === 'definition'
  const scoreStartCol  = hasDefinition ? 2 : 1

  const dimLabels = rows[headerIdx].slice(scoreStartCol).map(h => h.trim()).filter(h => h !== '')
  if (dimLabels.length === 0) throw new Error('No dimension names found in the header row.')

  const warnings: string[] = []
  const elementNames:        string[] = []
  const elementDefinitions:  string[] = []
  const rawScores: (number | null)[][] = []

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row  = rows[i]
    const name = row[0]?.trim()
    if (!name) continue

    let definition = ''
    if (hasDefinition) {
      const raw = row[1]?.trim() ?? ''
      definition = raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1) : raw
    }

    const rowScores: (number | null)[] = []
    for (let j = 0; j < dimLabels.length; j++) {
      const cell = row[j + scoreStartCol]?.trim() ?? ''
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
    elementDefinitions.push(definition)
    rawScores.push(rowScores)
  }

  if (elementNames.length === 0) {
    throw new Error('No elements found. Rows after the header should start with an element name.')
  }

  const allValues = rawScores.flat().filter((v): v is number => v !== null)
  const maxVal    = allValues.length > 0 ? Math.max(...allValues) : 1
  const minVal    = allValues.length > 0 ? Math.min(...allValues) : 0

  let scaleNote: string
  let normalizedScores: (number | null)[][]

  if (maxVal <= 1.0 && minVal >= 0.0) {
    scaleNote        = '0–1 (used as-is)'
    normalizedScores = rawScores
  } else {
    const range  = maxVal - minVal
    scaleNote        = `${minVal}–${maxVal} (normalized to 0–1)`
    normalizedScores = rawScores.map(row =>
      row.map(v => v === null ? null : (range === 0 ? 0.5 : (v - minVal) / range))
    )
  }

  const elements: Element[] = elementNames.map((name, i) => ({
    id: uuid(), name, definition: elementDefinitions[i] ?? '', weight: 1, color: '#9d9d53', shape: 'circle' as const
  }))

  const dimensions: Dimension[] = dimLabels.map(label => {
    const { poleA, poleB } = parsePoles(label)
    return { id: uuid(), label, poleA, poleB, definition: '', weight: 1, categories: defaultCategories() }
  })

  const scores: ScoreMap = {}
  for (let i = 0; i < elements.length; i++) {
    scores[elements[i].id] = {}
    for (let j = 0; j < dimensions.length; j++) {
      const v = normalizedScores[i]?.[j]
      if (v !== null && v !== undefined) scores[elements[i].id][dimensions[j].id] = v
    }
  }

  return { sessionMeta: defaultSessionMeta(), elements, types: [], dimensions, scores, scaleNote, warnings }
}

// ── Section splitter ──────────────────────────────────────────────────────────
//
// Splits a ##SECTION-formatted document into a map of section name → rows.
// Blank lines between sections are skipped. Content before the first ## is ignored.

function splitSections(text: string): Record<string, string[][]> {
  const result: Record<string, string[][]> = {}
  let currentName: string | null = null
  let currentRows: string[][] = []

  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('##')) {
      if (currentName !== null) result[currentName] = currentRows
      currentName = line.slice(2).trim()
      currentRows = []
    } else if (currentName !== null && line.trim() !== '') {
      currentRows.push(line.split('\t'))
    }
  }

  if (currentName !== null) result[currentName] = currentRows
  return result
}
