import { describe, expect, it } from 'vitest'
import {
  STRIP_WIDTH, columnMinWidth, columnWidth, paneMinWidth, paneWidth, parseLayout,
  snapsClosed, tabsThatFit,
  useScoreLayout, type StoredLayout
} from './scoreLayout'

const record = (fields: object) => JSON.stringify({ version: 7, ...fields })
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
    expect(parseLayout(record({ version: 8 }))).toEqual(defaults)
    expect(parseLayout('null')).toEqual(defaults)
  })

  it('drops unknown views and malformed widths', () => {
    expect(parseLayout(record({ openTabs: ['maps', 'elements'], paneWidths: { elements: 'wide', notes: -5, maps: 300 } })))
      .toEqual({ ...defaults, openTabs: ['elements'] })
  })

  it('collapses a layout with no view open', () => {
    expect(parseLayout(record({ openTabs: [] }))).toMatchObject({ openTabs: [], collapsed: true })
  })

  it('drops a view width saved before that view\'s default changed, once', () => {
    const widths = { notes: 200, elements: 440, dimensions: 300, collections: 500, scores: 600, conversions: 500 }
    expect(parseLayout(record({ version: 2, paneWidths: widths })).paneWidths).toEqual({})
    expect(parseLayout(record({ version: 3, paneWidths: widths })).paneWidths)
      .toEqual({ elements: 440, dimensions: 300, collections: 500 })
    expect(parseLayout(record({ version: 4, paneWidths: widths })).paneWidths)
      .toEqual({ elements: 440, dimensions: 300, collections: 500, scores: 600 })
    expect(parseLayout(record({ version: 6, paneWidths: widths })).paneWidths)
      .toEqual({ notes: 200, elements: 440, dimensions: 300, collections: 500, scores: 600 })
    expect(parseLayout(record({ paneWidths: widths })).paneWidths).toEqual(widths)
  })

  it('opens the data views at 200px and Conversions at 380px, snapping them closed below 75px, their minimum', () => {
    for (const tab of ['elements', 'dimensions', 'collections', 'conversions'] as const) {
      expect(paneWidth({ paneWidths: {} }, tab)).toBe(tab === 'conversions' ? 380 : 200)
      expect(paneMinWidth(tab)).toBe(75)
      expect(snapsClosed(tab, 75)).toBe(false)
      expect(snapsClosed(tab, 74)).toBe(true)
    }
  })

  it('opens Assess at 380px and snaps it closed below 160px, its minimum', () => {
    expect(paneWidth({ paneWidths: {} }, 'scores')).toBe(380)
    expect(paneMinWidth('scores')).toBe(160)
    expect(snapsClosed('scores', 160)).toBe(false)
    expect(snapsClosed('scores', 159)).toBe(true)
  })
})

describe('Score column width', () => {
  it('is the strip plus each open view and the lines between them', () => {
    const layout: StoredLayout = { ...defaults, openTabs: ['notes', 'elements'], paneWidths: { elements: 450 } }
    expect(columnWidth(layout)).toBe(STRIP_WIDTH + 200 + 450 + 1)
    expect(columnMinWidth(layout)).toBe(STRIP_WIDTH + paneMinWidth('notes') + paneMinWidth('elements') + 1)
  })

  it('opens Notes at 200px, snapping it closed below 100px, its minimum', () => {
    expect(paneWidth({ paneWidths: {} }, 'notes')).toBe(200)
    expect(paneMinWidth('notes')).toBe(100)
  })

  it('never shows a view below its minimum', () => {
    expect(paneWidth({ paneWidths: { notes: 10 } }, 'notes')).toBe(paneMinWidth('notes'))
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

  it('snaps a view closed only when dragged past its minimum', () => {
    expect(snapsClosed('elements', paneMinWidth('elements'))).toBe(false)
    expect(snapsClosed('elements', paneMinWidth('elements') - 1)).toBe(true)
  })

  it('reopens a view snapped closed at its default width, however wide it was before', () => {
    const defaults = { notes: 200, elements: 200, dimensions: 200, collections: 200, scores: 380, conversions: 380 } as const
    for (const [tab, width] of Object.entries(defaults) as [keyof typeof defaults, number][]) {
      useScoreLayout.setState({ openTabs: [tab], paneWidths: { [tab]: 600 }, collapsed: false })
      useScoreLayout.getState().snapClose(tab)
      expect(useScoreLayout.getState().openTabs).toEqual([])
      useScoreLayout.getState().toggleTab(tab)
      expect(paneWidth(useScoreLayout.getState(), tab)).toBe(width)
    }
  })

  it('reopens a view closed from the strip at the width it had', () => {
    useScoreLayout.setState({ openTabs: ['notes', 'scores'], paneWidths: { scores: 600 }, collapsed: false })
    useScoreLayout.getState().toggleTab('scores')
    useScoreLayout.getState().toggleTab('scores', true)
    expect(useScoreLayout.getState().paneWidths.scores).toBe(600)
  })

  it('shrinks open views wider than their defaults to their defaults when a map takes the room', () => {
    useScoreLayout.setState({
      openTabs: ['notes', 'elements', 'scores'], paneWidths: { notes: 300, elements: 120, scores: 700, conversions: 500 }
    })
    useScoreLayout.getState().squeeze()
    expect(useScoreLayout.getState().paneWidths)
      .toEqual({ notes: 200, elements: 120, scores: 380, conversions: 500 })
  })

  it('closes the last view when the splitter drags it below its minimum', () => {
    useScoreLayout.setState({ openTabs: ['notes', 'elements'], paneWidths: {}, collapsed: false })
    const layout = useScoreLayout.getState()
    layout.resizeColumn(columnWidth(layout) - paneWidth(layout, 'elements') + paneMinWidth('elements'))
    expect(useScoreLayout.getState().openTabs).toEqual(['notes', 'elements'])
    useScoreLayout.getState().resizeColumn(STRIP_WIDTH + paneWidth(layout, 'notes') + 20)
    expect(useScoreLayout.getState().openTabs).toEqual(['notes'])
  })
})
