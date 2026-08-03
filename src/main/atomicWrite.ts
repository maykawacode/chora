import { randomUUID } from 'node:crypto'
import { rename, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

interface AtomicWriteOperations {
  writeFile: (
    path: string,
    data: string,
    options: { encoding: 'utf8'; flag: 'wx' }
  ) => Promise<unknown>
  rename: (from: string, to: string) => Promise<unknown>
  unlink: (path: string) => Promise<unknown>
}

const nodeOperations: AtomicWriteOperations = { writeFile, rename, unlink }

/**
 * Replaces a file only after its complete contents have been written beside it.
 * Keeping the temporary file in the same directory makes the final rename an
 * atomic operation on the destination filesystem.
 */
export async function writeFileAtomically(
  filePath: string,
  data: string,
  operations: AtomicWriteOperations = nodeOperations
): Promise<void> {
  const tempPath = join(
    dirname(filePath),
    `.${basename(filePath)}.${process.pid}.${randomUUID()}.tmp`
  )

  try {
    await operations.writeFile(tempPath, data, { encoding: 'utf8', flag: 'wx' })
    await operations.rename(tempPath, filePath)
  } catch (error) {
    try {
      await operations.unlink(tempPath)
    } catch {
      // Cleanup is best-effort; callers need the original write/rename error.
    }
    throw error
  }
}
