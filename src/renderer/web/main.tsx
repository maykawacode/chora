import { browserApi } from './browserApi'
import { startApp } from '@renderer/bootstrap'
import { BrowserWorkspace } from './BrowserWorkspace'
import { installShortcuts } from './shortcuts'
import { setScoreSurfaceProbe } from '@renderer/lib/overlayStack'
import { activeSurface } from './interaction'

// Browser entry: install the browser host before the shared startup reads it.
window.api = browserApi
installShortcuts()
setScoreSurfaceProbe(() => activeSurface() === 'score')
void startApp({ workspace: <BrowserWorkspace /> })
