// ── TypesTab ───────────────────────────────────────────────────────────────────
//
// Mirrors ScoresTab for element × type membership scoring (0 = none, 1 = full).
// The right list is also a type manager: you can add, delete, and rename types
// here without leaving the tab.
//
// Top area: score slider for the selected element × type pair.
// Bottom area: elements list (left) | types list + add-input (right).
//
// Delete behavior:
//   - If the type has any membership scores → confirmation overlay (data loss warning)
//   - Otherwise → deletes immediately

import { useRef, useCallback, useState, useEffect, KeyboardEvent } from 'react'
import { useAppStore } from '../../store/appStore'
import { typeScoreStatus } from '../../lib/types'
import scores from './ScoresTab.module.css'
import tab from './TypesTab.module.css'

export function TypesTab(): React.JSX.Element {
  const elements       = useAppStore(s => s.elements)
  const types          = useAppStore(s => s.types)
  const scoreMap       = useAppStore(s => s.scores)
  const selectedElId   = useAppStore(s => s.selectedElementId)
  const selectedTypeId = useAppStore(s => s.selectedTypeId)
  const selectElement  = useAppStore(s => s.selectElement)
  const selectType     = useAppStore(s => s.selectType)
  const setScore       = useAppStore(s => s.setScore)
  const addType        = useAppStore(s => s.addType)
  const removeType     = useAppStore(s => s.removeType)
  const updateType     = useAppStore(s => s.updateType)

  const selectedEl   = elements.find(e => e.id === selectedElId)  ?? null
  const selectedType = types.find(t => t.id === selectedTypeId)   ?? null

  const currentScore = (selectedElId && selectedTypeId)
    ? (scoreMap[selectedElId]?.[selectedTypeId] ?? null)
    : null

  const hasData = elements.length > 0 && types.length > 0

  const [newTypeName,    setNewTypeName]    = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const addInputRef = useRef<HTMLInputElement>(null)

  // Bring Score Window to front when the delete confirmation overlay opens
  useEffect(() => {
    if (confirmDeleteId !== null) window.api.setModalOpen(true)
  }, [confirmDeleteId])

  // ── Handlers ─────────────────────────────────────────────────────────────────

  function handleAddType(): void {
    const name = newTypeName.trim()
    if (!name) return
    addType(name)
    setNewTypeName('')
    addInputRef.current?.focus()
  }

  function requestDeleteType(id: string): void {
    const hasScores = Object.values(scoreMap).some(el => el[id] !== undefined)
    if (hasScores) setConfirmDeleteId(id)
    else removeType(id)
  }

  // ── Keyboard navigation ───────────────────────────────────────────────────────

  function handleElementListKey(e: KeyboardEvent<HTMLUListElement>): void {
    if (!selectedElId) return
    const idx = elements.findIndex(el => el.id === selectedElId)
    if (e.key === 'ArrowDown' && idx < elements.length - 1) {
      selectElement(elements[idx + 1].id); e.preventDefault()
    } else if (e.key === 'ArrowUp' && idx > 0) {
      selectElement(elements[idx - 1].id); e.preventDefault()
    }
  }

  function handleTypeListKey(e: KeyboardEvent<HTMLUListElement>): void {
    if (!selectedTypeId) return
    const idx = types.findIndex(t => t.id === selectedTypeId)
    if (e.key === 'ArrowDown' && idx < types.length - 1) {
      selectType(types[idx + 1].id); e.preventDefault()
    } else if (e.key === 'ArrowUp' && idx > 0) {
      selectType(types[idx - 1].id); e.preventDefault()
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
      requestDeleteType(selectedTypeId)
    }
  }

  const confirmType = types.find(t => t.id === confirmDeleteId) ?? null

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className={scores.tab} style={{ position: 'relative' }}>
      {/* ── Slider area ── */}
      <div className={scores.sliderArea}>
        {hasData
          ? <TypeScoreSlider
              elementName={selectedEl?.name ?? ''}
              typeName={selectedType?.name ?? ''}
              score={currentScore}
              onScore={(v) => {
                if (selectedElId && selectedTypeId) setScore(selectedElId, selectedTypeId, v)
              }}
            />
          : <p className={scores.hint}>Add elements and types, then select both to score.</p>
        }
      </div>

      {/* ── Navigation lists ── */}
      <div className={scores.listsRow}>

        {/* Elements */}
        <div className={scores.listPanel}>
          <div className={scores.listHeader} style={{ borderColor: '#4a7a4a' }}>
            Elements ({elements.length})
          </div>
          <ul
            className={scores.list}
            style={{ borderColor: '#4a7a4a' }}
            tabIndex={0}
            onKeyDown={handleElementListKey}
          >
            {elements.map(el => {
              const status = typeScoreStatus(el, types, scoreMap, selectedTypeId)
              return (
                <li
                  key={el.id}
                  className={`${scores.listItem} ${el.id === selectedElId ? scores.selected : ''}`}
                  onClick={() => selectElement(el.id)}
                >
                  <span className={scores.indicator}>{status}</span>
                  <span>{el.name}</span>
                </li>
              )
            })}
          </ul>
        </div>

        {/* Types — includes add-input and inline name editing */}
        <div className={`${scores.listPanel} ${tab.typesPanel}`}>
          <div className={scores.listHeader} style={{ borderColor: '#6a5a9a' }}>
            Types ({types.length})
          </div>
          <ul
            className={scores.list}
            style={{ borderColor: '#6a5a9a' }}
            tabIndex={0}
            onKeyDown={handleTypeListKey}
          >
            {types.map(type => (
              <li
                key={type.id}
                className={`${scores.listItem} ${type.id === selectedTypeId ? scores.selected : ''}`}
                onClick={() => selectType(type.id)}
              >
                {/* Inline name editing when this type is selected */}
                {type.id === selectedTypeId
                  ? <input
                      key={`name-${type.id}`}
                      className={tab.inlineInput}
                      defaultValue={type.name}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === 'Tab') e.currentTarget.blur()
                        // Swallow arrow keys so they don't navigate the list while editing
                        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') e.stopPropagation()
                      }}
                      onBlur={e => {
                        const v = e.target.value.trim()
                        if (v && v !== type.name) updateType(type.id, { name: v })
                      }}
                      onClick={e => e.stopPropagation()}
                    />
                  : <span>{type.name}</span>
                }
              </li>
            ))}
          </ul>

          {/* Add-type input */}
          <div className={tab.addRow}>
            <input
              ref={addInputRef}
              className={tab.addInput}
              placeholder="New type…"
              value={newTypeName}
              onChange={e => setNewTypeName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAddType() }}
            />
          </div>
        </div>
      </div>

      {/* ── Delete confirmation overlay ── */}
      {confirmType && (
        <div className={tab.confirmOverlay}>
          <div className={tab.confirmBox}>
            <p>Delete <strong>{confirmType.name}</strong>?<br />All membership scores for this type will be lost.</p>
            <div className={tab.confirmButtons}>
              <button className={tab.confirmCancel} onClick={() => setConfirmDeleteId(null)}>Cancel</button>
              <button
                className={tab.confirmDelete}
                onClick={() => { removeType(confirmDeleteId!); setConfirmDeleteId(null) }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── TypeScoreSlider ───────────────────────────────────────────────────────────
//
// Same drag/click mechanic as ScoreSlider in ScoresTab.
// Replaces poleA/poleB with "None" / "Full" since types have no poles.

interface SliderProps {
  elementName: string
  typeName:    string
  score:       number | null
  onScore:     (value: number) => void
}

function TypeScoreSlider({ elementName, typeName, score, onScore }: SliderProps): React.JSX.Element {
  const trackRef = useRef<HTMLDivElement>(null)

  const getValueFromEvent = useCallback((clientX: number): number => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect) return 0.5
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
  }, [])

  function handleTrackClick(e: React.MouseEvent<HTMLDivElement>): void {
    onScore(getValueFromEvent(e.clientX))
  }

  function handleDotMouseDown(e: React.MouseEvent): void {
    e.preventDefault()
    e.stopPropagation()

    function onMove(ev: MouseEvent): void { onScore(getValueFromEvent(ev.clientX)) }
    function onUp(): void {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const pct = score !== null ? score * 100 : null

  return (
    <div className={scores.slider}>
      <div className={scores.sliderElementName}>{elementName || ' '}</div>
      <div className={scores.sliderPoles}>
        <span className={scores.poleLabel}>{typeName || ' '}</span>
      </div>
      <div className={scores.sliderPoles}>
        <span className={scores.poleLabel}>None</span>
        <span className={scores.poleLabel}>Full</span>
      </div>
      <div ref={trackRef} className={scores.sliderTrack} onClick={handleTrackClick}>
        <div className={scores.sliderLine} />
        {Array.from({ length: 11 }, (_, i) => (
          <div key={i} className={scores.tick} style={{ left: `${i * 10}%` }} />
        ))}
        {pct !== null && (
          <div
            className={scores.sliderDot}
            style={{ left: `${pct}%` }}
            onMouseDown={handleDotMouseDown}
          />
        )}
      </div>
      {pct === null && (
        <p className={scores.sliderHint}>Click the line to set a membership score. Slide the dot to adjust it.</p>
      )}
    </div>
  )
}
