import type { ReactNode } from 'react'

/** 16px line icon for the strip, drawn in the current text colour. */
export function Glyph({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </g>
    </svg>
  )
}
