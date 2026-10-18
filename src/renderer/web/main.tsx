import { browserApi } from './browserApi'
import { startApp } from '@renderer/bootstrap'
import { BrowserWorkspace } from './BrowserWorkspace'
import { ScoreDock } from './ScoreDock'
import { ScorePanes } from './ScorePanes'
import { useScoreLayout } from './scoreLayout'
import { TitleBanner } from './TitleBanner'
import './browser.css'
import { installShortcuts } from './shortcuts'
import { setScoreSurfaceProbe } from '@renderer/lib/overlayStack'
import { activeSurface } from './interaction'
import { setHostCapabilities } from '@renderer/lib/host'
import { clearRecovery, installLeaveWarning } from './recovery'
import { inPlaceSaving } from './fileAccess'
import { nameUntitledDocument } from './documentName'

// Browser entry: install the browser host before the shared startup reads it.
window.api = browserApi
setHostCapabilities({
  kind: 'browser',
  documentSave: inPlaceSaving ? 'file' : 'download',
  nameUntitledDocument
})
installShortcuts()
// A collapsed Score, or one under Settings, keeps its tabs mounted; their
// keyboard handlers stand down.
setScoreSurfaceProbe(() => {
  const { collapsed, view } = useScoreLayout.getState()
  return activeSurface() === 'score' && !collapsed && view === 'score'
})
void startApp({
  header: <TitleBanner />,
  workspace: <BrowserWorkspace />,
  scoreFrame: score => <ScoreDock>{score}</ScoreDock>,
  scorePanes: ScorePanes,
  // Restore-on-reload is parked (see recovery.ts); only the leave warning runs.
  beforeMount: () => {
    clearRecovery()
    installLeaveWarning()
  }
})
