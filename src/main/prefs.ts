// ── User preferences (main process) ──────────────────────────────────────────
//
// Stores preferences as a JSON file in Electron's userData directory.
// An in-memory cache avoids hitting the filesystem on every read —
// the cached value is kept in sync with the file on every save.
//
// NOTE: The Preferences interface is intentionally duplicated from
// src/renderer/src/lib/preferences.ts. Electron compiles main and renderer
// into separate bundles, so they cannot import each other's source directly.
// If you add a field here, also add it in the renderer's preferences.ts.

import { app } from 'electron'
import { join } from 'path'
import { readFile, writeFile } from 'fs/promises'

interface Preferences {
  rememberWindowPositions: boolean
  defaultShowDots: boolean
  defaultShowLabels: boolean
  defaultElementColor: string
  reopenLastFile: boolean
  confirmDeleteElement: boolean
  lastFilePath: string | null
  elementLabelSize: number
  dimensionLabelSize: number
  dimColorLow: string   // hex color mapped to score 0 by the Dimension → Color transform
  dimColorHigh: string  // hex color mapped to score 1 by the Dimension → Color transform
  dotDefaultSize: number
}

const DEFAULT: Preferences = {
  rememberWindowPositions: true,
  defaultShowDots: true,
  defaultShowLabels: true,
  defaultElementColor: '#9d9d53',
  reopenLastFile: false,
  confirmDeleteElement: true,
  lastFilePath: null,
  elementLabelSize: 11,
  dimensionLabelSize: 11,
  dimColorLow: '#b04040',
  dimColorHigh: '#508050',
  dotDefaultSize: 14
}

// In-memory cache; null means not yet loaded from disk
let cached: Preferences | null = null

function prefsPath(): string {
  return join(app.getPath('userData'), 'preferences.json')
}

/**
 * Loads preferences from disk, merging with DEFAULT so that any new fields
 * added since the last save are present. Result is cached for future calls.
 */
export async function loadPreferences(): Promise<Preferences> {
  if (cached) return cached
  try {
    const text = await readFile(prefsPath(), 'utf-8')
    cached = { ...DEFAULT, ...(JSON.parse(text) as Partial<Preferences>) }
  } catch {
    // File doesn't exist yet or is corrupt — use defaults
    cached = { ...DEFAULT }
  }
  return cached!
}

/**
 * Writes preferences to disk and updates the in-memory cache.
 * Errors are silently ignored — a failed save is unfortunate but not fatal.
 */
export async function savePreferences(prefs: Preferences): Promise<void> {
  cached = prefs
  try {
    await writeFile(prefsPath(), JSON.stringify(prefs, null, 2), 'utf-8')
  } catch { /* ignore write errors */ }
}

/**
 * Synchronous read of the cached preferences without touching the disk.
 * Returns DEFAULT if loadPreferences() has not been called yet.
 * Used in windowManager.ts where async is not practical.
 */
export function getCachedPreferences(): Preferences {
  return cached ?? DEFAULT
}
