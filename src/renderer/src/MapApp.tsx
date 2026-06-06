import { useEffect, useState } from 'react'
import { useAppStore } from './store/appStore'
import { deserializeSession } from './lib/parser'
import { MapPanel } from './components/maps/MapPanel'
import type { CartesianMapConfig, SemanticMapConfig } from './lib/types'

export function MapApp(): React.JSX.Element {
  const [mapId, setMapId]   = useState<string | null>(null)
  const loadSession         = useAppStore(s => s.loadSession)
  const setScore            = useAppStore(s => s.setScore)
  const updateMapConfig     = useAppStore(s => s.updateMapConfig)

  useEffect(() => {
    const removeInit = window.api.onMapInit((id, stateJson) => {
      setMapId(id)
      try { loadSession(deserializeSession(stateJson)) }
      catch (e) { console.error('map:init failed', e) }
    })

    const removeState = window.api.onState((stateJson) => {
      try { loadSession(deserializeSession(stateJson)) }
      catch (e) { console.error('state:push failed', e) }
    })

    // Fine-grained score sync from Score Window or another map window
    const removeScore = window.api.onScore((elementId, dimensionId, value) => {
      setScore(elementId, dimensionId, value)
    })

    // Config change applied by Score Window (e.g. toggle-labels from menu)
    const removeConfig = window.api.onMapConfig((mId, changes) => {
      updateMapConfig(mId, changes as Partial<CartesianMapConfig> | Partial<SemanticMapConfig>)
    })

    // All listeners registered — tell main process it's safe to send map:init
    window.api.signalReady()

    return () => { removeInit(); removeState(); removeScore(); removeConfig() }
  }, [loadSession, setScore, updateMapConfig])

  if (!mapId) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
                    height: '100vh', color: '#888', fontFamily: 'system-ui', fontSize: 13 }}>
        Loading…
      </div>
    )
  }

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <MapPanel mapId={mapId} onClose={() => window.close()} />
    </div>
  )
}
