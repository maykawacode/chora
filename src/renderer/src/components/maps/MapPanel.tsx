import { useRef, useEffect, useCallback } from 'react'
import { useAppStore } from '../../store/appStore'
import type { MapConfig, CartesianMapConfig } from '../../lib/types'
import { drawCartesian } from './cartesian/drawCartesian'
import styles from './MapPanel.module.css'

interface Props {
  mapId: string
  onClose: () => void
}

export function MapPanel({ mapId, onClose }: Props): React.JSX.Element | null {
  const config     = useAppStore(s => s.maps.find(m => m.id === mapId))
  const elements   = useAppStore(s => s.elements)
  const dimensions = useAppStore(s => s.dimensions)
  const scores     = useAppStore(s => s.scores)
  const updateMapConfig = useAppStore(s => s.updateMapConfig)

  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  const redraw = useCallback(() => {
    const canvas  = canvasRef.current
    const wrapper = wrapperRef.current
    const ctx     = canvas?.getContext('2d')
    if (!canvas || !wrapper || !ctx || !config) return

    const rect = wrapper.getBoundingClientRect()
    const cssW = rect.width
    const cssH = rect.height
    canvas.width  = cssW * window.devicePixelRatio
    canvas.height = cssH * window.devicePixelRatio
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio)

    if (config.type === 'cartesian') {
      drawCartesian(ctx, cssW, cssH, config as CartesianMapConfig, elements, dimensions, scores)
    }
    // Phase 3: if (config.type === 'semantic') drawSemantic(...)
  }, [config, elements, dimensions, scores])

  useEffect(() => { redraw() }, [redraw])

  // Observe the wrapper (not the canvas) so setting canvas.width doesn't retrigger
  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return
    const observer = new ResizeObserver(() => redraw())
    observer.observe(wrapper)
    return () => observer.disconnect()
  }, [redraw])

  if (!config) return null

  return (
    <div className={styles.panel}>
      <div className={styles.titleBar}>
        <span className={styles.title}>{config.title}</span>
        <div className={styles.titleBarActions}>
          <button
            className={styles.labelToggle}
            onClick={() => updateMapConfig(mapId, { showLabels: !config.showLabels })}
            title="Show/Hide Labels"
          >
            {config.showLabels ? 'Labels ✓' : 'Labels'}
          </button>
          <button className={styles.closeBtn} onClick={onClose} title="Close map">✕</button>
        </div>
      </div>
      <div ref={wrapperRef} className={styles.canvasWrapper}>
        <canvas ref={canvasRef} className={styles.canvas} />
      </div>
    </div>
  )
}

// Thin wrapper used by App.tsx to render all open maps
export function MapPanelList(): React.JSX.Element {
  const maps    = useAppStore(s => s.maps)
  const removeMap = useAppStore(s => s.removeMap)

  if (maps.length === 0) return <></>

  return (
    <div className={styles.panelList}>
      {maps.map(m => (
        <MapPanel key={m.id} mapId={m.id} onClose={() => removeMap(m.id)} />
      ))}
    </div>
  )
}
