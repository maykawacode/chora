// ── Parser migration tests ────────────────────────────────────────────────────
//
// Exercised against the real sessions in Data/, not fixtures: the 4.0 → 5.0
// change moves membership out of the score map, and the only convincing proof
// it does so faithfully is running it over files that were actually authored by
// hand. Fixtures would only ever contain the cases we already thought of.
//
// If Data/ is empty or missing the suite skips rather than fails — it is the
// author's working folder, not a committed fixture set.

import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { deserializeSession, serializeSession } from './parser'

const DATA_DIR = resolve(process.cwd(), '../Data')

const sessionFiles = existsSync(DATA_DIR)
  ? readdirSync(DATA_DIR).filter(f => f.endsWith('.mtda'))
  : []

describe('4.0 → 5.0 membership migration', () => {
  if (sessionFiles.length === 0) {
    it.skip('no .mtda files in Data/ to migrate', () => {})
    return
  }

  for (const file of sessionFiles) {
    describe(file, () => {
      const json = readFileSync(resolve(DATA_DIR, file), 'utf8')
      const raw = JSON.parse(json)
      const state = deserializeSession(json)

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

      it('carries over exactly the memberships that scored >= 0.5', () => {
        // Recomputed straight off the raw JSON rather than trusting the
        // parser's own bookkeeping, so a bug in liftMemberships cannot also
        // supply the expectation it is checked against.
        const rawCollections = (raw.collections ?? raw.types ?? []) as Array<{ id: string }>
        for (const el of state.elements) {
          const row = (raw.scores?.[el.id] ?? {}) as Record<string, number>
          const expected = rawCollections
            .filter(c => (row[c.id] ?? 0) >= 0.5)
            .map(c => c.id)
          expect(el.collectionIds).toEqual(expected)
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
