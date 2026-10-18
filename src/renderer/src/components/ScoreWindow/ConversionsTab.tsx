// ── ConversionsTab ─────────────────────────────────────────────────────────────
//
// Four groups, in order: mapping (FROM → TO, the CONVERSIONS table),
// randomizing (FOR → RANDOMIZE, the RANDOMIZERS table), scaling, and advanced
// whole-study conversions (ADVANCED). Every change is a pure transform
// (store/transforms.ts) applied through the store.

import { useState } from 'react'
import { useAppStore } from '../../store/appStore'
import { usePrefsStore } from '../../store/prefsStore'
import {
  colorFromCollections, colorFromScores, colorFromShape, collectionsFromShape, copyScores,
  randomCollectionAssignments, randomCollectionColors, randomDimensionWeight, randomElementColors,
  randomElementShapes, randomElementWeights, randomizeAll, randomScores, scoresFromWeights, shapeFromCollections,
  shapeFromColor, spreadScores, weightFromScores, type Transform
} from '../../store/transforms'
import { ConfirmationDisc, ForwardActionButton } from '../ConfirmationDisc'
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

type RandomTarget = 'elements' | 'dimensions' | 'collections'
type RandomAttribute = 'weights' | 'colors' | 'shapes' | 'members' | 'scores' | 'weight'

const TARGET_LABELS: Record<RandomTarget, string> = {
  elements: 'Elements', dimensions: 'Dimensions', collections: 'Collections'
}

const ATTRIBUTE_LABELS: Record<RandomAttribute, string> = {
  weights: 'Weights', colors: 'Colors', shapes: 'Shapes', members: 'Members', scores: 'Scores', weight: 'Weight'
}

/**
 * One randomizer: what it randomizes, for which kind of item. Dimensions are
 * randomized one at a time, chosen under FOR as a mapping's source dimension
 * is; `summary` gets that dimension's name and whether it has scores to
 * replace. Collections' randomizers refuse to apply without any collections.
 */
interface Randomizer {
  target: RandomTarget
  attribute: RandomAttribute
  summary: (labels: { dimension: string; overwrites: boolean }) => string
  apply: (dimensionId: string) => Transform
}

/** Every randomizer, in the order the attribute menu lists them. */
const RANDOMIZERS: Randomizer[] = [
  { target: 'elements', attribute: 'weights',
    summary: () => 'Gives every element a random weight from 1 to 100.',
    apply: () => randomElementWeights },
  { target: 'elements', attribute: 'colors',
    summary: () => 'Gives every element a random readable color.',
    apply: () => randomElementColors },
  { target: 'elements', attribute: 'shapes',
    summary: () => 'Gives every element a random shape: circle, square, triangle or diamond.',
    apply: () => randomElementShapes },
  { target: 'dimensions', attribute: 'scores',
    summary: l => `Gives every element a random score on ${l.dimension}${l.overwrites ? `, replacing its existing ${l.dimension} scores` : ''}.`,
    apply: randomScores },
  { target: 'dimensions', attribute: 'weight',
    summary: l => `Gives ${l.dimension} a random weight from 1 to 100.`,
    apply: randomDimensionWeight },
  { target: 'collections', attribute: 'colors',
    summary: () => 'Gives every collection a random readable color.',
    apply: () => randomCollectionColors },
  { target: 'collections', attribute: 'members',
    summary: () => "Replaces every collection's members at random: each element joins each collection with even odds.",
    apply: () => randomCollectionAssignments }
]

const RANDOM_TARGETS = [...new Set(RANDOMIZERS.map(r => r.target))]

/** Predefined whole-study conversions. Each replaces a great deal, so it applies in red; one Undo reverses it. */
const ADVANCED: { id: string; label: string; summary: string; apply: Transform }[] = [
  { id: 'randomize-all', label: 'Randomize All Values',
    summary: 'Gives every element a random weight, color, shape, set of collections and score on every dimension; every dimension a random weight; and every collection a random color. Replaces all existing values.',
    apply: randomizeAll }
]

/** Each field's apply control: the action named beside the green forward arrow. */
function ApplyRow({ label, applied, onApply, destructive = false }: {
  label: string; applied: boolean; onApply: () => void; destructive?: boolean
}): React.JSX.Element {
  return (
    <div className={styles.applyRow}>
      <span className={styles.applyLabel}>{applied ? 'Applied' : label}</span>
      <ForwardActionButton label={applied ? 'Applied' : label} disabled={applied} destructive={destructive} onClick={onApply} />
    </div>
  )
}

export function ConversionsTab(): React.JSX.Element {
  const elements    = useAppStore(s => s.elements)
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
  const [randomTarget, setRandomTarget] = useState<RandomTarget | ''>('')
  const [randomAttribute, setRandomAttribute] = useState<RandomAttribute | ''>('')
  const [randomDimId, setRandomDimId] = useState('')
  const [randomizerApplied, setRandomizerApplied] = useState(false)
  const [showRandomizeConfirm, setShowRandomizeConfirm] = useState(false)
  const spreadDim = spreadDimId ? dimensions.find(d => d.id === spreadDimId) ?? null : null

  const randomizer = RANDOMIZERS.find(r => r.target === randomTarget && r.attribute === randomAttribute) ?? null
  const randomDim = randomDimId ? dimensions.find(d => d.id === randomDimId) ?? null : null
  const randomDimName = randomDim ? randomDim.label || `Dimension ${dimensions.indexOf(randomDim) + 1}` : ''
  const forDimension = randomTarget === 'dimensions'
  // Only scores can be overwritten: every other randomizer replaces values that always exist.
  const randomOverwrites = randomAttribute === 'scores' && !!randomDim &&
    Object.values(scores).some(row => row[randomDim.id] !== undefined)
  const noCollectionsToRandomize = randomTarget === 'collections' && collections.length === 0
  // A dimension is chosen before what to randomize on it.
  const attributeReady = !!randomTarget && (!forDimension || !!randomDim) && !noCollectionsToRandomize
  const canRandomize = !!randomizer && attributeReady
  const randomSummary = canRandomize && randomizer
    ? randomizer.summary({ dimension: randomDimName, overwrites: randomOverwrites })
    : ''

  function chooseRandomTarget(value: string): void {
    setRandomTarget(value as RandomTarget | '')
    setRandomAttribute('')
    setRandomDimId('')
    setRandomizerApplied(false)
    setShowRandomizeConfirm(false)
  }

  function chooseRandomAttribute(value: string): void {
    setRandomAttribute(value as RandomAttribute | '')
    setRandomizerApplied(false)
    setShowRandomizeConfirm(false)
  }

  const spreadSummary = spreadDim
    ? `Rescales ${spreadDim.label || 'this dimension'} scores so the lowest is .05 and the highest .95, keeping their spacing. Unscored elements keep theirs.`
    : ''

  function handleSpreadApply(): void {
    if (!spreadDim) return
    transform(spreadScores(spreadDim.id))
    setSpreadApplied(true)
  }

  function applyRandomizer(): void {
    if (!canRandomize || !randomizer) return
    transform(randomizer.apply(randomDimId))
    setRandomizerApplied(true)
    setShowRandomizeConfirm(false)
  }

  function handleRandomize(): void {
    if (!canRandomize) return
    if (randomOverwrites) {
      setShowRandomizeConfirm(true)
      return
    }
    applyRandomizer()
  }

  const [advancedId, setAdvancedId] = useState('')
  const [advancedApplied, setAdvancedApplied] = useState(false)
  const advanced = ADVANCED.find(a => a.id === advancedId) ?? null
  const studyEmpty = elements.length === 0 && dimensions.length === 0 && collections.length === 0

  function applyAdvanced(): void {
    if (!advanced) return
    transform(advanced.apply)
    setAdvancedApplied(true)
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

  return (
    <div className={styles.tab}>

      <section className={styles.group}>
        <h2 className={styles.groupTitle}>Map Attributes to Attributes</h2>
        <div className={styles.groupBody}>

      {/* One field: FROM, TO, then what the mapping will do and the green
          arrow that applies it. Thin arrows run down from each label
          to the next step, and each label's contents sit indented beside them. */}
      <div className={styles.pipeline}>

      {/* ── FROM ────────────────────────────────────────────────────────────── */}
      <div className={styles.step}>
        <div className={styles.sectionLabel}>From</div>
        <div className={`${styles.sectionBody} ${styles.flowDown}`}>

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

      {/* ── TO ──────────────────────────────────────────────────────────────── */}
      <div className={styles.step}>
        <div className={styles.sectionLabel}>To</div>
        <div className={canApply ? `${styles.sectionBody} ${styles.flowDown}` : styles.sectionBody}>

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

      {canApply && (
        <div className={styles.pipelineFooter}>
          {summary && <p className={styles.pipelineSummary}>{summary}</p>}
          <ApplyRow label="Apply Conversion" applied={applied} onApply={handleApply} />
        </div>
      )}

      </div>

        </div>
      </section>

      <section className={styles.group}>
        <h2 className={styles.groupTitle}>Randomize Attribute Values</h2>
        <div className={styles.groupBody}>
          {/* FOR, then RANDOMIZE, then the result, in one field like the mapping. */}
          <div className={styles.pipeline}>
            <div className={styles.step}>
              <div className={styles.sectionLabel}>For</div>
              <div className={`${styles.sectionBody} ${styles.flowDown}`}>
                <select
                  className={styles.select}
                  value={randomTarget}
                  onChange={e => chooseRandomTarget(e.target.value)}
                  aria-label="Randomize for"
                >
                  <option value="">Choose elements, dimensions or collections…</option>
                  {RANDOM_TARGETS.map(t => <option key={t} value={t}>{TARGET_LABELS[t]}</option>)}
                </select>

                {forDimension && (
                  <div className={styles.subControl}>
                    <div className={styles.subLabel}>Dimension</div>
                    {dimensions.length === 0
                      ? <p className={styles.hint}>No dimensions defined.</p>
                      : (
                        <select
                          className={styles.select}
                          value={randomDimId}
                          onChange={e => { setRandomDimId(e.target.value); setRandomizerApplied(false); setShowRandomizeConfirm(false) }}
                          aria-label="Dimension to randomize"
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

                {noCollectionsToRandomize && <p className={styles.hint}>No collections defined.</p>}
              </div>
            </div>

            <div className={styles.step}>
              <div className={styles.sectionLabel}>Randomize</div>
              <div className={canRandomize ? `${styles.sectionBody} ${styles.flowDown}` : styles.sectionBody}>
                <select
                  className={styles.select}
                  value={randomAttribute}
                  disabled={!attributeReady}
                  onChange={e => chooseRandomAttribute(e.target.value)}
                  aria-label="Attribute to randomize"
                >
                  {!attributeReady
                    ? <option value="">{forDimension ? 'Choose a dimension first…' : 'Choose what to randomize for first…'}</option>
                    : <>
                        <option value="">Choose attribute…</option>
                        {RANDOMIZERS.filter(r => r.target === randomTarget).map(r => (
                          <option key={r.attribute} value={r.attribute}>{ATTRIBUTE_LABELS[r.attribute]}</option>
                        ))}
                      </>
                  }
                </select>
              </div>
            </div>

            {canRandomize && (
              <div className={styles.pipelineFooter}>
                <p className={styles.pipelineSummary}>{randomSummary}</p>
                {/* Overwriting scores still asks first (the disc below). */}
                <ApplyRow
                  label={randomOverwrites ? 'Overwrite & Randomize' : 'Apply Randomizer'}
                  applied={randomizerApplied}
                  onApply={handleRandomize}
                />
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── Spread: rescale a dimension's scores to fill .05–.95 ───────────── */}
      <section className={styles.group}>
        <h2 className={styles.groupTitle}>Scale Dimension to Range</h2>
        <div className={styles.groupBody}>
          {/* The dropdown, then the result below it, as in the mapping field. */}
          <div className={`${styles.section} ${styles.stepField}`}>

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
              <div className={styles.pipelineFooter}>
                <p className={styles.pipelineSummary}>{spreadSummary}</p>
                <ApplyRow label="Apply Spread" applied={spreadApplied} onApply={handleSpreadApply} />
              </div>
            )}

          </div>
        </div>
      </section>

      {/* ── Advanced: whole-study conversions ───────────────────────────────── */}
      <section className={styles.group}>
        <h2 className={styles.groupTitle}>Advanced</h2>
        <div className={styles.groupBody}>
          <div className={`${styles.section} ${styles.stepField}`}>
            <select
              className={styles.select}
              value={advancedId}
              onChange={e => { setAdvancedId(e.target.value); setAdvancedApplied(false) }}
              aria-label="Advanced conversion"
            >
              <option value="">Choose conversion…</option>
              {ADVANCED.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>

            {advanced && studyEmpty && <p className={styles.hint}>Add elements, dimensions or collections first.</p>}

            {advanced && !studyEmpty && (
              <div className={styles.pipelineFooter}>
                <p className={styles.pipelineSummary}>{advanced.summary}</p>
                <ApplyRow
                  label={advanced.label}
                  applied={advancedApplied}
                  destructive
                  onApply={applyAdvanced}
                />
              </div>
            )}
          </div>
        </div>
      </section>

      {showRandomizeConfirm && canRandomize && (
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
