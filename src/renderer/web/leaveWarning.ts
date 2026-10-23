import { useAppStore } from '../src/store/appStore'

// Warns before leaving the page with unsaved changes. Best effort: browsers
// show their own wording, and may skip it. Restore-on-reload was built and
// then removed (owner decisions 2026-10-15 and 2026-10-17, Discussion #8);
// any snapshot an earlier build left in this tab is cleared here.

const OLD_RECOVERY_KEY = 'chora:recovery'

export function installLeaveWarning(): void {
  try { sessionStorage.removeItem(OLD_RECOVERY_KEY) } catch { /* storage blocked: nothing to remove */ }
  window.addEventListener('beforeunload', (e) => {
    if (useAppStore.getState().isDirty) e.preventDefault()
  })
}
