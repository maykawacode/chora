import { describe, expect, it } from 'vitest'
import {
  STRIP_WIDTH, columnMinWidth, columnWidth, paneFloor, paneMinWidth, paneSnapWidth, paneWidth, parseLayout,
  snapsClosed, tabsThatFit,
  useScoreLayout, type StoredLayout
} from './scoreLayout'

const record = (fields: object) => JSON.stringify({ version: 1, ...fields })
const defaults: StoredLayout = { openTabs: ['notes'], paneWidths: {}, collapsed: false, labels: false }

describe('stored Score layout', () => {
  it('reads open views, their widths, collapse and names', () => {
    expect(parseLayout(record({
      openTabs: ['scores', 'notes'], paneWidths: { notes: 180.4, scores: 500 }, collapsed: true, labels: true
    }))).toEqual({ openTabs: ['notes', 'scores'], paneWidths: { notes: 180, scores: 500 }, collapsed: true, labels: true })
  })

  it('gives the defaults for missing, corrupt and foreign-version records', () => {
    expect(parseLayout(null)).toEqual(defaults)
    expect(parseLayout('{not json')).toEqual(defaults)
    expect(parseLayout(record({ version: 2 }))).toEqual(defaults)
    expect(parseLayout('null')).toEqual(defaults)
  })

  it('drops unknown views and malformed widths', () => {
    expect(parseLayout(record({ openTabs: ['maps', 'elements'], paneWidths: { elements: 'wide', notes: -5, maps: 300 } })))
      .toEqual({ ...defaults, openTabs: ['elements'] })
  })

  it('collapses a layout with no view open', () => {
    expect(parseLayout(record({ openTabs: [] }))).toMatchObject({ openTabs: [], collapsed: true })
  })

  it('carries a single Score width from before side-by-side views to each list-and-detail view', () => {
    const layout = parseLayout(record({ scoreWidth: 520, collapsed: false }))
    expect(layout.openTabs).toEqual(['notes'])
    expect(layout.paneWidths.elements).toBe(520 - STRIP_WIDTH)
    expect(layout.paneWidths.notes).toBeUndefined()
  })
})

describe('Score column width', () => {
  it('is the strip plus each open view and the lines between them', () => {
    const layout: StoredLayout = { ...defaults, openTabs: ['notes', 'elements'], paneWidths: { elements: 450 } }
    expect(columnWidth(layout)).toBe(STRIP_WIDTH + 260 + 450 + 1)
    expect(columnMinWidth(layout)).toBe(STRIP_WIDTH + paneMinWidth('notes') + paneMinWidth('elements') + 1)
  })

  it('lets Notes go thinner than a list-and-detail view, never below its snap width', () => {
    expect(paneMinWidth('notes')).toBeLessThan(paneMinWidth('elements'))
    expect(paneWidth({ paneWidths: { notes: 10 } }, 'notes')).toBe(paneSnapWidth('notes'))
  })

  it('counts a view dragged below its minimum at its own width', () => {
    const narrow: StoredLayout = { ...defaults, paneWidths: { notes: paneSnapWidth('notes') + 5 } }
    expect(paneFloor(narrow, 'notes')).toBe(paneSnapWidth('notes') + 5)
    expect(columnMinWidth(narrow)).toBe(columnWidth(narrow))
  })
})

describe('Score views sharing the page', () => {
  const four: StoredLayout = { ...defaults, openTabs: ['notes', 'elements', 'dimensions', 'scores'] }

  it('closes views from the right until the rest fit at their minimums', () => {
    const room = columnMinWidth({ ...four, openTabs: ['notes', 'elements'] })
    expect(tabsThatFit(four, room, 'notes')).toEqual(['notes', 'elements'])
    expect(tabsThatFit(four, columnMinWidth(four), 'notes')).toEqual(four.openTabs)
  })

  it('never closes the view in use, and always leaves one', () => {
    const room = columnMinWidth({ ...four, openTabs: ['notes', 'scores'] })
    expect(tabsThatFit(four, room, 'scores')).toEqual(['notes', 'scores'])
    expect(tabsThatFit(four, 0, 'dimensions')).toEqual(['dimensions'])
  })

  it('snaps a view closed only when dragged past its snap width', () => {
    expect(snapsClosed('elements', paneSnapWidth('elements'))).toBe(false)
    expect(snapsClosed('elements', paneSnapWidth('elements') - 1)).toBe(true)
  })

  it('reopens a view dragged below its minimum, or snapped closed, at its minimum', () => {
    useScoreLayout.setState({ openTabs: ['notes'], paneWidths: { elements: paneSnapWidth('elements') + 5 }, collapsed: false })
    useScoreLayout.getState().toggleTab('elements')
    expect(useScoreLayout.getState().paneWidths.elements).toBe(paneMinWidth('elements'))
  })

  it('shrinks every open view to its minimum when a map takes the room', () => {
    useScoreLayout.setState({ openTabs: ['notes', 'elements'], paneWidths: { notes: 300, elements: 600, scores: 700 } })
    useScoreLayout.getState().squeeze()
    expect(useScoreLayout.getState().paneWidths)
      .toEqual({ notes: paneMinWidth('notes'), elements: paneMinWidth('elements'), scores: 700 })
  })

  it('closes the last view when the splitter drags it well below its minimum', () => {
    useScoreLayout.setState({ openTabs: ['notes', 'elements'], paneWidths: {}, collapsed: false })
    const layout = useScoreLayout.getState()
    layout.resizeColumn(columnWidth(layout) - paneWidth(layout, 'elements') + paneMinWidth('elements') - 10)
    expect(useScoreLayout.getState().openTabs).toEqual(['notes', 'elements'])
    useScoreLayout.getState().resizeColumn(STRIP_WIDTH + paneWidth(layout, 'notes') + 20)
    expect(useScoreLayout.getState().openTabs).toEqual(['notes'])
  })
})
