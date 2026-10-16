import React, { type ReactNode } from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { usePrefsStore } from './store/prefsStore'
import { history } from './store/history'
import { mergePreferences } from './lib/preferences'
import { applyUiTheme } from './design/theme'
import './styles/global.css'

/**
 * Shared Score Window startup for the desktop renderer and the browser build.
 * The host's `window.api` must be installed before this runs.
 */
export async function startApp(options: {
  header?: ReactNode
  workspace?: ReactNode
  scoreFrame?: (score: ReactNode) => ReactNode
  /** Runs once history has started and before React mounts (browser recovery). */
  beforeMount?: () => void
} = {}): Promise<void> {
  applyUiTheme()

  // Load preferences BEFORE React mounts so every component sees the correct
  // values on its first render — no async gap to race against.
  try {
    const raw = await window.api.loadPreferences()
    usePrefsStore.getState().setPrefs(mergePreferences(raw))
  } catch {
    // Prefs unavailable — DEFAULT_PREFERENCES remain, app is still functional
  }

  // Only the Score Window owns session history. mapMain.tsx deliberately does
  // not start this controller, so map renderer stores remain disposable mirrors.
  history.start()
  options.beforeMount?.()

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      {options.header}
      <App workspace={options.workspace} scoreFrame={options.scoreFrame} />
    </React.StrictMode>
  )
}
