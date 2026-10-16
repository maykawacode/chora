import { describe, expect, it } from 'vitest'
import { holdFile, readHeldFile } from './files'

describe('browser file registry', () => {
  it('returns held text under a pseudo-path ending in the file name', async () => {
    const path = holdFile('study.chora', '{"a":1}')
    expect(path).toMatch(/^browser:\/\d+\/study\.chora$/)
    await expect(readHeldFile(path)).resolves.toBe('{"a":1}')
  })

  it('keeps only the four most recent files', async () => {
    const paths = ['a', 'b', 'c', 'd', 'e'].map(name => holdFile(`${name}.tsv`, name))
    await expect(readHeldFile(paths[0])).rejects.toThrow(/no longer open/)
    await expect(readHeldFile(paths[4])).resolves.toBe('e')
  })

  it('rejects unknown paths, including desktop-style ones', async () => {
    await expect(readHeldFile('/Users/someone/study.chora')).rejects.toThrow()
  })
})
