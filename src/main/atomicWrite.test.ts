import { dirname } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { writeFileAtomically } from './atomicWrite'

function operations(overrides: Partial<{
  writeFile: (path: string, data: string) => Promise<void>
  rename: (from: string, to: string) => Promise<void>
  unlink: (path: string) => Promise<void>
}> = {}) {
  return {
    writeFile: vi.fn(overrides.writeFile ?? (async () => {})),
    rename: vi.fn(overrides.rename ?? (async () => {})),
    unlink: vi.fn(overrides.unlink ?? (async () => {}))
  }
}

describe('writeFileAtomically', () => {
  it('writes a sibling temporary file before renaming it over the target', async () => {
    const ops = operations()
    const target = '/sessions/current.mtda'

    await writeFileAtomically(target, 'new session', ops)

    const tempPath = ops.writeFile.mock.calls[0][0]
    expect(dirname(tempPath)).toBe(dirname(target))
    expect(tempPath).not.toBe(target)
    expect(ops.writeFile).toHaveBeenCalledWith(
      tempPath,
      'new session',
      { encoding: 'utf8', flag: 'wx' }
    )
    expect(ops.rename).toHaveBeenCalledWith(tempPath, target)
    expect(ops.writeFile.mock.invocationCallOrder[0])
      .toBeLessThan(ops.rename.mock.invocationCallOrder[0])
    expect(ops.unlink).not.toHaveBeenCalled()
  })

  it('removes a partial temporary file and returns the original write error', async () => {
    const writeError = new Error('disk full')
    const ops = operations({ writeFile: async () => { throw writeError } })

    await expect(writeFileAtomically('/sessions/current.mtda', 'new session', ops))
      .rejects.toBe(writeError)

    const tempPath = ops.writeFile.mock.calls[0][0]
    expect(ops.rename).not.toHaveBeenCalled()
    expect(ops.unlink).toHaveBeenCalledWith(tempPath)
  })

  it('preserves the destination on rename failure and does not mask that error', async () => {
    const files = new Map<string, string>([['/sessions/current.mtda', 'original session']])
    const renameError = new Error('rename denied')
    const cleanupError = new Error('cleanup denied')
    const ops = operations({
      writeFile: async (path, data) => { files.set(path, data) },
      rename: async () => { throw renameError },
      unlink: async (path) => {
        files.delete(path)
        throw cleanupError
      }
    })

    await expect(writeFileAtomically('/sessions/current.mtda', 'new session', ops))
      .rejects.toBe(renameError)

    const tempPath = ops.writeFile.mock.calls[0][0]
    expect(files.get('/sessions/current.mtda')).toBe('original session')
    expect(files.has(tempPath)).toBe(false)
    expect(ops.unlink).toHaveBeenCalledWith(tempPath)
  })
})
