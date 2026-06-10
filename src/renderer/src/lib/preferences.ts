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

export interface Preferences {
  rememberWindowPositions: boolean  // restore each map window's position on open
  defaultShowDots: boolean          // new maps start with dots visible
  defaultShowLabels: boolean        // new maps start with labels visible
  defaultElementColor: string       // hex color for newly created elements
  reopenLastFile: boolean           // automatically reopen the last saved file on startup
  confirmDeleteElement: boolean     // show a confirmation dialog before deleting an element
  lastFilePath: string | null       // path of the most recently saved file (auto-updated)
  elementLabelSize: number          // font size (px) for element name labels on maps
  dimensionLabelSize: number        // font size (px) for dimension pole labels on maps
  dimColorLow: string               // hex color mapped to score 0 by the Dimension → Color transform
  dimColorHigh: string              // hex color mapped to score 1 by the Dimension → Color transform
}

export const DEFAULT_PREFERENCES: Preferences = {
  rememberWindowPositions: true,
  defaultShowDots: true,
  defaultShowLabels: true,
  defaultElementColor: '#9d9d53',
  reopenLastFile: false,
  confirmDeleteElement: true,
  lastFilePath: null,
  elementLabelSize: 11,
  dimensionLabelSize: 11,
  dimColorLow: '#b04040',   // muted red — low end of the color ramp
  dimColorHigh: '#508050'   // muted green — high end of the color ramp
}
