import { browserApi } from './browserApi'
import { startApp } from '@renderer/bootstrap'
import { BrowserWorkspace } from './BrowserWorkspace'
import { installShortcuts } from './shortcuts'

// Browser entry: install the browser host before the shared startup reads it.
window.api = browserApi
installShortcuts()
void startApp({ workspace: <BrowserWorkspace /> })
