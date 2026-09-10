import { describe, expect, it } from 'vitest'
import { fitSize, isRestorable, type Rect } from './windowGeometry'

// The built-in display. macOS reserves the menu bar, so the work area starts
// below y = 0 rather than at the origin.
const laptop: Rect = { x: 0, y: 25, width: 1728, height: 1085 }

// A second monitor arranged to the right of the laptop, as on the machine that
// produced the coordinates in resources/examples/sample-dataset.chora.
const external: Rect = { x: 1728, y: 0, width: 2560, height: 1415 }

const SCORE_WINDOW = { width: 530, height: 800 }
const at = (x: number, y: number): Rect => ({ x, y, ...SCORE_WINDOW })

describe('isRestorable', () => {
  it('accepts a position wholly inside the only display', () => {
    expect(isRestorable(at(400, 200), [laptop])).toBe(true)
  })

  it('rejects a position saved on a display that is no longer attached', () => {
    expect(isRestorable(at(2146, 157), [laptop])).toBe(false)
  })

  it('accepts that same position once the display is attached again', () => {
    expect(isRestorable(at(2146, 157), [laptop, external])).toBe(true)
  })

  it('accepts a window hanging off an edge while still grabbable', () => {
    expect(isRestorable(at(1600, 200), [laptop])).toBe(true)
  })

  it('rejects a window with only a sliver of its drag strip showing', () => {
    expect(isRestorable(at(1690, 200), [laptop])).toBe(false)
  })

  it('rejects a window sitting below the work area', () => {
    expect(isRestorable(at(400, 1200), [laptop])).toBe(false)
  })

  it('rejects a window whose drag strip is above the work area even though its body shows', () => {
    // Body spans y -800..100, so 75px is visible — but the title bar the user
    // would have to grab is off the top of the screen.
    expect(isRestorable(at(400, -800), [laptop])).toBe(false)
  })

  it('accepts a window straddling the seam between two displays', () => {
    expect(isRestorable(at(1650, 200), [laptop, external])).toBe(true)
  })

  it('measures a window narrower than the threshold against its own width', () => {
    expect(isRestorable({ x: 0, y: 200, width: 100, height: 800 }, [laptop])).toBe(true)
  })

  it('rejects everything when no displays are reported', () => {
    expect(isRestorable(at(400, 200), [])).toBe(false)
  })
})

describe('fitSize', () => {
  const minimum = { width: 400, height: 500 }

  it('leaves a size that already fits alone', () => {
    expect(fitSize(SCORE_WINDOW, laptop, minimum)).toEqual(SCORE_WINDOW)
  })

  it('shrinks a size remembered from a larger display', () => {
    expect(fitSize({ width: 2000, height: 1300 }, laptop, minimum))
      .toEqual({ width: 1728, height: 1085 })
  })

  it('keeps the minimum when the work area is smaller than it', () => {
    expect(fitSize(SCORE_WINDOW, { width: 320, height: 400 }, minimum)).toEqual(minimum)
  })
})
