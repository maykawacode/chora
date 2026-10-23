// ── Preferences store ─────────────────────────────────────────────────────────
//
// Thin Zustand store that holds the current user preferences in the renderer.
// Preferences are loaded before React mounts — bootstrap.tsx for the Score
// Window (desktop and browser), mapMain.tsx for desktop map windows — and
// saved back to disk whenever the user clicks Save in PreferencesDialog.

import { create } from 'zustand'
import type { Preferences } from '../lib/preferences'
import { DEFAULT_PREFERENCES } from '../lib/preferences'

interface PrefsStore {
  prefs: Preferences
  setPrefs: (prefs: Preferences) => void
}

export const usePrefsStore = create<PrefsStore>((set) => ({
  prefs: DEFAULT_PREFERENCES,
  setPrefs: (prefs) => set({ prefs })
}))
