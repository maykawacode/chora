// Hands text to the browser as a file download. The object URL is revoked
// after a delay rather than immediately: some browsers start reading it only
// after click() returns, and an early revoke cancels the download.

const REVOKE_DELAY_MS = 30_000

export function downloadText(fileName: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.rel = 'noopener'
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS)
}
