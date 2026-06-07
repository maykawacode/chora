// ── ImportPreview ─────────────────────────────────────────────────────────────
//
// Modal dialog shown after a spreadsheet is parsed but before it is applied.
// Displays a summary (element count, dimension count, scale detection) and any
// non-fatal parse warnings. The user can confirm or cancel.
//
// Confirming replaces the entire current session (elements, dimensions, scores)
// with the imported data. The caller (App.tsx) handles the actual store update
// via the onConfirm callback.

import type { ImportResult } from '../lib/importer'
import styles from './ImportPreview.module.css'

interface Props {
  fileName: string
  result: ImportResult
  onConfirm: () => void
  onCancel: () => void
}

export function ImportPreview({ fileName, result, onConfirm, onCancel }: Props): React.JSX.Element {
  const { elements, dimensions, scaleNote, warnings } = result

  return (
    <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) onCancel() }}>
      <div className={styles.dialog}>
        <p className={styles.title}>Import Spreadsheet</p>
        <p className={styles.fileName}>{fileName}</p>

        <div className={styles.summary}>
          <div className={styles.summaryRow}>
            <span className={styles.summaryLabel}>Elements</span>
            <span className={styles.summaryValue}>{elements.length}</span>
          </div>
          <div className={styles.summaryRow}>
            <span className={styles.summaryLabel}>Dimensions</span>
            <span className={styles.summaryValue}>{dimensions.length}</span>
          </div>
          <div className={styles.summaryRow}>
            <span className={styles.summaryLabel}>Scale</span>
            <span className={styles.summaryValue}>{scaleNote}</span>
          </div>
        </div>

        {warnings.length > 0 && (
          <ul className={styles.warnings}>
            {warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        )}

        <p className={styles.caution}>This will replace the current session.</p>

        <div className={styles.buttons}>
          <button className={styles.btnCancel} onClick={onCancel}>Cancel</button>
          <button className={styles.btnImport} onClick={onConfirm}>Import</button>
        </div>
      </div>
    </div>
  )
}
