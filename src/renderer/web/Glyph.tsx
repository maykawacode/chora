import type { ReactNode } from 'react'

/**
 * Line icon for the strip, drawn in the current text colour: 16-unit artwork
 * shown 10% larger (17.6px), with lines 10% heavier again so they hold up in
 * white on the signature colour.
 */
const GLYPH_SIZE = 17.6

export function Glyph({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <svg width={GLYPH_SIZE} height={GLYPH_SIZE} viewBox="0 0 16 16" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="1.43" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </g>
    </svg>
  )
}
