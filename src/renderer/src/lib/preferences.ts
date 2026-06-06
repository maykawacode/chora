export interface Preferences {
  rememberWindowPositions: boolean
  defaultShowDots: boolean
  defaultShowLabels: boolean
  defaultElementColor: string
  reopenLastFile: boolean
  confirmDeleteElement: boolean
  lastFilePath: string | null
}

export const DEFAULT_PREFERENCES: Preferences = {
  rememberWindowPositions: true,
  defaultShowDots: true,
  defaultShowLabels: true,
  defaultElementColor: '#808000',
  reopenLastFile: false,
  confirmDeleteElement: false,
  lastFilePath: null
}
