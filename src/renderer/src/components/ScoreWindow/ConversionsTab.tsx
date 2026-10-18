// ── ConversionsTab ─────────────────────────────────────────────────────────────
//
// Mapping operations use a FROM → TO pipeline described by the CONVERSIONS
// table. Scaling and Randomizing are independent action groups. Every change
// is a pure transform (store/transforms.ts) applied through the store.

import { useState } from 'react'
import { useAppStore } from '../../store/appStore'
import { usePrefsStore } from '../../store/prefsStore'
import {
  colorFromCollections, colorFromScores, colorFromShape, collectionsFromShape, copyScores,
  randomCollectionAssignments, randomCollectionColors, randomDimensionWeights, randomElementColors,
  randomElementShapes, randomElementWeights, randomScores, scoresFromWeights, shapeFromCollections,
  shapeFromColor, spreadScores, weightFromScores, type Transform
} from '../../store/transforms'
import { ConfirmationDisc, ForwardActionButton } from '../ConfirmationDisc'
import { hostCapabilities } from '../../lib/host'
import styles from './ConversionsTab.module.css'

type Kind = 'dim-scores' | 'el-weight' | 'collection' | 'el-shape' | 'el-color'

const LABELS: Record<Kind, string> = {
  'dim-scores': 'Dimension scores',
  'el-weight':  'Element weight',
  'collection': 'Collection membership',
  'el-shape':   'Element shape',
  'el-color':   'Element color'
}

interface Choices { fromDimId: string; toDimId: string; flipped: boolean; colorLow: string; colorHigh: string }

/** The labels a result text names: the chosen dimensions, and the ends of the pole choice. */
interface SummaryLabels { from: string; to: string; high: string; low: string }

/**
 * One mapping. `summary` says what applying it will do; `pole` asks which end
 * is high, of the source or the destination dimension; `colors` asks for the
 * two ends of a colour gradient; `needsCollections` refuses to apply without
 * any.
 */
interface Conversion {
  from: Kind
  to: Kind
  summary: (labels: SummaryLabels) => string
  apply: (choices: Choices) => Transform
  pole?: 'from' | 'to'
  colors?: boolean
  needsCollections?: boolean
}

/** Every mapping, in the order the destination menu lists them. */
const CONVERSIONS: Conversion[] = [
  { from: 'dim-scores', to: 'el-weight', pole: 'from',
    summary: l => `Sets each element's weight from 1 to 100 by its ${l.from} score, heaviest toward ${l.high}. Unscored elements keep theirs.`,
    apply: c => weightFromScores(c.fromDimId, c.flipped) },
  { from: 'dim-scores', to: 'el-color', colors: true,
    summary: l => `Colors each element between the two chosen colors by its ${l.from} score. Unscored elements keep theirs.`,
    apply: c => colorFromScores(c.fromDimId, c.colorLow, c.colorHigh) },
  { from: 'dim-scores', to: 'dim-scores',
    summary: l => `Copies ${l.from} scores onto ${l.to}, replacing any there. Elements unscored on ${l.from} keep their ${l.to} score.`,
    apply: c => copyScores(c.fromDimId, c.toDimId) },
  { from: 'el-weight', to: 'dim-scores', pole: 'to',
    summary: l => `Scores every element on ${l.to} by weight, lightest at ${l.low} and heaviest at ${l.high}. Replaces existing ${l.to} scores.`,
    apply: c => scoresFromWeights(c.toDimId, c.flipped) },
  { from: 'collection', to: 'el-color', needsCollections: true,
    summary: () => "Colors each element with the mix of its collections' colors, as a map colored by collection shows it. Elements in no collection keep theirs.",
    apply: () => colorFromCollections },
  { from: 'collection', to: 'el-shape', needsCollections: true,
    summary: () => 'Gives each element the shape of its first collection: 1st circle, 2nd square, 3rd triangle, 4th diamond, then repeating. Elements in no collection keep theirs.',
    apply: () => shapeFromCollections },
  { from: 'el-shape', to: 'el-color',
    summary: () => 'Colors every element by shape: circles blue, squares red, triangles green, diamonds purple.',
    apply: () => colorFromShape },
  { from: 'el-shape', to: 'collection', needsCollections: true,
    summary: () => "Replaces every element's collections by shape: circles join the 1st collection, squares the 2nd, triangles the 3rd, diamonds the 4th, and every 4th after.",
    apply: () => collectionsFromShape },
  { from: 'el-color', to: 'el-shape',
    summary: () => 'Shapes every element by the hue of its color: reds circle, oranges to greens square, cyans and blues triangle, purples and pinks diamond. Grays and white count as red.',
    apply: () => shapeFromColor }
]

const SOURCES = [...new Set(CONVERSIONS.map(c => c.from))]

export function ConversionsTab(): React.JSX.Element {
  const dimensions  = useAppStore(s => s.dimensions)
  const collections = useAppStore(s => s.collections)
  const scores      = useAppStore(s => s.scores)
  const transform   = useAppStore(s => s.transform)

  const { dimColorLow: prefLow, dimColorHigh: prefHigh } = usePrefsStore(s => s.prefs)

  const [fromSource,  setFromSource]  = useState<Kind | ''>('')
  const [toTarget,    setToTarget]    = useState<Kind | ''>('')
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

  const randomizerGroups: { label: string; options: { id: string; label: string; summary: string; overwrites: boolean; apply: Transform }[] }[] = [
    {
      label: 'Elements',
      options: [
        {
          id: 'element-weights', label: 'Element weights (1–100)',
          summary: 'Assigns a random weight from 1–100 to every element.',
          overwrites: false, apply: randomElementWeights
        },
        {
          id: 'element-colors', label: 'Element colors',
          summary: 'Assigns a random readable color to every element.',
          overwrites: false, apply: randomElementColors
        },
        {
          id: 'element-shapes', label: 'Element shapes',
          summary: 'Assigns a random circle, square, triangle, or diamond to every element.',
          overwrites: false, apply: randomElementShapes
        }
      ]
    },
    {
      label: 'Dimensions',
      options: [
        {
          id: 'dimension-weights', label: 'Dimension weights (1–100)',
          summary: 'Assigns a random weight from 1–100 to every dimension.',
          overwrites: false, apply: randomDimensionWeights
        },
        ...dimensions.map((dimension, index) => ({
          id: `dimension:${dimension.id}`,
          label: `Dimension scores — ${dimension.label || `Dimension ${index + 1}`}`,
          summary: `Assigns a random score to every element on ${dimension.label || `Dimension ${index + 1}`}.`,
          overwrites: Object.values(scores).some(row => row[dimension.id] !== undefined),
          apply: randomScores(dimension.id)
        }))
      ]
    },
    {
      label: 'Collections',
      options: [
        {
          id: 'collection-colors', label: 'Collection colors',
          summary: 'Assigns a random readable color to every collection.',
          overwrites: false, apply: randomCollectionColors
        },
        {
          id: 'collection-assignments', label: 'Element-to-collection assignments',
          summary: 'Replaces every element’s collection memberships with independently randomized assignments.',
          overwrites: false, apply: randomCollectionAssignments
        }
      ]
    }
  ]
  const randomizers = randomizerGroups.flatMap(group => group.options)
  const randomizer = randomizers.find(option => option.id === randomizerId) ?? null

  function handleSpreadApply(): void {
    if (!spreadDim) return
    transform(spreadScores(spreadDim.id))
    setSpreadApplied(true)
  }

  function applyRandomizer(): void {
    if (!randomizer) return
    transform(randomizer.apply)
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
    setFromSource(val as Kind | '')
    setToTarget('')
    setFromDimId('')
    setToDimId('')
    setPoleFlipped(false)
    setApplied(false)
  }

  function handleToChange(val: string): void {
    setToTarget(val as Kind | '')
    setToDimId('')
    setPoleFlipped(false)
    setApplied(false)
  }

  const conversion = CONVERSIONS.find(c => c.from === fromSource && c.to === toTarget) ?? null
  const showFromDimPicker = fromSource === 'dim-scores'
  const showToDimPicker   = toTarget === 'dim-scores'

  const fromDim = fromDimId ? dimensions.find(d => d.id === fromDimId) ?? null : null
  const toDim   = toDimId   ? dimensions.find(d => d.id === toDimId)   ?? null : null
  const poleDim = conversion?.pole === 'from' ? fromDim : toDim
  const noCollections = !!conversion?.needsCollections && collections.length === 0

  const canApply = !!conversion &&
    (fromSource !== 'dim-scores' || !!fromDim) &&
    (toTarget !== 'dim-scores' || !!toDim) &&
    !(fromSource === 'dim-scores' && toTarget === 'dim-scores' && fromDimId === toDimId) &&
    !noCollections

  const poleA = poleDim?.poleA || 'Pole A'
  const poleB = poleDim?.poleB || 'Pole B'
  const summary = conversion?.summary({
    from: fromDim?.label || 'the chosen dimension',
    to: toDim?.label || 'the chosen dimension',
    high: poleFlipped ? poleA : poleB,
    low: poleFlipped ? poleB : poleA
  }) ?? ''

  function handleApply(): void {
    if (!canApply || !conversion) return
    transform(conversion.apply({ fromDimId, toDimId, flipped: poleFlipped, colorLow, colorHigh }))
    setApplied(true)
  }

  const narrow = hostCapabilities().narrowDataViews

  return (
    <div className={narrow ? `${styles.tab} ${styles.narrow}` : styles.tab}>

      <section className={styles.group}>
        <h2 className={styles.groupTitle}>Mapping</h2>
        <div className={styles.groupBody}>

      {/* One field in narrow views: FROM, TO, then what the mapping will do and
          the green arrow that applies it. Thin arrows run down from each label
          to the next step, and each label's contents sit indented beside them. */}
      <div className={styles.pipeline}>

      {/* ── FROM ────────────────────────────────────────────────────────────── */}
      <div className={styles.section}>
        <div className={styles.sectionLabel}>From</div>
        <div className={narrow ? `${styles.sectionBody} ${styles.flowDown}` : styles.sectionBody}>

          <select
            className={styles.select}
            value={fromSource}
            onChange={e => handleFromChange(e.target.value)}
            aria-label="Source"
            data-transform-source
          >
            <option value="">Choose source…</option>
            {SOURCES.map(k => <option key={k} value={k}>{LABELS[k]}</option>)}
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
        </div>
      </div>

      {/* ── Divider (narrow views draw a thin arrow from FROM to TO instead) ── */}
      {!narrow && <div className={styles.divider}>↓</div>}

      {/* ── TO ──────────────────────────────────────────────────────────────── */}
      <div className={styles.section}>
        <div className={styles.sectionLabel}>To</div>
        <div className={narrow && canApply ? `${styles.sectionBody} ${styles.flowDown}` : styles.sectionBody}>

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
                  {CONVERSIONS.filter(c => c.from === fromSource).map(c => (
                    <option key={c.to} value={c.to}>{LABELS[c.to]}</option>
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

          {conversion?.pole && poleDim && (
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

          {conversion?.colors && (
            <div className={styles.colorRow}>
              <label className={styles.colorField}>
                <span className={styles.subLabel}>Low ({fromDim?.poleA || 'score 0'})</span>
                <input type="color" className={styles.colorPicker} value={colorLow}
                  onChange={e => { setColorLow(e.target.value); setApplied(false) }} />
              </label>
              <label className={styles.colorField}>
                <span className={styles.subLabel}>High ({fromDim?.poleB || 'score 1'})</span>
                <input type="color" className={styles.colorPicker} value={colorHigh}
                  onChange={e => { setColorHigh(e.target.value); setApplied(false) }} />
              </label>
            </div>
          )}

          {noCollections && <p className={styles.hint}>No collections defined.</p>}
        </div>
      </div>

      {narrow && canApply && (
        <div className={styles.pipelineFooter}>
          {summary && <p className={styles.pipelineSummary}>{summary}</p>}
          <div className={styles.applyRow}>
            <span className={styles.applyLabel}>{applied ? 'Applied' : 'Apply Conversion'}</span>
            <ForwardActionButton label="Apply Conversion" disabled={applied} onClick={handleApply} />
          </div>
        </div>
      )}

      </div>

      {/* ── Footer: summary + warning + apply ───────────────────────────────── */}
      {!narrow && canApply && (
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
