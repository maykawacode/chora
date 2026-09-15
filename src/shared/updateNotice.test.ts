import { describe, it, expect } from 'vitest'
import { parseUpdateNotice } from './updateNotice'

const CURRENT = '0.1.0-beta.6'

const VALID = {
  schema: 1,
  id: '2026-09-20-beta7',
  maxVersion: '0.1.0-beta.6',
  title: 'Update available',
  detail: 'Version 0.1.0-beta.7 is ready.',
  url: 'https://github.com/maykawacode/chora/releases'
}

const notice = (overrides: Record<string, unknown> = {}): string =>
  JSON.stringify({ ...VALID, ...overrides })

describe('parseUpdateNotice', () => {
  it('accepts a well-formed notice addressed to this build', () => {
    expect(parseUpdateNotice(notice(), CURRENT)).toEqual({
      id: '2026-09-20-beta7',
      title: 'Update available',
      detail: 'Version 0.1.0-beta.7 is ready.',
      url: 'https://github.com/maykawacode/chora/releases'
    })
  })

  it('treats detail as optional', () => {
    const parsed = parseUpdateNotice(notice({ detail: undefined }), CURRENT)
    expect(parsed?.detail).toBe('')
  })

  it('trims surrounding whitespace from copy', () => {
    const parsed = parseUpdateNotice(notice({ title: '  Update available  ' }), CURRENT)
    expect(parsed?.title).toBe('Update available')
  })

  // ── Nothing at all ──────────────────────────────────────────────────────────

  it('returns null for an empty or missing body', () => {
    expect(parseUpdateNotice('', CURRENT)).toBeNull()
    expect(parseUpdateNotice('   ', CURRENT)).toBeNull()
  })

  it('returns null for malformed JSON', () => {
    expect(parseUpdateNotice('{"schema": 1,', CURRENT)).toBeNull()
    expect(parseUpdateNotice('<!DOCTYPE html>', CURRENT)).toBeNull()
  })

  it('returns null for JSON that is not an object', () => {
    expect(parseUpdateNotice('[]', CURRENT)).toBeNull()
    expect(parseUpdateNotice('null', CURRENT)).toBeNull()
    expect(parseUpdateNotice('"update"', CURRENT)).toBeNull()
    expect(parseUpdateNotice('42', CURRENT)).toBeNull()
  })

  it('returns null for a retired notice', () => {
    expect(parseUpdateNotice('{"schema": 1}', CURRENT)).toBeNull()
  })

  // ── Schema ──────────────────────────────────────────────────────────────────

  it('refuses a schema this build does not understand', () => {
    expect(parseUpdateNotice(notice({ schema: 2 }), CURRENT)).toBeNull()
    expect(parseUpdateNotice(notice({ schema: '1' }), CURRENT)).toBeNull()
    expect(parseUpdateNotice(notice({ schema: undefined }), CURRENT)).toBeNull()
  })

  // ── Version window ──────────────────────────────────────────────────────────

  it('hides a notice from builds above maxVersion', () => {
    expect(parseUpdateNotice(notice(), '0.1.0-beta.7')).toBeNull()
    expect(parseUpdateNotice(notice(), '1.0.0')).toBeNull()
  })

  it('shows a notice to builds at or below maxVersion', () => {
    expect(parseUpdateNotice(notice(), '0.1.0-beta.6')).not.toBeNull()
    expect(parseUpdateNotice(notice(), '0.1.0-beta.2')).not.toBeNull()
  })

  it('honours an inclusive minVersion', () => {
    const banded = notice({ minVersion: '0.1.0-beta.4', maxVersion: '0.1.0-beta.6' })
    expect(parseUpdateNotice(banded, '0.1.0-beta.3')).toBeNull()
    expect(parseUpdateNotice(banded, '0.1.0-beta.4')).not.toBeNull()
    expect(parseUpdateNotice(banded, '0.1.0-beta.6')).not.toBeNull()
    expect(parseUpdateNotice(banded, '0.1.0-beta.7')).toBeNull()
  })

  it('reaches every build when no bounds are given', () => {
    const unbounded = notice({ maxVersion: undefined })
    expect(parseUpdateNotice(unbounded, '0.0.1')).not.toBeNull()
    expect(parseUpdateNotice(unbounded, '9.9.9')).not.toBeNull()
  })

  // A typo in a bound must silence the notice, not broadcast it to everyone.
  it('refuses a bound it cannot parse', () => {
    expect(parseUpdateNotice(notice({ maxVersion: 'v0.1.0-beta.6' }), CURRENT)).toBeNull()
    expect(parseUpdateNotice(notice({ maxVersion: 6 }), CURRENT)).toBeNull()
    expect(parseUpdateNotice(notice({ minVersion: 'latest' }), CURRENT)).toBeNull()
  })

  it('refuses to guess when the running version is unreadable', () => {
    expect(parseUpdateNotice(notice(), 'unknown')).toBeNull()
  })

  // ── URL ─────────────────────────────────────────────────────────────────────

  it('refuses a url that is not https', () => {
    expect(parseUpdateNotice(notice({ url: 'http://github.com/maykawacode/chora' }), CURRENT)).toBeNull()
    expect(parseUpdateNotice(notice({ url: 'file:///etc/passwd' }), CURRENT)).toBeNull()
    expect(parseUpdateNotice(notice({ url: 'javascript:alert(1)' }), CURRENT)).toBeNull()
  })

  it('refuses a url off the allowed host', () => {
    expect(parseUpdateNotice(notice({ url: 'https://example.com/chora' }), CURRENT)).toBeNull()
    expect(parseUpdateNotice(notice({ url: 'https://github.com.example.com/x' }), CURRENT)).toBeNull()
    expect(parseUpdateNotice(notice({ url: 'https://raw.githubusercontent.com/x' }), CURRENT)).toBeNull()
  })

  it('refuses a url that is not a url', () => {
    expect(parseUpdateNotice(notice({ url: 'github.com/maykawacode/chora' }), CURRENT)).toBeNull()
    expect(parseUpdateNotice(notice({ url: '' }), CURRENT)).toBeNull()
    expect(parseUpdateNotice(notice({ url: 42 }), CURRENT)).toBeNull()
  })

  // ── Copy ────────────────────────────────────────────────────────────────────

  it('requires an id and a title', () => {
    expect(parseUpdateNotice(notice({ id: undefined }), CURRENT)).toBeNull()
    expect(parseUpdateNotice(notice({ id: '   ' }), CURRENT)).toBeNull()
    expect(parseUpdateNotice(notice({ title: undefined }), CURRENT)).toBeNull()
    expect(parseUpdateNotice(notice({ title: '' }), CURRENT)).toBeNull()
    expect(parseUpdateNotice(notice({ title: 12 }), CURRENT)).toBeNull()
  })

  it('rejects copy that would overflow the panel', () => {
    expect(parseUpdateNotice(notice({ title: 'x'.repeat(81) }), CURRENT)).toBeNull()
    expect(parseUpdateNotice(notice({ detail: 'x'.repeat(301) }), CURRENT)).toBeNull()
    expect(parseUpdateNotice(notice({ id: 'x'.repeat(201) }), CURRENT)).toBeNull()
  })

  it('accepts copy exactly at the limit', () => {
    expect(parseUpdateNotice(notice({ title: 'x'.repeat(80) }), CURRENT)).not.toBeNull()
    expect(parseUpdateNotice(notice({ detail: 'x'.repeat(300) }), CURRENT)).not.toBeNull()
  })

  it('ignores unexpected extra keys', () => {
    expect(parseUpdateNotice(notice({ severity: 'critical', force: true }), CURRENT)).not.toBeNull()
  })
})
