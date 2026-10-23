// ── ConversionsTab ─────────────────────────────────────────────────────────────
//
// Four groups, in order: mapping (FROM → TO, the CONVERSIONS table),
// randomizing (FOR → RANDOMIZE, the RANDOMIZERS table), scaling, and advanced
// whole-study conversions (ADVANCED). Each group is one field: its choices,
// then a result text saying what applying will do, beside the forward arrow
// that applies it. Every change is a pure transform (store/transforms.ts)
// applied through the store.

import { useState, type ReactNode } from 'react'
import { useAppStore } from '../../store/appStore'
import { usePrefsStore } from '../../store/prefsStore'
import type { Dimension } from '../../lib/types'
import {
  colorFromCollections, colorFromScores, colorFromShape, collectionsFromShape, copyScores,
  randomCollectionAssignments, randomCollectionColors, randomDimensionWeight, randomElementColors,
  randomElementShapes, randomElementWeights, randomizeAll, randomScores, scoresFromWeights, shapeFromCollections,
  shapeFromColor, spreadScores, weightFromScores, type Transform
} from '../../store/transforms'
import { ConfirmationDisc, ForwardActionButton } from '../ConfirmationDisc'
import styles from './ConversionsTab.module.css'

// ── Mapping ───────────────────────────────────────────────────────────────────

type Kind = 'dim-scores' | 'el-weight' | 'collection' | 'el-shape' | 'el-color'

const KIND_LABELS: Record<Kind, string> = {
  'dim-scores': 'Dimension scores',
  'el-weight':  'Element weight',
  'collection': 'Collection membership',
  'el-shape':   'Element shape',
  'el-color':   'Element color'
}

interface MappingChoices {
  from: Kind | ''
  to: Kind | ''
  fromDimId: string
  toDimId: string
  /** The high end is pole A rather than pole B. */
  flipped: boolean
  colorLow: string
  colorHigh: string
}

/** The names a result text uses: the chosen dimensions, and the ends of the pole choice. */
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
  apply: (choices: MappingChoices) => Transform
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

// ── Randomizing ───────────────────────────────────────────────────────────────

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

// ── Advanced ──────────────────────────────────────────────────────────────────

/** Predefined whole-study conversions. Each replaces a great deal, so it applies in red; one Undo reverses it. */
const ADVANCED: { id: string; label: string; summary: string; apply: Transform }[] = [
  { id: 'randomize-all', label: 'Randomize All Values',
    summary: 'Gives every element a random weight, color, shape, set of collections and score on every dimension; every dimension a random weight; and every collection a random color. Replaces all existing values.',
    apply: randomizeAll }
]

// ── Shared pieces ─────────────────────────────────────────────────────────────

/**
 * A group's choices, and whether they have been applied. Any change to a
 * choice clears `applied`, so the arrow is ready again; the same choices can
 * be applied again (a randomizer rerolled) by changing one and back.
 */
function useChoices<T extends object>(initial: T): [T & { applied: boolean }, (patch: Partial<T>) => void, () => void] {
  const [state, setState] = useState({ ...initial, applied: false })
  const choose = (patch: Partial<T>): void => setState(s => ({ ...s, ...patch, applied: false }))
  const markApplied = (): void => setState(s => ({ ...s, applied: true }))
  return [state, choose, markApplied]
}

/** A dimension's name as the menus and result texts show it, numbered when it has no label. */
const dimensionName = (dimension: Dimension, dimensions: Dimension[]): string =>
  dimension.label || `Dimension ${dimensions.indexOf(dimension) + 1}`

/** A dimension menu, or a hint when there are none; `exclude` leaves one out. */
function DimensionSelect({ dimensions, value, onChange, label, exclude }: {
  dimensions: Dimension[]; value: string; onChange: (id: string) => void; label: string; exclude?: string
}): React.JSX.Element {
  if (dimensions.length === 0) return <p className={styles.hint}>No dimensions defined.</p>
  return (
    <select className={styles.select} value={value} onChange={e => onChange(e.target.value)} aria-label={label}>
      <option value="">Choose dimension…</option>
      {dimensions.filter(d => d.id !== exclude).map(d => (
        <option key={d.id} value={d.id}>{dimensionName(d, dimensions)}</option>
      ))}
    </select>
  )
}

/** A nested choice under a step, with its own small label. */
function SubControl({ label, children }: { label: string; children: ReactNode }): React.JSX.Element {
  return (
    <div className={styles.subControl}>
      <div className={styles.subLabel}>{label}</div>
      {children}
    </div>
  )
}

/**
 * One step of a field: its label at the field's edge, its choices indented
 * beside it. `leadsOn` draws the thin arrow from under the label down to the
 * next step.
 */
function Step({ label, leadsOn, children }: { label: string; leadsOn: boolean; children: ReactNode }): React.JSX.Element {
  return (
    <div className={styles.step}>
      <div className={styles.stepLabel}>{label}</div>
      <div className={leadsOn ? `${styles.stepBody} ${styles.flowDown}` : styles.stepBody}>{children}</div>
    </div>
  )
}

/** What applying will do, and the action named beside the forward arrow that applies it. */
function Result({ text, label, applied, onApply, destructive = false }: {
  text: string; label: string; applied: boolean; onApply: () => void; destructive?: boolean
}): React.JSX.Element {
  const name = applied ? 'Applied' : label
  return (
    <div className={styles.result}>
      <p className={styles.resultText}>{text}</p>
      <div className={styles.applyRow}>
        <span className={styles.applyLabel}>{name}</span>
        <ForwardActionButton label={name} disabled={applied} destructive={destructive} onClick={onApply} />
      </div>
    </div>
  )
}

/** A titled group holding one field. */
function Group({ title, children }: { title: string; children: ReactNode }): React.JSX.Element {
  return (
    <section className={styles.group}>
      <h2 className={styles.groupTitle}>{title}</h2>
      <div className={styles.field}>{children}</div>
    </section>
  )
}

// ── The view ──────────────────────────────────────────────────────────────────

export function ConversionsTab(): React.JSX.Element {
  const elements    = useAppStore(s => s.elements)
  const dimensions  = useAppStore(s => s.dimensions)
  const collections = useAppStore(s => s.collections)
  const scores      = useAppStore(s => s.scores)
  const transform   = useAppStore(s => s.transform)
  const { dimColorLow, dimColorHigh } = usePrefsStore(s => s.prefs)

  const findDimension = (id: string): Dimension | null => dimensions.find(d => d.id === id) ?? null
  const nameOf = (dimension: Dimension | null): string =>
    dimension ? dimensionName(dimension, dimensions) : 'the chosen dimension'

  // ── Mapping ──
  const [mapping, chooseMapping, mappingApplied] = useChoices<MappingChoices>({
    from: '', to: '', fromDimId: '', toDimId: '', flipped: false, colorLow: dimColorLow, colorHigh: dimColorHigh
  })
  const conversion = CONVERSIONS.find(c => c.from === mapping.from && c.to === mapping.to) ?? null
  const fromDim = findDimension(mapping.fromDimId)
  const toDim = findDimension(mapping.toDimId)
  const poleDim = conversion?.pole === 'from' ? fromDim : toDim
  const poleA = poleDim?.poleA || 'Pole A'
  const poleB = poleDim?.poleB || 'Pole B'
  const mappingNoCollections = !!conversion?.needsCollections && collections.length === 0
  const canMap = !!conversion && !mappingNoCollections &&
    (mapping.from !== 'dim-scores' || !!fromDim) &&
    (mapping.to !== 'dim-scores' || !!toDim)

  function applyMapping(): void {
    if (!canMap || !conversion) return
    transform(conversion.apply(mapping))
    mappingApplied()
  }

  // ── Randomizing ──
  const [random, chooseRandom, randomApplied] = useChoices<{
    target: RandomTarget | ''; attribute: RandomAttribute | ''; dimId: string
  }>({ target: '', attribute: '', dimId: '' })
  const [confirmingOverwrite, setConfirmingOverwrite] = useState(false)
  const randomizer = RANDOMIZERS.find(r => r.target === random.target && r.attribute === random.attribute) ?? null
  const randomDim = findDimension(random.dimId)
  const forDimension = random.target === 'dimensions'
  const randomNoCollections = random.target === 'collections' && collections.length === 0
  // A dimension is chosen before what to randomize on it.
  const attributeReady = !!random.target && (!forDimension || !!randomDim) && !randomNoCollections
  const canRandomize = !!randomizer && attributeReady
  // Only scores can be overwritten: every other randomizer replaces values that always exist.
  const randomOverwrites = random.attribute === 'scores' && !!randomDim &&
    Object.values(scores).some(row => row[randomDim.id] !== undefined)

  function applyRandomizer(): void {
    setConfirmingOverwrite(false)
    if (!canRandomize || !randomizer) return
    transform(randomizer.apply(random.dimId))
    randomApplied()
  }

  // ── Scaling ──
  const [spread, chooseSpread, spreadApplied] = useChoices({ dimId: '' })
  const spreadDim = findDimension(spread.dimId)

  function applySpread(): void {
    if (!spreadDim) return
    transform(spreadScores(spreadDim.id))
    spreadApplied()
  }

  // ── Advanced ──
  const [advancedChoice, chooseAdvanced, advancedApplied] = useChoices({ id: '' })
  const advanced = ADVANCED.find(a => a.id === advancedChoice.id) ?? null
  const studyEmpty = elements.length === 0 && dimensions.length === 0 && collections.length === 0

  function applyAdvanced(): void {
    if (!advanced) return
    transform(advanced.apply)
    advancedApplied()
  }

  return (
    <div className={styles.tab}>

      <Group title="Map Attributes to Attributes">
        <Step label="From" leadsOn>
          <select
            className={styles.select}
            value={mapping.from}
            onChange={e => chooseMapping({
              from: e.target.value as Kind | '', to: '', fromDimId: '', toDimId: '', flipped: false
            })}
            aria-label="Source"
          >
            <option value="">Choose source…</option>
            {SOURCES.map(k => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
          </select>

          {mapping.from === 'dim-scores' && (
            <SubControl label="Dimension">
              <DimensionSelect
                dimensions={dimensions}
                value={mapping.fromDimId}
                // A dimension cannot be copied onto itself.
                onChange={id => chooseMapping({ fromDimId: id, ...(id === mapping.toDimId && { toDimId: '' }) })}
                label="Source dimension"
              />
            </SubControl>
          )}
        </Step>

        <Step label="To" leadsOn={canMap}>
          <select
            className={styles.select}
            value={mapping.to}
            disabled={!mapping.from}
            onChange={e => chooseMapping({ to: e.target.value as Kind | '', toDimId: '', flipped: false })}
            aria-label="Destination"
          >
            {!mapping.from
              ? <option value="">Choose a source first…</option>
              : <>
                  <option value="">Choose destination…</option>
                  {CONVERSIONS.filter(c => c.from === mapping.from).map(c => (
                    <option key={c.to} value={c.to}>{KIND_LABELS[c.to]}</option>
                  ))}
                </>
            }
          </select>

          {mapping.to === 'dim-scores' && (
            <SubControl label="Dimension">
              <DimensionSelect
                dimensions={dimensions}
                value={mapping.toDimId}
                onChange={id => chooseMapping({ toDimId: id })}
                label="Destination dimension"
                exclude={mapping.from === 'dim-scores' ? mapping.fromDimId : undefined}
              />
            </SubControl>
          )}

          {conversion?.pole && poleDim && (
            <SubControl label="High end">
              <div className={styles.poleButtons} role="group" aria-label="High end">
                {[{ flipped: true, name: poleA }, { flipped: false, name: poleB }].map(pole => (
                  <button
                    key={String(pole.flipped)}
                    type="button"
                    className={`${styles.poleBtn} ${mapping.flipped === pole.flipped ? styles.poleBtnActive : ''}`}
                    onClick={() => chooseMapping({ flipped: pole.flipped })}
                    aria-pressed={mapping.flipped === pole.flipped}
                  >
                    {pole.name}
                  </button>
                ))}
              </div>
            </SubControl>
          )}

          {conversion?.colors && (
            <div className={styles.colorRow}>
              <label className={styles.colorField}>
                <span className={styles.subLabel}>Low ({fromDim?.poleA || 'score 0'})</span>
                <input type="color" className={styles.colorPicker} value={mapping.colorLow}
                  onChange={e => chooseMapping({ colorLow: e.target.value })} />
              </label>
              <label className={styles.colorField}>
                <span className={styles.subLabel}>High ({fromDim?.poleB || 'score 1'})</span>
                <input type="color" className={styles.colorPicker} value={mapping.colorHigh}
                  onChange={e => chooseMapping({ colorHigh: e.target.value })} />
              </label>
            </div>
          )}

          {mappingNoCollections && <p className={styles.hint}>No collections defined.</p>}
        </Step>

        {canMap && conversion && (
          <Result
            text={conversion.summary({
              from: nameOf(fromDim),
              to: nameOf(toDim),
              high: mapping.flipped ? poleA : poleB,
              low: mapping.flipped ? poleB : poleA
            })}
            label="Apply Conversion"
            applied={mapping.applied}
            onApply={applyMapping}
          />
        )}
      </Group>

      <Group title="Randomize Attribute Values">
        <Step label="For" leadsOn>
          <select
            className={styles.select}
            value={random.target}
            onChange={e => chooseRandom({ target: e.target.value as RandomTarget | '', attribute: '', dimId: '' })}
            aria-label="Randomize for"
          >
            <option value="">Choose elements, dimensions or collections…</option>
            {RANDOM_TARGETS.map(t => <option key={t} value={t}>{TARGET_LABELS[t]}</option>)}
          </select>

          {forDimension && (
            <SubControl label="Dimension">
              <DimensionSelect
                dimensions={dimensions}
                value={random.dimId}
                onChange={id => chooseRandom({ dimId: id })}
                label="Dimension to randomize"
              />
            </SubControl>
          )}

          {randomNoCollections && <p className={styles.hint}>No collections defined.</p>}
        </Step>

        <Step label="Randomize" leadsOn={canRandomize}>
          <select
            className={styles.select}
            value={random.attribute}
            disabled={!attributeReady}
            onChange={e => chooseRandom({ attribute: e.target.value as RandomAttribute | '' })}
            aria-label="Attribute to randomize"
          >
            {!attributeReady
              ? <option value="">{forDimension ? 'Choose a dimension first…' : 'Choose what to randomize for first…'}</option>
              : <>
                  <option value="">Choose attribute…</option>
                  {RANDOMIZERS.filter(r => r.target === random.target).map(r => (
                    <option key={r.attribute} value={r.attribute}>{ATTRIBUTE_LABELS[r.attribute]}</option>
                  ))}
                </>
            }
          </select>
        </Step>

        {canRandomize && randomizer && (
          <Result
            text={randomizer.summary({ dimension: nameOf(randomDim), overwrites: randomOverwrites })}
            label={randomOverwrites ? 'Overwrite & Randomize' : 'Apply Randomizer'}
            applied={random.applied}
            // Overwriting scores asks first.
            onApply={randomOverwrites ? () => setConfirmingOverwrite(true) : applyRandomizer}
          />
        )}
      </Group>

      <Group title="Scale Dimension to Range">
        <DimensionSelect
          dimensions={dimensions}
          value={spread.dimId}
          onChange={id => chooseSpread({ dimId: id })}
          label="Dimension to spread"
        />

        {spreadDim && (
          <Result
            text={`Rescales ${nameOf(spreadDim)} scores so the lowest is .05 and the highest .95, keeping their spacing. Unscored elements keep theirs.`}
            label="Apply Spread"
            applied={spread.applied}
            onApply={applySpread}
          />
        )}
      </Group>

      <Group title="Advanced">
        <select
          className={styles.select}
          value={advancedChoice.id}
          onChange={e => chooseAdvanced({ id: e.target.value })}
          aria-label="Advanced conversion"
        >
          <option value="">Choose conversion…</option>
          {ADVANCED.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
        </select>

        {advanced && studyEmpty && <p className={styles.hint}>Add elements, dimensions or collections first.</p>}

        {advanced && !studyEmpty && (
          <Result text={advanced.summary} label={advanced.label} applied={advancedChoice.applied} destructive onApply={applyAdvanced} />
        )}
      </Group>

      {confirmingOverwrite && canRandomize && (
        <ConfirmationDisc
          fixed
          title="Randomize scores?"
          detail="This will overwrite existing scores with new values"
          actionLabel="Randomize"
          onCancel={() => setConfirmingOverwrite(false)}
          onAction={applyRandomizer}
        />
      )}

    </div>
  )
}
