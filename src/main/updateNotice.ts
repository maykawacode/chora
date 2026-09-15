// ── Update notice fetch (main process) ────────────────────────────────────────
//
// Asks GitHub once per launch whether there is a message for this build. The
// answer is a static JSON file in the repository, edited by hand; see
// shared/updateNotice.ts for the format and for every check applied to it.
//
// The fetch lives in main rather than the renderer for two reasons. It can
// start during app.whenReady(), in parallel with window creation, so the
// answer is usually waiting by the time the renderer asks for it; and it keeps
// the renderer free of network access, which is the direction the parked
// P7-01/P7-02 hardening work is heading.
//
// Every failure resolves to null in silence. A user with no network, a captive
// portal, or a GitHub outage must see exactly what a user with no message
// sees: nothing. There is no error state and no retry.

import { net } from 'electron'
import { parseUpdateNotice, type UpdateNotice } from '../shared/updateNotice'

const NOTICE_URL = 'https://raw.githubusercontent.com/maykawacode/chora/main/update.json'

/** Long enough for a slow connection, short enough to beat a launch. */
const TIMEOUT_MS = 4000

/** The real file is a few hundred bytes; anything near this is not our file. */
const MAX_BYTES = 16 * 1024

// Resolved once per launch and reused. Null covers both "no message" and
// "could not ask", which callers are not meant to distinguish.
let pending: Promise<UpdateNotice | null> | null = null

async function fetchNotice(currentVersion: string): Promise<UpdateNotice | null> {
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS)

  try {
    // net.fetch rather than global fetch: it goes through Chromium's network
    // stack, so it honors the system proxy configuration a student's campus
    // network may require.
    const response = await net.fetch(NOTICE_URL, {
      signal: abort.signal,
      // The file changes rarely and matters only at launch; letting the HTTP
      // cache answer is both faster and lighter on GitHub.
      //
      // Redirects are followed rather than refused. What protects this call is
      // the parser, not the transport: the body is validated the same way
      // wherever it came from, and a captive portal's login page fails to parse
      // exactly as a hijacked redirect would. Refusing them would instead risk
      // silently killing the feature if GitHub ever adds a legitimate one.
      cache: 'default'
    })

    if (!response.ok) return null

    // Cheap rejection before reading a body that should never be large.
    const declaredLength = Number(response.headers.get('content-length'))
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BYTES) return null

    const body = await response.text()
    if (body.length > MAX_BYTES) return null

    return parseUpdateNotice(body, currentVersion)
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Starts the check, or settles it as "nothing" without touching the network.
 *
 * When the preference is off no request is made at all, rather than one whose
 * result is discarded — the point of the preference is that nothing is sent.
 */
export function startUpdateNoticeCheck(currentVersion: string, enabled: boolean): void {
  if (pending) return
  pending = enabled ? fetchNotice(currentVersion) : Promise.resolve(null)
}

/**
 * The notice for this launch, awaiting the in-flight request if it is still
 * running so a fast-loading renderer does not miss a slightly slower network.
 */
export function getUpdateNotice(): Promise<UpdateNotice | null> {
  return pending ?? Promise.resolve(null)
}
