import { create } from 'zustand'
import type { Preferences } from '../lib/preferences'
import { DEFAULT_PREFERENCES } from '../lib/preferences'

interface PrefsStore {
  prefs: Preferences
  loaded: boolean
  setPrefs: (prefs: Preferences) => void
}

export const usePrefsStore = create<PrefsStore>((set) => ({
  prefs: DEFAULT_PREFERENCES,
  loaded: false,
  setPrefs: (prefs) => set({ prefs, loaded: true })
}))
