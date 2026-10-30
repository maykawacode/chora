// Checks the pages in site/ (every .html file). Run with
// `npm run site:check`; CI runs it on every push, and the Pages workflow
// before publishing.
//
// - Every page carries exactly the site CSP (csp.ts).
// - Every local reference in the pages and site.css is relative and exists,
//   so the pages load from /chora/ and from a local server alike.
// - The only links to another host are the project's own GitHub pages and
//   the author's LinkedIn page.
// - There is one version element for the Pages workflow to fill in.
// - The landing page's start links point to the app at app/.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SITE_CONTENT_SECURITY_POLICY } from './csp.ts'

const root = 'site'
const failures: string[] = []
const fail = (message: string): void => { failures.push(message) }

const PAGES = readdirSync(root).filter(name => name.endsWith('.html'))
const html = readFileSync(join(root, 'index.html'), 'utf8')
const css = readFileSync(join(root, 'site.css'), 'utf8')

const GITHUB = 'https://github.com/maykawacode/chora'
// The author credit in the footer.
const LINKEDIN = 'https://www.linkedin.com/in/mayfield/'
// app/ is published beside the site, not kept in site/, so it is not on disk here.
const PUBLISHED_BESIDE = new Set(['app/'])

function checkReference(where: string, url: string, external: 'allowed' | 'forbidden'): void {
  if (/^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('//')) {
    const allowed = external === 'allowed' &&
      (url === GITHUB || url.startsWith(`${GITHUB}/`) || url === LINKEDIN)
    if (!allowed) fail(`${where} references another host: ${url}`)
    return
  }
  if (url.startsWith('/')) { fail(`${where} references root-relative ${url}`); return }
  if (url.startsWith('#') || PUBLISHED_BESIDE.has(url)) return
  if (!existsSync(join(root, url.split(/[?#]/)[0]))) fail(`${where} references missing ${url}`)
}

// Links (<a href>) may reach the hosts above; anything a page loads (src,
// <link href>, CSS url()) must be its own.
for (const page of PAGES) {
  const pageHtml = readFileSync(join(root, page), 'utf8')
  const csp = /<meta http-equiv="Content-Security-Policy"\s+content="([^"]*)"/.exec(pageHtml)?.[1]
  if (csp !== SITE_CONTENT_SECURITY_POLICY) fail(`${page} CSP is ${csp ?? 'missing'}`)
  for (const [, tag, attrs] of pageHtml.matchAll(/<([a-z]+)\b([^>]*)>/gi)) {
    for (const [, url] of attrs.matchAll(/\b(?:src|href)="([^"]+)"/g)) {
      checkReference(`${page} <${tag}>`, url, tag.toLowerCase() === 'a' ? 'allowed' : 'forbidden')
    }
  }
}
for (const [, url] of css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) {
  checkReference('site.css', url, 'forbidden')
}

const startLinks = [...html.matchAll(/<a\b[^>]*\bhref="app\/"/g)].length
if (startLinks !== 2) fail(`index.html has ${startLinks} links to app/, expected 2 (hero and closing)`)

// The Pages workflow writes the release tag into this element.
const versions = [...html.matchAll(/<p class="version">[^<]*<\/p>/g)].length
if (versions !== 1) fail(`index.html has ${versions} <p class="version"> elements, expected 1`)

if (failures.length > 0) {
  console.error(`Site check failed:\n- ${failures.join('\n- ')}`)
  process.exit(1)
}
console.log('Site check passed.')
