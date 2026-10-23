import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { contentSecurityPolicy } from './build/csp'
import { version } from './package.json'

// Browser build of Chora. Shares the renderer source with the desktop app and
// emits a static site to dist-web/, loadable from any subpath (relative base).
export default defineConfig({
  root: resolve('src/renderer/web'),
  base: './',
  publicDir: false,
  define: {
    __CHORA_VERSION__: JSON.stringify(version)
  },
  resolve: {
    alias: {
      '@renderer': resolve('src/renderer/src')
    }
  },
  build: {
    outDir: resolve('dist-web'),
    emptyOutDir: true,
    // The polyfill fetches preloads at runtime; the CSP's connect-src 'none'
    // would refuse it, and every supported browser has native modulepreload.
    modulePreload: { polyfill: false }
  },
  plugins: [react(), contentSecurityPolicy({ fileScheme: false })]
})
