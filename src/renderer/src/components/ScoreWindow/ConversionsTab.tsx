// ── ConversionsTab ─────────────────────────────────────────────────────────────
//
// Mapping operations use a FROM → TO pipeline. Scaling and Randomizing are
// independent action groups. All mutations delegate to store actions.

import { useState } from 'react'
import { useAppStore } from '../../store/appStore'
import { usePrefsStore } from '../../store/prefsStore'
import { ConfirmationDisc } from '../ConfirmationDisc'
import styles from './ConversionsTab.module.css'

type FromSource = 'dim-scores' | 'el-weight' | 'collection' | 'el-shape' | 'el-color'
type ToTarget   = 'el-weight'  | 'el-color'  | 'dim-scores' | 'el-shape' | 'collection'

const FROM_LABELS: Record<FromSource, string> = {
  'dim-scores': 'Dimension scores',
  'el-weight':  'Element weight',
  'collection': 'Collection membership',
  'el-shape':   'Element shape',
  'el-color':   'Element color',
}

const TO_LABELS: Record<ToTarget, string> = {
  'el-weight':  'Element weight',
  'el-color':   'Element color',
  'dim-scores': 'Dimension scores',
  'el-shape':   'Element shape',
  'collection': 'Collection membership',
}

const VALID_TO: Record<FromSource, ToTarget[]> = {
  'dim-scores': ['el-weight', 'el-color', 'dim-scores'],
  'el-weight':  ['dim-scores'],
  'collection': ['el-color', 'el-shape'],
  'el-shape':   ['el-color', 'collection'],
  'el-color':   ['el-shape'],
}

function buildSummary(
  from: FromSource | '', to: ToTarget | '', fromLabel: string, toLabel: string
): string {
  if (!from || !to) return ''
  const fd = fromLabel || 'the chosen dimension'
  const td = toLabel   || 'the chosen dimension'
  if (from === 'dim-scores' && to === 'el-weight')  return `Sets each element's weight from ${fd} scores (scaled 1–100). Unscored elements unchanged.`
  if (from === 'dim-scores' && to === 'el-color')   return `Sets each element's color from ${fd} scores, interpolating between the chosen colors. Unscored elements unchanged.`
  if (from === 'dim-scores' && to === 'dim-scores') return `Copies scores from ${fd} to ${td}. Only scored elements are updated; unscored elements unchanged.`
  if (from === 'el-weight'  && to === 'dim-scores') return `Writes each element's weight as its ${td} score, scaling the current weight range to 0–1. All elements updated.`
  if (from === 'collection' && to === 'el-color')   return "Sets each element's color by mixing the colors of every collection it belongs to — the same mix a map colored by collection draws. Elements in no collection unchanged."
  if (from === 'collection' && to === 'el-shape')   return "Assigns shapes by collection order: circle, square, triangle, diamond (cycling). Elements in no collection unchanged."
  if (from === 'el-shape'   && to === 'el-color')   return "Sets each element's color by shape: circle→blue, square→red, triangle→green, diamond→purple."
  if (from === 'el-shape'   && to === 'collection') return "Puts each element in its matched collection and no other, replacing its current memberships. Matched by creation order: circle=1st, square=2nd, triangle=3rd, diamond=4th (cycling)."
  if (from === 'el-color'   && to === 'el-shape')   return "Sets each element's shape by hue: red→circle, yellow-green→square, blue→triangle, purple→diamond."
  return ''
}

export function ConversionsTab(): React.JSX.Element {
  const dimensions         = useAppStore(s => s.dimensions)
  const collections        = useAppStore(s => s.collections)
  const scores             = useAppStore(s => s.scores)
  const dimensionToWeight  = useAppStore(s => s.dimensionToWeight)
  const weightToDimension  = useAppStore(s => s.weightToDimension)
  const dimensionToColor   = useAppStore(s => s.dimensionToColor)
  const dimToDimScores     = useAppStore(s => s.dimToDimScores)
  const randomizeScores    = useAppStore(s => s.randomizeScores)
  const randomizeElementWeights = useAppStore(s => s.randomizeElementWeights)
  const randomizeElementColors = useAppStore(s => s.randomizeElementColors)
  const randomizeDimensionWeights = useAppStore(s => s.randomizeDimensionWeights)
  const randomizeCollectionColors = useAppStore(s => s.randomizeCollectionColors)
  const randomizeElementShapes = useAppStore(s => s.randomizeElementShapes)
  const randomizeCollectionAssignments = useAppStore(s => s.randomizeCollectionAssignments)
  const collectionToElementColor = useAppStore(s => s.collectionToElementColor)
  const collectionToElementShape = useAppStore(s => s.collectionToElementShape)
  const shapeToColor       = useAppStore(s => s.shapeToColor)
  const colorToShape       = useAppStore(s => s.colorToShape)
  const shapeToCollection  = useAppStore(s => s.shapeToCollection)
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

  const [spreadDimId, setSpreadDimId] = useState('')
  const [spreadApplied, setSpreadApplied] = useState(false)
  const [randomizerId, setRandomizerId] = useState('')
  const [randomizerApplied, setRandomizerApplied] = useState(false)
  const [showRandomizeConfirm, setShowRandomizeConfirm] = useState(false)
  const spreadDim = spreadDimId ? dimensions.find(d => d.id === spreadDimId) ?? null : null

  const randomizerGroups = [
    {
      label: 'Elements',
      options: [
        {
          id: 'element-weights', label: 'Element weights (1–100)',
          summary: 'Assigns a random weight from 1–100 to every element.',
          overwrites: false, apply: randomizeElementWeights
        },
        {
          id: 'element-colors', label: 'Element colors',
          summary: 'Assigns a random readable color to every element.',
          overwrites: false, apply: randomizeElementColors
        },
        {
          id: 'element-shapes', label: 'Element shapes',
          summary: 'Assigns a random circle, square, triangle, or diamond to every element.',
          overwrites: false, apply: randomizeElementShapes
        }
      ]
    },
    {
      label: 'Dimensions',
      options: [
        {
          id: 'dimension-weights', label: 'Dimension weights (1–100)',
          summary: 'Assigns a random weight from 1–100 to every dimension.',
          overwrites: false, apply: randomizeDimensionWeights
        },
        ...dimensions.map((dimension, index) => ({
          id: `dimension:${dimension.id}`,
          label: `Dimension scores — ${dimension.label || `Dimension ${index + 1}`}`,
          summary: `Assigns a random score to every element on ${dimension.label || `Dimension ${index + 1}`}.`,
          overwrites: Object.values(scores).some(row => row[dimension.id] !== undefined),
          apply: () => randomizeScores(dimension.id)
        }))
      ]
    },
    {
      label: 'Collections',
      options: [
        {
          id: 'collection-colors', label: 'Collection colors',
          summary: 'Assigns a random readable color to every collection.',
          overwrites: false, apply: randomizeCollectionColors
        },
        {
          id: 'collection-assignments', label: 'Element-to-collection assignments',
          summary: 'Replaces every element’s collection memberships with independently randomized assignments.',
          overwrites: false, apply: randomizeCollectionAssignments
        }
      ]
    }
  ]
  const randomizers = randomizerGroups.flatMap(group => group.options)
  const randomizer = randomizers.find(option => option.id === randomizerId) ?? null

  function handleSpreadApply(): void {
    if (!spreadDim) return
    spreadDimensionScores(spreadDim.id)
    setSpreadApplied(true)
  }

  function applyRandomizer(): void {
    if (!randomizer) return
    randomizer.apply()
    setRandomizerApplied(true)
    setShowRandomizeConfirm(false)
  }

  function handleRandomize(): void {
    if (!randomizer) return
    if (randomizer.overwrites) {
      setShowRandomizeConfirm(true)
      return
    }
    applyRandomizer()
  }

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
  const showPole = (fromSource === 'dim-scores' && toTarget === 'el-weight') ||
                   (fromSource === 'el-weight'  && toTarget === 'dim-scores')
  const showColorPickers  = fromSource === 'dim-scores' && toTarget === 'el-color'

  const fromDim = fromDimId ? dimensions.find(d => d.id === fromDimId) ?? null : null
  const toDim   = toDimId   ? dimensions.find(d => d.id === toDimId)   ?? null : null
  const poleDim = fromSource === 'dim-scores' ? fromDim : toDim

  const canApply = (() => {
    if (!fromSource || !toTarget) return false
    if (fromSource === 'dim-scores' && !fromDim) return false
    if (toTarget   === 'dim-scores' && !toDim)   return false
    if (fromSource === 'dim-scores' && toTarget === 'dim-scores' && fromDimId === toDimId) return false
    if ((fromSource === 'collection' || toTarget === 'collection') && collections.length === 0) return false
    return true
  })()

  const summary = buildSummary(fromSource, toTarget, fromDim?.label ?? '', toDim?.label ?? '')

  function handleApply(): void {
    if (!canApply) return
    if      (fromSource === 'dim-scores' && toTarget === 'el-weight')  dimensionToWeight(fromDimId, poleFlipped)
    else if (fromSource === 'dim-scores' && toTarget === 'el-color')   dimensionToColor(fromDimId, colorLow, colorHigh)
    else if (fromSource === 'dim-scores' && toTarget === 'dim-scores') dimToDimScores(fromDimId, toDimId)
    else if (fromSource === 'el-weight'  && toTarget === 'dim-scores') weightToDimension(toDimId, poleFlipped)
    else if (fromSource === 'collection' && toTarget === 'el-color')   collectionToElementColor()
    else if (fromSource === 'collection' && toTarget === 'el-shape')   collectionToElementShape()
    else if (fromSource === 'el-shape'   && toTarget === 'el-color')   shapeToColor()
    else if (fromSource === 'el-shape'   && toTarget === 'collection') shapeToCollection()
    else if (fromSource === 'el-color'   && toTarget === 'el-shape')   colorToShape()
    else return
    setApplied(true)
  }

  return (
    <div className={styles.tab}>

      <section className={styles.group}>
        <h2 className={styles.groupTitle}>Mapping</h2>
        <div className={styles.groupBody}>

      {/* ── FROM ────────────────────────────────────────────────────────────── */}
      <div className={styles.section}>
        <div className={styles.sectionLabel}>From</div>

        <select
          className={styles.select}
          value={fromSource}
          onChange={e => handleFromChange(e.target.value)}
          aria-label="Source"
          data-transform-source
        >
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
                <select
                  className={styles.select}
                  value={fromDimId}
                  onChange={e => { const v = e.target.value; setFromDimId(v); if (v === toDimId) setToDimId(''); setApplied(false) }}
                  aria-label="Source dimension"
                >
                  <option value="">Choose dimension…</option>
                  {dimensions.map((d, i) => (
                    <option key={d.id} value={d.id}>{d.label || `Dimension ${i + 1}`}</option>
                  ))}
                </select>
              )
            }
          </div>
        )}

        {fromSource === 'el-weight' && <p className={styles.descriptor}>Each element's weight, scaled from the current range.</p>}
        {fromSource === 'collection' && <p className={styles.descriptor}>The collections each element belongs to.</p>}
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
          aria-label="Destination"
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
                <select
                  className={styles.select}
                  value={toDimId}
                  onChange={e => { setToDimId(e.target.value); setApplied(false) }}
                  aria-label="Destination dimension"
                >
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
            <div className={styles.poleButtons} role="group" aria-label="High end">
              <button
                type="button"
                className={`${styles.poleBtn} ${poleFlipped ? styles.poleBtnActive : ''}`}
                onClick={() => { setPoleFlipped(true); setApplied(false) }}
                aria-pressed={poleFlipped}
              >
                {poleDim.poleA || 'Pole A'}
              </button>
              <button
                type="button"
                className={`${styles.poleBtn} ${!poleFlipped ? styles.poleBtnActive : ''}`}
                onClick={() => { setPoleFlipped(false); setApplied(false) }}
                aria-pressed={!poleFlipped}
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

        {fromSource === 'collection' && toTarget === 'el-color' && collections.length === 0 && (
          <p className={styles.hint}>No collections defined.</p>
        )}
        {fromSource === 'el-shape' && toTarget === 'collection' && collections.length === 0 && (
          <p className={styles.hint}>No collections defined.</p>
        )}
        {fromSource === 'el-shape' && toTarget === 'el-color' && (
          <p className={styles.descriptor}>circle → #4080c0 · square → #c04040 · triangle → #40a040 · diamond → #a040a0</p>
        )}
        {fromSource === 'el-color' && toTarget === 'el-shape' && (
          <p className={styles.descriptor}>By hue: red → circle · yellow-green → square · blue → triangle · purple → diamond</p>
        )}
        {fromSource === 'collection' && toTarget === 'el-shape' && collections.length > 0 && (
          <p className={styles.descriptor}>Collection order → shape: 1st circle · 2nd square · 3rd triangle · 4th diamond (cycling)</p>
        )}
        {fromSource === 'el-shape' && toTarget === 'collection' && collections.length > 0 && (
          <p className={styles.descriptor}>Matched by creation order: circle=1st collection · square=2nd · triangle=3rd · diamond=4th (cycling)</p>
        )}
      </div>

      {/* ── Footer: summary + warning + apply ───────────────────────────────── */}
      {canApply && (
        <div className={styles.footer}>
          {summary && <p className={styles.summary}>{summary}</p>}
          <button
            className={applied ? styles.applyBtnDone : styles.applyBtn}
            disabled={applied}
            onClick={handleApply}
          >
            {applied ? 'Applied' : 'Apply Conversion'}
          </button>
        </div>
      )}
        </div>
      </section>

      {/* ── Spread: rescale a dimension's scores to fill .05–.95 ───────────── */}
      <section className={styles.group}>
        <h2 className={styles.groupTitle}>Scaling</h2>
        <div className={styles.groupBody}>
          <div className={styles.section}>
            <div className={styles.sectionLabel}>Spread dimension to fill range</div>

            <select
              className={styles.select}
              value={spreadDimId}
              onChange={e => { setSpreadDimId(e.target.value); setSpreadApplied(false) }}
              aria-label="Dimension to spread"
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
      </section>

      <section className={styles.group}>
        <h2 className={styles.groupTitle}>Randomizing</h2>
        <div className={styles.groupBody}>
          <div className={styles.section}>
            <div className={styles.sectionLabel}>Apply randomizer</div>

            <select
              className={styles.select}
              value={randomizerId}
              onChange={e => {
                setRandomizerId(e.target.value)
                setRandomizerApplied(false)
                setShowRandomizeConfirm(false)
              }}
              aria-label="Randomizer"
            >
              <option value="">Choose randomizer…</option>
              {randomizerGroups.map(group => (
                <optgroup key={group.label} label={group.label}>
                  {group.options.map(option => (
                    <option key={option.id} value={option.id}>{option.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            <p className={styles.descriptor}>
              Randomized element and dimension weights use the range 1–100.
            </p>

            {randomizer && (
              <div className={styles.footer}>
                <p className={styles.summary}>{randomizer.summary}</p>
                {randomizer.overwrites && (
                  <p className={styles.warning}>⚠ Existing scores on this dimension will be overwritten.</p>
                )}
                <button
                  className={randomizerApplied
                    ? styles.applyBtnDone
                    : randomizer.overwrites ? styles.applyBtnOverwrite : styles.applyBtn}
                  disabled={randomizerApplied}
                  onClick={handleRandomize}
                >
                  {randomizerApplied
                    ? 'Applied'
                    : randomizer.overwrites ? 'Overwrite & Randomize' : 'Apply Randomizer'}
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {showRandomizeConfirm && randomizer && (
        <ConfirmationDisc
          fixed
          title="Randomize scores?"
          detail="This will overwrite existing scores with new values"
          actionLabel="Randomize"
          onCancel={() => setShowRandomizeConfirm(false)}
          onAction={applyRandomizer}
        />
      )}

    </div>
  )
}
