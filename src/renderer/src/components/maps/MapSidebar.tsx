// ── MapSidebar ────────────────────────────────────────────────────────────────
//
// Collapsible control panel on the right edge of a map window. Replaces the
// former ⋯ dropdown in the title bar, and is the same panel on every map type:
//
//   Elements    — dots, labels, weight sizing, colors
//   Collections — which collections the map displays or emphasizes
//   Output      — export
//
// Collections was cartesian-only while the selection meant "draw this blob",
// which a semantic map has no space for. It means "focus this map on these
// collections" now, and each map type honours that the way its geometry allows:
// a cartesian map draws the cluster as a blob, while a semantic map narrows to
// the members and hides everything else. Same control, same
// question asked of it — so no section is conditional and the panel reads
// identically whichever map you opened it from.
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
import type { MapConfig, CartesianMapConfig, SemanticMapConfig, ColorMode, MarkMode } from '../../lib/types'
import { memberCount } from './collections'
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
  // Mirrors MapPanel's own updateConfig: every setting this panel writes is
  // shared by both map types, so the union is never actually narrowed here.
  updateConfig: (changes: Partial<CartesianMapConfig> | Partial<SemanticMapConfig>) => void
  onExportSvg: () => void
}

export function MapSidebar({ config, updateConfig, onExportSvg }: Props): React.JSX.Element {
  const collections = useAppStore(s => s.collections)
  const elements    = useAppStore(s => s.elements)

  // Drives the heading link, which offers whichever action is still available.
  const allShown = collections.length > 0 &&
    collections.every(c => config.shownCollectionIds.includes(c.id))

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
              const shown = config.shownCollectionIds.includes(collection.id)
              return (
                <CollectionRow
                  key={collection.id}
                  name={collection.name || 'Untitled collection'}
                  color={collection.color}
                  count={memberCount(collection, elements)}
                  shown={shown}
                  onToggle={() => updateConfig({
                    shownCollectionIds: shown
                      ? config.shownCollectionIds.filter(id => id !== collection.id)
                      : [...config.shownCollectionIds, collection.id]
                  })}
                />
              )
            })
          )}
        </section>

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
// One collection, and whether this map is currently focused on it. The swatch
// carries the state on its own: solid when the collection is selected, a hollow
// ring of the same color when it isn't. That reads at a glance where a checkbox
// would need to be read, and it echoes the cartesian blob — an outline holding
// a translucent fill — so on that map the control looks like a small picture of
// its result.
//
// The count is how many elements belong to the collection, which is not always
// how many the map ends up drawing: a cartesian member unscored on either axis
// has nowhere to sit, and a semantic member unscored on every displayed
// dimension draws no polyline at all. Both are counted here regardless — the
// count describes the collection, not this map's view of it.

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
