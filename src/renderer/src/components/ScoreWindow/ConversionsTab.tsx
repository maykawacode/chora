// ── ConversionsTab ─────────────────────────────────────────────────────────────
//
// Data-conversion operations presented as a FROM → TO pipeline.
// User picks a source kind and a destination kind from dropdowns; contextual
// controls (dimension pickers, pole toggle) appear only when relevant.
// All mutations delegate to existing store actions — no new store changes needed.

import { useState } from 'react'
import { useAppStore } from '../../store/appStore'
import { usePrefsStore } from '../../store/prefsStore'
import styles from './ConversionsTab.module.css'

type FromSource = 'dim-scores' | 'el-weight' | 'random'
type ToTarget   = 'el-weight'  | 'el-color'  | 'dim-scores'

const FROM_LABELS: Record<FromSource, string> = {
  'dim-scores': 'Dimension scores',
  'el-weight':  'Element weight',
  'random':     'Random values',
}

const TO_LABELS: Record<ToTarget, string> = {
  'el-weight':  'Element weight',
  'el-color':   'Element color',
  'dim-scores': 'Dimension scores',
}

const VALID_TO: Record<FromSource, ToTarget[]> = {
  'dim-scores': ['el-weight', 'el-color'],
  'el-weight':  ['dim-scores'],
  'random':     ['dim-scores', 'el-weight', 'el-color'],
}

function buildSummary(
  from: FromSource | '',
  to: ToTarget | '',
  fromLabel: string,
  toLabel: string
): string {
  if (!from || !to) return ''
  const fd = fromLabel || 'the chosen dimension'
  const td = toLabel   || 'the chosen dimension'
  if (from === 'dim-scores' && to === 'el-weight')  return `Sets each element's weight from ${fd} scores (scaled 1–100). Unscored elements unchanged.`
  if (from === 'dim-scores' && to === 'el-color')   return `Sets each element's color from ${fd} scores, interpolating between Preferences colors. Unscored elements unchanged.`
  if (from === 'el-weight'  && to === 'dim-scores') return `Writes each element's weight as its ${td} score (scaled 0–1). All elements updated.`
  if (from === 'random'     && to === 'dim-scores') return `Assigns a random score to every element on ${td}.`
  if (from === 'random'     && to === 'el-weight')  return "Assigns a random weight (1–100) to every element."
  if (from === 'random'     && to === 'el-color')   return "Assigns a random color to every element."
  return ''
}

export function ConversionsTab(): React.JSX.Element {
  const dimensions        = useAppStore(s => s.dimensions)
  const scores            = useAppStore(s => s.scores)
  const dimensionToWeight = useAppStore(s => s.dimensionToWeight)
  const weightToDimension = useAppStore(s => s.weightToDimension)
  const dimensionToColor  = useAppStore(s => s.dimensionToColor)
  const randomizeScores   = useAppStore(s => s.randomizeScores)
  const randomizeWeights  = useAppStore(s => s.randomizeWeights)
  const randomizeColors   = useAppStore(s => s.randomizeColors)

  const { dimColorLow: prefLow, dimColorHigh: prefHigh } = usePrefsStore(s => s.prefs)

  const [fromSource,  setFromSource]  = useState<FromSource | ''>('')
  const [toTarget,    setToTarget]    = useState<ToTarget   | ''>('')
  const [fromDimId,   setFromDimId]   = useState('')
  const [toDimId,     setToDimId]     = useState('')
  const [poleFlipped, setPoleFlipped] = useState(false)
  const [colorLow,    setColorLow]    = useState(prefLow)
  const [colorHigh,   setColorHigh]   = useState(prefHigh)
  const [applied,     setApplied]     = useState(false)

  function handleFromChange(val: string): void {
    setFromSource(val as FromSource | '')
    setToTarget('')
    setFromDimId('')
    setToDimId('')
    setPoleFlipped(false)
    setApplied(false)
  }

  function handleToChange(val: string): void {
    setToTarget(val as ToTarget | '')
    setToDimId('')
    setPoleFlipped(false)
    setApplied(false)
  }

  const showFromDimPicker = fromSource === 'dim-scores'
  const showToDimPicker   = toTarget === 'dim-scores'
  // Pole toggle is only meaningful when converting between dim scores and weight
  const showPole = (fromSource === 'dim-scores' && toTarget === 'el-weight') ||
                   (fromSource === 'el-weight'  && toTarget === 'dim-scores')

  const fromDim  = fromDimId ? dimensions.find(d => d.id === fromDimId) ?? null : null
  const toDim    = toDimId   ? dimensions.find(d => d.id === toDimId)   ?? null : null
  // The dimension that supplies pole labels for the toggle
  const poleDim  = fromSource === 'dim-scores' ? fromDim : toDim

  // Warn before randomizing a dimension that already has scores
  const hasExistingScores = (fromSource === 'random' && !!toDimId)
    ? Object.values(scores).some(el => el[toDimId] !== undefined)
    : false

  const canApply = (() => {
    if (!fromSource || !toTarget) return false
    if (fromSource === 'dim-scores' && !fromDimId) return false
    if (toTarget   === 'dim-scores' && !toDimId)   return false
    return true
  })()

  const fromDimLabel = fromDim?.label ?? ''
  const toDimLabel   = toDim?.label   ?? ''
  const summary      = buildSummary(fromSource, toTarget, fromDimLabel, toDimLabel)

  function handleApply(): void {
    if (!canApply) return
    if      (fromSource === 'dim-scores' && toTarget === 'el-weight')  dimensionToWeight(fromDimId, poleFlipped)
    else if (fromSource === 'dim-scores' && toTarget === 'el-color')   dimensionToColor(fromDimId, colorLow, colorHigh)
    else if (fromSource === 'el-weight'  && toTarget === 'dim-scores') weightToDimension(toDimId, poleFlipped)
    else if (fromSource === 'random'     && toTarget === 'dim-scores') randomizeScores(toDimId)
    else if (fromSource === 'random'     && toTarget === 'el-weight')  randomizeWeights()
    else if (fromSource === 'random'     && toTarget === 'el-color')   randomizeColors()
    setApplied(true)
  }

  return (
    <div className={styles.tab}>

      {/* ── FROM ────────────────────────────────────────────────────────────── */}
      <div className={styles.section}>
        <div className={styles.sectionLabel}>From</div>

        <select className={styles.select} value={fromSource} onChange={e => handleFromChange(e.target.value)}>
          <option value="">Choose source…</option>
          {(Object.keys(FROM_LABELS) as FromSource[]).map(k => (
            <option key={k} value={k}>{FROM_LABELS[k]}</option>
          ))}
        </select>

        {showFromDimPicker && (
          <div className={styles.subControl}>
            <div className={styles.subLabel}>Dimension</div>
            {dimensions.length === 0
              ? <p className={styles.hint}>No dimensions defined.</p>
              : (
                <select className={styles.select} value={fromDimId} onChange={e => { setFromDimId(e.target.value); setApplied(false) }}>
                  <option value="">Choose dimension…</option>
                  {dimensions.map((d, i) => (
                    <option key={d.id} value={d.id}>{d.label || `Dimension ${i + 1}`}</option>
                  ))}
                </select>
              )
            }
          </div>
        )}

        {fromSource === 'el-weight' && <p className={styles.descriptor}>Each element's weight value (1–100).</p>}
        {fromSource === 'random'    && <p className={styles.descriptor}>Random values 0–1, one per element.</p>}
      </div>

      {/* ── Divider ─────────────────────────────────────────────────────────── */}
      <div className={styles.divider}>↓</div>

      {/* ── TO ──────────────────────────────────────────────────────────────── */}
      <div className={styles.section}>
        <div className={styles.sectionLabel}>To</div>

        <select
          className={styles.select}
          value={toTarget}
          disabled={!fromSource}
          onChange={e => handleToChange(e.target.value)}
        >
          {!fromSource
            ? <option value="">Choose a source first…</option>
            : <>
                <option value="">Choose destination…</option>
                {VALID_TO[fromSource].map(k => (
                  <option key={k} value={k}>{TO_LABELS[k]}</option>
                ))}
              </>
          }
        </select>

        {showToDimPicker && (
          <div className={styles.subControl}>
            <div className={styles.subLabel}>Dimension</div>
            {dimensions.length === 0
              ? <p className={styles.hint}>No dimensions defined.</p>
              : (
                <select className={styles.select} value={toDimId} onChange={e => { setToDimId(e.target.value); setApplied(false) }}>
                  <option value="">Choose dimension…</option>
                  {dimensions.map((d, i) => (
                    <option key={d.id} value={d.id}>{d.label || `Dimension ${i + 1}`}</option>
                  ))}
                </select>
              )
            }
          </div>
        )}

        {/* Pole toggle — shown only for dim↔weight, and only once a dimension is chosen */}
        {showPole && poleDim && (
          <div className={styles.subControl}>
            <div className={styles.subLabel}>High end</div>
            <div className={styles.poleButtons}>
              <button
                type="button"
                className={`${styles.poleBtn} ${poleFlipped ? styles.poleBtnActive : ''}`}
                onClick={() => { setPoleFlipped(true); setApplied(false) }}
              >
                {poleDim.poleA || 'Pole A'}
              </button>
              <button
                type="button"
                className={`${styles.poleBtn} ${!poleFlipped ? styles.poleBtnActive : ''}`}
                onClick={() => { setPoleFlipped(false); setApplied(false) }}
              >
                {poleDim.poleB || 'Pole B'}
              </button>
            </div>
          </div>
        )}

        {toTarget === 'el-color' && fromSource === 'dim-scores' && (
          <div className={styles.colorRow}>
            <label className={styles.colorField}>
              <span className={styles.subLabel}>Low (score 0)</span>
              <input
                type="color"
                className={styles.colorPicker}
                value={colorLow}
                onChange={e => { setColorLow(e.target.value); setApplied(false) }}
              />
            </label>
            <label className={styles.colorField}>
              <span className={styles.subLabel}>High (score 1)</span>
              <input
                type="color"
                className={styles.colorPicker}
                value={colorHigh}
                onChange={e => { setColorHigh(e.target.value); setApplied(false) }}
              />
            </label>
          </div>
        )}
      </div>

      {/* ── Footer: summary + warning + apply ───────────────────────────────── */}
      {canApply && (
        <div className={styles.footer}>
          {summary && <p className={styles.summary}>{summary}</p>}
          {hasExistingScores && (
            <p className={styles.warning}>
              ⚠ {toDim?.label || 'This dimension'} already has scores — applying will overwrite them.
            </p>
          )}
          <button
            className={applied ? styles.applyBtnDone : hasExistingScores ? styles.applyBtnOverwrite : styles.applyBtn}
            disabled={applied}
            onClick={handleApply}
          >
            {applied ? 'Applied' : hasExistingScores ? 'Overwrite & Randomize' : 'Apply Conversion'}
          </button>
        </div>
      )}

    </div>
  )
}
