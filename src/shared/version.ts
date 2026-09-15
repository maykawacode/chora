// ── Version comparison ────────────────────────────────────────────────────────
//
// Chora ships prereleases for long stretches, so "is this build older than
// that one" cannot be a string comparison: '0.1.0-beta.10' sorts before
// '0.1.0-beta.6' alphabetically and after it in fact. The rules implemented
// here are semver's ordering rules, and only those — this is not a parser for
// ranges, and nothing outside update notices needs one.
//
// Kept dependency-free and unit-tested rather than pulling in `semver`, in
// keeping with windowGeometry.ts and numericRange.ts.

interface ParsedVersion {
  release: [number, number, number]
  /** Dot-separated prerelease identifiers; empty means a final release. */
  prerelease: string[]
}

const VERSION = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/

/**
 * Reads 'major.minor.patch' with an optional '-prerelease' tail, or null if
 * the string is not that. Build metadata after '+' is accepted and discarded:
 * semver says it takes no part in ordering.
 */
export function parseVersion(raw: string): ParsedVersion | null {
  if (typeof raw !== 'string') return null
  const match = VERSION.exec(raw.trim())
  if (!match) return null

  const prerelease = match[4] ? match[4].split('.') : []
  // '1.0.0-' and '1.0.0-beta..1' both reach here with an empty identifier,
  // which semver disallows and which would otherwise compare as a number.
  if (prerelease.some(identifier => identifier === '')) return null

  return {
    release: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease
  }
}

const NUMERIC = /^\d+$/

/** Compares one prerelease identifier pair by semver's rules. */
function compareIdentifiers(a: string, b: string): number {
  const aNumeric = NUMERIC.test(a)
  const bNumeric = NUMERIC.test(b)

  // Numeric identifiers compare numerically — this is the rule that puts
  // beta.6 before beta.10 — and always rank below alphanumeric ones.
  if (aNumeric && bNumeric) return Math.sign(Number(a) - Number(b))
  if (aNumeric) return -1
  if (bNumeric) return 1
  return a < b ? -1 : a > b ? 1 : 0
}

/**
 * -1 if `a` is older than `b`, 1 if newer, 0 if equal.
 *
 * Returns null when either string is not a version. Callers get an explicit
 * "cannot tell" rather than a silent ordering against a made-up 0.0.0, because
 * every caller here is deciding whether to show something to a user and should
 * decline when the answer is unknown.
 */
export function compareVersions(a: string, b: string): number | null {
  const left = parseVersion(a)
  const right = parseVersion(b)
  if (!left || !right) return null

  for (let index = 0; index < 3; index++) {
    const difference = Math.sign(left.release[index] - right.release[index])
    if (difference !== 0) return difference
  }

  // A prerelease is older than the release it leads to: 1.0.0-beta.1 < 1.0.0.
  if (left.prerelease.length === 0 && right.prerelease.length === 0) return 0
  if (left.prerelease.length === 0) return 1
  if (right.prerelease.length === 0) return -1

  const shared = Math.min(left.prerelease.length, right.prerelease.length)
  for (let index = 0; index < shared; index++) {
    const difference = compareIdentifiers(left.prerelease[index], right.prerelease[index])
    if (difference !== 0) return difference
  }

  // All shared identifiers matched; the longer prerelease is the later one.
  return Math.sign(left.prerelease.length - right.prerelease.length)
}
