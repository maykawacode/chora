// Browser features jsdom lacks, for tests that render components. Layout is
// absent, so observers never fire and sizes are zero; canvases have no context.
export function installDomStubs(): void {
  globalThis.ResizeObserver = class { observe(): void {} unobserve(): void {} disconnect(): void {} }
  window.matchMedia = (query: string) => ({
    matches: false, media: query, onchange: null,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false
  })
  HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext
  // The Notes editor (Trix) reports its value to forms through element internals,
  // which jsdom only partly implements.
  const internals = globalThis.ElementInternals?.prototype as unknown as Record<string, unknown> | undefined
  if (internals) for (const name of ['setValidity', 'setFormValue']) internals[name] ??= () => {}
}
