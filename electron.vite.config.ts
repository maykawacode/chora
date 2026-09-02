import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

// ── Content-Security-Policy ───────────────────────────────────────────────────
//
// Chora is an offline application: it loads its own bundle from disk and makes
// no network requests of any kind. This policy says exactly that, so anything
// that tries to reach the network is refused by the renderer itself rather than
// relying on every future line of code to keep the promise.
//
// The directive doing the real work is `img-src 'none'`. A CSS background
// accepts `url(...)`, so any untrusted string that reaches a style — an element
// or collection color out of a shared .chora file, say — is a potential request
// to a remote server that fires when the swatch is painted. Colors are
// validated at the file boundary (see lib/color.ts), and this is the second
// line: even a color that somehow got through cannot fetch anything.
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
// would be redundant. The three kept explicit are the ones the app actually
// needs, plus img-src and connect-src — redundant today, but named so that
// loosening default-src later cannot silently reopen the network path this
// policy exists to close. The tag is injected first in <head>, ahead of the
// module script it governs, which keeps <meta charset> inside the first 1024
// bytes the HTML parser looks in.
const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'self' file:",
  "style-src 'self' file: 'unsafe-inline'",
  "font-src 'self' file:",
  "img-src 'none'",
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
function contentSecurityPolicy(): Plugin {
  return {
    name: 'chora:content-security-policy',
    apply: 'build',
    transformIndexHtml() {
      return [{
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: CONTENT_SECURITY_POLICY },
        injectTo: 'head-prepend'
      }]
    }
  }
}

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/renderer/index.html'),
          map:   resolve('src/renderer/map.html')
        }
      }
    },
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react(), contentSecurityPolicy()]
  }
})
