import { usePrefsStore } from '@renderer/store/prefsStore'
import { SettingsSections, withDefaults } from '@renderer/components/PreferencesDialog'
import { CenteredPopup } from '@renderer/components/CenteredPopup'
import type { Preferences } from '@renderer/lib/preferences'
import styles from '@renderer/components/PreferencesDialog.module.css'
import popup from './SettingsPopup.module.css'

// Browser Settings: a centred popup like Chora Orientation, opened by the
// strip's gear (StripCommands.tsx). Like edits in Score's views and the map
// side panel, each change applies and is remembered at once, so there is no
// Save or Cancel. The desktop keeps its Settings dialog.

function apply(change: (prefs: Preferences) => Preferences): void {
  const { prefs, setPrefs } = usePrefsStore.getState()
  const next = change(prefs)
  setPrefs(next)
  window.api.savePreferences(next)
}

export function SettingsPopup({ onClose }: { onClose: () => void }): React.JSX.Element {
  const prefs = usePrefsStore(s => s.prefs)
  return (
    <CenteredPopup
      title="Settings"
      titleId="settings-popup-title"
      onClose={onClose}
      footer={<>
        <span>Changes apply as you make them.</span>
        <button type="button" className={styles.restoreButton} onClick={() => apply(withDefaults)}>
          Restore defaults
        </button>
      </>}
    >
      <div className={popup.content}>
        <SettingsSections values={prefs} update={apply} />
      </div>
    </CenteredPopup>
  )
}
