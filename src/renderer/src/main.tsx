import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { usePrefsStore } from './store/prefsStore'
import { DEFAULT_PREFERENCES } from './lib/preferences'
import type { Preferences } from './lib/preferences'
import './styles/global.css'

// Initialize preferences synchronously before React mounts.
// The main process loads prefs from disk before opening the window, so the
// sendSync call returns the actual saved values — no async gap to race against.
const rawPrefs = window.api.getPrefsSync()
usePrefsStore.getState().setPrefs({ ...DEFAULT_PREFERENCES, ...(rawPrefs as Partial<Preferences>) })

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
