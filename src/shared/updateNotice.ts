// ── Update notice ─────────────────────────────────────────────────────────────
//
// Chora asks GitHub once per launch whether there is a message for the version
// being run. The message is a JSON file edited by hand in the repository, so
// this module's job is to decide whether what came back is a notice at all,
// and whether it is addressed to this build.
//
// Everything here treats the payload as untrusted. The realistic threat is not
// an attacker but a mistyped line in the GitHub web editor at midnight: the
// text reaches a dialog and the URL is handed to the operating system, so a
// malformed field must yield nothing at all rather than a broken dialog or a
// link somewhere unintended.
//
// Pure functions, no Electron import, so the whole trust boundary is testable.

import { compareVersions } from './version'

export interface UpdateNotice {
  /** Dismissal key. Cancelling stores it; that notice never appears again. */
  id: string
  title: string
  detail: string
  url: string
}

/** The only payload shape this build understands. */
const SUPPORTED_SCHEMA = 1

/**
 * The panel's text budget. Over-long copy is rejected rather than truncated:
 * a sentence cut in half looks like a bug and tells the author nothing, while
 * a rejected notice shows nothing and is caught the first time it is tested.
 */
const MAX_ID_LENGTH = 200
const MAX_TITLE_LENGTH = 80
const MAX_DETAIL_LENGTH = 300

/**
 * The one host a notice may send someone to.
 *
 * Deliberately exact — not subdomains, and not the project domain that will
 * serve the downloads inbox. `shell.openExternal` launches whatever the OS has
 * registered, and windowSecurity.ts already refuses non-https; this narrows
 * the remaining surface to the repository itself. Widening it later is a
 * one-line change.
 */
const ALLOWED_HOST = 'github.com'

/** A non-empty string no longer than `max`, or null for anything else. */
function readText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > max) return null
  return trimmed
}

/** An https URL on the allowed host, or null. */
function readUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value.trim())
    if (url.protocol !== 'https:') return null
    if (url.hostname !== ALLOWED_HOST) return null
    return url.href
  } catch {
    return null
  }
}

/**
 * True if `current` sits inside the notice's optional version window.
 *
 * Both bounds are inclusive. A bound that is present but unparseable fails the
 * check rather than being ignored — a typo in `maxVersion` should silence the
 * notice, not broadcast it to every version there is.
 */
function isAddressedTo(current: string, min: unknown, max: unknown): boolean {
  if (min !== undefined && min !== null) {
    if (typeof min !== 'string') return false
    const order = compareVersions(current, min)
    if (order === null || order < 0) return false
  }
  if (max !== undefined && max !== null) {
    if (typeof max !== 'string') return false
    const order = compareVersions(current, max)
    if (order === null || order > 0) return false
  }
  return true
}

/**
 * Turns the fetched body into a notice for this build, or null.
 *
 * Null is the answer for every kind of nothing: no file, an empty file, a
 * retired notice, a malformed one, and a valid one aimed at other versions.
 * The caller does not distinguish between them, and the user never sees the
 * difference.
 */
export function parseUpdateNotice(rawJson: string, currentVersion: string): UpdateNotice | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawJson)
  } catch {
    return null
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null
  const raw = parsed as Record<string, unknown>

  // An unknown schema means a later build changed the format. Showing nothing
  // is the correct behavior for an old build that cannot read the new shape.
  if (raw.schema !== SUPPORTED_SCHEMA) return null

  if (!isAddressedTo(currentVersion, raw.minVersion, raw.maxVersion)) return null

  const id = readText(raw.id, MAX_ID_LENGTH)
  const title = readText(raw.title, MAX_TITLE_LENGTH)
  const url = readUrl(raw.url)
  if (!id || !title || !url) return null

  // Detail is the one optional field: a title and a link can be the whole
  // message. An over-long detail is still a rejection, not an empty string.
  let detail = ''
  if (raw.detail !== undefined && raw.detail !== null) {
    const read = readText(raw.detail, MAX_DETAIL_LENGTH)
    if (read === null && raw.detail !== '') return null
    detail = read ?? ''
  }

  return { id, title, detail, url }
}
