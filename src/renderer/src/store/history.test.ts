import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppState, CartesianMapConfig } from '../lib/types'
import { blackTextContrast } from '../lib/color'
import {
  cartesianDotRadius,
  DOT_DEFAULT_RADIUS,
  DOT_MAX_RADIUS,
  DOT_MIN_RADIUS
} from '../components/maps/cartesian/drawCartesian'
import { useAppStore } from './appStore'
import {
  HistoryController,
  SCORE_HISTORY_OWNER,
  type HistoryAvailability
} from './history'

let controller: HistoryController

function state(): ReturnType<typeof useAppStore.getState> {
  return useAppStore.getState()
}

async function flushHistory(): Promise<void> {
  await Promise.resolve()
}

function cartesianMap(id = 'map-1', title = 'Map'): CartesianMapConfig {
  // Keep the same natural property order used by newly created map configs.
  return {
    id,
    type: 'cartesian',
    onlySelectedCollections: false,
    title,
    xDimensionId: 'dim-x',
    yDimensionId: 'dim-y',
    xFlipped: false,
    yFlipped: false,
    showLabels: true,
    marks: 'circle',
    sizeByWeight: true,
    colorMode: 'element',
    shownCollectionIds: [],
    windowX: 100,
    windowY: 110,
    windowWidth: 600,
    windowHeight: 500
  }
}

function importedState(name: string): AppState {
  return {
    filePath: null,
    isDirty: true,
    sessionMeta: { id: `session-${name}`, name, definition: '' },
    elements: [{
      id: `element-${name}`,
      name,
      definition: '',
      weight: 1,
      color: '#9d9d53',
      shape: 'circle',
      collectionIds: []
    }],
    collections: [],
    dimensions: [],
    scores: {},
    maps: [],
    selectedElementId: null,
    selectedDimensionId: null,
    selectedCollectionId: null,
    activeTab: 'elements'
  }
}

beforeEach(() => {
  state().resetToEmpty()
  useAppStore.setState({
    filePath: null,
    isDirty: false,
    selectedElementId: null,
    selectedDimensionId: null,
    selectedCollectionId: null,
    selectedElementIds: [],
    activeTab: 'elements'
  })
  controller = new HistoryController()
  controller.start()
})

afterEach(() => {
  controller.dispose()
})

describe('HistoryController', () => {
  it('captures one atomic mutation and restores it with undo and redo', () => {
    state().addElement('Alpha')

    expect(controller.pastCount).toBe(1)
    expect(controller.canUndo).toBe(true)
    expect(state().elements.map(element => element.name)).toEqual(['Alpha'])

    expect(controller.undo()).toBe(true)
    expect(state().elements).toEqual([])
    expect(controller.canRedo).toBe(true)

    expect(controller.redo()).toBe(true)
    expect(state().elements.map(element => element.name)).toEqual(['Alpha'])
  })

  it('retains only the latest 50 actions', () => {
    for (let i = 0; i < 55; i++) state().addElement(`Element ${i}`)

    expect(controller.pastCount).toBe(50)
    for (let i = 0; i < 50; i++) expect(controller.undo()).toBe(true)

    expect(controller.undo()).toBe(false)
    expect(state().elements.map(element => element.name)).toEqual([
      'Element 0', 'Element 1', 'Element 2', 'Element 3', 'Element 4'
    ])
  })

  it('invalidates redo after a new branch', () => {
    state().addElement('Alpha')
    state().addElement('Beta')
    controller.undo()
    expect(controller.canRedo).toBe(true)

    state().addElement('Gamma')

    expect(controller.canRedo).toBe(false)
    expect(controller.redo()).toBe(false)
    expect(state().elements.map(element => element.name)).toEqual(['Alpha', 'Gamma'])
  })

  it('suppresses semantic no-ops and repairs their dirty flag after notification', async () => {
    controller.replaceDocument(() => state().addElement('Alpha'))
    const id = state().elements[0].id

    state().updateElement(id, { name: 'Alpha' })
    await flushHistory()

    expect(controller.pastCount).toBe(0)
    expect(state().isDirty).toBe(false)
  })

  it('groups many mutations into one transaction without closing a nested same-owner run', () => {
    controller.begin(SCORE_HISTORY_OWNER)
    state().addElement('Alpha')
    controller.run(SCORE_HISTORY_OWNER, () => {
      state().addElement('Beta')
      state().addElement('Gamma')
    })

    expect(controller.activeOwner).toBe(SCORE_HISTORY_OWNER)
    expect(controller.pastCount).toBe(0)
    expect(controller.canUndo).toBe(true)

    controller.end(SCORE_HISTORY_OWNER)
    expect(controller.pastCount).toBe(1)
    controller.undo()
    expect(state().elements).toEqual([])
  })

  it('drops a transaction whose mutations return exactly to its starting frame', () => {
    controller.replaceDocument(() => state().addElement('Alpha'))
    const id = state().elements[0].id

    controller.begin(SCORE_HISTORY_OWNER)
    state().updateElement(id, { definition: 'temporary' })
    state().updateElement(id, { definition: '' })
    controller.end(SCORE_HISTORY_OWNER)

    expect(controller.pastCount).toBe(0)
    expect(state().isDirty).toBe(false)
  })

  it('closes and records a compound transaction even when its callback throws', () => {
    expect(() => controller.run(SCORE_HISTORY_OWNER, () => {
      state().addElement('Partial result')
      throw new Error('failed compound action')
    })).toThrow('failed compound action')

    expect(controller.activeOwner).toBeNull()
    expect(controller.pastCount).toBe(1)
    controller.undo()
    expect(state().elements).toEqual([])
  })

  it('defensively commits a leaked owner and ignores its late end message', () => {
    controller.begin(11)
    state().addElement('First map edit')

    controller.begin(22)
    state().addElement('Second map edit')
    controller.end(11)

    expect(controller.activeOwner).toBe(22)
    controller.end(22)
    expect(controller.pastCount).toBe(2)
  })

  it('restores the exact random result on redo rather than rerunning the operation', () => {
    controller.replaceDocument(() => {
      state().addElement('Alpha')
      state().addElement('Beta')
    })

    state().randomizeWeights()
    const randomWeights = state().elements.map(element => element.weight)
    controller.undo()
    controller.redo()

    expect(state().elements.map(element => element.weight)).toEqual(randomWeights)
  })

  it('scales the actual Element weight range into Dimension scores', () => {
    controller.replaceDocument(() => {
      state().addElement('Light')
      state().addElement('Middle')
      state().addElement('Heavy')
      state().addDimension('Low–High')
    })
    const [light, middle, heavy] = state().elements
    state().updateElement(light.id, { weight: 0 })
    state().updateElement(middle.id, { weight: 125 })
    state().updateElement(heavy.id, { weight: 250 })

    const dimensionId = state().dimensions[0].id
    state().weightToDimension(dimensionId)

    expect(state().scores[light.id][dimensionId]).toBe(0)
    expect(state().scores[middle.id][dimensionId]).toBe(0.5)
    expect(state().scores[heavy.id][dimensionId]).toBe(1)
  })

  it('sanitizes Element weights without imposing an upper ceiling', () => {
    controller.replaceDocument(() => state().addElement('Alpha'))
    const id = state().elements[0].id

    state().updateElement(id, { weight: 500 })
    expect(state().elements[0].weight).toBe(500)

    state().updateElement(id, { weight: -10 })
    expect(state().elements[0].weight).toBe(0)
  })

  it('sanitizes Dimension weights without imposing an upper ceiling', () => {
    controller.replaceDocument(() => state().addDimension('Low–High'))
    const id = state().dimensions[0].id

    state().updateDimension(id, { weight: 500 })
    expect(state().dimensions[0].weight).toBe(500)

    state().updateDimension(id, { weight: -10 })
    expect(state().dimensions[0].weight).toBe(0)
  })

  it('randomizes element colors that remain readable under black text', () => {
    controller.replaceDocument(() => {
      state().addElement('Alpha')
      state().addElement('Beta')
    })

    state().randomizeColors()

    for (const element of state().elements) {
      expect(blackTextContrast(element.color)).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('ignores navigation and prunes only selections invalidated by restoration', () => {
    controller.replaceDocument(() => state().addElement('Alpha'))
    const alphaId = state().elements[0].id

    state().selectElement(alphaId)
    state().selectElements([alphaId])
    state().setActiveTab('scores')
    expect(controller.pastCount).toBe(0)

    state().duplicateElement(alphaId)
    const copyId = state().selectedElementId!
    state().selectElements([alphaId, copyId])

    controller.undo()

    expect(state().activeTab).toBe('scores')
    expect(state().selectedElementId).toBeNull()
    expect(state().selectedElementIds).toEqual([alphaId])
  })

  it('makes New/Open replacements clean and clears both stacks', () => {
    state().addElement('Alpha')
    state().addElement('Beta')
    controller.undo()
    expect(controller.availability).toEqual({ canUndo: true, canRedo: true })

    controller.replaceDocument(() => state().loadSession(importedState('Opened')))

    expect(controller.availability).toEqual({ canUndo: false, canRedo: false })
    expect(state().isDirty).toBe(false)
    expect(state().elements[0].name).toBe('Opened')
  })

  it('rolls back a partial document replacement when its callback throws', () => {
    controller.replaceDocument(() => state().addElement('Original'))

    expect(() => controller.replaceDocument(() => {
      state().addElement('Partial replacement')
      throw new Error('open failed')
    })).toThrow('open failed')

    expect(state().elements.map(element => element.name)).toEqual(['Original'])
    expect(state().isDirty).toBe(false)
    expect(controller.pastCount).toBe(0)
  })

  it('treats Import as one replacement and restores its prior file identity', () => {
    controller.replaceDocument(() => {
      state().addElement('Original')
      useAppStore.setState({ filePath: '/sessions/original.mtda' })
    })

    controller.replaceUndoable(() => state().loadSession(importedState('Imported')))
    expect(state().filePath).toBeNull()
    expect(state().isDirty).toBe(true)

    controller.undo()
    expect(state().elements[0].name).toBe('Original')
    expect(state().filePath).toBe('/sessions/original.mtda')

    controller.redo()
    expect(state().elements[0].name).toBe('Imported')
    expect(state().filePath).toBeNull()
  })

  it('tracks the exact saved frame across undo, redo, and save-after-undo', async () => {
    state().addElement('Alpha')
    const id = state().elements[0].id
    const firstSave = controller.captureSave()
    expect(controller.markSaved(firstSave, '/sessions/work.mtda')).toBe(true)
    expect(state().isDirty).toBe(false)

    state().updateElement(id, { definition: 'changed' })
    await flushHistory()
    expect(state().isDirty).toBe(true)

    controller.undo()
    expect(state().isDirty).toBe(false)
    controller.redo()
    expect(state().isDirty).toBe(true)

    controller.undo()
    const secondSave = controller.captureSave()
    expect(controller.markSaved(secondSave, '/sessions/saved-after-undo.mtda')).toBe(true)
    expect(controller.canRedo).toBe(true)
    expect(state().isDirty).toBe(false)

    controller.redo()
    expect(state().filePath).toBe('/sessions/saved-after-undo.mtda')
    expect(state().isDirty).toBe(true)
  })

  it('keeps newer edits dirty when an earlier asynchronous save completes', () => {
    state().addElement('Alpha')
    const token = controller.captureSave()

    state().addElement('Beta')
    expect(controller.markSaved(token, '/sessions/work.mtda')).toBe(true)

    expect(state().filePath).toBe('/sessions/work.mtda')
    expect(state().isDirty).toBe(true)
    expect(controller.pastCount).toBe(2)
  })

  it('rebases a transaction begun while Save As is in flight', () => {
    controller.replaceDocument(() => state().addElement('Alpha'))
    const id = state().elements[0].id
    const token = controller.captureSave()

    // Merely focusing a field while the write completes must not create an
    // action whose only difference is the pre-Save-As path.
    controller.begin(SCORE_HISTORY_OWNER)
    expect(controller.markSaved(token, '/sessions/new.mtda')).toBe(true)
    controller.end(SCORE_HISTORY_OWNER)
    expect(controller.pastCount).toBe(0)

    // If the focused field changes before a later write completes, its one real
    // history entry is rebased while active and stays on the new path when undone.
    const secondToken = controller.captureSave()
    controller.begin(SCORE_HISTORY_OWNER)
    state().updateElement(id, { definition: 'edited after save began' })
    expect(controller.markSaved(secondToken, '/sessions/newer.mtda')).toBe(true)
    controller.end(SCORE_HISTORY_OWNER)
    expect(controller.pastCount).toBe(1)

    controller.undo()
    expect(state().filePath).toBe('/sessions/newer.mtda')
    expect(state().elements[0].definition).toBe('')
    expect(state().isDirty).toBe(false)
  })

  it('rejects stale save completion after a document replacement', () => {
    state().addElement('Alpha')
    const token = controller.captureSave()

    controller.replaceDocument(() => state().loadSession(importedState('Opened')))

    expect(controller.markSaved(token, '/sessions/stale.mtda')).toBe(false)
    expect(state().filePath).toBeNull()
    expect(state().isDirty).toBe(false)
  })

  it('rejects stale save completion after an undoable Import replacement', () => {
    state().addElement('Original')
    const token = controller.captureSave()

    controller.replaceUndoable(() => state().loadSession(importedState('Imported')))

    expect(controller.markSaved(token, '/sessions/stale-import.mtda')).toBe(false)
    expect(state().elements[0].name).toBe('Imported')
    expect(state().filePath).toBeNull()
  })

  it('rebases all frame paths after Save As so undo never reverts the path', () => {
    controller.replaceDocument(() => {
      state().addElement('Alpha')
      useAppStore.setState({ filePath: '/sessions/old.mtda' })
    })
    state().addElement('Beta')
    controller.undo()

    const token = controller.captureSave()
    controller.markSaved(token, '/sessions/new.mtda')
    controller.redo()
    expect(state().filePath).toBe('/sessions/new.mtda')
    controller.undo()
    expect(state().filePath).toBe('/sessions/new.mtda')
  })

  it('does not record suspended geometry maintenance', () => {
    controller.replaceDocument(() => state().addMap(cartesianMap()))

    controller.suspend(() => {
      state().updateMapConfig('map-1', {
        windowX: 700,
        windowY: 710,
        windowWidth: 900,
        windowHeight: 800
      })
    })

    expect(controller.pastCount).toBe(0)
    expect(state().maps[0].windowX).toBe(700)
  })

  it('preserves current geometry for a surviving map during restore', () => {
    controller.replaceDocument(() => state().addMap(cartesianMap()))
    state().updateMapConfig('map-1', { title: 'Renamed' })
    controller.suspend(() => state().updateMapConfig('map-1', {
      windowX: 777,
      windowY: 778,
      windowWidth: 901,
      windowHeight: 801
    }))

    controller.undo()

    expect(state().maps[0]).toMatchObject({
      title: 'Map',
      windowX: 777,
      windowY: 778,
      windowWidth: 901,
      windowHeight: 801
    })
  })

  it('restores captured geometry when undo brings back a deleted map', () => {
    controller.replaceDocument(() => state().addMap(cartesianMap()))
    state().removeMap('map-1')

    controller.undo()

    expect(state().maps[0]).toMatchObject({
      id: 'map-1',
      windowX: 100,
      windowY: 110,
      windowWidth: 600,
      windowHeight: 500
    })
  })

  it('keeps a newly created map frame byte-stable through saved undo and redo', () => {
    state().addMap(cartesianMap())
    const saved = controller.captureSave()
    controller.markSaved(saved, '/sessions/map.mtda')

    state().updateMapConfig('map-1', { title: 'Renamed' })
    controller.undo()
    expect(state().isDirty).toBe(false)

    controller.redo()
    expect(state().isDirty).toBe(true)
    controller.undo()
    expect(state().isDirty).toBe(false)
  })

  it('emits availability immediately and while the first transaction is active', () => {
    const seen: HistoryAvailability[] = []
    const listener = vi.fn((value: HistoryAvailability) => seen.push(value))
    const unsubscribe = controller.onAvailability(listener)

    expect(seen).toEqual([{ canUndo: false, canRedo: false }])

    controller.begin(SCORE_HISTORY_OWNER)
    state().addElement('Alpha')
    expect(seen.at(-1)).toEqual({ canUndo: true, canRedo: false })

    controller.end(SCORE_HISTORY_OWNER)
    controller.undo()
    expect(seen.at(-1)).toEqual({ canUndo: false, canRedo: true })

    unsubscribe()
    state().addElement('Beta')
    expect(listener).toHaveBeenCalledTimes(3)
  })
})

describe('cartesianDotRadius', () => {
  it('uses the complete current range while retaining the default size', () => {
    const weighted = cartesianMap()
    const range = { min: 0, max: 250 }
    expect(cartesianDotRadius(weighted, 0, range)).toBe(DOT_MIN_RADIUS)
    expect(cartesianDotRadius(weighted, 125, range)).toBe(41)
    expect(cartesianDotRadius(weighted, 250, range)).toBe(76)
    expect(DOT_MAX_RADIUS).toBe(76)

    expect(cartesianDotRadius({ ...weighted, sizeByWeight: false }, 250, range))
      .toBe(DOT_DEFAULT_RADIUS)
  })
})
