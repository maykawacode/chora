// ── PreferencesDialog ─────────────────────────────────────────────────────────
//
// Modal dialog for editing user preferences. Opened via Cmd+, or the app menu.
// The sections are shared with the browser's Settings panel (web/SettingsPopup).
//
// Uses a local `draft` copy of the preferences so the user can cancel without
// committing any changes. On Save, the draft is written to both the Zustand
// store (so all components see it immediately) and to disk via IPC.

import { useState } from 'react'
import { usePrefsStore } from '../store/prefsStore'
import { DEFAULT_PREFERENCES, type Preferences } from '../lib/preferences'
import { ELEMENT_SHAPES } from '../lib/types'
import { ForwardActionButton } from './ConfirmationDisc'
import { ModalShell } from './ModalShell'
import { hostCapabilities } from '../lib/host'
import styles from './PreferencesDialog.module.css'

interface Props { onClose: () => void }

export function PreferencesDialog({ onClose }: Props): React.JSX.Element {
  const { prefs, setPrefs } = usePrefsStore()
  // Work on a draft so Cancel discards all changes
  const [draft, setDraft] = useState<Preferences>({ ...prefs })
  const [isCancelling, setIsCancelling] = useState(false)

  function handleSave(): void {
    // The draft was copied when this dialog opened, so it can be stale for
    // values that change behind it. Dismissing an update notice while Settings
    // sits open is the reachable case: saving a draft captured beforehand
    // would resurrect a notice the user has already closed.
    const next: Preferences = { ...draft, dismissedNoticeId: prefs.dismissedNoticeId }

    setPrefs(next)
    window.api?.savePreferences(next)
    // Push updated prefs to all open map BrowserWindows. Each has its own
    // renderer process with its own prefsStore, so they won't see the change
    // unless we explicitly relay it over IPC.
    window.api?.broadcastPrefs(next)
    onClose()
  }

  function handleCancel(): void {
    if (isCancelling) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      onClose()
      return
    }
    setIsCancelling(true)
  }

  function restoreDefaults(): void {
    setDraft(withDefaults)
  }

  return (
    <ModalShell
      overlayClassName={styles.overlay}
      dialogClassName={styles.dialog}
      onClose={handleCancel}
      labelledBy="preferences-title"
      dialogAnimationClassName={isCancelling ? 'modalZoomExit' : 'modalZoomEnter'}
      onDialogAnimationEnd={() => {
        if (isCancelling) onClose()
      }}
    >
      <header className={styles.header}>
        <h2 className={styles.title} id="preferences-title">Chora settings</h2>
      </header>

      <div className={styles.content}>
        <SettingsSections values={draft} update={setDraft} />
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
            onClick={handleCancel}
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

/**
 * Defaults for every choice shown in Settings. Application state kept in the
 * same record is preserved: restoring defaults must not forget the last
 * document, move the main window, or bring back a notice the user has already
 * dismissed.
 */
export function withDefaults(current: Preferences): Preferences {
  return {
    ...DEFAULT_PREFERENCES,
    lastFilePath: current.lastFilePath,
    dismissedNoticeId: current.dismissedNoticeId,
    mainWindowX: current.mainWindowX,
    mainWindowY: current.mainWindowY,
    mainWindowWidth: current.mainWindowWidth,
    mainWindowHeight: current.mainWindowHeight
  }
}

// ── Settings table ────────────────────────────────────────────────────────────
//
// Every choice Settings offers, by section. A new setting is one row here.

type KeysOf<V> = { [K in keyof Preferences]: Preferences[K] extends V ? K : never }[keyof Preferences]

type Setting =
  | { kind: 'check'; key: KeysOf<boolean>; label: string }
  | { kind: 'color'; key: KeysOf<string>; label: string }
  | { kind: 'size'; key: KeysOf<number>; label: string; min: number; max: number }
  | { kind: 'select'; key: 'defaultMarks' | 'defaultElementShape'; label: string; options: [value: string, label: string][] }
  /** The file "Reopen last file" would open, when there is one. */
  | { kind: 'lastFile' }

interface SettingsSection {
  id: string
  title: string
  /** Startup and window choices, shown where the host offers them. */
  startup?: boolean
  settings: Setting[]
}

const SETTINGS: SettingsSection[] = [
  {
    id: 'startup', title: 'Startup & Windows', startup: true,
    settings: [
      { kind: 'check', key: 'reopenLastFile', label: 'Reopen last file on startup' },
      { kind: 'lastFile' },
      { kind: 'check', key: 'rememberWindowPositions', label: 'Remember window positions' },
      { kind: 'check', key: 'checkForUpdatesOnLaunch', label: 'Check for updates on launch' }
    ]
  },
  {
    id: 'new-maps', title: 'New Maps',
    settings: [
      { kind: 'select', key: 'defaultMarks', label: 'Marks',
        options: [['none', 'none'], ['circle', 'circles'], ['element', 'by element']] },
      { kind: 'check', key: 'defaultShowLabels', label: 'Show labels by default' }
    ]
  },
  {
    id: 'elements', title: 'Elements',
    settings: [
      { kind: 'color', key: 'defaultElementColor', label: 'Default color' },
      { kind: 'select', key: 'defaultElementShape', label: 'Default shape',
        options: ELEMENT_SHAPES.map(shape => [shape, shape]) }
    ]
  },
  {
    id: 'data', title: 'Data',
    settings: [
      { kind: 'check', key: 'confirmDeleteData', label: 'Confirm before deleting any data (elements, dimensions, collections)' }
    ]
  },
  {
    id: 'labels', title: 'Map Labels & Marks',
    settings: [
      { kind: 'size', key: 'elementLabelSize', label: 'Element labels', min: 8, max: 24 },
      { kind: 'size', key: 'dimensionLabelSize', label: 'Dimension labels', min: 8, max: 24 },
      { kind: 'size', key: 'dotDefaultSize', label: 'Default mark radius', min: 3, max: 16 }
    ]
  },
  {
    id: 'dimension-color', title: 'Dimension-to-color Gradient',
    settings: [
      { kind: 'color', key: 'dimColorLow', label: 'Low end' },
      { kind: 'color', key: 'dimColorHigh', label: 'High end' }
    ]
  }
]

/**
 * The Settings sections, shared by the desktop dialog (which edits a draft)
 * and the browser's Settings panel (which applies each change at once).
 */
export function SettingsSections({ values, update }: {
  values: Preferences
  update: (change: (prefs: Preferences) => Preferences) => void
}): React.JSX.Element {
  const set = <K extends keyof Preferences>(key: K, value: Preferences[K]): void =>
    update(d => ({ ...d, [key]: value }))
  const { startupSettings } = hostCapabilities()

  function row(setting: Setting): React.JSX.Element | null {
    switch (setting.kind) {
      case 'check':
        return (
          <label key={setting.key} className={styles.row}>
            <input type="checkbox" checked={values[setting.key]}
              onChange={() => update(d => ({ ...d, [setting.key]: !d[setting.key] }))} />
            <span>{setting.label}</span>
          </label>
        )
      case 'color':
        return (
          <label key={setting.key} className={styles.row}>
            <span>{setting.label}</span>
            <input type="color" className={styles.colorInput} value={values[setting.key]}
              onChange={e => set(setting.key, e.target.value)} />
          </label>
        )
      case 'size': {
        const { key, min, max } = setting
        return (
          <label key={key} className={styles.row}>
            <span>{setting.label}</span>
            <span className={styles.sizeControl}>
              <input type="number" className={styles.sizeInput} min={min} max={max} step={1} value={values[key]}
                onChange={e => set(key, Math.max(min, Math.min(max, +e.target.value || DEFAULT_PREFERENCES[key])))} />
              <span className={styles.sizeUnit}>px</span>
            </span>
          </label>
        )
      }
      case 'select':
        return (
          <label key={setting.key} className={styles.row}>
            <span>{setting.label}</span>
            <select className={styles.selectInput} value={values[setting.key]}
              onChange={e => update(d => ({ ...d, [setting.key]: e.target.value }))}>
              {setting.options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        )
      case 'lastFile':
        return values.lastFilePath ? (
          <div key="lastFile" className={styles.lastFile} title={values.lastFilePath}>
            Last: {values.lastFilePath.split('/').pop()}
          </div>
        ) : null
    }
  }

  return (
    <div className={styles.settingsGrid}>
      {SETTINGS.filter(section => startupSettings || !section.startup).map(section => (
        <section key={section.id} className={styles.section} aria-labelledby={`preferences-${section.id}`}>
          <h3 className={styles.sectionTitle} id={`preferences-${section.id}`}>{section.title}</h3>
          {section.settings.map(row)}
        </section>
      ))}
    </div>
  )
}
