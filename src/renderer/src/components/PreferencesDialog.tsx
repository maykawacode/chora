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
import type { MarkMode } from '../lib/types'
import { ForwardActionButton } from './ConfirmationDisc'
import { ModalShell } from './ModalShell'
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
    window.api?.savePreferences(draft)
    // Push updated prefs to all open map BrowserWindows. Each has its own
    // renderer process with its own prefsStore, so they won't see the change
    // unless we explicitly relay it over IPC.
    window.api?.broadcastPrefs(draft)
    onClose()
  }

  return (
    <ModalShell overlayClassName={styles.overlay} dialogClassName={styles.dialog} onClose={onClose}>
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
            <span>Marks</span>
            <select
              className={styles.selectInput}
              value={draft.defaultMarks}
              onChange={e => setDraft(d => ({ ...d, defaultMarks: e.target.value as MarkMode }))}
            >
              <option value="none">none</option>
              <option value="circle">circles</option>
              <option value="element">by element</option>
            </select>
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

        {/* ── Dimension → Color ── */}
        <section className={styles.section}>
          <div className={styles.sectionTitle}>Dimension → Color</div>
          <div className={styles.row}>
            <span>Low end color</span>
            <input
              type="color"
              className={styles.colorInput}
              value={draft.dimColorLow}
              onChange={e => setDraft(d => ({ ...d, dimColorLow: e.target.value }))}
            />
          </div>
          <div className={styles.row}>
            <span>High end color</span>
            <input
              type="color"
              className={styles.colorInput}
              value={draft.dimColorHigh}
              onChange={e => setDraft(d => ({ ...d, dimColorHigh: e.target.value }))}
            />
          </div>
        </section>

        {/* ── Labels ── */}
        <section className={styles.section}>
          <div className={styles.sectionTitle}>Labels</div>
          <div className={styles.row}>
            <span>Element label size</span>
            <input
              type="number"
              className={styles.sizeInput}
              min={8} max={24} step={1}
              value={draft.elementLabelSize}
              onChange={e => setDraft(d => ({ ...d, elementLabelSize: Math.max(8, Math.min(24, +e.target.value || 11)) }))}
            />
            <span className={styles.sizeUnit}>px</span>
          </div>
          <div className={styles.row}>
            <span>Dimension label size</span>
            <input
              type="number"
              className={styles.sizeInput}
              min={8} max={24} step={1}
              value={draft.dimensionLabelSize}
              onChange={e => setDraft(d => ({ ...d, dimensionLabelSize: Math.max(8, Math.min(24, +e.target.value || 11)) }))}
            />
            <span className={styles.sizeUnit}>px</span>
          </div>
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

        {/* ── Keyboard Shortcuts ── */}
        <section className={styles.section}>
          <div className={styles.sectionTitle}>Keyboard Shortcuts</div>
          <div className={styles.shortcutRow}><kbd className={styles.kbd}>⌘D</kbd><span>Duplicate selected element</span></div>
          <div className={styles.shortcutRow}><kbd className={styles.kbd}>↑ ↓</kbd><span>Navigate element / dimension list</span></div>
          <div className={styles.shortcutRow}><kbd className={styles.kbd}>⌫</kbd><span>Delete selected element / dimension</span></div>
        </section>

        <div className={styles.buttons}>
          <button className={styles.btnCancel} onClick={onClose}>Cancel</button>
          <ForwardActionButton label="Save preferences" onClick={handleSave} />
        </div>
    </ModalShell>
  )
}
