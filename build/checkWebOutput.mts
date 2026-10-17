// Checks the browser build in dist-web/ after `npm run web:build`.
// Run with `npm run web:check`; CI runs it on every push.
//
// - index.html carries exactly the browser CSP (no file: scheme).
// - Asset references are relative, so the site loads from any subpath.
// - No Node or Electron code reached the bundle.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { contentSecurityPolicyString } from './csp.ts'

const root = 'dist-web'
const failures: string[] = []
const fail = (message: string): void => { failures.push(message) }

const html = readFileSync(join(root, 'index.html'), 'utf8')
const csp = /<meta http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(html)?.[1]
  ?.replaceAll('&#39;', "'")
if (csp !== contentSecurityPolicyString({ fileScheme: false })) fail(`index.html CSP is ${csp ?? 'missing'}`)

for (const [, url] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
  if (!url.startsWith('./')) fail(`index.html references non-relative ${url}`)
}

const forbidden = [/\bipcRenderer\b/, /\brequire\(["']electron["']\)/, /from ?["']electron["']/, /\brequire\(["']node:/]
for (const name of readdirSync(join(root, 'assets'))) {
  if (!name.endsWith('.js')) continue
  const code = readFileSync(join(root, 'assets', name), 'utf8')
  for (const pattern of forbidden) {
    if (pattern.test(code)) fail(`assets/${name} matches ${pattern}`)
  }
}

if (failures.length > 0) {
  console.error(`Web output check failed:\n- ${failures.join('\n- ')}`)
  process.exit(1)
}
console.log('Web output check passed.')
