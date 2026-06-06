import { useRef, useEffect, useCallback, useState } from 'react'
import { useAppStore } from '../../store/appStore'
import type { CartesianMapConfig, SemanticMapConfig, Dimension } from '../../lib/types'
import { drawCartesian, MARGIN } from './cartesian/drawCartesian'
import { drawSemantic } from './semantic/drawSemantic'
import styles from './MapPanel.module.css'

type Edge = 'left' | 'right' | 'top' | 'bottom'

interface AxisPickerState {
  edge: Edge
  clickX: number
  clickY: number
}

// ── MapPanel ──────────────────────────────────────────────────────────────────

interface Props {
  mapId: string
  onClose: () => void
}

export function MapPanel({ mapId, onClose }: Props): React.JSX.Element | null {
  const config          = useAppStore(s => s.maps.find(m => m.id === mapId))
  const elements        = useAppStore(s => s.elements)
  const dimensions      = useAppStore(s => s.dimensions)
  const scores          = useAppStore(s => s.scores)
  const updateMapConfig = useAppStore(s => s.updateMapConfig)

  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  const [axisPicker, setAxisPicker] = useState<AxisPickerState | null>(null)
  const [cursor, setCursor]         = useState('default')

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
    } else if (config.type === 'semantic') {
      drawSemantic(ctx, cssW, cssH, config as SemanticMapConfig, elements, dimensions, scores)
    }
  }, [config, elements, dimensions, scores])

  useEffect(() => { redraw() }, [redraw])

  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return
    const observer = new ResizeObserver(() => redraw())
    observer.observe(wrapper)
    return () => observer.disconnect()
  }, [redraw])

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>): void {
    const wrapper = wrapperRef.current
    if (!wrapper || !config || config.type !== 'cartesian') return
    const rect = wrapper.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const inMargin = x < MARGIN || x > rect.width - MARGIN || y < MARGIN || y > rect.height - MARGIN
    setCursor(inMargin ? 'pointer' : 'default')
  }

  function handleClick(e: React.MouseEvent<HTMLDivElement>): void {
    const wrapper = wrapperRef.current
    if (!wrapper || !config || config.type !== 'cartesian') return
    const rect = wrapper.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const W = rect.width
    const H = rect.height

    if (x < MARGIN) {
      setAxisPicker({ edge: 'left', clickX: x, clickY: y })
    } else if (x > W - MARGIN) {
      setAxisPicker({ edge: 'right', clickX: x, clickY: y })
    } else if (y < MARGIN) {
      setAxisPicker({ edge: 'top', clickX: x, clickY: y })
    } else if (y > H - MARGIN) {
      setAxisPicker({ edge: 'bottom', clickX: x, clickY: y })
    } else {
      setAxisPicker(null)
    }
  }

  if (!config) return null

  const cartConfig = config as CartesianMapConfig

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
      <div
        ref={wrapperRef}
        className={styles.canvasWrapper}
        style={{ cursor }}
        onMouseMove={handleMouseMove}
        onClick={handleClick}
      >
        <canvas ref={canvasRef} className={styles.canvas} />
        {axisPicker && config.type === 'cartesian' && (
          <AxisPicker
            edge={axisPicker.edge}
            clickX={axisPicker.clickX}
            clickY={axisPicker.clickY}
            currentId={
              axisPicker.edge === 'left' || axisPicker.edge === 'right'
                ? cartConfig.xDimensionId
                : cartConfig.yDimensionId
            }
            dimensions={dimensions}
            onPick={(id) => {
              if (axisPicker.edge === 'left' || axisPicker.edge === 'right') {
                updateMapConfig(mapId, { xDimensionId: id })
              } else {
                updateMapConfig(mapId, { yDimensionId: id })
              }
              setAxisPicker(null)
            }}
            onClose={() => setAxisPicker(null)}
          />
        )}
      </div>
    </div>
  )
}

// ── AxisPicker ────────────────────────────────────────────────────────────────

interface AxisPickerProps {
  edge: Edge
  clickX: number
  clickY: number
  currentId: string
  dimensions: Dimension[]
  onPick: (id: string) => void
  onClose: () => void
}

function AxisPicker({ edge, clickX, clickY, currentId, dimensions, onPick, onClose }: AxisPickerProps): React.JSX.Element {
  const axis = edge === 'left' || edge === 'right' ? 'X Axis' : 'Y Axis'

  const pickerStyle: React.CSSProperties = (() => {
    const base: React.CSSProperties = { position: 'absolute', zIndex: 10 }
    switch (edge) {
      case 'left':   return { ...base, left: MARGIN + 4,  top: Math.max(4, clickY - 20) }
      case 'right':  return { ...base, right: MARGIN + 4, top: Math.max(4, clickY - 20) }
      case 'top':    return { ...base, left: Math.max(4, clickX - 70), top: MARGIN + 4 }
      case 'bottom': return { ...base, left: Math.max(4, clickX - 70), bottom: MARGIN + 4 }
    }
  })()

  return (
    <>
      <div style={{ position: 'absolute', inset: 0, zIndex: 9 }} onClick={onClose} />
      <div className={styles.axisPicker} style={pickerStyle}>
        <div className={styles.axisPickerTitle}>{axis}</div>
        <ul className={styles.axisPickerList}>
          {dimensions.map((dim, i) => (
            <li
              key={dim.id}
              className={`${styles.axisPickerItem} ${dim.id === currentId ? styles.axisPickerSelected : ''}`}
              onClick={(e) => { e.stopPropagation(); onPick(dim.id) }}
            >
              {dim.label || `Dimension ${i + 1}`}
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}

// ── MapPanelList ──────────────────────────────────────────────────────────────

export function MapPanelList(): React.JSX.Element {
  const maps      = useAppStore(s => s.maps)
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
