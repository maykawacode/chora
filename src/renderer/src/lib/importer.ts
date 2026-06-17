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
  const sessionRows = sections['SESSION'] ?? []
  const sessionMeta: SessionMeta = {
    id:         crypto.randomUUID(),
    name:       sessionRows.find(r => r[0]?.trim() === 'Name')?.slice(1).join('\t') ?? '',
    definition: sessionRows.find(r => r[0]?.trim() === 'Definition')?.slice(1).join('\t') ?? ''
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
      const name = row[nameCol]?.trim()
      if (!name) continue
      const rawColor  = row[colorCol]?.trim() ?? ''
      const rawShape  = row[shapeCol]?.trim() ?? ''
      elementsByName.set(name, {
        id:         uuid(),
        name,
        definition: defCol >= 0 ? (row[defCol]?.trim() ?? '') : '',
        color:      /^#[0-9a-fA-F]{6}$/.test(rawColor) ? rawColor : '#9d9d53',
        weight:     weightCol >= 0 ? Math.max(1, Math.min(100, parseInt(row[weightCol]) || 1)) : 1,
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
    const nameCol = Math.max(0, hdr.indexOf('name'))
    const defCol  = hdr.indexOf('definition')

    for (const row of typeRows.slice(1)) {
      const name = row[nameCol]?.trim()
      if (!name) continue
      typesByName.set(name, {
        id:         uuid(),
        name,
        definition: defCol >= 0 ? (row[defCol]?.trim() ?? '') : ''
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
      const label = row[labelCol]?.trim()
      if (!label) continue
      const derived = parsePoles(label)
      dimensionsByName.set(label, {
        id:         uuid(),
        label,
        poleA:      (poleACol >= 0 ? row[poleACol]?.trim() : '') || derived.poleA,
        poleB:      (poleBCol >= 0 ? row[poleBCol]?.trim() : '') || derived.poleB,
        definition: defCol    >= 0 ? (row[defCol]?.trim()    ?? '') : '',
        weight:     weightCol >= 0 ? Math.max(1, Math.min(100, parseInt(row[weightCol]) || 1)) : 1,
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
  const typeScoreRows = sections['TYPE_SCORES'] ?? []
  if (typeScoreRows.length >= 2) {
    const colNames = typeScoreRows[0].slice(1).map(h => h.trim())

    for (const name of colNames) {
      if (name && !typesByName.has(name)) typesByName.set(name, { id: uuid(), name, definition: '' })
    }

    for (const row of typeScoreRows.slice(1)) {
      const elName = row[0]?.trim()
      if (!elName) continue
      const el = ensureElement(elName)
      scores[el.id] = scores[el.id] ?? {}

      for (let j = 0; j < colNames.length; j++) {
        const typeName = colNames[j]
        if (!typeName) continue
        const t = typesByName.get(typeName)!
        const cell = row[j + 1]?.trim()
        if (!cell) continue
        const v = parseFloat(cell)
        if (isNaN(v)) warnings.push(`Type scores: "${elName}" × "${typeName}": "${cell}" is not a number — skipped.`)
        else scores[el.id][t.id] = Math.max(0, Math.min(1, v))
      }
    }
  }

  // ── Dimension scores ───────────────────────────────────────────────────────
  const dimScoreRows = sections['DIMENSION_SCORES'] ?? []
  if (dimScoreRows.length >= 2) {
    const colNames = dimScoreRows[0].slice(1).map(h => h.trim())

    for (const label of colNames) {
      if (label && !dimensionsByName.has(label)) {
        const derived = parsePoles(label)
        dimensionsByName.set(label, {
          id: uuid(), label, poleA: derived.poleA, poleB: derived.poleB,
          definition: '', weight: 1, categories: defaultCategories()
        })
      }
    }

    for (const row of dimScoreRows.slice(1)) {
      const elName = row[0]?.trim()
      if (!elName) continue
      const el = ensureElement(elName)
      scores[el.id] = scores[el.id] ?? {}

      for (let j = 0; j < colNames.length; j++) {
        const label = colNames[j]
        if (!label) continue
        const dim = dimensionsByName.get(label)!
        const cell = row[j + 1]?.trim()
        if (!cell) continue
        const v = parseFloat(cell)
        if (isNaN(v)) warnings.push(`Dimension scores: "${elName}" × "${label}": "${cell}" is not a number — skipped.`)
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
