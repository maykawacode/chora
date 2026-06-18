// ── ScoresTab ─────────────────────────────────────────────────────────────────
//
// Combined scoring tab for both dimensions and types.
//
// Top area: slider for the selected element × dimension (or element × type).
// Bottom area: elements list (left) | toggling right panel (right).
//
// The right panel header has two toggle buttons — Dimensions and Types.
// Clicking either one switches the right list and the top slider simultaneously.
// Element indicator dots update to reflect whichever panel is active.

import { useRef, useCallback, useState, KeyboardEvent } from 'react'
import { useAppStore } from '../../store/appStore'
import { scoreStatus, typeScoreStatus } from '../../lib/types'
import styles from './ScoresTab.module.css'

export function ScoresTab(): React.JSX.Element {
  const elements        = useAppStore(s => s.elements)
  const dimensions      = useAppStore(s => s.dimensions)
  const types           = useAppStore(s => s.types)
  const scoreMap        = useAppStore(s => s.scores)
  const selectedElId    = useAppStore(s => s.selectedElementId)
  const selectedDimId   = useAppStore(s => s.selectedDimensionId)
  const selectedTypeId  = useAppStore(s => s.selectedTypeId)
  const selectElement   = useAppStore(s => s.selectElement)
  const selectDimension = useAppStore(s => s.selectDimension)
  const selectType      = useAppStore(s => s.selectType)
  const setScore        = useAppStore(s => s.setScore)

  const [rightPanel, setRightPanel] = useState<'dimensions' | 'types'>('dimensions')

  const selectedEl   = elements.find(e => e.id === selectedElId)   ?? null
  const selectedDim  = dimensions.find(d => d.id === selectedDimId) ?? null
  const selectedType = types.find(t => t.id === selectedTypeId)    ?? null

  const dimScore  = (selectedElId && selectedDimId)
    ? (scoreMap[selectedElId]?.[selectedDimId]  ?? null) : null
  const typeScore = (selectedElId && selectedTypeId)
    ? (scoreMap[selectedElId]?.[selectedTypeId] ?? null) : null

  const hasDimData  = elements.length > 0 && dimensions.length > 0
  const hasTypeData = elements.length > 0 && types.length > 0

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

  function handleRightListKey(e: KeyboardEvent<HTMLUListElement>): void {
    if (rightPanel === 'dimensions') {
      if (!selectedDimId) return
      const idx = dimensions.findIndex(d => d.id === selectedDimId)
      if (e.key === 'ArrowDown' && idx < dimensions.length - 1) {
        selectDimension(dimensions[idx + 1].id); e.preventDefault()
      } else if (e.key === 'ArrowUp' && idx > 0) {
        selectDimension(dimensions[idx - 1].id); e.preventDefault()
      }
    } else {
      if (!selectedTypeId) return
      const idx = types.findIndex(t => t.id === selectedTypeId)
      if (e.key === 'ArrowDown' && idx < types.length - 1) {
        selectType(types[idx + 1].id); e.preventDefault()
      } else if (e.key === 'ArrowUp' && idx > 0) {
        selectType(types[idx - 1].id); e.preventDefault()
      }
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className={styles.tab}>
      {/* ── Slider area ── */}
      <div className={styles.sliderArea}>
        {rightPanel === 'dimensions'
          ? hasDimData
            ? <ScoreSlider
                elementName={selectedEl?.name ?? ''}
                poleA={selectedDim?.poleA ?? ''}
                poleB={selectedDim?.poleB ?? ''}
                score={dimScore}
                onScore={(v) => {
                  if (selectedElId && selectedDimId) setScore(selectedElId, selectedDimId, v)
                }}
              />
            : <p className={styles.hint}>Add elements and dimensions, then select both to score.</p>
          : hasTypeData
            ? <TypeScoreSlider
                elementName={selectedEl?.name ?? ''}
                typeName={selectedType?.name ?? ''}
                score={typeScore}
                onScore={(v) => {
                  if (selectedElId && selectedTypeId) setScore(selectedElId, selectedTypeId, v)
                }}
              />
            : <p className={styles.hint}>Add elements and types, then select both to score.</p>
        }
      </div>

      {/* ── Navigation lists ── */}
      <div className={styles.listsRow}>

        {/* Elements */}
        <div className={styles.listPanel}>
          <div className={styles.listHeader} style={{ borderColor: '#4a7a4a' }}>
            Elements ({elements.length})
          </div>
          <ul
            className={styles.list}
            style={{ borderColor: '#4a7a4a' }}
            tabIndex={0}
            onKeyDown={handleElementListKey}
          >
            {elements.map(el => {
              const status = rightPanel === 'dimensions'
                ? scoreStatus(el, dimensions, scoreMap, selectedDimId)
                : typeScoreStatus(el, types, scoreMap, selectedTypeId)
              return (
                <li
                  key={el.id}
                  className={`${styles.listItem} ${el.id === selectedElId ? styles.selected : ''}`}
                  onClick={() => selectElement(el.id)}
                >
                  <span className={styles.indicator}>{status}</span>
                  <span>{el.name}</span>
                </li>
              )
            })}
          </ul>
        </div>

        {/* Right panel — Dimensions or Types */}
        <div className={styles.listPanel}>
          <div className={styles.panelToggleRow}>
            <button
              className={`${styles.panelToggleBtn} ${rightPanel === 'dimensions' ? styles.panelToggleBtnActive : ''}`}
              onClick={() => setRightPanel('dimensions')}
            >
              Dimensions ({dimensions.length})
            </button>
            <button
              className={`${styles.panelToggleBtn} ${rightPanel === 'types' ? styles.panelToggleBtnActive : ''}`}
              onClick={() => setRightPanel('types')}
            >
              Types ({types.length})
            </button>
          </div>

          {rightPanel === 'dimensions'
            ? (
              <ul
                className={styles.list}
                style={{ borderColor: '#c47a50' }}
                tabIndex={0}
                onKeyDown={handleRightListKey}
              >
                {dimensions.map(dim => (
                  <li
                    key={dim.id}
                    className={`${styles.listItem} ${dim.id === selectedDimId ? styles.selected : ''}`}
                    onClick={() => selectDimension(dim.id)}
                  >
                    {dim.label}
                  </li>
                ))}
              </ul>
            )
            : (
              <ul
                className={styles.list}
                style={{ borderColor: '#6a5a9a' }}
                tabIndex={0}
                onKeyDown={handleRightListKey}
              >
                {types.map(type => (
                  <li
                    key={type.id}
                    className={`${styles.listItem} ${type.id === selectedTypeId ? styles.selected : ''}`}
                    onClick={() => selectType(type.id)}
                  >
                    {type.name}
                  </li>
                ))}
              </ul>
            )
          }
        </div>
      </div>
    </div>
  )
}

// ── ScoreSlider ───────────────────────────────────────────────────────────────
//
// Custom draggable slider for a single element × dimension score.
// Clicking anywhere on the track sets the score; dragging the dot adjusts it.

interface DimSliderProps {
  elementName: string
  poleA:       string
  poleB:       string
  score:       number | null
  onScore:     (value: number) => void
}

function ScoreSlider({ elementName, poleA, poleB, score, onScore }: DimSliderProps): React.JSX.Element {
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
    <div className={styles.slider}>
      <div className={styles.sliderElementName}>{elementName || ' '}</div>
      <div className={styles.sliderPoles}>
        <span className={styles.poleLabel}>{poleA}</span>
        <span className={styles.poleLabel}>{poleB}</span>
      </div>
      <div ref={trackRef} className={styles.sliderTrack} onClick={handleTrackClick}>
        <div className={styles.sliderLine} />
        {Array.from({ length: 11 }, (_, i) => (
          <div key={i} className={styles.tick} style={{ left: `${i * 10}%` }} />
        ))}
        {pct !== null && (
          <div
            className={styles.sliderDot}
            style={{ left: `${pct}%` }}
            onMouseDown={handleDotMouseDown}
          />
        )}
      </div>
      <p className={styles.sliderHint} style={{ visibility: pct !== null ? 'hidden' : 'visible' }}>
        Click on the line to indicate the score. Slide the dot to adjust it.
      </p>
    </div>
  )
}

// ── TypeScoreSlider ───────────────────────────────────────────────────────────
//
// Same mechanic as ScoreSlider but for type membership (0 = None, 1 = Full).

interface TypeSliderProps {
  elementName: string
  typeName:    string
  score:       number | null
  onScore:     (value: number) => void
}

function TypeScoreSlider({ elementName, typeName, score, onScore }: TypeSliderProps): React.JSX.Element {
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
    <div className={styles.slider}>
      <div className={styles.sliderElementName}>{elementName || ' '}</div>
      <div className={styles.sliderPoles}>
        <span className={styles.poleLabel}>None</span>
        <span className={`${styles.poleLabel} ${styles.poleLabelCenter}`}>{typeName || ' '}</span>
        <span className={styles.poleLabel}>Full</span>
      </div>
      <div ref={trackRef} className={styles.sliderTrack} onClick={handleTrackClick}>
        <div className={styles.sliderLine} />
        {Array.from({ length: 11 }, (_, i) => (
          <div key={i} className={styles.tick} style={{ left: `${i * 10}%` }} />
        ))}
        {pct !== null && (
          <div
            className={styles.sliderDot}
            style={{ left: `${pct}%` }}
            onMouseDown={handleDotMouseDown}
          />
        )}
      </div>
      <p className={styles.sliderHint} style={{ visibility: pct !== null ? 'hidden' : 'visible' }}>
        Click the line to set a membership score. Slide the dot to adjust it.
      </p>
    </div>
  )
}
