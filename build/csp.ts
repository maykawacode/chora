import type { Plugin } from 'vite'

// ── Content-Security-Policy ───────────────────────────────────────────────────
//
// Chora is an offline application: it loads its own bundle from disk and makes
// no network requests of any kind. This policy says exactly that, so anything
// that tries to reach the network is refused by the renderer itself rather than
// relying on every future line of code to keep the promise.
//
// The directive doing the real work is `img-src data:`. A CSS background
// accepts `url(...)`, so any untrusted string that reaches a style — an element
// or collection color out of a shared .chora file, say — is a potential request
// to a remote server that fires when the swatch is painted. Colors are
// validated at the file boundary (see lib/color.ts), and this is the second
// line: even a color that somehow got through cannot fetch anything.
//
// `data:` is the single source allowed, and it opens no network path — a data
// URI carries its own bytes and reaches nothing off the machine, so the promise
// above is unchanged. It is listed for the Notes tab: Trix ships its toolbar
// icons as data-URI backgrounds inside trix.css, and under the `'none'` this
// replaced they were refused, leaving working buttons with no icons on them.
// Those fifteen icons are the only images the renderer loads at all.
//
// `file:` is listed alongside 'self' deliberately. A packaged renderer is loaded
// over file://, where a document's origin is opaque and 'self' is not reliably
// matched by Chromium; naming the scheme keeps the app's own bundle loadable
// without admitting anything remote.
//
// `'unsafe-inline'` on style-src only. Inline styles cannot reach the network
// here — img-src and font-src forbid it — and the alternative is risking a
// silently unstyled window if a build ever emits an inline <style>. Scripts get
// no such latitude.
// `default-src 'none'` already denies every fetch type, so most directives
// would be redundant. The four kept explicit are the ones the app actually
// needs, plus connect-src — redundant today, but named so that
// loosening default-src later cannot silently reopen the network path this
// policy exists to close. The tag is injected first in <head>, ahead of the
// module script it governs, which keeps <meta charset> inside the first 1024
// bytes the HTML parser looks in.
//
// The browser build is served over HTTPS, where 'self' is matched normally, so
// it omits `file:` and is otherwise identical.
export function contentSecurityPolicyString(options: { fileScheme: boolean }): string {
  const own = options.fileScheme ? "'self' file:" : "'self'"
  return [
    "default-src 'none'",
    `script-src ${own}`,
    `style-src ${own} 'unsafe-inline'`,
    `font-src ${own}`,
    "img-src data:",
    "connect-src 'none'",
    "base-uri 'none'",
    "form-action 'none'"
  ].join('; ')
}

// The landing page (site/) is a plain static page with the same promise: it
// loads only its own script, styles, fonts and icons. It differs from the
// browser build only in `img-src`, which also allows 'self' for its favicon.
// The page carries this policy in its own meta tag; build/checkSite.mts holds
// it to this string.
export const SITE_CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' data:",
  "connect-src 'none'",
  "base-uri 'none'",
  "form-action 'none'"
].join('; ')

/**
 * Adds the CSP meta tag to every renderer document.
 *
 * Build only. The dev server serves its client and React Fast Refresh as inline
 * scripts over http://localhost, which this policy forbids by design — applying
 * it to `electron-vite dev` would break hot reload while protecting a renderer
 * that never ships.
 */
export function contentSecurityPolicy(options: { fileScheme: boolean }): Plugin {
  const content = contentSecurityPolicyString(options)
  return {
    name: 'chora:content-security-policy',
    apply: 'build',
    transformIndexHtml() {
      return [{
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content },
        injectTo: 'head-prepend'
      }]
    }
  }
}
