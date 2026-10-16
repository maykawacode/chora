import { afterEach, describe, expect, it, vi } from 'vitest'
import { chooseSaveTarget, hasHandle, openStudyWithHandle, writeToHandle } from './fileAccess'
import { readHeldFile } from './files'

// Fake platform pickers on globalThis; each test installs what it needs.
const g = globalThis as Record<string, unknown>
afterEach(() => { delete g.showOpenFilePicker; delete g.showSaveFilePicker })

function fakeHandle(name: string, opts: { content?: string; permission?: PermissionState; failClose?: boolean } = {}) {
  const log: string[] = []
  return {
    log,
    handle: {
      name,
      getFile: async () => new File([opts.content ?? ''], name),
      queryPermission: async () => opts.permission ?? 'granted',
      requestPermission: async () => opts.permission ?? 'granted',
      createWritable: async () => ({
        write: async (d: string) => { log.push(`write:${d}`) },
        close: async () => {
          if (opts.failClose) throw new DOMException('Disk full', 'InvalidStateError')
          log.push('close')
        }
      })
    }
  }
}

describe('in-place file access', () => {
  it('cancelling a picker resolves null and changes nothing', async () => {
    g.showSaveFilePicker = vi.fn().mockRejectedValue(new DOMException('cancel', 'AbortError'))
    await expect(chooseSaveTarget('Untitled.chora')).resolves.toBeNull()
  })

  it('saves through the chosen handle, resolving only after close', async () => {
    const { handle, log } = fakeHandle('study.chora')
    g.showSaveFilePicker = vi.fn().mockResolvedValue(handle)
    const path = (await chooseSaveTarget('Untitled.chora'))!
    expect(path).toMatch(/study\.chora$/)
    expect(hasHandle(path)).toBe(true)
    await writeToHandle(path, '{}')
    expect(log).toEqual(['write:{}', 'close'])
  })

  it('opens a study with its handle so Save can write back to it', async () => {
    const { handle } = fakeHandle('old.mtda', { content: '{"v":1}' })
    g.showOpenFilePicker = vi.fn().mockResolvedValue([handle])
    const path = (await openStudyWithHandle())!
    await expect(readHeldFile(path)).resolves.toBe('{"v":1}')
    expect(hasHandle(path)).toBe(true)
  })

  it('denied permission and close failures reject with the copy hint', async () => {
    const denied = fakeHandle('a.chora', { permission: 'denied' })
    g.showSaveFilePicker = vi.fn().mockResolvedValue(denied.handle)
    await expect(writeToHandle((await chooseSaveTarget('a.chora'))!, '{}')).rejects.toThrow(/permission.*Download a Copy/)
    expect(denied.log).toEqual([])

    const full = fakeHandle('b.chora', { failClose: true })
    g.showSaveFilePicker = vi.fn().mockResolvedValue(full.handle)
    await expect(writeToHandle((await chooseSaveTarget('b.chora'))!, '{}')).rejects.toThrow(/Disk full.*Download a Copy/)
  })

  it('a blocked picker explains itself; an unknown path cannot be written', async () => {
    g.showSaveFilePicker = vi.fn().mockRejectedValue(new DOMException('no activation', 'SecurityError'))
    await expect(chooseSaveTarget('x.chora')).rejects.toThrow(/blocked/)
    await expect(writeToHandle('browser:/download/x.chora', '{}')).rejects.toThrow(/Save As/)
  })
})
