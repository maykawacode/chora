type TokenGroup = Readonly<Record<string, string>>

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
  // The mosaic palette (Output/2026-10-22_palette-mosaic_v1.html): pale tan
  // oklch(0.956 0.012 74) behind, chocolate oklch(0.31 0.045 42) for text, and
  // a cool sea-glass tint (hue 189) as the soft highlight for hover. The frame,
  // forward actions and focus are a greyed dark cyan in the same hue; yellow
  // means chosen and red means delete. Tokens merge only when they do the same
  // job, so a few still share a value.
  color: {
    surfaceCanvas: '#ffffff',
    surfaceBase: '#f5efe8',
    surfaceChrome: '#e8e0d7',
    surfaceChromeStrong: '#dbd1c7',
    surfaceDisabled: '#dbd1c7',
    surfaceHover: '#e1eae9',
    surfaceTextField: '#fdfaf6',
    // Chora's signature colour: the persistent frame around the views (the
    // browser's title banner and icon strip). A greyed dark cyan, oklch(0.36
    // 0.035 195°), with text and icons reversed out in white (10.7:1). Hover
    // lightens, selected darkens.
    surfaceSignature: '#264343',
    surfaceSignatureHover: '#466464',
    surfaceSignatureSelected: '#173030',
    borderSignature: '#173030',
    textOnSignatureSecondary: 'rgba(255, 255, 255, 0.8)',
    dividerOnSignature: 'rgba(255, 255, 255, 0.24)',
    textPrimary: '#39261e',
    textSecondary: '#66544a',
    textDisabled: '#90867e',
    textInverse: '#ffffff',
    borderSubtle: '#cbc1b7',
    borderControl: '#90867e',
    // Chosen items keep their yellow on hover.
    selectionStrong: '#f2c230',
    selectionSoft: '#f5e7b5',
    focus: '#466464',
    focusRing: 'rgba(70, 100, 100, 0.3)',
    // Forward and confirm actions share the frame's dark cyan.
    confirmation: '#264343',
    confirmationHover: '#466464',
    // Red hover darkens: the same colour, 0.06 darker in OKLCH.
    destructive: '#9c443b',
    destructiveHover: '#88322b',
    warningText: '#785224',
    unsaved: '#9c443b',
    backdrop: 'rgba(47, 24, 16, 0.46)',
    whiteWash: 'rgba(255, 255, 255, 0.42)',
    confirmationInset: 'rgba(255, 255, 255, 0.28)'
  },
  map: {
    background: '#ffffff',
    axis: '#66544a',
    grid: '#cbc1b7',
    label: '#39261e',
    labelMuted: '#66544a',
    outline: '#ffffff',
    selection: '#f2c230',
    partial: '#9c443b',
    drag: '#66544a',
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
    listRow: '26px',
    /** Every circular dialog (Welcome, About, confirmation discs) shares this diameter. */
    disc: '300px'
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
