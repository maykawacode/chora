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
  it('resolves examples inside their fixed directory', () => {
    expect(resolveBundledResourcePath('example', 'sample-dataset.chora', development))
      .toBe('/workspace/chora/resources/examples/sample-dataset.chora')
    expect(resolveBundledResourcePath('example', 'sample-dataset.chora', packaged))
      .toBe('/Applications/Chora.app/Contents/Resources/examples/sample-dataset.chora')
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

  it('restricts examples to their public file extensions', () => {
    expect(() => resolveBundledResourcePath('example', 'help.md', development))
      .toThrow('Unsupported bundled example resource extension')
  })

  it('accepts legacy session examples and case-insensitive extensions', () => {
    expect(resolveBundledResourcePath('example', 'legacy.MTDA', packaged))
      .toBe('/Applications/Chora.app/Contents/Resources/examples/legacy.MTDA')
  })
})
