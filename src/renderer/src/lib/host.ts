// What the hosting shell can do, for the few shared commands that differ.
// The desktop defaults apply unless a host (the browser build) overrides them
// before startup.

export interface HostCapabilities {
  /**
   * 'browser' hides desktop-only settings (reopen last file, window positions,
   * update checks) and labels the version as the web version.
   */
  kind: 'desktop' | 'browser'
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

let capabilities: HostCapabilities = { kind: 'desktop', documentSave: 'file' }

export function hostCapabilities(): HostCapabilities {
  return capabilities
}

export function setHostCapabilities(next: Partial<HostCapabilities>): void {
  capabilities = { ...capabilities, ...next }
}
