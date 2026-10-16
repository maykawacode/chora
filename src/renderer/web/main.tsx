import { browserApi } from './browserApi'
import { startApp } from '@renderer/bootstrap'
import { BrowserWorkspace } from './BrowserWorkspace'
import { MenuBar } from './MenuBar'
import { DeviceNotice } from './DeviceNotice'
import './browser.css'
import { installShortcuts } from './shortcuts'
import { setScoreSurfaceProbe } from '@renderer/lib/overlayStack'
import { activeSurface } from './interaction'
import { setHostCapabilities } from '@renderer/lib/host'
import { clearRecovery, installLeaveWarning } from './recovery'

// Browser entry: install the browser host before the shared startup reads it.
window.api = browserApi
setHostCapabilities({ kind: 'browser', documentSave: 'download' })
installShortcuts()
setScoreSurfaceProbe(() => activeSurface() === 'score')
void startApp({
  header: <><MenuBar /><DeviceNotice /></>,
  workspace: <BrowserWorkspace />,
  // Restore-on-reload is parked (see recovery.ts); only the leave warning runs.
  beforeMount: () => {
    clearRecovery()
    installLeaveWarning()
  }
})
