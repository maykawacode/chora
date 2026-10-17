import { usePrefsStore } from '@renderer/store/prefsStore'
import { SettingsSections, withDefaults } from '@renderer/components/PreferencesDialog'
import type { Preferences } from '@renderer/lib/preferences'
import styles from '@renderer/components/PreferencesDialog.module.css'
import scoreStyles from '@renderer/components/ScoreWindow/ScoreWindow.module.css'
import panel from './SettingsPanel.module.css'

// Browser Settings: shown in the Score column in Score's place, chosen by the
// strip's gear like a tab (ScoreDock.tsx). Like edits in Score's tabs and the
// map side panel, each change applies and is remembered at once, so there is
// no Save or Cancel. The desktop keeps its Settings dialog.

function apply(change: (prefs: Preferences) => Preferences): void {
  const { prefs, setPrefs } = usePrefsStore.getState()
  const next = change(prefs)
  setPrefs(next)
  window.api.savePreferences(next)
}

export function SettingsPanel(): React.JSX.Element {
  const prefs = usePrefsStore(s => s.prefs)
  return (
    <section className={styles.dialog} aria-labelledby="settings-panel-title">
      {/* Titled like the Score views and map tiles. */}
      <h2 className={scoreStyles.paneTitle} id="settings-panel-title">Settings</h2>
      <div className={panel.content}>
        <SettingsSections values={prefs} update={apply} />
      </div>
      <footer className={styles.buttons}>
        <button type="button" className={styles.restoreButton} onClick={() => apply(withDefaults)}>
          Restore defaults
        </button>
      </footer>
    </section>
  )
}
