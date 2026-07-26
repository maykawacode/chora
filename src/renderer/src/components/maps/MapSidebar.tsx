// ── MapSidebar ────────────────────────────────────────────────────────────────
//
// Collapsible control panel on the right edge of a map window. Replaces the
// former ⋯ dropdown in the title bar, and serves every map type:
//
//   Elements — dots, labels, weight sizing, colors      (all maps)
//   Types    — blob overlay, membership threshold,
//              per-type show/hide                        (cartesian only)
//   Output   — export
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
import type { MapConfig, CartesianMapConfig } from '../../lib/types'
import styles from './MapSidebar.module.css'

interface Props {
  config: MapConfig
  updateConfig: (changes: Partial<CartesianMapConfig>) => void
  onExportSvg: () => void
}

export function MapSidebar({ config, updateConfig, onExportSvg }: Props): React.JSX.Element {
  const types = useAppStore(s => s.types)

  // Only cartesian maps carry types — a semantic map has no 2D space to
  // project a cluster into, so it gets Elements + Output only.
  const cartConfig = config.type === 'cartesian' ? config : null

  return (
    <div className={styles.sidebar}>
      <div className={styles.scroll}>
        {/* ── Elements ───────────────────────────────────────────────────── */}
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Elements</h3>
          <Check
            label="Show dots"
            checked={config.showDots}
            onChange={v => updateConfig({ showDots: v })}
          />
          <Check
            label="Show labels"
            checked={config.showLabels}
            onChange={v => updateConfig({ showLabels: v })}
          />
          <Check
            label="Size dots by weight"
            checked={config.sizeByWeight}
            onChange={v => updateConfig({ sizeByWeight: v })}
          />
          <Check
            label="Show colors"
            checked={config.showColors}
            onChange={v => updateConfig({ showColors: v })}
          />
        </section>

        {/* ── Types ──────────────────────────────────────────────────────── */}
        {cartConfig && (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Types</h3>

            {types.length === 0 ? (
              <p className={styles.empty}>No types defined yet.</p>
            ) : (
              <>
                <Check
                  label="Show type clusters"
                  checked={cartConfig.showTypes}
                  onChange={v => updateConfig({ showTypes: v })}
                />

                <label className={styles.slider}>
                  <span className={styles.sliderLabel}>
                    Membership threshold
                    <span className={styles.sliderValue}>
                      {cartConfig.threshold.toFixed(2)}
                    </span>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={cartConfig.threshold}
                    onChange={e => updateConfig({ threshold: Number(e.target.value) })}
                  />
                </label>

                <div className={styles.subhead}>
                  Show types
                  {/* typeIds=[] means all types; the button clears back to that. */}
                  {cartConfig.typeIds.length > 0 && (
                    <button
                      className={styles.linkBtn}
                      onClick={() => updateConfig({ typeIds: [] })}
                    >
                      All
                    </button>
                  )}
                </div>

                {types.map(type => {
                  const isVisible =
                    cartConfig.typeIds.length === 0 || cartConfig.typeIds.includes(type.id)
                  return (
                    <Check
                      key={type.id}
                      label={type.name || 'Untitled type'}
                      swatch={type.color}
                      checked={isVisible}
                      onChange={() => {
                        const allIds  = types.map(t => t.id)
                        const current = cartConfig.typeIds.length === 0 ? allIds : cartConfig.typeIds
                        const next    = isVisible
                          ? current.filter(id => id !== type.id)
                          : [...current, type.id]
                        // Normalize back to [] when everything is selected, so
                        // "all types" has exactly one representation.
                        updateConfig({ typeIds: next.length === allIds.length ? [] : next })
                      }}
                    />
                  )
                })}

                <p className={styles.hint}>
                  An element hides only once every type it belongs to is
                  deselected. Elements belonging to no type are always shown.
                </p>
              </>
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

// ── Checkbox row ──────────────────────────────────────────────────────────────

interface CheckProps {
  label: string
  checked: boolean
  onChange: (value: boolean) => void
  swatch?: string   // optional color chip, used for the per-type rows
}

function Check({ label, checked, onChange, swatch }: CheckProps): React.JSX.Element {
  return (
    <label className={styles.check}>
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
      />
      {swatch && <span className={styles.swatch} style={{ background: swatch }} />}
      <span className={styles.checkLabel}>{label}</span>
    </label>
  )
}
