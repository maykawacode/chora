// ── Window geometry against the live display layout ───────────────────────────
//
// Saved window coordinates outlive the display arrangement that produced them.
// A position recorded on a second monitor is meaningless once that monitor is
// gone, and the platform will not rescue us. macOS constrains *titled* windows
// back onto a visible screen — which is why map windows, created with
// titleBarStyle 'hidden', always land somewhere reachable — but the Score
// Window is frameless (frame: false) and is placed exactly where it is told,
// on-screen or not.
//
// These functions are pure and take work areas as plain rectangles so they can
// be tested without Electron. Callers supply them from the screen module, e.g.
// screen.getAllDisplays().map(d => d.workArea).

export interface Rect { x: number; y: number; width: number; height: number }
export interface Size { width: number; height: number }

// A saved position is honored only when enough of the window's drag strip lands
// on a single display for the user to grab and move it. The Score Window's drag
// region is the title bar spanning its top edge, so the strip is measured from
// the top: a window whose only visible part is its bottom corner cannot be
// moved, and is no more usable than one that is fully off-screen.
const DRAG_STRIP_HEIGHT = 40
const MIN_GRABBABLE_WIDTH = 120
const MIN_GRABBABLE_HEIGHT = 20

/** Length of the overlap between two 1-D spans; 0 when they do not meet. */
function overlap(aStart: number, aLength: number, bStart: number, bLength: number): number {
  return Math.max(0, Math.min(aStart + aLength, bStart + bLength) - Math.max(aStart, bStart))
}

/**
 * True when the window's drag strip has a grabbable patch on some one display.
 *
 * The test is deliberately per-display rather than a sum across displays: a
 * window straddling a seam still clears the width threshold on one side of it,
 * and treating separated slivers on two monitors as if they added up to a
 * usable target would defeat the point.
 *
 * A window smaller than a threshold is measured against its own size, so a
 * narrow window is not rejected for being unable to show 120px it never had.
 */
export function isRestorable(rect: Rect, workAreas: Rect[]): boolean {
  const stripHeight = Math.min(DRAG_STRIP_HEIGHT, rect.height)
  const needWidth  = Math.min(MIN_GRABBABLE_WIDTH,  rect.width)
  const needHeight = Math.min(MIN_GRABBABLE_HEIGHT, stripHeight)

  return workAreas.some(area =>
    overlap(rect.x, rect.width,  area.x, area.width)  >= needWidth &&
    overlap(rect.y, stripHeight, area.y, area.height) >= needHeight
  )
}

/**
 * Shrinks a remembered size to fit the display it is about to be shown on.
 *
 * A size saved on a large monitor can exceed every screen now attached, which
 * would push the window's own controls out of reach. The minimum wins over the
 * work area when a display is smaller still — BrowserWindow's minWidth and
 * minHeight would enforce that floor regardless, so honoring it here keeps the
 * returned size equal to the size actually used.
 */
export function fitSize(size: Size, workArea: Size, minimum: Size): Size {
  return {
    width:  Math.max(minimum.width,  Math.min(size.width,  workArea.width)),
    height: Math.max(minimum.height, Math.min(size.height, workArea.height))
  }
}
