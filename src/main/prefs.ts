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
}

const DEFAULT: Preferences = {
  rememberWindowPositions: true,
  defaultShowDots: true,
  defaultShowLabels: true,
  defaultElementColor: '#808000',
  reopenLastFile: false,
  confirmDeleteElement: false,
  lastFilePath: null
}

let cached: Preferences | null = null

function prefsPath(): string {
  return join(app.getPath('userData'), 'preferences.json')
}

export async function loadPreferences(): Promise<Preferences> {
  if (cached) return cached
  try {
    const text = await readFile(prefsPath(), 'utf-8')
    cached = { ...DEFAULT, ...(JSON.parse(text) as Partial<Preferences>) }
  } catch {
    cached = { ...DEFAULT }
  }
  return cached!
}

export async function savePreferences(prefs: Preferences): Promise<void> {
  cached = prefs
  try {
    await writeFile(prefsPath(), JSON.stringify(prefs, null, 2), 'utf-8')
  } catch { /* ignore write errors */ }
}

export function getCachedPreferences(): Preferences {
  return cached ?? DEFAULT
}
