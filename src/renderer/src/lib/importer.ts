// ── Spreadsheet importer ──────────────────────────────────────────────────────
//
// Parses a TSV file into Chora session data. Supports two formats:
//
// FULL FORMAT (##SECTION markers) — produced by Export Spreadsheet.
// Supports all analysis data for a lossless round-trip. Any section may be
// omitted or partially edited; missing fields get safe defaults. Entities
// referenced in score sections but absent from their entity section are
// created automatically with defaults.
//
//   ##SESSION        — Name, Definition (key/value rows)
//   ##ELEMENTS       — Name, Definition, Color, Weight, Shape, Collections
//   ##COLLECTIONS    — Name, Definition, Color
//   ##DIMENSIONS     — Label, Pole A, Pole B, Definition, Weight
//   ##DIMENSION_SCORES — element × dimension matrix (blank cell = unscored)
//
// LEGACY SECTIONS — files exported before membership became binary named the
// collections section ##TYPES and carried a separate ##TYPE_SCORES matrix of
// 0–1 values. Both are still read: ##TYPES is treated as ##COLLECTIONS, and a
// score at or above MEMBERSHIP_CUTOFF is read as membership.
//
// SIMPLE FORMAT (no ##markers) — backward-compatible with existing files.
// First row is headers (blank, then dimension labels). Optional second column
// named "Definition" holds element definitions. Scores are auto-normalized to
// 0–1 if any value exceeds 1.0.
//
//   [blank]      [Definition]   DimLabel1   DimLabel2   ...
//   ElementName  [def text]     score       score       ...

import type { Element, Dimension, ScoreMap, SessionMeta, Collection } from './types'
import { defaultCategories, defaultSessionMeta, parsePoles } from './types'
import { MEMBERSHIP_CUTOFF } from './parser'
import { COLLECTION_SEPARATOR, isFormulaEscaped } from './exporter'
import { openWeight } from './numericRange'
import { DEFAULT_COLLECTION_COLOR, DEFAULT_ELEMENT_COLOR, readHexColor } from './color'

// Strip surrounding double-quotes and unescape "" → " (standard TSV/CSV quoting).
function stripQuotes(s: string): string {
  if (s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1).replace(/""/g, '"')
  return s
}

/**
 * Removes the apostrophe the exporter adds to a cell a spreadsheet would
 * otherwise evaluate. The exact inverse of escapeFormula in exporter.ts — see
 * the note there for why only some leading apostrophes are removed.
 *
 * Applied to text read from any spreadsheet, not only ones Chora wrote, which
 * is why it is conservative: a hand-typed name beginning with an apostrophe is
 * left alone unless what follows is something that would have been escaped.
 */
function unescapeFormula(s: string): string {
  return isFormulaEscaped(s) ? s.slice(1) : s
}

// Trim whitespace, strip surrounding quotes, then undo formula escaping.
// The reverse of the exporter's order, so a round-trip is lossless.
function tc(raw: string | undefined): string {
  return unescapeFormula(stripQuotes((raw ?? '').trim()))
}

export interface ImportResult {
  sessionMeta: SessionMeta
  elements:    Element[]
  collections: Collection[]
  dimensions:  Dimension[]
  scores:      ScoreMap
  /** Human-readable description of the scale detected, e.g. "1–7 (normalized to 0–1)". */
  scaleNote:   string
  /** Non-fatal warnings about cells that could not be parsed. */
  warnings:    string[]
}

// A qualitative analysis is a human-scale thing: tens or hundreds of elements,
// a handful of dimensions. These ceilings are far above any real session and
// exist only so that a corrupt, generated, or hostile file fails immediately
// with something a person can read, instead of hanging the window or dying
// somewhere further in with a stack overflow.
const MAX_IMPORT_CHARACTERS = 8_000_000
const MAX_IMPORT_ROWS = 100_000

export function parseSpreadsheet(text: string): ImportResult {
  if (text.length > MAX_IMPORT_CHARACTERS) {
    throw new Error(
      `This file is too large to import (${Math.round(text.length / 1_000_000)} MB). ` +
      `The limit is ${MAX_IMPORT_CHARACTERS / 1_000_000} MB.`
    )
  }
  return text.trimStart().startsWith('##')
    ? parseFullSpreadsheet(text)
    : parseSimpleSpreadsheet(text)
}

/** Splits into lines, refusing a file with an implausible number of them. */
function splitLines(text: string): string[] {
  const lines = text.split(/\r?\n/)
  if (lines.length > MAX_IMPORT_ROWS) {
    throw new Error(
      `This file has too many rows to import (${lines.length}). ` +
      `The limit is ${MAX_IMPORT_ROWS}.`
    )
  }
  return lines
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

  // ── Collections ────────────────────────────────────────────────────────────
  // Parsed before elements so an element's Collections cell can be resolved
  // against the declared set. ##TYPES is the pre-binary name for this section.
  const collectionsByName = new Map<string, Collection>()

  const collectionRows = sections['COLLECTIONS'] ?? sections['TYPES'] ?? []
  if (collectionRows.length >= 2) {
    const hdr = collectionRows[0].map(h => h.trim().toLowerCase())
    const nameCol  = Math.max(0, hdr.indexOf('name'))
    const defCol   = hdr.indexOf('definition')
    const colorCol = hdr.indexOf('color')

    for (const row of collectionRows.slice(1)) {
      const name = tc(row[nameCol])
      if (!name) continue
      collectionsByName.set(name, {
        id:         crypto.randomUUID(),
        name,
        definition: defCol   >= 0 ? tc(row[defCol])   : '',
        color:      readHexColor(colorCol >= 0 ? tc(row[colorCol]) : '', DEFAULT_COLLECTION_COLOR)
      })
    }
  }

  // A collection named anywhere in the file. Created on demand so a spreadsheet
  // can introduce one just by typing it in an element's Collections cell,
  // without also having to add a ##COLLECTIONS row for it.
  function ensureCollection(name: string): Collection {
    const existing = collectionsByName.get(name)
    if (existing) return existing
    const created: Collection = { id: crypto.randomUUID(), name, definition: '', color: DEFAULT_COLLECTION_COLOR }
    collectionsByName.set(name, created)
    return created
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
    const collCol   = hdr.indexOf('collections')

    for (const row of elemRows.slice(1)) {
      const name = tc(row[nameCol])
      if (!name) continue
      const rawColor = tc(row[colorCol])
      const rawWeight = tc(row[weightCol])
      const rawShape = tc(row[shapeCol])
      const rawColls = collCol >= 0 ? tc(row[collCol]) : ''
      elementsByName.set(name, {
        id:         crypto.randomUUID(),
        name,
        definition: defCol >= 0 ? tc(row[defCol]) : '',
        color:      readHexColor(rawColor, DEFAULT_ELEMENT_COLOR),
        weight:     weightCol >= 0 && rawWeight !== ''
          ? openWeight(Number(rawWeight), 1)
          : 1,
        shape:      (['circle', 'square', 'triangle', 'diamond'] as const).includes(rawShape as Element['shape'])
                      ? rawShape as Element['shape'] : 'circle',
        collectionIds: rawColls
          .split(COLLECTION_SEPARATOR)
          // Each name carries its own escaping: tc() above only unescaped the
          // start of the joined cell, not the names after the separator.
          .map(n => unescapeFormula(n.trim()))
          .filter(n => n !== '')
          .map(n => ensureCollection(n).id)
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
      const rawWeight = tc(row[weightCol])
      dimensionsByName.set(label, {
        id:         crypto.randomUUID(),
        label,
        poleA:      (poleACol >= 0 ? tc(row[poleACol]) : '') || derived.poleA,
        poleB:      (poleBCol >= 0 ? tc(row[poleBCol]) : '') || derived.poleB,
        definition: defCol    >= 0 ? tc(row[defCol])         : '',
        weight:     weightCol >= 0 && rawWeight !== ''
          ? openWeight(Number(rawWeight), 1)
          : 1,
        categories: defaultCategories()
      })
    }
  }

  const scores: ScoreMap = {}

  function ensureElement(name: string): Element {
    if (!elementsByName.has(name)) {
      elementsByName.set(name, {
        id: crypto.randomUUID(), name, definition: '', color: DEFAULT_ELEMENT_COLOR, weight: 1,
        shape: 'circle', collectionIds: []
      })
    }
    return elementsByName.get(name)!
  }

  // ── Legacy membership matrix ───────────────────────────────────────────────
  // Files exported before membership became binary carry a ##TYPE_SCORES matrix
  // of 0–1 values instead of a Collections column. A cell at or above
  // MEMBERSHIP_CUTOFF is read as membership and everything below it is dropped,
  // the same conversion applied to pre-5.0 .mtda files.
  //
  // Skipped entirely when the elements already declared their collections, so a
  // hand-edited file that carries both is not overruled by the older section.
  const legacyRows = sections['TYPE_SCORES'] ?? []
  const declaredMembership = [...elementsByName.values()].some(el => el.collectionIds.length > 0)

  if (legacyRows.length >= 2 && !declaredMembership) {
    // Unescaped like any other text: when there is no ##TYPES section these
    // headers name the collections rather than merely labelling the columns.
    const colHeaders = legacyRows[0].slice(1).map(h => unescapeFormula(h.trim()))
    // With a ##TYPES section present, columns are matched to it by position and
    // the headers are read as human-readable labels only; without one, the
    // header names the collection.
    const declared = [...collectionsByName.values()]
    const usePositional = sections['TYPES'] !== undefined || sections['COLLECTIONS'] !== undefined

    const colCollections: (Collection | null)[] = colHeaders.map((header, i) => {
      if (!header) return null
      return usePositional ? declared[i] ?? null : ensureCollection(header)
    })

    for (const row of legacyRows.slice(1)) {
      const elName = tc(row[0])
      if (!elName) continue
      const el = ensureElement(elName)

      for (let j = 0; j < colHeaders.length; j++) {
        const collection = colCollections[j]
        if (!collection) continue
        const cellVal = row[j + 1]?.trim()
        if (!cellVal) continue
        const v = parseFloat(cellVal)
        if (isNaN(v)) {
          warnings.push(`Collection membership: "${elName}" × "${colHeaders[j]}": "${cellVal}" is not a number — skipped.`)
        } else if (v >= MEMBERSHIP_CUTOFF && !el.collectionIds.includes(collection.id)) {
          el.collectionIds.push(collection.id)
        }
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
    // Same reason as above: without a ##DIMENSIONS section these headers are
    // the dimension names, not just labels for columns matched by position.
    const colHeaders = dimScoreRows[0].slice(1).map(h => unescapeFormula(h.trim()))
    const dimList = [...dimensionsByName.values()]
    const usePositional = sections['DIMENSIONS'] !== undefined

    const colDims: (Dimension | null)[] = colHeaders.map((header, i) => {
      if (!header) return null
      if (usePositional) return dimList[i] ?? null
      if (!dimensionsByName.has(header)) {
        const derived = parsePoles(header)
        const dim: Dimension = {
          id: crypto.randomUUID(), label: header, poleA: derived.poleA, poleB: derived.poleB,
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
    collections: [...collectionsByName.values()],
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
  const rows = splitLines(text).map(l => l.split(sep))

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

  // Folded rather than spread. `Math.max(...values)` passes every score as a
  // separate argument, which overflows the call stack somewhere around a
  // hundred thousand of them — a crash that scales with the user's own data,
  // not with anything hostile.
  let maxVal = -Infinity
  let minVal = Infinity
  for (const row of rawScores) {
    for (const value of row) {
      if (value === null) continue
      if (value > maxVal) maxVal = value
      if (value < minVal) minVal = value
    }
  }
  if (!Number.isFinite(maxVal)) { maxVal = 1; minVal = 0 }

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
    id: crypto.randomUUID(), name, definition: elementDefinitions[i] ?? '', weight: 1,
    color: DEFAULT_ELEMENT_COLOR, shape: 'circle' as const, collectionIds: []
  }))

  const dimensions: Dimension[] = dimLabels.map(label => {
    const { poleA, poleB } = parsePoles(label)
    return { id: crypto.randomUUID(), label, poleA, poleB, definition: '', weight: 1, categories: defaultCategories() }
  })

  const scores: ScoreMap = {}
  for (let i = 0; i < elements.length; i++) {
    scores[elements[i].id] = {}
    for (let j = 0; j < dimensions.length; j++) {
      const v = normalizedScores[i]?.[j]
      if (v !== null && v !== undefined) scores[elements[i].id][dimensions[j].id] = v
    }
  }

  return { sessionMeta: defaultSessionMeta(), elements, collections: [], dimensions, scores, scaleNote, warnings }
}

// ── Section splitter ──────────────────────────────────────────────────────────
//
// Splits a ##SECTION-formatted document into a map of section name → rows.
// Blank lines between sections are skipped. Content before the first ## is ignored.

function splitSections(text: string): Record<string, string[][]> {
  const result: Record<string, string[][]> = {}
  let currentName: string | null = null
  let currentRows: string[][] = []

  for (const line of splitLines(text)) {
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
