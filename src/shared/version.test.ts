import { describe, it, expect } from 'vitest'
import { compareVersions, parseVersion } from './version'

describe('parseVersion', () => {
  it('reads a plain release', () => {
    expect(parseVersion('1.2.3')).toEqual({ release: [1, 2, 3], prerelease: [] })
  })

  it('reads a prerelease tail', () => {
    expect(parseVersion('0.1.0-beta.6')).toEqual({ release: [0, 1, 0], prerelease: ['beta', '6'] })
  })

  it('accepts and discards build metadata', () => {
    expect(parseVersion('1.0.0+20260914')).toEqual({ release: [1, 0, 0], prerelease: [] })
  })

  it('tolerates surrounding whitespace', () => {
    expect(parseVersion('  1.0.0  ')).toEqual({ release: [1, 0, 0], prerelease: [] })
  })

  it('rejects anything that is not major.minor.patch', () => {
    for (const raw of ['', '1', '1.0', 'v1.0.0', '1.0.0.0', 'beta', '1.0.x', '-1.0.0']) {
      expect(parseVersion(raw), raw).toBeNull()
    }
  })

  it('rejects empty prerelease identifiers', () => {
    expect(parseVersion('1.0.0-')).toBeNull()
    expect(parseVersion('1.0.0-beta..1')).toBeNull()
  })
})

describe('compareVersions', () => {
  it('orders by major, then minor, then patch', () => {
    expect(compareVersions('2.0.0', '1.9.9')).toBe(1)
    expect(compareVersions('1.2.0', '1.1.9')).toBe(1)
    expect(compareVersions('1.1.1', '1.1.2')).toBe(-1)
    expect(compareVersions('1.1.1', '1.1.1')).toBe(0)
  })

  it('treats double-digit release numbers numerically', () => {
    expect(compareVersions('1.10.0', '1.9.0')).toBe(1)
  })

  // The reason this module exists: a string compare puts beta.10 before beta.6.
  it('orders numeric prerelease identifiers numerically', () => {
    expect(compareVersions('0.1.0-beta.10', '0.1.0-beta.6')).toBe(1)
    expect(compareVersions('0.1.0-beta.6', '0.1.0-beta.10')).toBe(-1)
    expect(compareVersions('0.1.0-beta.6', '0.1.0-beta.6')).toBe(0)
  })

  it('ranks a prerelease below the release it leads to', () => {
    expect(compareVersions('1.0.0-beta.1', '1.0.0')).toBe(-1)
    expect(compareVersions('1.0.0', '1.0.0-beta.1')).toBe(1)
  })

  it('ranks numeric identifiers below alphanumeric ones', () => {
    expect(compareVersions('1.0.0-1', '1.0.0-alpha')).toBe(-1)
  })

  it('orders alphanumeric identifiers lexically', () => {
    expect(compareVersions('1.0.0-alpha', '1.0.0-beta')).toBe(-1)
    expect(compareVersions('1.0.0-rc', '1.0.0-beta')).toBe(1)
  })

  it('ranks a longer prerelease above a shorter prefix of it', () => {
    expect(compareVersions('1.0.0-beta.1', '1.0.0-beta')).toBe(1)
  })

  it('walks the full semver ordering example', () => {
    const ordered = [
      '1.0.0-alpha', '1.0.0-alpha.1', '1.0.0-alpha.beta',
      '1.0.0-beta', '1.0.0-beta.2', '1.0.0-beta.11',
      '1.0.0-rc.1', '1.0.0'
    ]
    for (let index = 0; index < ordered.length - 1; index++) {
      expect(compareVersions(ordered[index], ordered[index + 1]), `${ordered[index]} < ${ordered[index + 1]}`).toBe(-1)
    }
  })

  it('returns null rather than guessing when either side is unparseable', () => {
    expect(compareVersions('not-a-version', '1.0.0')).toBeNull()
    expect(compareVersions('1.0.0', '')).toBeNull()
  })
})
