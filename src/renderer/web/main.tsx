import { browserApi } from './browserApi'
import { startApp } from '@renderer/bootstrap'
import { BrowserWorkspace } from './BrowserWorkspace'
import { ScoreDock } from './ScoreDock'
import { useScoreLayout } from './scoreLayout'
import { MenuBar } from './MenuBar'
import { DeviceNotice } from './DeviceNotice'
import './browser.css'
import { installShortcuts } from './shortcuts'
import { setScoreSurfaceProbe } from '@renderer/lib/overlayStack'
import { activeSurface } from './interaction'
import { setHostCapabilities } from '@renderer/lib/host'
import { clearRecovery, installLeaveWarning } from './recovery'
import { inPlaceSaving } from './fileAccess'

// Browser entry: install the browser host before the shared startup reads it.
window.api = browserApi
setHostCapabilities({ kind: 'browser', documentSave: inPlaceSaving ? 'file' : 'download' })
installShortcuts()
// A collapsed Score keeps its tabs mounted; their keyboard handlers stand down.
setScoreSurfaceProbe(() => activeSurface() === 'score' && !useScoreLayout.getState().collapsed)
void startApp({
  header: <><MenuBar /><DeviceNotice /></>,
  workspace: <BrowserWorkspace />,
  scoreFrame: score => <ScoreDock>{score}</ScoreDock>,
  // Restore-on-reload is parked (see recovery.ts); only the leave warning runs.
  beforeMount: () => {
    clearRecovery()
    installLeaveWarning()
  }
})
