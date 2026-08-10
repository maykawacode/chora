import { describe, expect, it } from 'vitest'
import { bundledResourceRoot, resolveBundledResourcePath } from './resourcePaths'

const development = {
  isPackaged: false,
  resourcesPath: '/Applications/Chora.app/Contents/Resources',
  appPath: '/workspace/chora'
}

const packaged = { ...development, isPackaged: true }

describe('bundledResourceRoot', () => {
  it('uses the checked-in resource tree during development', () => {
    expect(bundledResourceRoot(development)).toBe('/workspace/chora/resources')
  })

  it('uses Electron resourcesPath in a packaged application', () => {
    expect(bundledResourceRoot(packaged)).toBe('/Applications/Chora.app/Contents/Resources')
  })
})

describe('resolveBundledResourcePath', () => {
  it('resolves examples and Help inside their fixed directories', () => {
    expect(resolveBundledResourcePath('example', 'packaging-smoke.chora', development))
      .toBe('/workspace/chora/resources/examples/packaging-smoke.chora')
    expect(resolveBundledResourcePath('help', 'packaging-smoke.md', packaged))
      .toBe('/Applications/Chora.app/Contents/Resources/help/packaging-smoke.md')
  })

  it.each([
    '../secret.chora',
    'nested/secret.chora',
    '/tmp/secret.chora',
    '.',
    '..',
    ''
  ])('rejects non-flat resource name %j', (fileName) => {
    expect(() => resolveBundledResourcePath('example', fileName, development))
      .toThrow('Invalid bundled example resource name')
  })

  it('restricts each resource kind to its public file extensions', () => {
    expect(() => resolveBundledResourcePath('example', 'help.md', development))
      .toThrow('Unsupported bundled example resource extension')
    expect(() => resolveBundledResourcePath('help', 'session.chora', development))
      .toThrow('Unsupported bundled help resource extension')
  })

  it('accepts legacy session examples and case-insensitive extensions', () => {
    expect(resolveBundledResourcePath('example', 'legacy.MTDA', packaged))
      .toBe('/Applications/Chora.app/Contents/Resources/examples/legacy.MTDA')
  })
})
