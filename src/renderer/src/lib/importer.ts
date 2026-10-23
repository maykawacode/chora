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
//   ##SESSION        — Name, Definition, Notes (key/value rows)
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
import { ELEMENT_SHAPES, defaultSessionMeta, newCollection, newDimension, newElement, parsePoles } from './types'
import { MEMBERSHIP_CUTOFF } from './parser'
import { COLLECTION_SEPARATOR, isFormulaEscaped } from './exporter'
import { openWeight } from './numericRange'
import { DEFAULT_COLLECTION_COLOR, DEFAULT_ELEMENT_COLOR, readHexColor } from './color'
import { foldIntentIntoNotes } from './sessionIntent'

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

/**
 * Reads a section's rows by column name. The header is matched case-blind;
 * `key` names the column that identifies each row and falls back to the
 * first column. A missing column reads as an empty cell.
 */
function table(rows: string[][], key: string): { key: (row: string[]) => string; get: (row: string[], name: string) => string; rows: string[][] } {
  const header = (rows[0] ?? []).map(h => h.trim().toLowerCase())
  const keyCol = Math.max(0, header.indexOf(key))
  return {
    key: row => tc(row[keyCol]),
    get: (row, name) => header.includes(name) ? tc(row[header.indexOf(name)]) : '',
    rows: rows.slice(1)
  }
}

/** A weight cell: blank means the default of 1. */
function readWeight(cell: string): number {
  return cell === '' ? 1 : openWeight(Number(cell), 1)
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
  const sessionMeta: SessionMeta = { id: crypto.randomUUID(), name: '', definition: '', notes: '' }
  if (sessionRows.length >= 2) {
    const hdr  = sessionRows[0].map(h => h.trim().toLowerCase())
    const data = sessionRows[1]
    const nameCol  = Math.max(0, hdr.indexOf('name'))
    // definition lives in the first column that isn't 'name'
    const defCol   = hdr.findIndex((h, i) => i !== nameCol && h !== '')
    // named explicitly, unlike defCol's positional fallback, so adding this
    // column can't be mistaken for the definition column above
    const notesCol = hdr.indexOf('notes')
    sessionMeta.name       = tc(data[nameCol])
    sessionMeta.definition = defCol   >= 0 ? tc(data[defCol])   : ''
    sessionMeta.notes      = notesCol >= 0 ? tc(data[notesCol]) : ''
  }
  // An imported Intent moves into Notes, as when a study file opens.
  Object.assign(sessionMeta, foldIntentIntoNotes(sessionMeta))

  // ── Collections ────────────────────────────────────────────────────────────
  // Parsed before elements so an element's Collections cell can be resolved
  // against the declared set. ##TYPES is the pre-binary name for this section.
  const collectionsByName = new Map<string, Collection>()

  const collectionTable = table(sections['COLLECTIONS'] ?? sections['TYPES'] ?? [], 'name')
  for (const row of collectionTable.rows) {
    const name = collectionTable.key(row)
    if (!name) continue
    collectionsByName.set(name, newCollection(name, {
      definition: collectionTable.get(row, 'definition'),
      color:      readHexColor(collectionTable.get(row, 'color'), DEFAULT_COLLECTION_COLOR)
    }))
  }

  // A collection named anywhere in the file. Created on demand so a spreadsheet
  // can introduce one just by typing it in an element's Collections cell,
  // without also having to add a ##COLLECTIONS row for it.
  function ensureCollection(name: string): Collection {
    const existing = collectionsByName.get(name)
    if (existing) return existing
    const created = newCollection(name)
    collectionsByName.set(name, created)
    return created
  }

  // ── Elements ───────────────────────────────────────────────────────────────
  const elementsByName = new Map<string, Element>()

  const elementTable = table(sections['ELEMENTS'] ?? [], 'name')
  for (const row of elementTable.rows) {
    const name = elementTable.key(row)
    if (!name) continue
    const shape = elementTable.get(row, 'shape') as Element['shape']
    elementsByName.set(name, newElement(name, {
      definition: elementTable.get(row, 'definition'),
      color:      readHexColor(elementTable.get(row, 'color'), DEFAULT_ELEMENT_COLOR),
      weight:     readWeight(elementTable.get(row, 'weight')),
      shape:      ELEMENT_SHAPES.includes(shape) ? shape : 'circle',
      collectionIds: elementTable.get(row, 'collections')
        .split(COLLECTION_SEPARATOR)
        // Each name carries its own escaping: tc() only unescaped the start
        // of the joined cell, not the names after the separator.
        .map(n => unescapeFormula(n.trim()))
        .filter(n => n !== '')
        .map(n => ensureCollection(n).id)
    }))
  }

  // ── Dimensions ─────────────────────────────────────────────────────────────
  const dimensionsByName = new Map<string, Dimension>()

  const dimensionTable = table(sections['DIMENSIONS'] ?? [], 'label')
  for (const row of dimensionTable.rows) {
    const label = dimensionTable.key(row)
    if (!label) continue
    const derived = parsePoles(label)
    dimensionsByName.set(label, newDimension(label, {
      poleA:      dimensionTable.get(row, 'pole a') || derived.poleA,
      poleB:      dimensionTable.get(row, 'pole b') || derived.poleB,
      definition: dimensionTable.get(row, 'definition'),
      weight:     readWeight(dimensionTable.get(row, 'weight'))
    }))
  }

  const scores: ScoreMap = {}

  function ensureElement(name: string): Element {
    if (!elementsByName.has(name)) elementsByName.set(name, newElement(name))
    return elementsByName.get(name)!
  }

  /**
   * Reads an element × column matrix of numbers: `columns` resolves each
   * column to its target (or null to skip it), and `apply` receives each
   * numeric cell. Rows name their element in the first cell; a blank cell is
   * skipped and a non-number is reported under `section`.
   */
  function readMatrix<T>(
    rows: string[][],
    section: string,
    columns: (headers: string[]) => (T | null)[],
    apply: (element: Element, target: T, value: number) => void,
    onRow: (element: Element) => void = () => {}
  ): void {
    if (rows.length < 2) return
    // Unescaped like any other text: without a declaring section these
    // headers name what they hold rather than merely labelling the columns.
    const headers = rows[0].slice(1).map(h => unescapeFormula(h.trim()))
    const targets = columns(headers)
    for (const row of rows.slice(1)) {
      const elName = tc(row[0])
      if (!elName) continue
      const el = ensureElement(elName)
      onRow(el)
      for (let j = 0; j < headers.length; j++) {
        const target = targets[j]
        const cell = row[j + 1]?.trim()
        if (!target || !cell) continue
        const v = parseFloat(cell)
        if (isNaN(v)) warnings.push(`${section}: "${elName}" × "${headers[j]}": "${cell}" is not a number — skipped.`)
        else apply(el, target, v)
      }
    }
  }

  // ── Legacy membership matrix ───────────────────────────────────────────────
  // Files exported before membership became binary carry a ##TYPE_SCORES matrix
  // of 0–1 values instead of a Collections column. A cell at or above
  // MEMBERSHIP_CUTOFF is read as membership and everything below it is dropped,
  // the same conversion applied to pre-5.0 .mtda files.
  //
  // Skipped entirely when the elements already declared their collections, so a
  // hand-edited file that carries both is not overruled by the older section.
  const declaredMembership = [...elementsByName.values()].some(el => el.collectionIds.length > 0)
  if (!declaredMembership) {
    // With a ##TYPES section present, columns are matched to it by position
    // and the headers are read as labels only; without one, the header names
    // the collection.
    const declared = [...collectionsByName.values()]
    const usePositional = sections['TYPES'] !== undefined || sections['COLLECTIONS'] !== undefined
    readMatrix<Collection>(sections['TYPE_SCORES'] ?? [], 'Collection membership',
      headers => headers.map((header, i) => !header ? null : usePositional ? declared[i] ?? null : ensureCollection(header)),
      (el, collection, v) => {
        if (v >= MEMBERSHIP_CUTOFF && !el.collectionIds.includes(collection.id)) el.collectionIds.push(collection.id)
      })
  }

  // ── Dimension scores ───────────────────────────────────────────────────────
  // When ##DIMENSIONS was present, columns are matched to dimensions by position
  // (N→N). Column headers are treated as human-readable labels only, so the user
  // can use short names in the score matrix without breaking the import.
  // When ##DIMENSIONS was absent, fall back to name-based find-or-create.
  const dimList = [...dimensionsByName.values()]
  const dimPositional = sections['DIMENSIONS'] !== undefined
  readMatrix<Dimension>(sections['DIMENSION_SCORES'] ?? [], 'Dimension scores',
    headers => headers.map((header, i) => {
      if (!header) return null
      if (dimPositional) return dimList[i] ?? null
      if (!dimensionsByName.has(header)) dimensionsByName.set(header, newDimension(header))
      return dimensionsByName.get(header)!
    }),
    (el, dim, v) => { scores[el.id][dim.id] = Math.max(0, Math.min(1, v)) },
    el => { scores[el.id] = scores[el.id] ?? {} })

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

  const elements = elementNames.map((name, i) => newElement(name, { definition: elementDefinitions[i] ?? '' }))
  const dimensions = dimLabels.map(label => newDimension(label))

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
