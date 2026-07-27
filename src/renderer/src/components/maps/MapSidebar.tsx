// ── MapSidebar ────────────────────────────────────────────────────────────────
//
// Collapsible control panel on the right edge of a map window. Replaces the
// former ⋯ dropdown in the title bar, and serves every map type:
//
//   Elements    — dots, labels, weight sizing, colors    (all maps)
//   Collections — blob overlay, per-collection show/hide (cartesian only)
//   Output      — export
//
// Visibility is owned by MapPanel, which drives it from the toggle button in
// the title bar. Collapsed by default and never persisted: the sidebar is a
// transient control surface, not part of the map, so it starts out of the way
// every time a window opens. Everything it changes IS persisted, via the
// caller's updateConfig.
//
// The sidebar carries no header of its own. It shares --chrome-bg with the
// title bar so the two present as one panel, and the toggle that reveals it
// already names it — a "Controls" strip would only restate that and cut the
// shared surface in two. Section headings do the labelling from here down.

import { useAppStore } from '../../store/appStore'
import type { MapConfig, CartesianMapConfig, ColorMode, MarkMode } from '../../lib/types'
import { memberCount } from './cartesian/drawCartesian'
import styles from './MapSidebar.module.css'

// Labels for the color mode picker. Declared alongside the control rather than
// in types.ts: ColorMode is domain vocabulary, these are UI wording and are
// free to change without touching the model.
//
// Phrased to complete the sentence the row starts — "Color: by collection" — so
// they are lowercase and read as continuations, not as standalone captions.
const COLOR_MODE_OPTIONS: ReadonlyArray<{ value: ColorMode; label: string }> = [
  { value: 'none',       label: 'none' },
  { value: 'element',    label: 'by element' },
  { value: 'collection', label: 'by collection' }
]

const MARK_MODE_OPTIONS: ReadonlyArray<{ value: MarkMode; label: string }> = [
  { value: 'none',    label: 'none' },
  { value: 'circle',  label: 'circles' },
  { value: 'element', label: 'by element' }
]

interface Props {
  config: MapConfig
  updateConfig: (changes: Partial<CartesianMapConfig>) => void
  onExportSvg: () => void
}

export function MapSidebar({ config, updateConfig, onExportSvg }: Props): React.JSX.Element {
  const collections = useAppStore(s => s.collections)
  const elements    = useAppStore(s => s.elements)

  // Only cartesian maps draw blobs — a semantic map has no 2D space to
  // project a cluster into, so it gets Elements + Output only.
  const cartConfig = config.type === 'cartesian' ? config : null

  // Drives the heading link, which offers whichever action is still available.
  const allShown = collections.length > 0 && cartConfig !== null &&
    collections.every(c => cartConfig.shownCollectionIds.includes(c.id))

  return (
    <div className={styles.sidebar}>
      <div className={styles.scroll}>
        {/* ── Elements ───────────────────────────────────────────────────── */}
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Elements</h3>
          <Choice
            label="Marks"
            value={config.marks}
            options={MARK_MODE_OPTIONS}
            onChange={v => updateConfig({ marks: v })}
          />
          <Toggle
            label="Labels"
            value={config.showLabels}
            whenTrue="shown" whenFalse="hidden"
            onChange={v => updateConfig({ showLabels: v })}
          />
          <Toggle
            label="Size"
            value={config.sizeByWeight}
            whenTrue="by weight" whenFalse="default"
            onChange={v => updateConfig({ sizeByWeight: v })}
          />
          <Choice
            label="Color"
            value={config.colorMode}
            options={COLOR_MODE_OPTIONS}
            onChange={v => updateConfig({ colorMode: v })}
          />
        </section>

        {/* ── Collections ────────────────────────────────────────────────── */}
        {cartConfig && (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>
              Collections
              {collections.length > 0 && (
                <button
                  className={styles.linkBtn}
                  onClick={() => updateConfig({
                    shownCollectionIds: allShown ? [] : collections.map(c => c.id)
                  })}
                >
                  {allShown ? 'None' : 'All'}
                </button>
              )}
            </h3>

            {collections.length === 0 ? (
              <p className={styles.empty}>No collections defined yet.</p>
            ) : (
              collections.map(collection => {
                const shown = cartConfig.shownCollectionIds.includes(collection.id)
                return (
                  <CollectionRow
                    key={collection.id}
                    name={collection.name || 'Untitled collection'}
                    color={collection.color}
                    count={memberCount(collection, elements)}
                    shown={shown}
                    onToggle={() => updateConfig({
                      shownCollectionIds: shown
                        ? cartConfig.shownCollectionIds.filter(id => id !== collection.id)
                        : [...cartConfig.shownCollectionIds, collection.id]
                    })}
                  />
                )
              })
            )}
          </section>
        )}

        {/* ── Output ─────────────────────────────────────────────────────── */}
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Output</h3>
          <button className={styles.actionBtn} onClick={onExportSvg}>
            Export as SVG…
          </button>
        </section>
      </div>
    </div>
  )
}

// ── Collection row ────────────────────────────────────────────────────────────
//
// One collection, and whether its blob is drawn. The swatch carries the state
// on its own: solid when the blob is drawn, a hollow ring of the same color
// when it isn't. That reads at a glance where a checkbox would need to be read,
// and it echoes what the map itself draws — an outline holding a translucent
// fill — so the control looks like a small picture of its result.
//
// The count is how many elements belong to the collection. It can exceed what
// the blob visibly encloses: a member missing a score on either of the map's
// axes has nowhere to sit, so it is counted but not drawn.

interface CollectionRowProps {
  name: string
  color: string
  count: number
  shown: boolean
  onToggle: () => void
}

function CollectionRow({ name, color, count, shown, onToggle }: CollectionRowProps): React.JSX.Element {
  return (
    <button
      type="button"
      className={styles.collection}
      aria-pressed={shown}
      onClick={onToggle}
    >
      <span
        className={styles.collectionSwatch}
        style={shown
          ? { background: color, borderColor: color }
          : { background: 'transparent', borderColor: color }}
      />
      <span className={styles.collectionName}>{name}</span>
      <span className={styles.collectionCount}>{count}</span>
    </button>
  )
}

// ── Setting rows ──────────────────────────────────────────────────────────────
//
// Both render one sentence — "Color: by collection" — where the value is the control.
// Toggle flips between two values on click; Choice opens a menu. They are
// deliberately indistinguishable at rest: no caret, no box, nothing marking one
// row as a different kind of thing from its neighbors. Every row in the section
// is clickable, so the section teaches the interaction once rather than
// annotating each line.

interface ToggleProps {
  label: string
  value: boolean
  whenTrue: string   // value text for the on state, e.g. "by weight"
  whenFalse: string  // ...and the off state, e.g. "default"
  onChange: (value: boolean) => void
}

function Toggle({ label, value, whenTrue, whenFalse, onChange }: ToggleProps): React.JSX.Element {
  const shown = value ? whenTrue : whenFalse
  return (
    <button
      type="button"
      className={styles.setting}
      // The visible text is two spans, which a screen reader would run together
      // without the separator; say the whole sentence explicitly instead.
      aria-label={`${label}: ${shown}`}
      onClick={() => onChange(!value)}
    >
      <span className={styles.settingName}>{label}:</span>
      <span className={styles.settingValue}>{shown}</span>
    </button>
  )
}

// Generic over the option type so the caller's union — ColorMode here — flows
// through to onChange without a cast at the call site.
interface ChoiceProps<T extends string> {
  label: string
  value: T
  options: ReadonlyArray<{ value: T; label: string }>
  onChange: (value: T) => void
}

function Choice<T extends string>({ label, value, options, onChange }: ChoiceProps<T>): React.JSX.Element {
  const current = options.find(o => o.value === value)
  return (
    <div className={`${styles.setting} ${styles.settingMenu}`}>
      <span className={styles.settingName}>{label}:</span>
      <span className={styles.settingValue}>{current?.label ?? value}</span>
      {/* Laid transparently over the row above: the menu is the platform's, the
          text is ours. See .settingSelect for why this beats styling a select. */}
      <select
        className={styles.settingSelect}
        aria-label={label}
        value={value}
        onChange={e => onChange(e.target.value as T)}
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}
