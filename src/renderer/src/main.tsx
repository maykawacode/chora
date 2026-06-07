import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { usePrefsStore } from './store/prefsStore'
import { DEFAULT_PREFERENCES } from './lib/preferences'
import type { Preferences } from './lib/preferences'
import './styles/global.css'

// Load preferences BEFORE React mounts so every component sees the correct
// values on its first render — no async gap to race against.
async function init(): Promise<void> {
  try {
    const raw = await window.api.loadPreferences()
    usePrefsStore.getState().setPrefs({ ...DEFAULT_PREFERENCES, ...(raw as Partial<Preferences>) })
  } catch {
    // Prefs unavailable — DEFAULT_PREFERENCES remain, app is still functional
  }

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}

init()
