import { useRef, useEffect, useCallback, useState } from 'react'
import { useAppStore } from '../../store/appStore'
import type { CartesianMapConfig, SemanticMapConfig, Dimension } from '../../lib/types'
import { drawCartesian, MARGIN } from './cartesian/drawCartesian'
import { drawSemantic, SEM_MARGIN_H, SEM_MARGIN_V } from './semantic/drawSemantic'
import styles from './MapPanel.module.css'

type Edge = 'left' | 'right' | 'top' | 'bottom'

interface AxisPickerState {
  edge: Edge
  clickX: number
  clickY: number
}

interface SemanticPickerState {
  dimIndex: number
  dimId: string
  clickX: number
  clickY: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function semAxisYs(H: number, count: number): number[] {
  if (count === 0) return []
  if (count === 1) return [H / 2]
  return Array.from({ length: count }, (_, i) =>
    SEM_MARGIN_V + i * (H - 2 * SEM_MARGIN_V) / (count - 1)
  )
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

  const [axisPicker,     setAxisPicker]     = useState<AxisPickerState | null>(null)
  const [semanticPicker, setSemanticPicker] = useState<SemanticPickerState | null>(null)
  const [cursor,         setCursor]         = useState('default')

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
    if (!wrapper || !config) return
    const rect = wrapper.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    if (config.type === 'cartesian') {
      const inMargin = x < MARGIN || x > rect.width - MARGIN || y < MARGIN || y > rect.height - MARGIN
      setCursor(inMargin ? 'pointer' : 'default')
    } else if (config.type === 'semantic') {
      const semCfg = config as SemanticMapConfig
      const dims = semCfg.dimensionIds
        .map(id => dimensions.find(d => d.id === id))
        .filter(Boolean)
      const inMargin = x < SEM_MARGIN_H || x > rect.width - SEM_MARGIN_H
      if (!inMargin || dims.length === 0) { setCursor('default'); return }
      const ys = semAxisYs(rect.height, dims.length)
      setCursor(ys.some(ay => Math.abs(y - ay) < 16) ? 'pointer' : 'default')
    }
  }

  function handleClick(e: React.MouseEvent<HTMLDivElement>): void {
    const wrapper = wrapperRef.current
    if (!wrapper || !config) return
    const rect = wrapper.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const W = rect.width
    const H = rect.height

    if (config.type === 'cartesian') {
      setSemanticPicker(null)
      if      (x < MARGIN)       setAxisPicker({ edge: 'left',   clickX: x, clickY: y })
      else if (x > W - MARGIN)   setAxisPicker({ edge: 'right',  clickX: x, clickY: y })
      else if (y < MARGIN)       setAxisPicker({ edge: 'top',    clickX: x, clickY: y })
      else if (y > H - MARGIN)   setAxisPicker({ edge: 'bottom', clickX: x, clickY: y })
      else                       setAxisPicker(null)
    } else if (config.type === 'semantic') {
      setAxisPicker(null)
      const semCfg = config as SemanticMapConfig
      const dims = semCfg.dimensionIds
        .map(id => dimensions.find(d => d.id === id))
        .filter((d): d is Dimension => d !== undefined)
      if (dims.length === 0) return
      const inMargin = x < SEM_MARGIN_H || x > W - SEM_MARGIN_H
      if (!inMargin) { setSemanticPicker(null); return }
      const ys = semAxisYs(H, dims.length)
      let best = -1, bestDist = Infinity
      for (let i = 0; i < ys.length; i++) {
        const d = Math.abs(y - ys[i])
        if (d < bestDist) { bestDist = d; best = i }
      }
      if (best >= 0 && bestDist <= 16) {
        setSemanticPicker({ dimIndex: best, dimId: dims[best].id, clickX: x, clickY: y })
      } else {
        setSemanticPicker(null)
      }
    }
  }

  if (!config) return null

  const cartConfig = config as CartesianMapConfig
  const semConfig  = config as SemanticMapConfig

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
            isFlipped={
              axisPicker.edge === 'left' || axisPicker.edge === 'right'
                ? cartConfig.xFlipped
                : cartConfig.yFlipped
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
            onFlip={() => {
              if (axisPicker.edge === 'left' || axisPicker.edge === 'right') {
                updateMapConfig(mapId, { xFlipped: !cartConfig.xFlipped })
              } else {
                updateMapConfig(mapId, { yFlipped: !cartConfig.yFlipped })
              }
              setAxisPicker(null)
            }}
            onClose={() => setAxisPicker(null)}
          />
        )}

        {semanticPicker && config.type === 'semantic' && (
          <SemanticAxisPicker
            dimIndex={semanticPicker.dimIndex}
            currentDimId={semanticPicker.dimId}
            isFlipped={semConfig.flippedDimensionIds.includes(semanticPicker.dimId)}
            dimensions={dimensions}
            clickX={semanticPicker.clickX}
            clickY={semanticPicker.clickY}
            onPick={(newId) => {
              const newIds = [...semConfig.dimensionIds]
              newIds[semanticPicker.dimIndex] = newId
              const newFlipped = semConfig.flippedDimensionIds.filter(id => id !== semanticPicker.dimId)
              updateMapConfig(mapId, { dimensionIds: newIds, flippedDimensionIds: newFlipped })
              setSemanticPicker(null)
            }}
            onFlip={() => {
              const id = semanticPicker.dimId
              const current = semConfig.flippedDimensionIds
              const newFlipped = current.includes(id)
                ? current.filter(x => x !== id)
                : [...current, id]
              updateMapConfig(mapId, { flippedDimensionIds: newFlipped })
              setSemanticPicker(null)
            }}
            onClose={() => setSemanticPicker(null)}
          />
        )}
      </div>
    </div>
  )
}

// ── AxisPicker (Cartesian) ────────────────────────────────────────────────────

interface AxisPickerProps {
  edge: Edge
  clickX: number
  clickY: number
  currentId: string
  isFlipped: boolean
  dimensions: Dimension[]
  onPick: (id: string) => void
  onFlip: () => void
  onClose: () => void
}

function AxisPicker({ edge, clickX, clickY, currentId, isFlipped, dimensions, onPick, onFlip, onClose }: AxisPickerProps): React.JSX.Element {
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
        <button
          className={styles.axisPickerFlipBtn}
          onClick={(e) => { e.stopPropagation(); onFlip() }}
        >
          ↔ {isFlipped ? 'Restore poles' : 'Flip poles'}
        </button>
        <div className={styles.axisPickerSubtitle}>Change to</div>
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

// ── SemanticAxisPicker ────────────────────────────────────────────────────────

interface SemanticAxisPickerProps {
  dimIndex: number
  currentDimId: string
  isFlipped: boolean
  dimensions: Dimension[]
  clickX: number
  clickY: number
  onPick: (newDimId: string) => void
  onFlip: () => void
  onClose: () => void
}

function SemanticAxisPicker({ currentDimId, isFlipped, dimensions, clickX, clickY, onPick, onFlip, onClose }: SemanticAxisPickerProps): React.JSX.Element {
  const pickerStyle: React.CSSProperties = {
    position: 'absolute',
    zIndex: 10,
    left: Math.max(4, clickX - 70),
    top: Math.max(4, clickY - 20)
  }

  return (
    <>
      <div style={{ position: 'absolute', inset: 0, zIndex: 9 }} onClick={onClose} />
      <div className={styles.axisPicker} style={pickerStyle}>
        <div className={styles.axisPickerTitle}>Dimension</div>
        <button
          className={styles.axisPickerFlipBtn}
          onClick={(e) => { e.stopPropagation(); onFlip() }}
        >
          ↔ {isFlipped ? 'Restore poles' : 'Flip poles'}
        </button>
        <div className={styles.axisPickerSubtitle}>Change to</div>
        <ul className={styles.axisPickerList}>
          {dimensions.map((dim, i) => (
            <li
              key={dim.id}
              className={`${styles.axisPickerItem} ${dim.id === currentDimId ? styles.axisPickerSelected : ''}`}
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
