import { useRef, useState, KeyboardEvent } from 'react'
import { useAppStore } from '../../store/appStore'
import styles from './DataTab.module.css'

export function DimensionsTab(): React.JSX.Element {
  const dimensions        = useAppStore(s => s.dimensions)
  const selectedId        = useAppStore(s => s.selectedDimensionId)
  const addDimension      = useAppStore(s => s.addDimension)
  const updateDimension   = useAppStore(s => s.updateDimension)
  const removeDimension   = useAppStore(s => s.removeDimension)
  const selectDimension   = useAppStore(s => s.selectDimension)

  const selected = dimensions.find(d => d.id === selectedId) ?? null
  const [newLabel, setNewLabel] = useState('')
  const addInputRef = useRef<HTMLInputElement>(null)

  function handleAdd(): void {
    const label = newLabel.trim()
    if (!label) return
    addDimension(label)
    setNewLabel('')
    addInputRef.current?.focus()
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Enter') handleAdd()
  }

  function handleListKeyDown(e: KeyboardEvent<HTMLUListElement>): void {
    if (!selectedId || dimensions.length === 0) return
    const idx = dimensions.findIndex(d => d.id === selectedId)
    if (e.key === 'ArrowDown' && idx < dimensions.length - 1) {
      selectDimension(dimensions[idx + 1].id)
      e.preventDefault()
    } else if (e.key === 'ArrowUp' && idx > 0) {
      selectDimension(dimensions[idx - 1].id)
      e.preventDefault()
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
      removeDimension(selectedId)
    }
  }

  return (
    <div className={styles.tab}>
      <div className={styles.listPane}>
        <div className={styles.listHeader}>Dimensions ({dimensions.length})</div>
        {dimensions.length === 0
          ? <p className={styles.emptyHint}>Begin by entering a list of dimensions.</p>
          : (
            <ul
              className={styles.list}
              tabIndex={0}
              onKeyDown={handleListKeyDown}
              aria-label="Dimensions"
            >
              {dimensions.map(dim => (
                <li
                  key={dim.id}
                  className={`${styles.listItem} ${dim.id === selectedId ? styles.selected : ''}`}
                  onClick={() => selectDimension(dim.id)}
                >
                  <span
                    className={styles.name}
                    contentEditable
                    suppressContentEditableWarning
                    onBlur={e => {
                      const label = e.currentTarget.textContent?.trim() ?? ''
                      if (label && label !== dim.label) updateDimension(dim.id, { label })
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); e.currentTarget.blur() }
                    }}
                  >
                    {dim.label}
                  </span>
                </li>
              ))}
            </ul>
          )
        }
        <div className={styles.addRow}>
          <input
            ref={addInputRef}
            className={styles.addInput}
            placeholder="New dimension (e.g. Hot–Cold)…"
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button className={styles.addBtn} onClick={handleAdd}>+</button>
        </div>
      </div>

      <div className={styles.detailPane}>
        <div className={styles.fieldRow}>
          <label className={styles.label}>Weight</label>
          <input
            key={selected?.id ?? 'none'}
            className={styles.weightInput}
            type="number"
            min={1}
            max={100}
            defaultValue={selected?.weight ?? 1}
            disabled={!selected}
            onBlur={e => selected && updateDimension(selected.id, { weight: Math.max(1, Math.min(100, +e.target.value || 1)) })}
          />
        </div>
        <textarea
          className={styles.description}
          placeholder="Description…"
          value={selected?.description ?? ''}
          disabled={!selected}
          onChange={e => selected && updateDimension(selected.id, { description: e.target.value })}
        />
      </div>
    </div>
  )
}
