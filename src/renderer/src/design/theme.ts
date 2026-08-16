export type TokenGroup = Readonly<Record<string, string>>

export interface UiTheme {
  color: TokenGroup
  map: TokenGroup
  fontFamily: TokenGroup
  fontSize: TokenGroup
  fontWeight: TokenGroup
  lineHeight: TokenGroup
  space: TokenGroup
  radius: TokenGroup
  size: TokenGroup
  shadow: TokenGroup
  motion: TokenGroup
}

/**
 * Chora's one active interface theme.
 *
 * These are semantic UI values, not data colors. Element colors, Collection
 * colors, dimension ramps, and imported values remain in their domain modules
 * because they encode user data rather than application chrome.
 */
export const uiTheme = {
  color: {
    surfaceCanvas: '#ffffff',
    surfaceApp: '#f4f0e8',
    surfaceRaised: '#faf8f4',
    surfaceChrome: '#e8e2d8',
    surfaceChromeStrong: '#ded7cc',
    surfaceField: '#fffefc',
    surfaceHover: '#eee9e1',
    surfaceDisabled: '#e5dfd6',
    textPrimary: '#292725',
    textSecondary: '#5e5953',
    textMuted: '#706a62',
    textDisabled: '#a39c93',
    textInverse: '#ffffff',
    borderSubtle: '#d6cfc5',
    borderControl: '#b8afa4',
    borderStrong: '#898177',
    selectionStrong: '#f2c230',
    selectionHover: '#dda90f',
    selectionSoft: '#f5e7b5',
    selectionSoftHover: '#edda97',
    selectionText: '#292725',
    actionStrong: '#4e4a45',
    actionHover: '#3f3c38',
    focus: '#4e4a45',
    focusRing: 'rgba(78, 74, 69, 0.34)',
    confirmation: '#367a4a',
    confirmationHover: '#2d683f',
    destructive: '#a33f38',
    destructiveHover: '#842f2a',
    warningText: '#7b5525',
    warningSurface: '#faf1df',
    warningBorder: '#d9b878',
    unsaved: '#b8433d',
    windowControl: '#a39c93',
    windowControlBorder: 'rgba(41, 39, 37, 0.14)',
    windowControlGlyph: 'rgba(41, 39, 37, 0.58)',
    backdrop: 'rgba(31, 29, 26, 0.38)',
    backdropStrong: 'rgba(31, 29, 26, 0.48)',
    backdropConfirmation: 'rgba(31, 29, 26, 0.46)',
    whiteWash: 'rgba(255, 255, 255, 0.42)',
    confirmationInset: 'rgba(255, 255, 255, 0.28)',
    disabledWash: 'rgba(41, 39, 37, 0.08)'
  },
  map: {
    background: '#ffffff',
    axis: '#5e5953',
    grid: '#d6cfc5',
    label: '#292725',
    labelMuted: '#706a62',
    outline: '#ffffff',
    selection: '#f2c230',
    partial: '#a33f38',
    drag: '#66615b',
    neutral: '#9a9a9a'
  },
  fontFamily: {
    ui: '"IBM Plex Sans", -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif',
    mono: '"SFMono-Regular", Consolas, "Liberation Mono", monospace'
  },
  fontSize: {
    meta: '10px',
    label: '11px',
    control: '12px',
    body: '13px',
    title: '15px',
    display: '20px'
  },
  fontWeight: {
    regular: '400',
    medium: '500',
    semibold: '600'
  },
  lineHeight: {
    compact: '1.25',
    interface: '1.4',
    reading: '1.55'
  },
  space: {
    one: '4px',
    two: '8px',
    three: '12px',
    four: '16px',
    five: '24px',
    six: '32px'
  },
  radius: {
    sharp: '0',
    subtle: '2px',
    small: '3px',
    control: '4px',
    dialog: '8px',
    welcome: '10px',
    round: '999px'
  },
  size: {
    titleBar: '28px',
    statusBar: '74px',
    control: '28px',
    listRow: '26px'
  },
  shadow: {
    dialog: '0 10px 30px rgba(41, 39, 37, 0.18)',
    dialogStrong: '0 12px 34px rgba(41, 39, 37, 0.23)',
    confirmation: '0 14px 38px rgba(41, 39, 37, 0.24)'
  },
  motion: {
    durationEnter: '180ms',
    easeStandard: 'cubic-bezier(0.2, 0.8, 0.2, 1)'
  }
} as const satisfies UiTheme

function kebabCase(value: string): string {
  return value.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)
}

/** Flattens the typed theme into the stable CSS custom-property contract. */
export function themeVariables(theme: UiTheme = uiTheme): Record<string, string> {
  const variables: Record<string, string> = {}
  for (const [groupName, group] of Object.entries(theme)) {
    for (const [tokenName, value] of Object.entries(group) as Array<[string, string]>) {
      variables[`--${kebabCase(groupName)}-${kebabCase(tokenName)}`] = value
    }
  }
  return variables
}

/** Installs the active theme synchronously before either renderer mounts. */
export function applyUiTheme(
  theme: UiTheme = uiTheme,
  root: HTMLElement = document.documentElement
): void {
  for (const [name, value] of Object.entries(themeVariables(theme))) {
    root.style.setProperty(name, value)
  }
}
