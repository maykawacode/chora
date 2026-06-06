import { useEffect, useState } from 'react'
import { useAppStore } from './store/appStore'
import { ScoreWindow } from './components/ScoreWindow/ScoreWindow'
import { MapPanelList } from './components/maps/MapPanel'
import { ChooseDimensions } from './components/maps/ChooseDimensions'
import { serializeSession, deserializeSession } from './lib/parser'
import styles from './App.module.css'

export function App(): React.JSX.Element {
  const filePath   = useAppStore(s => s.filePath)
  const isDirty    = useAppStore(s => s.isDirty)
  const loadSession = useAppStore(s => s.loadSession)
  const markClean  = useAppStore(s => s.markClean)
  const resetToEmpty = useAppStore(s => s.resetToEmpty)

  const [showChooseDimensions, setShowChooseDimensions] = useState(false)

  // Title bar reflects file state
  useEffect(() => {
    const name = filePath ? filePath.split('/').pop() ?? filePath : 'Untitled'
    document.title = isDirty ? `${name} •` : name
  }, [filePath, isDirty])

  // Native menu actions arrive via IPC
  useEffect(() => {
    return window.api.onMenuAction(async (action) => {
      switch (action) {
        case 'new':      await handleNew();            break
        case 'open':     await handleOpen();           break
        case 'save':     await handleSave(false);      break
        case 'save-as':  await handleSave(true);       break
        case 'create-cartesian': setShowChooseDimensions(true); break
        case 'toggle-labels':    handleToggleLabels(); break
        case 'update-maps':      /* maps redraw reactively — no-op */ break
      }
    })
  }, [filePath, isDirty])   // eslint-disable-line react-hooks/exhaustive-deps

  async function handleNew(): Promise<void> {
    if (isDirty && !await confirmDiscard()) return
    resetToEmpty()
  }

  async function handleOpen(): Promise<void> {
    if (isDirty && !await confirmDiscard()) return
    const path = await window.api.openFile()
    if (!path) return
    try {
      const json = await window.api.readFile(path)
      const state = deserializeSession(json)
      loadSession({ ...state, filePath: path })
      markClean(path)
    } catch (e) {
      alert(`Could not open file:\n${(e as Error).message}`)
    }
  }

  async function handleSave(forceDialog: boolean): Promise<void> {
    const state = useAppStore.getState()
    let path = state.filePath
    if (!path || forceDialog) {
      path = await window.api.showSaveDialog()
      if (!path) return
    }
    const json = serializeSession(state)
    await window.api.writeFile(path, json)
    markClean(path)
  }

  function handleToggleLabels(): void {
    const { maps, updateMapConfig } = useAppStore.getState()
    // Toggle all visible maps
    for (const m of maps) updateMapConfig(m.id, { showLabels: !m.showLabels })
  }

  async function confirmDiscard(): Promise<boolean> {
    return window.confirm('You have unsaved changes. Discard them?')
  }

  return (
    <div className={styles.root}>
      <div className={styles.scorePane}>
        <ScoreWindow />
      </div>
      <div className={styles.mapPane}>
        <MapPanelList />
        {useAppStore.getState().maps.length === 0 && (
          <div className={styles.mapEmpty}>
            <p>No maps open.</p>
            <button
              className={styles.createMapBtn}
              onClick={() => setShowChooseDimensions(true)}
            >
              Create Cartesian Map…
            </button>
          </div>
        )}
      </div>

      {showChooseDimensions && (
        <ChooseDimensions onClose={() => setShowChooseDimensions(false)} />
      )}
    </div>
  )
}
