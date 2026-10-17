import React from 'react'
import ReactDOM from 'react-dom/client'
import { MapApp } from './MapApp'
import { usePrefsStore } from './store/prefsStore'
import { mergePreferences } from '../../shared/contracts'
import { applyUiTheme } from './design/theme'
import './styles/global.css'

async function start(): Promise<void> {
  applyUiTheme()

  // Load saved preferences before the first paint, as the Score Window does,
  // so label and dot sizes are right from the start. Later changes still
  // arrive through onPrefs (Issue #4).
  try {
    usePrefsStore.getState().setPrefs(mergePreferences(await window.api.loadPreferences()))
  } catch {
    // Prefs unavailable — defaults remain, the map still works
  }

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <MapApp />
    </React.StrictMode>
  )
}

void start()
