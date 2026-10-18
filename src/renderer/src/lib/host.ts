// What the hosting shell can do, for the few shared commands that differ.
// The desktop defaults apply unless a host (the browser build) overrides them
// before startup.

export interface HostCapabilities {
  /**
   * Which edition this is: 'browser' labels the version as the web version,
   * offers the Mac app in About, and titles the tab without the file extension.
   * Behaviour that differs by host has a named capability below instead.
   */
  kind: 'desktop' | 'browser'
  /**
   * Score draws its own title bar, tab bar and list headers. The browser shows
   * them in its page banner, strip and pane titles instead.
   */
  scoreChrome: boolean
  /**
   * Elements, Dimensions and Collections keep their detail below the list at
   * every width, and list names on one line ending in "…". The browser's narrow side-by-side views do; the
   * desktop keeps list and detail side by side.
   */
  stackedDataViews: boolean
  /** Settings offers startup and window choices: reopen last file, window positions, update checks. */
  startupSettings: boolean
  /** Export always hands over a download, even where Save writes in place. */
  exportByDownload: boolean
  /**
   * 'file' writes to a chosen path. 'download' hands the browser a copy. Both
   * mark the document saved; a download's write is not confirmed.
   */
  documentSave: 'file' | 'download'
  /**
   * Download saving only: names an untitled document before its first
   * download. Resolves false when the user cancels, and nothing downloads.
   */
  nameUntitledDocument?: () => Promise<boolean>
}

let capabilities: HostCapabilities = {
  kind: 'desktop',
  scoreChrome: true,
  stackedDataViews: false,
  startupSettings: true,
  exportByDownload: false,
  documentSave: 'file'
}

export function hostCapabilities(): HostCapabilities {
  return capabilities
}

export function setHostCapabilities(next: Partial<HostCapabilities>): void {
  capabilities = { ...capabilities, ...next }
}
