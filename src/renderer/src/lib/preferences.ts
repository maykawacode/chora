// ── User preferences (renderer-side types) ────────────────────────────────────
//
// This file defines the Preferences interface and defaults used throughout
// the renderer. The main process (src/main/prefs.ts) maintains its own copy
// of this interface because Electron's build system compiles main and renderer
// into separate bundles — they cannot share source files directly.
//
// IMPORTANT: If you add a field here, also add it in src/main/prefs.ts and
// update DEFAULT_PREFERENCES below. New fields are merged with existing
// saved data on load, so old preference files will pick up new defaults
// automatically.

import type { MarkMode } from './types'

export interface Preferences {
  rememberWindowPositions: boolean  // restore each map window's position on open
  defaultMarks: MarkMode            // mark mode new maps start in
  defaultShowLabels: boolean        // new maps start with labels visible
  defaultElementColor: string       // hex color for newly created elements
  reopenLastFile: boolean           // automatically reopen the last saved file on startup
  confirmDeleteElement: boolean     // show a confirmation dialog before deleting an element
  lastFilePath: string | null       // path of the most recently saved file (auto-updated)
  elementLabelSize: number          // font size (px) for element name labels on maps
  dimensionLabelSize: number        // font size (px) for dimension pole labels on maps
  dotDefaultSize: number            // radius (px) of element dots when a map is NOT sizing by weight
  dimColorLow: string               // hex color mapped to score 0 by the Dimension → Color transform
  dimColorHigh: string              // hex color mapped to score 1 by the Dimension → Color transform
  mainWindowX: number | null        // last known main window position (null = use OS default)
  mainWindowY: number | null
  mainWindowWidth: number           // last known main window size
  mainWindowHeight: number
}

export const DEFAULT_PREFERENCES: Preferences = {
  rememberWindowPositions: true,
  // Circles rather than 'element': a new map should present every element
  // alike, leaving shape free to be switched on later as a deliberate encoding.
  defaultMarks: 'circle',
  defaultShowLabels: true,
  defaultElementColor: '#9d9d53',
  reopenLastFile: false,
  confirmDeleteElement: true,
  lastFilePath: null,
  elementLabelSize: 11,
  dimensionLabelSize: 11,
  dotDefaultSize: 6,        // matches the historic hardcoded radius
  dimColorLow: '#b04040',   // muted red — low end of the color ramp
  dimColorHigh: '#508050',  // muted green — high end of the color ramp
  mainWindowX: null,
  mainWindowY: null,
  mainWindowWidth: 530,
  mainWindowHeight: 800
}
