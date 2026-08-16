// ── AssessTab ─────────────────────────────────────────────────────────────────
//
// One workspace for applying judgments to elements. Dimension scores remain
// continuous values; Collection membership remains binary. They are colocated
// because both belong to assessment, not because they share a data model.
//
// The internal navigation key remains `scores` to avoid unrelated runtime/type
// churn. Collection remains the data-model and user-facing term.

import { useRef, useCallback, useEffect, KeyboardEvent } from 'react'
import { useAppStore } from '../../store/appStore'
import { history, SCORE_HISTORY_OWNER } from '../../store/history'
import { scoreStatus } from '../../lib/types'
import { useResizableSplitPane } from './useResizableSplitPane'
import styles from './ScoresTab.module.css'
import { CollectionChoiceRow } from '../CollectionChoiceRow'
import { memberCount } from '../maps/collections'

type Membership = 'all' | 'none' | 'mixed'

export function AssessTab(): React.JSX.Element {
  const elements        = useAppStore(s => s.elements)
  const dimensions      = useAppStore(s => s.dimensions)
  const collections     = useAppStore(s => s.collections)
  const scoreMap        = useAppStore(s => s.scores)
  const selectedElId    = useAppStore(s => s.selectedElementId)
  const selectedElIds   = useAppStore(s => s.selectedElementIds)
  const selectedDimId   = useAppStore(s => s.selectedDimensionId)
  const selectElement   = useAppStore(s => s.selectElement)
  const selectElements  = useAppStore(s => s.selectElements)
  const clearElementSelection = useAppStore(s => s.clearElementSelection)
  const selectDimension = useAppStore(s => s.selectDimension)
  const setScore        = useAppStore(s => s.setScore)
  const setCollection   = useAppStore(s => s.setElementsCollection)
  const setActiveTab    = useAppStore(s => s.setActiveTab)

  const splitPane = useResizableSplitPane()
  const keyboardHistoryOpenRef = useRef(false)

  const selectedEl  = elements.find(e => e.id === selectedElId)    ?? null
  const selectedDim = dimensions.find(d => d.id === selectedDimId) ?? null
  const elementById = new Map(elements.map(element => [element.id, element]))

  // A map lasso can leave a group selected while window focus clears the score
  // anchor. Keep those meanings separate: the slider writes only the anchor;
  // Collection controls write the valid, de-duplicated group when one exists.
  const validGroupIds = [...new Set(selectedElIds)].filter(id => elementById.has(id))
  // A one-item runtime group is equivalent to the anchor. If IPC leaves a
  // different one-item group behind, the visible anchor wins rather than
  // silently sending Collection changes to another element.
  const groupIds = validGroupIds.length > 1 || !selectedEl ? validGroupIds : []
  const isMultiSelection = groupIds.length > 1
  const targetIds = groupIds.length > 0
    ? groupIds
    : (selectedEl ? [selectedEl.id] : [])

  const dimScore = (selectedElId && selectedDimId)
    ? (scoreMap[selectedElId]?.[selectedDimId] ?? null) : null

  // Enter Assess ready to score without enforcing a permanent selection. After
  // this one-time initialization, a map's Deselect All must be allowed to leave
  // the element anchor empty.
  useEffect(() => {
    const state = useAppStore.getState()
    if (!state.selectedElementId && state.elements[0]) state.selectElement(state.elements[0].id)
    if (!state.selectedDimensionId && state.dimensions[0]) state.selectDimension(state.dimensions[0].id)
  }, [])

  // Left/right scoring belongs to the selected element × dimension pair, not
  // to whichever Assess control happens to hold focus. Reading live state keeps
  // key-repeat increments current between React renders.
  useEffect(() => {
    if (!selectedElId || !selectedDimId || isMultiSelection) return

    const endKeyboardHistory = (): void => {
      if (!keyboardHistoryOpenRef.current) return
      keyboardHistoryOpenRef.current = false
      history.end(SCORE_HISTORY_OWNER)
    }

    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      if (event.metaKey || event.ctrlKey || event.altKey) return

      const state = useAppStore.getState()
      if (!state.elements.some(element => element.id === selectedElId) ||
          !state.dimensions.some(dimension => dimension.id === selectedDimId)) return

      event.preventDefault()
      history.begin(SCORE_HISTORY_OWNER)
      keyboardHistoryOpenRef.current = true
      const current = state.scores[selectedElId]?.[selectedDimId] ?? 0.5
      const delta = event.key === 'ArrowLeft' ? -0.05 : 0.05
      state.setScore(selectedElId, selectedDimId,
        Math.round(Math.max(0, Math.min(1, current + delta)) * 100) / 100)
    }

    const onKeyUp = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') endKeyboardHistory()
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', endKeyboardHistory)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', endKeyboardHistory)
      endKeyboardHistory()
    }
  }, [selectedElId, selectedDimId, isMultiSelection])

  function membership(collectionId: string): Membership {
    if (targetIds.length === 0) return 'none'
    let count = 0
    for (const id of targetIds) {
      if (elementById.get(id)?.collectionIds.includes(collectionId)) count++
    }
    return count === 0 ? 'none' : count === targetIds.length ? 'all' : 'mixed'
  }

  function toggleMembership(collectionId: string): void {
    if (targetIds.length === 0) return
    setCollection(targetIds, collectionId, membership(collectionId) !== 'all')
  }

  // The transpose of scoreStatus(): an Element row is complete when every
  // Dimension has a score; a Dimension row is complete when every Element has
  // a score. The middle state shows that the active counterpart is scored even
  // though the row is not complete overall.
  function dimensionStatus(dimensionId: string): '–' | '◇' | '●' {
    if (elements.length === 0) return '–'
    if (elements.every(element => scoreMap[element.id]?.[dimensionId] !== undefined)) return '●'
    if (selectedEl && scoreMap[selectedEl.id]?.[dimensionId] !== undefined) return '◇'
    return '–'
  }

  // ── Keyboard navigation ───────────────────────────────────────────────────────

  function handleElementListKey(e: KeyboardEvent<HTMLUListElement>): void {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    if (elements.length === 0) return

    const idx = elements.findIndex(element => element.id === selectedElId)
    const next = idx < 0
      ? (e.key === 'ArrowDown' ? 0 : elements.length - 1)
      : idx + (e.key === 'ArrowDown' ? 1 : -1)
    if (next < 0 || next >= elements.length) return

    e.preventDefault()
    const targetId = elements[next].id
    if (e.shiftKey && selectedElId) {
      // Shift+Arrow extends a keyboard-created Collection batch. Traversing an
      // already selected row keeps the set intact; unlike the old toggle logic,
      // an interior anchor cannot punch a surprising hole in the group.
      const base = groupIds.length > 0 ? groupIds : [selectedElId]
      selectElements(base.includes(targetId) ? base : [...base, targetId])
    } else {
      // Unmodified arrows answer only the single-anchor scoring question.
      clearElementSelection()
    }
    selectElement(targetId)
  }

  function handleDimensionListKey(e: KeyboardEvent<HTMLUListElement>): void {
    if (isMultiSelection) return
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    if (dimensions.length === 0) return

    const idx = dimensions.findIndex(dimension => dimension.id === selectedDimId)
    const next = idx < 0
      ? (e.key === 'ArrowDown' ? 0 : dimensions.length - 1)
      : idx + (e.key === 'ArrowDown' ? 1 : -1)
    if (next < 0 || next >= dimensions.length) return

    e.preventDefault()
    selectDimension(dimensions[next].id)
  }

  function handleElementRowClick(e: React.MouseEvent, id: string): void {
    if (e.shiftKey && selectedElId) {
      const anchor = elements.findIndex(element => element.id === selectedElId)
      const clicked = elements.findIndex(element => element.id === id)
      if (anchor >= 0 && clicked >= 0) {
        const [start, end] = anchor < clicked ? [anchor, clicked] : [clicked, anchor]
        selectElements(elements.slice(start, end + 1).map(element => element.id))
        return
      }
    }

    if (e.metaKey || e.ctrlKey) {
      const base = groupIds.length > 0
        ? groupIds
        : (selectedElId ? [selectedElId] : [])
      const next = base.includes(id) ? base.filter(elementId => elementId !== id) : [...base, id]
      selectElements(next)
      if (next.includes(id)) selectElement(id)
      else if (next.length > 0) selectElement(next[next.length - 1])
      else {
        selectElement(null)
        selectDimension(null)
      }
      return
    }

    // An ordinary click answers the narrow question "what am I scoring?" and
    // intentionally ends any batch Collection selection.
    clearElementSelection()
    selectElement(id)
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className={styles.tab}>
      <div className={styles.scoreKey} aria-label="Scoring status key">
        <span><span className={styles.keySymbol}>–</span>No score</span>
        <span><span className={styles.keySymbol}>◇</span>Incomplete scores</span>
        <span><span className={styles.keySymbol}>●</span>Complete scores</span>
      </div>

      <section className={`${styles.section} ${styles.scoreSection}`}>
        {elements.length === 0 ? (
          <div className={styles.guidance}>
            <span>Add an element before scoring.</span>
            <button type="button" className={styles.linkBtn} onClick={() => setActiveTab('elements')}>
              Go to Elements
            </button>
          </div>
        ) : dimensions.length === 0 ? (
          <div className={styles.guidance}>
            <span>Add a dimension before scoring.</span>
            <button type="button" className={styles.linkBtn} onClick={() => setActiveTab('dimensions')}>
              Go to Dimensions
            </button>
          </div>
        ) : isMultiSelection ? (
          <p className={styles.multiScoreMessage}>Select one element to change dimension scores.</p>
        ) : !selectedEl ? (
          <EmptyScoreSlider />
        ) : !selectedDim ? (
          <p className={styles.empty}>Choose a dimension below to score {selectedEl.name || 'this element'}.</p>
        ) : (
          <ScoreSlider
            elementName={selectedEl.name || 'Untitled element'}
            poleA={selectedDim.poleA}
            poleB={selectedDim.poleB}
            score={dimScore}
            onScore={(value) => setScore(selectedEl.id, selectedDim.id, value)}
          />
        )}
      </section>

      <div className={styles.workspace} ref={splitPane.containerRef} style={splitPane.containerStyle}>
        <section className={`${styles.section} ${styles.elementsSection}`} style={splitPane.leftPaneStyle}>
          <h3 className={styles.sectionTitle}>Elements</h3>
          {elements.length === 0 ? (
            <p className={styles.empty}>No elements defined yet.</p>
          ) : (
            <ul
              className={styles.list}
              tabIndex={0}
              onKeyDown={handleElementListKey}
              role="listbox"
              aria-label="Elements to assess"
              aria-multiselectable
              aria-activedescendant={selectedEl
                ? `assess-element-${elements.findIndex(element => element.id === selectedEl.id)}`
                : undefined}
            >
              {elements.map((element, index) => {
                const inGroup = groupIds.includes(element.id)
                const status = scoreStatus(element, dimensions, scoreMap, selectedDimId)
                const statusLabel = status === '●'
                  ? 'All dimensions scored'
                  : status === '◇'
                    ? 'Selected dimension scored'
                    : dimensions.length === 0
                      ? 'No dimensions to score'
                      : selectedDimId
                        ? 'Selected dimension not scored'
                        : 'Not fully scored'
                return (
                  <li
                    id={`assess-element-${index}`}
                    key={element.id}
                    className={[
                      styles.listItem,
                      inGroup ? styles.multiSelected : '',
                      element.id === selectedElId ? styles.selected : ''
                    ].filter(Boolean).join(' ')}
                    role="option"
                    aria-selected={inGroup || element.id === selectedElId}
                    aria-current={element.id === selectedElId ? 'true' : undefined}
                    onClick={event => handleElementRowClick(event, element.id)}
                  >
                    <span className={styles.indicator} title={statusLabel} aria-label={statusLabel}>
                      {status}
                    </span>
                    <span className={styles.rowName}>{element.name || 'Untitled element'}</span>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <div className={styles.resizeHandle} style={splitPane.dividerStyle} {...splitPane.dividerProps} />

        <div className={styles.controlRail} style={splitPane.rightPaneStyle}>
          <section className={`${styles.section} ${styles.dimensionsSection}`}>
            <h3 className={styles.sectionTitle}>Dimensions</h3>
            {dimensions.length === 0 ? (
              <div className={styles.guidance}>
                <span>No dimensions defined yet.</span>
                <button type="button" className={styles.linkBtn} onClick={() => setActiveTab('dimensions')}>
                  Go to Dimensions
                </button>
              </div>
            ) : (
              <ul
                className={`${styles.list} ${isMultiSelection ? styles.listDisabled : ''}`}
                tabIndex={isMultiSelection ? -1 : 0}
                onKeyDown={handleDimensionListKey}
                role="listbox"
                aria-label="Dimensions to score"
                aria-disabled={isMultiSelection}
                aria-activedescendant={selectedDim
                  ? `assess-dimension-${dimensions.findIndex(dimension => dimension.id === selectedDim.id)}`
                  : undefined}
              >
                {dimensions.map((dimension, index) => {
                  const status = dimensionStatus(dimension.id)
                  const completionLabel = status === '●'
                    ? 'All elements scored'
                    : status === '◇'
                      ? 'Selected element scored'
                      : elements.length === 0
                        ? 'No elements to score'
                        : selectedEl
                          ? 'Selected element not scored'
                          : 'Not fully scored'
                  return (
                    <li
                      id={`assess-dimension-${index}`}
                      key={dimension.id}
                      className={`${styles.listItem} ${!isMultiSelection && dimension.id === selectedDimId ? styles.selected : ''}`}
                      role="option"
                      aria-selected={!isMultiSelection && dimension.id === selectedDimId}
                      aria-current={!isMultiSelection && dimension.id === selectedDimId ? 'true' : undefined}
                      aria-disabled={isMultiSelection}
                      onClick={() => { if (!isMultiSelection) selectDimension(dimension.id) }}
                    >
                      <span className={styles.indicator} title={completionLabel} aria-label={completionLabel}>
                        {status}
                      </span>
                      <span className={styles.rowName}>{dimension.label || 'Untitled dimension'}</span>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <section className={`${styles.section} ${styles.collectionsSection}`}>
            <h3 className={styles.sectionTitle}>
              <span>
                Collections
                {targetIds.length > 1 && <span className={styles.targetCount}>{targetIds.length} selected</span>}
              </span>
            </h3>

            {collections.length === 0 ? (
              <div className={styles.guidance}>
                <span>No collections defined yet.</span>
                <button type="button" className={styles.linkBtn} onClick={() => setActiveTab('collections')}>
                  Go to Collections
                </button>
              </div>
            ) : (
              <div className={styles.collectionList}>
                {collections.map(collection => {
                  const state = membership(collection.id)
                  const count = memberCount(collection, elements)
                  const name = collection.name || 'Untitled collection'
                  return (
                    <CollectionChoiceRow
                      key={collection.id}
                      name={`${name} (${count})`}
                      color={collection.color}
                      state={state}
                      disabled={targetIds.length === 0}
                      onToggle={() => toggleMembership(collection.id)}
                    />
                  )
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

// ── ScoreSlider ───────────────────────────────────────────────────────────────
//
// Custom slider for a single element × dimension score. Clicking anywhere on
// the track sets the score; dragging the dot or using arrow keys adjusts it.

interface DimSliderProps {
  elementName: string
  poleA:       string
  poleB:       string
  score:       number | null
  onScore:     (value: number) => void
}

interface ScoreScaleProps {
  score: number | null
  onDotMouseDown?: (event: React.MouseEvent) => void
}

function ScoreScale({ score, onDotMouseDown }: ScoreScaleProps): React.JSX.Element {
  return (
    <>
      <div className={styles.sliderLine} />
      {Array.from({ length: 11 }, (_, i) => (
        <div key={i} className={styles.tick} style={{ left: `${i * 10}%` }} />
      ))}
      {score !== null && (
        <div
          className={styles.sliderDot}
          data-score-slider-dot
          style={{ left: `${score * 100}%` }}
          onMouseDown={onDotMouseDown}
        />
      )}
    </>
  )
}

function EmptyScoreSlider(): React.JSX.Element {
  return (
    <div className={styles.slider} aria-hidden="true">
      <div className={styles.sliderElementName}>&nbsp;</div>
      <div className={styles.sliderPoles}>
        <span className={styles.poleLabel}>&nbsp;</span>
        <span className={styles.poleLabel}>&nbsp;</span>
      </div>
      <div className={`${styles.sliderTrack} ${styles.sliderTrackInactive}`}>
        <ScoreScale score={null} />
      </div>
    </div>
  )
}

function ScoreSlider({
  elementName,
  poleA,
  poleB,
  score,
  onScore
}: DimSliderProps): React.JSX.Element {
  const trackRef = useRef<HTMLDivElement>(null)
  const historyOpenRef = useRef(false)
  const removeDragListenersRef = useRef<(() => void) | null>(null)
  const suppressTrackClickRef = useRef(false)

  const endDragHistory = useCallback((): void => {
    if (!historyOpenRef.current) return
    historyOpenRef.current = false
    history.end(SCORE_HISTORY_OWNER)
  }, [])

  useEffect(() => () => {
    removeDragListenersRef.current?.()
    removeDragListenersRef.current = null
    endDragHistory()
  }, [endDragHistory])

  const getValueFromEvent = useCallback((clientX: number): number => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect) return 0.5
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
  }, [])

  function handleTrackClick(e: React.MouseEvent<HTMLDivElement>): void {
    // A dot drag ends at mouseup, immediately before the browser dispatches its
    // click. Do not let that trailing click become a second score/history entry.
    if (suppressTrackClickRef.current ||
        (e.target as HTMLElement).closest('[data-score-slider-dot]')) {
      suppressTrackClickRef.current = false
      return
    }
    onScore(getValueFromEvent(e.clientX))
  }

  function handleDotMouseDown(e: React.MouseEvent): void {
    e.preventDefault()
    e.stopPropagation()

    let wroteScore = false

    function removeListeners(): void {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('blur', onBlur)
      if (removeDragListenersRef.current === removeListeners) {
        removeDragListenersRef.current = null
      }
    }

    function finishDrag(): void {
      removeListeners()
      if (wroteScore) {
        suppressTrackClickRef.current = true
        // If this mouseup does not generate a click, do not suppress the user's
        // next deliberate track click.
        window.setTimeout(() => { suppressTrackClickRef.current = false }, 0)
      }
      endDragHistory()
    }

    function onMove(ev: MouseEvent): void {
      // Reassert the idempotent boundary on every write. A menu Undo, Redo, or
      // Save can finalize history while the pointer is still down; the next
      // move must then open a fresh transaction instead of recording each
      // remaining mousemove as its own action.
      history.begin(SCORE_HISTORY_OWNER)
      historyOpenRef.current = true
      wroteScore = true
      onScore(getValueFromEvent(ev.clientX))
    }

    function onUp(): void { finishDrag() }
    function onBlur(): void { finishDrag() }

    removeDragListenersRef.current?.()
    removeDragListenersRef.current = removeListeners
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('blur', onBlur)
  }

  function handleTrackKeyDown(e: KeyboardEvent<HTMLDivElement>): void {
    const current = score ?? 0.5
    let next: number

    switch (e.key) {
      case 'ArrowDown': next = current - 0.05; break
      case 'ArrowUp':   next = current + 0.05; break
      case 'Home':      next = 0; break
      case 'End':       next = 1; break
      default: return
    }

    e.preventDefault()
    // Key repeat is one continuous adjustment just like pointer drag, so one
    // press-and-hold remains one Undo step. Blur closes a missing keyup.
    history.begin(SCORE_HISTORY_OWNER)
    historyOpenRef.current = true
    onScore(Math.round(Math.max(0, Math.min(1, next)) * 100) / 100)
  }

  function handleTrackKeyUp(e: KeyboardEvent<HTMLDivElement>): void {
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
      endDragHistory()
    }
  }

  return (
    <div className={styles.slider}>
      <div className={styles.sliderElementName}>{elementName || ' '}</div>
      <div className={styles.sliderPoles}>
        <span className={styles.poleLabel}>{poleA}</span>
        <span className={styles.poleLabel}>{poleB}</span>
      </div>
      <div
        ref={trackRef}
        className={styles.sliderTrack}
        role="slider"
        tabIndex={0}
        aria-label={`${elementName}: ${poleA} to ${poleB}`}
        aria-valuemin={0}
        aria-valuemax={1}
        aria-valuenow={score ?? 0.5}
        aria-valuetext={score === null
          ? 'Not scored. Use the arrow keys to set a score.'
          : `${Math.round(score * 100)} percent from ${poleA} toward ${poleB}`}
        onKeyDown={handleTrackKeyDown}
        onKeyUp={handleTrackKeyUp}
        onBlur={endDragHistory}
        onClick={handleTrackClick}
      >
        <ScoreScale score={score} onDotMouseDown={handleDotMouseDown} />
      </div>
    </div>
  )
}
