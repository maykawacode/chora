import { useEffect, useRef, useState } from 'react'
import { useAppStore } from './store/appStore'
import { ScoreWindow } from './components/ScoreWindow/ScoreWindow'
import { ChooseDimensions, CreateSemanticMap } from './components/maps/ChooseDimensions'
import { AdvancedTransform } from './components/maps/AdvancedTransform'
import type { TransformMode } from './components/maps/AdvancedTransform'
import { StarterListPicker } from './components/ScoreWindow/StarterListPicker'
import { ImportPreview } from './components/ImportPreview'
import { serializeSession, deserializeSession } from './lib/parser'
import { parseSpreadsheet } from './lib/importer'
import type { ImportResult } from './lib/importer'
import { exportSpreadsheet } from './lib/exporter'
import type { CartesianMapConfig, SemanticMapConfig } from './lib/types'
import styles from './App.module.css'

export function App(): React.JSX.Element {
  const filePath      = useAppStore(s => s.filePath)
  const isDirty       = useAppStore(s => s.isDirty)
  const loadSession   = useAppStore(s => s.loadSession)
  const markClean     = useAppStore(s => s.markClean)
  const resetToEmpty  = useAppStore(s => s.resetToEmpty)

  const [showChooseDimensions, setShowChooseDimensions] = useState(false)
  const [showCreateSemantic,   setShowCreateSemantic]   = useState(false)
  const [showStarterPicker,    setShowStarterPicker]    = useState(false)
  const [activeTransform,      setActiveTransform]      = useState<TransformMode | null>(null)
  const [importPreview,        setImportPreview]        = useState<{ fileName: string; result: ImportResult } | null>(null)

  // Suppresses state:push broadcast while applying IPC-received score updates
  // to prevent a feedback loop (map drag → Score Window → broadcast back to map).
  const suppressBroadcast = useRef(false)

  // ── State broadcast to map windows ───────────────────────────────────────────

  useEffect(() => {
    return useAppStore.subscribe((state, prevState) => {
      // Open a new BrowserWindow for any map added to the session
      const prevIds = new Set(prevState.maps.map(m => m.id))
      for (const map of state.maps) {
        if (!prevIds.has(map.id)) {
          window.api.openMap(map.id, serializeSession(state))
        }
      }

      // Broadcast full state to all open map windows
      if (!suppressBroadcast.current) {
        window.api.broadcastState(serializeSession(state))
      }
    })
  }, [])

  // ── IPC listeners from map windows ───────────────────────────────────────────

  useEffect(() => {
    // Fine-grained score from a map window drag — apply silently (no re-broadcast)
    const removeScore = window.api.onScore((elementId, dimensionId, value) => {
      suppressBroadcast.current = true
      useAppStore.getState().setScore(elementId, dimensionId, value)
      suppressBroadcast.current = false
    })

    // Map config change from a map window — apply and let subscriber broadcast
    const removeConfig = window.api.onMapConfig((mapId, changes) => {
      useAppStore.getState().updateMapConfig(
        mapId,
        changes as Partial<CartesianMapConfig> | Partial<SemanticMapConfig>
      )
    })

    // Map window closed by user — remove from session
    const removeMapClosed = window.api.onMapClosed((mapId) => {
      suppressBroadcast.current = true
      useAppStore.getState().removeMap(mapId)
      suppressBroadcast.current = false
    })

    return () => { removeScore(); removeConfig(); removeMapClosed() }
  }, [])

  // ── Modal z-order: float Score Window above map windows while any modal is open

  const isModalOpen = showChooseDimensions || showCreateSemantic || showStarterPicker ||
                      activeTransform !== null || importPreview !== null

  useEffect(() => {
    window.api?.setModalOpen?.(isModalOpen)
  }, [isModalOpen])

  // ── Title bar ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    const name = filePath ? filePath.split('/').pop() ?? filePath : 'Untitled'
    document.title = isDirty ? `${name} •` : name
  }, [filePath, isDirty])

  // ── Menu actions ──────────────────────────────────────────────────────────────

  useEffect(() => {
    return window.api.onMenuAction(async (action) => {
      switch (action) {
        case 'new':                 await handleNew();            break
        case 'open':                await handleOpen();           break
        case 'save':                await handleSave(false);      break
        case 'save-as':             await handleSave(true);       break
        case 'import-spreadsheet':  await handleImport();         break
        case 'export-spreadsheet':  await handleExport();         break
        case 'create-cartesian': setShowChooseDimensions(true); break
        case 'create-semantic':  setShowCreateSemantic(true);   break
        case 'dim-to-weight':    setActiveTransform('dim-to-weight'); break
        case 'weight-to-dim':    setActiveTransform('weight-to-dim'); break
        case 'dim-to-gray':      setActiveTransform('dim-to-gray');        break
        case 'randomize-scores': setActiveTransform('randomize-scores');   break
        case 'toggle-labels':    handleToggleLabels(); break
        case 'update-maps':      /* maps redraw reactively */ break
      }
    })
  }, [filePath, isDirty])   // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers ──────────────────────────────────────────────────────────────────

  async function handleNew(): Promise<void> {
    if (isDirty && !await confirmDiscard()) return
    window.api.closeAllMaps()
    resetToEmpty()
  }

  async function handleOpen(): Promise<void> {
    if (isDirty && !await confirmDiscard()) return
    const path = await window.api.openFile()
    if (!path) return
    try {
      const json = await window.api.readFile(path)
      const state = deserializeSession(json)
      window.api.closeAllMaps()
      loadSession({ ...state, filePath: path })
      markClean(path)
      // The Zustand subscriber detects new maps and opens windows for each
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

  async function handleImport(): Promise<void> {
    const path = await window.api.openCsvFile()
    if (!path) return
    try {
      const text = await window.api.readFile(path)
      const result = parseSpreadsheet(text)
      const fileName = path.split('/').pop() ?? path
      setImportPreview({ fileName, result })
    } catch (e) {
      alert(`Could not parse file:\n${(e as Error).message}`)
    }
  }

  async function handleExport(): Promise<void> {
    const path = await window.api.showCsvSaveDialog()
    if (!path) return
    try {
      const tsv = exportSpreadsheet(useAppStore.getState())
      await window.api.writeFile(path, tsv)
    } catch (e) {
      alert(`Could not export file:\n${(e as Error).message}`)
    }
  }

  function handleToggleLabels(): void {
    const { maps, updateMapConfig } = useAppStore.getState()
    for (const m of maps) updateMapConfig(m.id, { showLabels: !m.showLabels })
  }

  async function confirmDiscard(): Promise<boolean> {
    return window.confirm('You have unsaved changes. Discard them?')
  }

  return (
    <div className={styles.root}>
      <ScoreWindow onOpenStarterPicker={() => setShowStarterPicker(true)} />

      {importPreview && (
        <ImportPreview
          fileName={importPreview.fileName}
          result={importPreview.result}
          onCancel={() => setImportPreview(null)}
          onConfirm={() => {
            const { elements, dimensions, scores } = importPreview.result
            loadSession({ filePath: null, isDirty: true, elements, dimensions, scores, maps: [],
                          selectedElementId: elements[0]?.id ?? null,
                          selectedDimensionId: dimensions[0]?.id ?? null, activeTab: 'elements' })
            setImportPreview(null)
          }}
        />
      )}
      {showStarterPicker && (
        <StarterListPicker onClose={() => setShowStarterPicker(false)} />
      )}
      {showChooseDimensions && (
        <ChooseDimensions onClose={() => setShowChooseDimensions(false)} />
      )}
      {showCreateSemantic && (
        <CreateSemanticMap onClose={() => setShowCreateSemantic(false)} />
      )}
      {activeTransform && (
        <AdvancedTransform mode={activeTransform} onClose={() => setActiveTransform(null)} />
      )}
    </div>
  )
}
