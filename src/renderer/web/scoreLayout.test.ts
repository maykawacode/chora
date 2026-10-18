import { describe, expect, it } from 'vitest'
import {
  STRIP_WIDTH, columnMinWidth, columnWidth, paneFloor, paneMinWidth, paneSnapWidth, paneWidth, parseLayout,
  snapsClosed, tabsThatFit,
  useScoreLayout, type StoredLayout
} from './scoreLayout'

const record = (fields: object) => JSON.stringify({ version: 3, ...fields })
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
    expect(parseLayout(record({ version: 4 }))).toEqual(defaults)
    expect(parseLayout('null')).toEqual(defaults)
  })

  it('drops unknown views and malformed widths', () => {
    expect(parseLayout(record({ openTabs: ['maps', 'elements'], paneWidths: { elements: 'wide', notes: -5, maps: 300 } })))
      .toEqual({ ...defaults, openTabs: ['elements'] })
  })

  it('collapses a layout with no view open', () => {
    expect(parseLayout(record({ openTabs: [] }))).toMatchObject({ openTabs: [], collapsed: true })
  })

  it('carries a single Score width from before side-by-side views to Assess and Conversions', () => {
    const layout = parseLayout(record({ version: 1, scoreWidth: 520, collapsed: false }))
    expect(layout.openTabs).toEqual(['notes'])
    expect(layout.paneWidths.scores).toBe(520 - STRIP_WIDTH)
    expect(layout.paneWidths.elements).toBeUndefined()
    expect(layout.paneWidths.notes).toBeUndefined()
  })

  it('drops the Elements, Dimensions and Collections widths an older record kept, once', () => {
    const widths = { notes: 200, elements: 440, dimensions: 300, collections: 500, scores: 600 }
    for (const version of [1, 2]) {
      expect(parseLayout(record({ version, paneWidths: widths })).paneWidths).toEqual({ notes: 200, scores: 600 })
    }
    expect(parseLayout(record({ paneWidths: widths })).paneWidths).toEqual(widths)
  })

  it('opens Elements, Dimensions and Collections at 200px, squeezing to 150px', () => {
    for (const tab of ['elements', 'dimensions', 'collections'] as const) {
      expect(paneWidth({ paneWidths: {} }, tab)).toBe(200)
      expect(paneMinWidth(tab)).toBe(150)
    }
  })
})

describe('Score column width', () => {
  it('is the strip plus each open view and the lines between them', () => {
    const layout: StoredLayout = { ...defaults, openTabs: ['notes', 'elements'], paneWidths: { elements: 450 } }
    expect(columnWidth(layout)).toBe(STRIP_WIDTH + 260 + 450 + 1)
    expect(columnMinWidth(layout)).toBe(STRIP_WIDTH + paneMinWidth('notes') + paneMinWidth('elements') + 1)
  })

  it('lets Notes go thinner than Assess, never below its snap width', () => {
    expect(paneMinWidth('notes')).toBeLessThan(paneMinWidth('scores'))
    expect(paneWidth({ paneWidths: { notes: 10 } }, 'notes')).toBe(paneSnapWidth('notes'))
  })

  it('counts a view dragged below its minimum at its own width', () => {
    const narrow: StoredLayout = { ...defaults, paneWidths: { notes: paneSnapWidth('notes') + 5 } }
    expect(paneFloor(narrow, 'notes')).toBe(paneSnapWidth('notes') + 5)
    expect(columnMinWidth(narrow)).toBe(columnWidth(narrow))
  })
})

describe('Choosing Score views from the strip', () => {
  const start = (openTabs: StoredLayout['openTabs'], collapsed = false): void =>
    useScoreLayout.setState({ openTabs, paneWidths: {}, collapsed, animating: false })
  const open = (): StoredLayout['openTabs'] => useScoreLayout.getState().openTabs

  it('opens a view alone, closing the others', () => {
    start(['notes', 'elements'])
    useScoreLayout.getState().toggleTab('scores')
    expect(open()).toEqual(['scores'])
  })

  it('opens a view beside the others when added', () => {
    start(['notes'])
    useScoreLayout.getState().toggleTab('scores', true)
    expect(open()).toEqual(['notes', 'scores'])
  })

  it('closes only the chosen view when it is open', () => {
    start(['notes', 'elements'])
    useScoreLayout.getState().toggleTab('notes')
    expect(open()).toEqual(['elements'])
    useScoreLayout.getState().toggleTab('elements', true)
    expect(open()).toEqual([])
    expect(useScoreLayout.getState().collapsed).toBe(true)
  })

  it('shows only one view for a study just opened', () => {
    start(['notes', 'elements', 'scores'])
    useScoreLayout.getState().showOnly('notes')
    expect(open()).toEqual(['notes'])
  })

  it('opens the column with only the chosen view while collapsed', () => {
    start(['notes', 'elements'], true)
    useScoreLayout.getState().toggleTab('elements', true)
    expect(open()).toEqual(['elements'])
    expect(useScoreLayout.getState().collapsed).toBe(false)
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
