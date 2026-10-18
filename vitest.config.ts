import { resolve } from 'path'
import { defineConfig } from 'vitest/config'
import { version } from './package.json'

// Tests run in Node by default; a test that renders components opts into a
// simulated DOM with `// @vitest-environment jsdom`. The alias and version
// constant match the browser build (vite.web.config.ts).
export default defineConfig({
  define: {
    __CHORA_VERSION__: JSON.stringify(version)
  },
  resolve: {
    alias: {
      '@renderer': resolve('src/renderer/src')
    }
  }
})
