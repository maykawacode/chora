import { basename, extname, join } from 'node:path'

export type BundledResourceKind = 'example' | 'help'

export interface ResourceRuntime {
  isPackaged: boolean
  resourcesPath: string
  appPath: string
}

const resourceDirectories: Record<BundledResourceKind, string> = {
  example: 'examples',
  help: 'help'
}

const allowedExtensions: Record<BundledResourceKind, ReadonlySet<string>> = {
  example: new Set(['.chora', '.mtda']),
  help: new Set(['.md'])
}

/**
 * Returns the root copied by electron-builder in production and the checked-in
 * resource tree during development. Renderer code never needs to know either
 * location.
 */
export function bundledResourceRoot(runtime: ResourceRuntime): string {
  return runtime.isPackaged
    ? runtime.resourcesPath
    : join(runtime.appPath, 'resources')
}

/**
 * Resolves one named, read-only application resource.
 *
 * Names are deliberately flat: callers choose a known example or Help file,
 * never an arbitrary path. The basename and extension checks prevent an IPC
 * caller from escaping the public resource directories.
 */
export function resolveBundledResourcePath(
  kind: BundledResourceKind,
  fileName: string,
  runtime: ResourceRuntime
): string {
  if (
    typeof fileName !== 'string' ||
    fileName.length === 0 ||
    fileName === '.' ||
    fileName === '..' ||
    basename(fileName) !== fileName
  ) {
    throw new Error(`Invalid bundled ${kind} resource name`)
  }

  const extension = extname(fileName).toLowerCase()
  if (!allowedExtensions[kind].has(extension)) {
    throw new Error(`Unsupported bundled ${kind} resource extension`)
  }

  return join(bundledResourceRoot(runtime), resourceDirectories[kind], fileName)
}
