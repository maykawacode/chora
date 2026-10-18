import { browserApi } from './browserApi'
import { startApp } from '@renderer/bootstrap'
import { BrowserWorkspace } from './BrowserWorkspace'
import { ScoreDock } from './ScoreDock'
import { ScorePanes } from './ScorePanes'
import { useScoreLayout } from './scoreLayout'
import { TitleBanner } from './TitleBanner'
import { BrowserWelcome } from './BrowserWelcome'
import './browser.css'
import { installShortcuts } from './shortcuts'
import { setScoreSurfaceProbe } from '@renderer/lib/overlayStack'
import { activeSurface } from './interaction'
import { setHostCapabilities } from '@renderer/lib/host'
import { installLeaveWarning } from './leaveWarning'
import { inPlaceSaving } from './fileAccess'
import { nameUntitledDocument } from './documentName'

// Browser entry: install the browser host before the shared startup reads it.
window.api = browserApi
setHostCapabilities({
  kind: 'browser',
  scoreChrome: false,
  stackedDataViews: true,
  startupSettings: false,
  exportByDownload: true,
  documentSave: inPlaceSaving ? 'file' : 'download',
  nameUntitledDocument
})
installShortcuts()
installLeaveWarning()
// A collapsed Score keeps its tabs mounted; their keyboard handlers stand down.
setScoreSurfaceProbe(() => activeSurface() === 'score' && !useScoreLayout.getState().collapsed)
void startApp({
  header: <TitleBanner />,
  workspace: <BrowserWorkspace />,
  scoreFrame: score => <ScoreDock>{score}</ScoreDock>,
  scorePanes: ScorePanes,
  welcome: props => <BrowserWelcome {...props} />
})
