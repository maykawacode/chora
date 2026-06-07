// ── Preferences store ─────────────────────────────────────────────────────────
//
// Thin Zustand store that holds the current user preferences in the renderer.
// Preferences are loaded once on startup via IPC (App.tsx useEffect) and
// saved back to disk whenever the user clicks Save in PreferencesDialog.
//
// The `loaded` flag lets components distinguish between "defaults are showing"
// and "loaded from disk" if they ever need to defer rendering until prefs arrive.

import { create } from 'zustand'
import type { Preferences } from '../lib/preferences'
import { DEFAULT_PREFERENCES } from '../lib/preferences'

interface PrefsStore {
  prefs: Preferences
  loaded: boolean          // true once loadPreferences() IPC call has resolved
  setPrefs: (prefs: Preferences) => void
}

export const usePrefsStore = create<PrefsStore>((set) => ({
  prefs: DEFAULT_PREFERENCES,
  loaded: false,
  setPrefs: (prefs) => set({ prefs, loaded: true })
}))
