// ── PreferencesDialog ─────────────────────────────────────────────────────────
//
// Modal dialog for editing user preferences. Opened via Cmd+, or the app menu.
//
// Uses a local `draft` copy of the preferences so the user can cancel without
// committing any changes. On Save, the draft is written to both the Zustand
// store (so all components see it immediately) and to disk via IPC.

import { useState } from 'react'
import { usePrefsStore } from '../store/prefsStore'
import type { Preferences } from '../lib/preferences'
import styles from './PreferencesDialog.module.css'

interface Props { onClose: () => void }

export function PreferencesDialog({ onClose }: Props): React.JSX.Element {
  const { prefs, setPrefs } = usePrefsStore()
  // Work on a draft so Cancel discards all changes
  const [draft, setDraft] = useState<Preferences>({ ...prefs })

  function toggle(key: keyof Preferences): void {
    setDraft(d => ({ ...d, [key]: !d[key] }))
  }

  function handleSave(): void {
    setPrefs(draft)
    window.api?.savePreferences(draft as unknown as Record<string, unknown>)
    onClose()
  }

  return (
    <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.dialog}>
        <h2 className={styles.title}>Preferences</h2>

        {/* ── Window ── */}
        <section className={styles.section}>
          <div className={styles.sectionTitle}>Window</div>
          <label className={styles.row}>
            <input type="checkbox" checked={draft.rememberWindowPositions}
              onChange={() => toggle('rememberWindowPositions')} />
            <span>Remember map window positions</span>
          </label>
        </section>

        {/* ── New Maps ── */}
        <section className={styles.section}>
          <div className={styles.sectionTitle}>New Maps</div>
          <label className={styles.row}>
            <input type="checkbox" checked={draft.defaultShowDots}
              onChange={() => toggle('defaultShowDots')} />
            <span>Show dots by default</span>
          </label>
          <label className={styles.row}>
            <input type="checkbox" checked={draft.defaultShowLabels}
              onChange={() => toggle('defaultShowLabels')} />
            <span>Show labels by default</span>
          </label>
        </section>

        {/* ── Elements ── */}
        <section className={styles.section}>
          <div className={styles.sectionTitle}>Elements</div>
          <div className={styles.row}>
            <span>Default color</span>
            <input
              type="color"
              className={styles.colorInput}
              value={draft.defaultElementColor}
              onChange={e => setDraft(d => ({ ...d, defaultElementColor: e.target.value }))}
            />
          </div>
          <label className={styles.row}>
            <input type="checkbox" checked={draft.confirmDeleteElement}
              onChange={() => toggle('confirmDeleteElement')} />
            <span>Confirm before deleting elements</span>
          </label>
        </section>

        {/* ── Session ── */}
        <section className={styles.section}>
          <div className={styles.sectionTitle}>Session</div>
          <label className={styles.row}>
            <input type="checkbox" checked={draft.reopenLastFile}
              onChange={() => toggle('reopenLastFile')} />
            <span>Reopen last file on startup</span>
          </label>
          {draft.lastFilePath && (
            <div className={styles.lastFile} title={draft.lastFilePath}>
              Last: {draft.lastFilePath.split('/').pop()}
            </div>
          )}
        </section>

        <div className={styles.buttons}>
          <button className={styles.btnCancel} onClick={onClose}>Cancel</button>
          <button className={styles.btnSave} onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  )
}
