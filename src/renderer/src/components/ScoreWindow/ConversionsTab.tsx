// ── ConversionsTab ─────────────────────────────────────────────────────────────
//
// Data-conversion operations presented as a FROM → TO pipeline.
// User picks a source kind and a destination kind from dropdowns; contextual
// controls (dimension pickers, pole toggle, color pickers) appear only when
// relevant. All mutations delegate to store actions.

import { useState } from 'react'
import { useAppStore } from '../../store/appStore'
import { usePrefsStore } from '../../store/prefsStore'
import type { TypeColorMethod } from '../../lib/types'
import styles from './ConversionsTab.module.css'

type FromSource = 'dim-scores' | 'el-weight' | 'random' | 'type' | 'el-shape' | 'el-color'
type ToTarget   = 'el-weight'  | 'el-color'  | 'dim-scores' | 'el-shape' | 'type'

const FROM_LABELS: Record<FromSource, string> = {
  'dim-scores': 'Dimension scores',
  'el-weight':  'Element weight',
  'random':     'Random values',
  'type':       'Type membership',
  'el-shape':   'Element shape',
  'el-color':   'Element color',
}

const TO_LABELS: Record<ToTarget, string> = {
  'el-weight':  'Element weight',
  'el-color':   'Element color',
  'dim-scores': 'Dimension scores',
  'el-shape':   'Element shape',
  'type':       'Type membership',
}

const VALID_TO: Record<FromSource, ToTarget[]> = {
  'dim-scores': ['el-weight', 'el-color', 'dim-scores'],
  'el-weight':  ['dim-scores'],
  'random':     ['dim-scores', 'el-weight', 'el-color'],
  'type':       ['el-color', 'el-shape'],
  'el-shape':   ['el-color', 'type'],
  'el-color':   ['el-shape'],
}

function buildSummary(
  from: FromSource | '', to: ToTarget | '', fromLabel: string, toLabel: string,
  typeColorMethod: TypeColorMethod
): string {
  if (!from || !to) return ''
  const fd = fromLabel || 'the chosen dimension'
  const td = toLabel   || 'the chosen dimension'
  if (from === 'dim-scores' && to === 'el-weight')  return `Sets each element's weight from ${fd} scores (scaled 1–100). Unscored elements unchanged.`
  if (from === 'dim-scores' && to === 'el-color')   return `Sets each element's color from ${fd} scores, interpolating between the chosen colors. Unscored elements unchanged.`
  if (from === 'dim-scores' && to === 'dim-scores') return `Copies scores from ${fd} to ${td}. Only scored elements are updated; unscored elements unchanged.`
  if (from === 'el-weight'  && to === 'dim-scores') return `Writes each element's weight as its ${td} score (scaled 0–1). All elements updated.`
  if (from === 'random'     && to === 'dim-scores') return `Assigns a random score to every element on ${td}.`
  if (from === 'random'     && to === 'el-weight')  return "Assigns a random weight (1–100) to every element."
  if (from === 'random'     && to === 'el-color')   return "Assigns a random color to every element."
  if (from === 'type'       && to === 'el-color')   return typeColorMethod === 'blend'
    ? "Sets each element's color by mixing the colors of every type it belongs to, weighted by membership strength — the same blend a map colored by type draws. Elements with no type scores unchanged."
    : "Sets each element's color from its dominant type's color. Elements with no type scores unchanged."
  if (from === 'type'       && to === 'el-shape')   return "Assigns shapes by type order: circle, square, triangle, diamond (cycling). Elements with no type scores unchanged."
  if (from === 'el-shape'   && to === 'el-color')   return "Sets each element's color by shape: circle→blue, square→red, triangle→green, diamond→purple."
  if (from === 'el-shape'   && to === 'type')       return "Sets type membership to 1.0 for each element's matched type, 0.0 for others. Matched by creation order: circle=1st, square=2nd, triangle=3rd, diamond=4th (cycling)."
  if (from === 'el-color'   && to === 'el-shape')   return "Sets each element's shape by hue: red→circle, yellow-green→square, blue→triangle, purple→diamond."
  return ''
}

export function ConversionsTab(): React.JSX.Element {
  const dimensions         = useAppStore(s => s.dimensions)
  const types              = useAppStore(s => s.types)
  const scores             = useAppStore(s => s.scores)
  const dimensionToWeight  = useAppStore(s => s.dimensionToWeight)
  const weightToDimension  = useAppStore(s => s.weightToDimension)
  const dimensionToColor   = useAppStore(s => s.dimensionToColor)
  const dimToDimScores     = useAppStore(s => s.dimToDimScores)
  const randomizeScores    = useAppStore(s => s.randomizeScores)
  const randomizeWeights   = useAppStore(s => s.randomizeWeights)
  const randomizeColors    = useAppStore(s => s.randomizeColors)
  const typeToElementColor = useAppStore(s => s.typeToElementColor)
  const typeToElementShape = useAppStore(s => s.typeToElementShape)
  const shapeToColor       = useAppStore(s => s.shapeToColor)
  const colorToShape       = useAppStore(s => s.colorToShape)
  const shapeToType        = useAppStore(s => s.shapeToType)
  const spreadDimensionScores = useAppStore(s => s.spreadDimensionScores)

  const { dimColorLow: prefLow, dimColorHigh: prefHigh } = usePrefsStore(s => s.prefs)

  const [fromSource,  setFromSource]  = useState<FromSource | ''>('')
  const [toTarget,    setToTarget]    = useState<ToTarget   | ''>('')
  const [fromDimId,   setFromDimId]   = useState('')
  const [toDimId,     setToDimId]     = useState('')
  const [poleFlipped, setPoleFlipped] = useState(false)
  const [colorLow,    setColorLow]    = useState(prefLow)
  const [colorHigh,   setColorHigh]   = useState(prefHigh)
  const [applied,     setApplied]     = useState(false)

  // Blending matches what a map colored by type shows, so it is the default;
  // 'dominant' stays available as the flatter, one-color-per-element result.
  const [typeColorMethod, setTypeColorMethod] = useState<TypeColorMethod>('blend')

  const [spreadDimId, setSpreadDimId] = useState('')
  const [spreadApplied, setSpreadApplied] = useState(false)
  const spreadDim = spreadDimId ? dimensions.find(d => d.id === spreadDimId) ?? null : null

  function handleSpreadApply(): void {
    if (!spreadDimId) return
    spreadDimensionScores(spreadDimId)
    setSpreadApplied(true)
  }

  function handleFromChange(val: string): void {
    setFromSource(val as FromSource | '')
    setToTarget('')
    setFromDimId('')
    setToDimId('')
    setPoleFlipped(false)
    setTypeColorMethod('blend')
    setApplied(false)
  }

  function handleToChange(val: string): void {
    setToTarget(val as ToTarget | '')
    setToDimId('')
    setPoleFlipped(false)
    setTypeColorMethod('blend')
    setApplied(false)
  }

  const showFromDimPicker = fromSource === 'dim-scores'
  const showToDimPicker   = toTarget === 'dim-scores'
  const showPole = (fromSource === 'dim-scores' && toTarget === 'el-weight') ||
                   (fromSource === 'el-weight'  && toTarget === 'dim-scores')
  const showColorPickers  = fromSource === 'dim-scores' && toTarget === 'el-color'
  // Type → element color is the one pair with two defensible answers, so it is
  // the one pair that asks. Every other conversion has a single meaning.
  const showTypeColorMethod = fromSource === 'type' && toTarget === 'el-color' && types.length > 0

  const fromDim = fromDimId ? dimensions.find(d => d.id === fromDimId) ?? null : null
  const toDim   = toDimId   ? dimensions.find(d => d.id === toDimId)   ?? null : null
  const poleDim = fromSource === 'dim-scores' ? fromDim : toDim

  const hasExistingScores = (fromSource === 'random' && !!toDimId)
    ? Object.values(scores).some(el => el[toDimId] !== undefined)
    : false

  const canApply = (() => {
    if (!fromSource || !toTarget) return false
    if (fromSource === 'dim-scores' && !fromDimId) return false
    if (toTarget   === 'dim-scores' && !toDimId)   return false
    if (fromSource === 'dim-scores' && toTarget === 'dim-scores' && fromDimId === toDimId) return false
    if ((fromSource === 'type' || toTarget === 'type') && types.length === 0) return false
    return true
  })()

  const summary = buildSummary(fromSource, toTarget, fromDim?.label ?? '', toDim?.label ?? '', typeColorMethod)

  function handleApply(): void {
    if (!canApply) return
    if      (fromSource === 'dim-scores' && toTarget === 'el-weight')  dimensionToWeight(fromDimId, poleFlipped)
    else if (fromSource === 'dim-scores' && toTarget === 'el-color')   dimensionToColor(fromDimId, colorLow, colorHigh)
    else if (fromSource === 'dim-scores' && toTarget === 'dim-scores') dimToDimScores(fromDimId, toDimId)
    else if (fromSource === 'el-weight'  && toTarget === 'dim-scores') weightToDimension(toDimId, poleFlipped)
    else if (fromSource === 'random'     && toTarget === 'dim-scores') randomizeScores(toDimId)
    else if (fromSource === 'random'     && toTarget === 'el-weight')  randomizeWeights()
    else if (fromSource === 'random'     && toTarget === 'el-color')   randomizeColors()
    else if (fromSource === 'type'       && toTarget === 'el-color')   typeToElementColor(typeColorMethod)
    else if (fromSource === 'type'       && toTarget === 'el-shape')   typeToElementShape()
    else if (fromSource === 'el-shape'   && toTarget === 'el-color')   shapeToColor()
    else if (fromSource === 'el-shape'   && toTarget === 'type')       shapeToType()
    else if (fromSource === 'el-color'   && toTarget === 'el-shape')   colorToShape()
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
                <select className={styles.select} value={fromDimId} onChange={e => { const v = e.target.value; setFromDimId(v); if (v === toDimId) setToDimId(''); setApplied(false) }}>
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
        {fromSource === 'random'    && <p className={styles.descriptor}>Random values, one per element.</p>}
        {fromSource === 'type'      && <p className={styles.descriptor}>Each element's type memberships (0–1 per type).</p>}
        {fromSource === 'el-shape'  && <p className={styles.descriptor}>Each element's current shape.</p>}
        {fromSource === 'el-color'  && <p className={styles.descriptor}>Each element's current color.</p>}
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
                  {dimensions
                    .filter(d => !(fromSource === 'dim-scores' && d.id === fromDimId))
                    .map((d, i) => (
                      <option key={d.id} value={d.id}>{d.label || `Dimension ${i + 1}`}</option>
                    ))}
                </select>
              )
            }
          </div>
        )}

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

        {showColorPickers && (
          <div className={styles.colorRow}>
            <label className={styles.colorField}>
              <span className={styles.subLabel}>Low (score 0)</span>
              <input type="color" className={styles.colorPicker} value={colorLow}
                onChange={e => { setColorLow(e.target.value); setApplied(false) }} />
            </label>
            <label className={styles.colorField}>
              <span className={styles.subLabel}>High (score 1)</span>
              <input type="color" className={styles.colorPicker} value={colorHigh}
                onChange={e => { setColorHigh(e.target.value); setApplied(false) }} />
            </label>
          </div>
        )}

        {showTypeColorMethod && (
          <div className={styles.subControl}>
            <div className={styles.subLabel}>Method</div>
            <div className={styles.poleButtons}>
              <button
                type="button"
                className={`${styles.poleBtn} ${typeColorMethod === 'blend' ? styles.poleBtnActive : ''}`}
                onClick={() => { setTypeColorMethod('blend'); setApplied(false) }}
              >
                Blend all types
              </button>
              <button
                type="button"
                className={`${styles.poleBtn} ${typeColorMethod === 'dominant' ? styles.poleBtnActive : ''}`}
                onClick={() => { setTypeColorMethod('dominant'); setApplied(false) }}
              >
                Dominant type
              </button>
            </div>
          </div>
        )}

        {fromSource === 'type' && toTarget === 'el-color' && types.length === 0 && (
          <p className={styles.hint}>No types defined.</p>
        )}
        {fromSource === 'el-shape' && toTarget === 'type' && types.length === 0 && (
          <p className={styles.hint}>No types defined.</p>
        )}
        {fromSource === 'el-shape' && toTarget === 'el-color' && (
          <p className={styles.descriptor}>circle → #4080c0 · square → #c04040 · triangle → #40a040 · diamond → #a040a0</p>
        )}
        {fromSource === 'el-color' && toTarget === 'el-shape' && (
          <p className={styles.descriptor}>By hue: red → circle · yellow-green → square · blue → triangle · purple → diamond</p>
        )}
        {fromSource === 'type' && toTarget === 'el-shape' && types.length > 0 && (
          <p className={styles.descriptor}>Type order → shape: 1st circle · 2nd square · 3rd triangle · 4th diamond (cycling)</p>
        )}
        {fromSource === 'el-shape' && toTarget === 'type' && types.length > 0 && (
          <p className={styles.descriptor}>Matched by creation order: circle=1st type · square=2nd · triangle=3rd · diamond=4th (cycling)</p>
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

      {/* ── Spread: rescale a dimension's scores to fill .05–.95 ───────────── */}
      <div className={`${styles.section} ${styles.standaloneSection}`}>
        <div className={styles.sectionLabel}>Spread dimension to fill range</div>

        <select
          className={styles.select}
          value={spreadDimId}
          onChange={e => { setSpreadDimId(e.target.value); setSpreadApplied(false) }}
        >
          <option value="">Choose dimension…</option>
          {dimensions.map((d, i) => (
            <option key={d.id} value={d.id}>{d.label || `Dimension ${i + 1}`}</option>
          ))}
        </select>

        {spreadDim && (
          <div className={styles.footer}>
            <p className={styles.summary}>
              Rescales {spreadDim.label || 'this dimension'}&apos;s scores so the lowest becomes .05 and the
              highest becomes .95, preserving relative spacing. Unscored elements unchanged.
            </p>
            <button
              className={spreadApplied ? styles.applyBtnDone : styles.applyBtn}
              disabled={spreadApplied}
              onClick={handleSpreadApply}
            >
              {spreadApplied ? 'Applied' : 'Apply Spread'}
            </button>
          </div>
        )}
      </div>

    </div>
  )
}
