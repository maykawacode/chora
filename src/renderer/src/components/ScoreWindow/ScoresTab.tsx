// ── ScoresTab ─────────────────────────────────────────────────────────────────
//
// Scoring tab for element × dimension.
//
// Top area: slider for the selected element on the selected dimension.
// Bottom area: elements list (left) | dimensions list (right).
//
// It used to score collection membership here too, behind a Dimensions/
// Collections toggle that swapped both lists and the slider at once. Membership
// is binary now and is set on the Elements tab beside color and shape, so this
// tab has one job and needs no toggle to say which one it is doing.

import { useRef, useCallback, KeyboardEvent } from 'react'
import { useAppStore } from '../../store/appStore'
import { scoreStatus } from '../../lib/types'
import styles from './ScoresTab.module.css'

export function ScoresTab(): React.JSX.Element {
  const elements        = useAppStore(s => s.elements)
  const dimensions      = useAppStore(s => s.dimensions)
  const scoreMap        = useAppStore(s => s.scores)
  const selectedElId    = useAppStore(s => s.selectedElementId)
  const selectedDimId   = useAppStore(s => s.selectedDimensionId)
  const selectElement   = useAppStore(s => s.selectElement)
  const selectDimension = useAppStore(s => s.selectDimension)
  const setScore        = useAppStore(s => s.setScore)

  const selectedEl  = elements.find(e => e.id === selectedElId)    ?? null
  const selectedDim = dimensions.find(d => d.id === selectedDimId) ?? null

  const dimScore = (selectedElId && selectedDimId)
    ? (scoreMap[selectedElId]?.[selectedDimId] ?? null) : null

  const hasData = elements.length > 0 && dimensions.length > 0

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

  function handleDimensionListKey(e: KeyboardEvent<HTMLUListElement>): void {
    if (!selectedDimId) return
    const idx = dimensions.findIndex(d => d.id === selectedDimId)
    if (e.key === 'ArrowDown' && idx < dimensions.length - 1) {
      selectDimension(dimensions[idx + 1].id); e.preventDefault()
    } else if (e.key === 'ArrowUp' && idx > 0) {
      selectDimension(dimensions[idx - 1].id); e.preventDefault()
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className={styles.tab}>
      {/* ── Slider area ── */}
      <div className={styles.sliderArea}>
        {hasData
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
            {elements.map(el => (
              <li
                key={el.id}
                className={`${styles.listItem} ${el.id === selectedElId ? styles.selected : ''}`}
                onClick={() => selectElement(el.id)}
              >
                <span className={styles.indicator}>
                  {scoreStatus(el, dimensions, scoreMap, selectedDimId)}
                </span>
                <span>{el.name}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Dimensions */}
        <div className={styles.listPanel}>
          <div className={styles.listHeader} style={{ borderColor: '#c47a50' }}>
            Dimensions ({dimensions.length})
          </div>
          <ul
            className={styles.list}
            style={{ borderColor: '#c47a50' }}
            tabIndex={0}
            onKeyDown={handleDimensionListKey}
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
      <div className={styles.sliderElementName}>{elementName || ' '}</div>
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
