import { useRef, useState, KeyboardEvent } from 'react'
import { useAppStore } from '../../store/appStore'
import styles from './DataTab.module.css'

export function ElementsTab(): React.JSX.Element {
  const elements          = useAppStore(s => s.elements)
  const selectedId        = useAppStore(s => s.selectedElementId)
  const addElement        = useAppStore(s => s.addElement)
  const updateElement     = useAppStore(s => s.updateElement)
  const removeElement     = useAppStore(s => s.removeElement)
  const selectElement     = useAppStore(s => s.selectElement)

  const selected = elements.find(e => e.id === selectedId) ?? null
  const [newName, setNewName] = useState('')
  const addInputRef = useRef<HTMLInputElement>(null)

  function handleAdd(): void {
    const name = newName.trim()
    if (!name) return
    addElement(name)
    setNewName('')
    addInputRef.current?.focus()
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Enter') handleAdd()
  }

  function handleListKeyDown(e: KeyboardEvent<HTMLUListElement>): void {
    if (!selectedId || elements.length === 0) return
    const idx = elements.findIndex(el => el.id === selectedId)
    if (e.key === 'ArrowDown' && idx < elements.length - 1) {
      selectElement(elements[idx + 1].id)
      e.preventDefault()
    } else if (e.key === 'ArrowUp' && idx > 0) {
      selectElement(elements[idx - 1].id)
      e.preventDefault()
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
      removeElement(selectedId)
    }
  }

  return (
    <div className={styles.tab}>
      <div className={styles.listPane}>
        <div className={styles.listHeader}>Elements ({elements.length})</div>
        {elements.length === 0
          ? <p className={styles.emptyHint}>Begin by entering a list of elements.</p>
          : (
            <ul
              className={styles.list}
              tabIndex={0}
              onKeyDown={handleListKeyDown}
              aria-label="Elements"
            >
              {elements.map(el => (
                <li
                  key={el.id}
                  className={`${styles.listItem} ${el.id === selectedId ? styles.selected : ''}`}
                  onClick={() => selectElement(el.id)}
                >
                  <span
                    className={styles.colorDot}
                    style={{ background: el.color }}
                  />
                  <span
                    className={styles.name}
                    contentEditable
                    suppressContentEditableWarning
                    onBlur={e => {
                      const name = e.currentTarget.textContent?.trim() ?? ''
                      if (name && name !== el.name) updateElement(el.id, { name })
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); e.currentTarget.blur() }
                    }}
                  >
                    {el.name}
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
            placeholder="New element…"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button className={styles.addBtn} onClick={handleAdd}>+</button>
        </div>
      </div>

      <div className={styles.detailPane}>
        <div className={styles.fieldRow}>
          <label className={styles.label}>Color</label>
          <input
            type="color"
            className={styles.colorInput}
            value={selected?.color ?? '#808000'}
            disabled={!selected}
            onChange={e => selected && updateElement(selected.id, { color: e.target.value })}
          />
        </div>
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
            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
            onBlur={e => selected && updateElement(selected.id, { weight: Math.max(1, Math.min(100, +e.target.value || 1)) })}
          />
        </div>
        <textarea
          className={styles.description}
          placeholder="Description…"
          value={selected?.description ?? ''}
          disabled={!selected}
          onChange={e => selected && updateElement(selected.id, { description: e.target.value })}
        />
      </div>
    </div>
  )
}
