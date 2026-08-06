// ── Parser migration tests ────────────────────────────────────────────────────
//
// Exercised against the real sessions in Data/, not fixtures: the 4.0 → 5.0
// change moves membership out of the score map, and the only convincing proof
// it does so faithfully is running it over files that were actually authored by
// hand. Fixtures would only ever contain the cases we already thought of.
//
// If Data/ is empty or missing the suite skips rather than fails — it is the
// author's working folder, not a committed fixture set.
//
// Because it is the working folder, it fills up with 5.0 files as soon as the
// app can write them — every save lands one there. So the version each file
// declares decides what is being asserted, rather than every file being treated
// as a 4.0 waiting to be migrated:
//
//   4.0 — memberships must be derived from the score map at the 0.5 threshold
//   5.0 — already migrated; memberships must survive a re-read untouched
//
// Both cases share everything else, including the invariant that matters most
// (no collection ever appears as a key in the score map).

import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { deserializeSession, serializeSession } from './parser'

const DATA_DIR = resolve(process.cwd(), '../Data')

const sessionFiles = existsSync(DATA_DIR)
  ? readdirSync(DATA_DIR).filter(f => f.endsWith('.mtda'))
  : []

describe('Weight parsing', () => {
  it('preserves open-ended Element and Dimension weights', () => {
    const state = deserializeSession(JSON.stringify({
      version: '5.0',
      elements: [
        { id: 'light', name: 'Light', weight: 0 },
        { id: 'heavy', name: 'Heavy', weight: 275 }
      ],
      collections: [],
      dimensions: [
        { id: 'minor', label: 'Minor–Major', weight: 0 },
        { id: 'major', label: 'Near–Far', weight: 480 }
      ],
      scores: {}, maps: []
    }))

    expect(state.elements.map(element => element.weight)).toEqual([0, 275])
    expect(state.dimensions.map(dimension => dimension.weight)).toEqual([0, 480])
  })
})

describe('4.0 → 5.0 membership migration', () => {
  if (sessionFiles.length === 0) {
    it.skip('no .mtda files in Data/ to migrate', () => {})
    return
  }

  for (const file of sessionFiles) {
    const rawVersion = (JSON.parse(readFileSync(resolve(DATA_DIR, file), 'utf8')).version ?? '4.0') as string

    // Version is in the describe title so the report says which contract each
    // file was held to. A 4.0-only assertion quietly not running is otherwise
    // indistinguishable from one that ran and passed.
    describe(`${file} (${rawVersion})`, () => {
      const json = readFileSync(resolve(DATA_DIR, file), 'utf8')
      const raw = JSON.parse(json)
      const state = deserializeSession(json)

      const isLegacy = rawVersion !== '5.0'
      const collectionIds = new Set(state.collections.map(c => c.id))

      it('parses', () => {
        expect(state.elements.length).toBeGreaterThanOrEqual(0)
      })

      it('leaves no collection keys behind in the score map', () => {
        for (const row of Object.values(state.scores)) {
          for (const key of Object.keys(row)) {
            expect(collectionIds.has(key)).toBe(false)
          }
        }
      })

      it('assigns only memberships that name a real collection', () => {
        for (const el of state.elements) {
          for (const id of el.collectionIds) {
            expect(collectionIds.has(id)).toBe(true)
          }
        }
      })

      // Both expectations below are recomputed straight off the raw JSON rather
      // than trusting the parser's own bookkeeping, so a bug in the migration
      // cannot also supply the expectation it is checked against.

      it.runIf(isLegacy)('carries over exactly the memberships that scored >= 0.5', () => {
        const rawCollections = (raw.collections ?? raw.types ?? []) as Array<{ id: string }>
        for (const el of state.elements) {
          const row = (raw.scores?.[el.id] ?? {}) as Record<string, number>
          const expected = rawCollections
            .filter(c => (row[c.id] ?? 0) >= 0.5)
            .map(c => c.id)
          expect(el.collectionIds).toEqual(expected)
        }
      })

      // The 5.0 counterpart. Re-reading an already-migrated file must not touch
      // membership at all — running the 0.5 lift a second time would find an
      // empty score map and silently strip every element back to no
      // collections, which is precisely the bug this guards.
      it.runIf(!isLegacy)('leaves an already-migrated file\'s memberships alone', () => {
        const rawElements = (raw.elements ?? []) as Array<{ id: string; collectionIds?: string[] }>
        for (const el of state.elements) {
          const before = rawElements.find(e => e.id === el.id)?.collectionIds ?? []
          expect(el.collectionIds).toEqual(before)
        }
      })

      it('preserves every dimension score', () => {
        for (const dim of state.dimensions) {
          for (const el of state.elements) {
            const before = (raw.scores?.[el.id] ?? {})[dim.id]
            expect(state.scores[el.id]?.[dim.id]).toBe(before)
          }
        }
      })

      it('drops threshold and keeps a blob selection on every cartesian map', () => {
        for (const map of state.maps) {
          if (map.type !== 'cartesian') continue
          expect(map).not.toHaveProperty('threshold')
          expect(Array.isArray(map.shownCollectionIds)).toBe(true)
        }
      })

      // The collection selection became a field of every map. A semantic map
      // written before that has none, and must load with an empty one rather
      // than undefined — the sidebar and painter both index into it — and
      // specifically empty, since inventing a selection would recolor a map
      // the user never asked to have recolored.
      it('gives every semantic map an empty selection when the file predates it', () => {
        const rawMaps = (raw.maps ?? []) as Array<Record<string, unknown>>
        for (const map of state.maps) {
          if (map.type !== 'semantic') continue
          expect(Array.isArray(map.shownCollectionIds)).toBe(true)
          const before = rawMaps.find(m => m.id === map.id)?.shownCollectionIds
          if (before === undefined) expect(map.shownCollectionIds).toEqual([])
        }
      })

      it('round-trips through 5.0 without drift', () => {
        // The property that makes saving safe: reading a file we just wrote has
        // to be a no-op, or memberships would decay a little on every save.
        const reparsed = deserializeSession(serializeSession(state))
        expect(reparsed.elements).toEqual(state.elements)
        expect(reparsed.collections).toEqual(state.collections)
        expect(reparsed.scores).toEqual(state.scores)
        expect(reparsed.maps).toEqual(state.maps)
      })
    })
  }
})
