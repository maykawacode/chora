// ── PreferencesDialog ─────────────────────────────────────────────────────────
//
// Modal dialog for editing user preferences. Opened via Cmd+, or the app menu.
//
// Uses a local `draft` copy of the preferences so the user can cancel without
// committing any changes. On Save, the draft is written to both the Zustand
// store (so all components see it immediately) and to disk via IPC.

import { useState } from 'react'
import { usePrefsStore } from '../store/prefsStore'
import { DEFAULT_PREFERENCES, type Preferences } from '../lib/preferences'
import type { ElementShape, MarkMode } from '../lib/types'
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

  function restoreDefaults(): void {
    setDraft(current => ({
      ...DEFAULT_PREFERENCES,
      // These values are application state rather than choices shown in this
      // screen. Restoring defaults must not forget the last document or move
      // the main window the next time Settings is saved.
      lastFilePath: current.lastFilePath,
      mainWindowX: current.mainWindowX,
      mainWindowY: current.mainWindowY,
      mainWindowWidth: current.mainWindowWidth,
      mainWindowHeight: current.mainWindowHeight
    }))
  }

  return (
    <ModalShell
      overlayClassName={styles.overlay}
      dialogClassName={styles.dialog}
      onClose={onClose}
      labelledBy="preferences-title"
    >
      <header className={styles.header}>
        <h2 className={styles.title} id="preferences-title">Chora settings</h2>
        <p className={styles.subtitle}>Interface, map, and session defaults</p>
      </header>

      <div className={styles.content}>
        <div className={styles.settingsGrid}>
          <section className={styles.section} aria-labelledby="preferences-startup">
            <h3 className={styles.sectionTitle} id="preferences-startup">Startup &amp; Windows</h3>
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
            <label className={styles.row}>
              <input type="checkbox" checked={draft.rememberWindowPositions}
                onChange={() => toggle('rememberWindowPositions')} />
              <span>Remember window positions</span>
            </label>
          </section>

          <section className={styles.section} aria-labelledby="preferences-new-maps">
            <h3 className={styles.sectionTitle} id="preferences-new-maps">New Maps</h3>
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

          <section className={styles.section} aria-labelledby="preferences-elements">
            <h3 className={styles.sectionTitle} id="preferences-elements">Elements</h3>
            <label className={styles.row}>
              <span>Default color</span>
              <input
                type="color"
                className={styles.colorInput}
                value={draft.defaultElementColor}
                onChange={e => setDraft(d => ({ ...d, defaultElementColor: e.target.value }))}
              />
            </label>
            <label className={styles.row}>
              <span>Default shape</span>
              <select
                className={styles.selectInput}
                value={draft.defaultElementShape}
                onChange={e => setDraft(d => ({ ...d, defaultElementShape: e.target.value as ElementShape }))}
              >
                <option value="circle">circle</option>
                <option value="square">square</option>
                <option value="triangle">triangle</option>
                <option value="diamond">diamond</option>
              </select>
            </label>
            <label className={styles.row}>
              <input type="checkbox" checked={draft.confirmDeleteElement}
                onChange={() => toggle('confirmDeleteElement')} />
              <span>Confirm before deleting elements</span>
            </label>
          </section>

          <section className={styles.section} aria-labelledby="preferences-labels">
            <h3 className={styles.sectionTitle} id="preferences-labels">Map Labels &amp; Marks</h3>
            <label className={styles.row}>
              <span>Element labels</span>
              <span className={styles.sizeControl}>
                <input
                  type="number"
                  className={styles.sizeInput}
                  min={8} max={24} step={1}
                  value={draft.elementLabelSize}
                  onChange={e => setDraft(d => ({ ...d, elementLabelSize: Math.max(8, Math.min(24, +e.target.value || 11)) }))}
                />
                <span className={styles.sizeUnit}>px</span>
              </span>
            </label>
            <label className={styles.row}>
              <span>Dimension labels</span>
              <span className={styles.sizeControl}>
                <input
                  type="number"
                  className={styles.sizeInput}
                  min={8} max={24} step={1}
                  value={draft.dimensionLabelSize}
                  onChange={e => setDraft(d => ({ ...d, dimensionLabelSize: Math.max(8, Math.min(24, +e.target.value || 11)) }))}
                />
                <span className={styles.sizeUnit}>px</span>
              </span>
            </label>
            <label className={styles.row}>
              <span>Default mark radius</span>
              <span className={styles.sizeControl}>
                <input
                  type="number"
                  className={styles.sizeInput}
                  min={3} max={16} step={1}
                  value={draft.dotDefaultSize}
                  onChange={e => setDraft(d => ({ ...d, dotDefaultSize: Math.max(3, Math.min(16, +e.target.value || 6)) }))}
                />
                <span className={styles.sizeUnit}>px</span>
              </span>
            </label>
          </section>

          <section className={styles.section} aria-labelledby="preferences-dimension-color">
            <h3 className={styles.sectionTitle} id="preferences-dimension-color">Dimension-to-color Gradient</h3>
            <label className={styles.row}>
              <span>Low end</span>
              <input
                type="color"
                className={styles.colorInput}
                value={draft.dimColorLow}
                onChange={e => setDraft(d => ({ ...d, dimColorLow: e.target.value }))}
              />
            </label>
            <label className={styles.row}>
              <span>High end</span>
              <input
                type="color"
                className={styles.colorInput}
                value={draft.dimColorHigh}
                onChange={e => setDraft(d => ({ ...d, dimColorHigh: e.target.value }))}
              />
            </label>
          </section>

        </div>
      </div>

      <footer className={styles.buttons}>
        <button type="button" className={styles.restoreButton} onClick={restoreDefaults}>
          Restore defaults
        </button>
        <div className={styles.buttonActions}>
          <button
            type="button"
            className={styles.btnCancel}
            aria-label="Cancel settings"
            title="Cancel settings"
            onClick={onClose}
          >
            <svg className={styles.cancelIcon} viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 5L19 19M19 5L5 19" />
            </svg>
          </button>
          <ForwardActionButton label="Save settings" onClick={handleSave} />
        </div>
      </footer>
    </ModalShell>
  )
}
