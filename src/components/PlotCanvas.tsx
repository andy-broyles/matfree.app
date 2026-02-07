'use client'

import { useRef, useEffect, useCallback, useState } from 'react'
import type { PlotFigure, PlotSeries } from '@/engine/plot'
import { PALETTE } from '@/engine/plot'

interface Props {
  figure: PlotFigure
  onExport?: () => void
}

const DARK = {
  bg: '#13131d', axis: '#3a3a52', grid: '#1e1e2e', text: '#a0a0b8',
  titleText: '#e4e4ef', tick: '#666680', plotBg: '#0e0e16',
  crosshair: 'rgba(99,102,241,0.4)', zoomBox: 'rgba(99,102,241,0.15)',
  zoomBorder: 'rgba(99,102,241,0.6)', annotBg: '#1e1e2e',
}

type ZoomState = { xMin: number; xMax: number; yMin: number; yMax: number } | null

export default function PlotCanvas({ figure }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null)
  const [dims, setDims] = useState({ w: figure.width, h: figure.height })
  const [zoom, setZoom] = useState<ZoomState>(null)
  const [zoomStack, setZoomStack] = useState<ZoomState[]>([])
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null)
  const [dragCurrent, setDragCurrent] = useState<{ x: number; y: number } | null>(null)
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState<{ mx: number; my: number; zoom: ZoomState } | null>(null)
  const [crosshair, setCrosshair] = useState<{ x: number; y: number; dataX: number; dataY: number } | null>(null)

  // Responsive resize
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new ResizeObserver((entries) => {
      const { width } = entries[0].contentRect
      if (width > 100) setDims({ w: Math.floor(width), h: Math.floor(width * 0.625) })
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  // Reset zoom when figure changes
  useEffect(() => { setZoom(null); setZoomStack([]) }, [figure])

  const getPadding = useCallback(() => {
    const pad = { top: 48, right: 24, bottom: 52, left: 64 }
    if (figure.title) pad.top = 56
    if (figure.legend && figure.series.some(s => s.label)) pad.right = 140
    return pad
  }, [figure])

  const getBounds = useCallback(() => {
    if (zoom) return zoom
    let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity
    for (const s of figure.series) {
      for (const v of s.x) { if (isFinite(v)) { xMin = Math.min(xMin, v); xMax = Math.max(xMax, v) } }
      for (const v of s.y) { if (isFinite(v)) { yMin = Math.min(yMin, v); yMax = Math.max(yMax, v) } }
    }
    if (figure.xRange) { xMin = figure.xRange[0]; xMax = figure.xRange[1] }
    if (figure.yRange) { yMin = figure.yRange[0]; yMax = figure.yRange[1] }
    const xPad = (xMax - xMin) * 0.05 || 1, yPad = (yMax - yMin) * 0.08 || 1
    return { xMin: xMin - xPad, xMax: xMax + xPad, yMin: yMin - yPad, yMax: yMax + yPad }
  }, [figure, zoom])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = dims.w * dpr
    canvas.height = dims.h * dpr
    canvas.style.width = `${dims.w}px`
    canvas.style.height = `${dims.h}px`
    ctx.scale(dpr, dpr)

    const W = dims.w, H = dims.h
    const pad = getPadding()
    const pw = W - pad.left - pad.right, ph = H - pad.top - pad.bottom

    // Background
    ctx.fillStyle = DARK.bg
    ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = DARK.plotBg
    roundRect(ctx, pad.left, pad.top, pw, ph, 4)
    ctx.fill()

    if (figure.series.length === 0) {
      ctx.fillStyle = DARK.text; ctx.font = '14px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText('No data to plot', W / 2, H / 2); return
    }

    // Check for heatmap mode
    const heatmapData = (figure as any).__heatmapData as number[] | undefined
    if (heatmapData && figure.series[0]?.label === '__heatmap__') {
      const nRows = (figure as any).__heatmapRows as number
      const nCols = (figure as any).__heatmapCols as number
      const minV = Math.min(...heatmapData), maxV = Math.max(...heatmapData)
      const range = maxV - minV || 1
      const cellW = pw / nCols, cellH = ph / nRows
      for (let r = 0; r < nRows; r++) {
        for (let c = 0; c < nCols; c++) {
          const v = (heatmapData[r * nCols + c] - minV) / range
          ctx.fillStyle = viridis(v)
          ctx.fillRect(pad.left + c * cellW, pad.top + r * cellH, cellW + 0.5, cellH + 0.5)
        }
      }
      // Colorbar
      const cbX = pad.left + pw + 8, cbW = 14
      for (let y = 0; y < ph; y++) {
        ctx.fillStyle = viridis(1 - y / ph)
        ctx.fillRect(cbX, pad.top + y, cbW, 1.5)
      }
      ctx.fillStyle = DARK.text; ctx.font = '10px var(--font-mono, monospace)'; ctx.textAlign = 'left'
      ctx.fillText(formatTick(maxV), cbX + cbW + 4, pad.top + 10)
      ctx.fillText(formatTick(minV), cbX + cbW + 4, pad.top + ph)
      if (figure.title) { ctx.fillStyle = DARK.titleText; ctx.font = 'bold 15px var(--font-sans, sans-serif)'; ctx.textAlign = 'center'; ctx.fillText(figure.title, pad.left + pw / 2, 28) }
      return
    }

    const bounds = getBounds()
    const { xMin, xMax, yMin, yMax } = bounds
    const toX = (v: number) => pad.left + ((v - xMin) / (xMax - xMin)) * pw
    const toY = (v: number) => pad.top + ph - ((v - yMin) / (yMax - yMin)) * ph

    // Grid
    if (figure.grid) {
      const baseXMin = zoom ? xMin : xMin + (xMax - xMin) * 0.05
      const baseXMax = zoom ? xMax : xMax - (xMax - xMin) * 0.05
      const baseYMin = zoom ? yMin : yMin + (yMax - yMin) * 0.08
      const baseYMax = zoom ? yMax : yMax - (yMax - yMin) * 0.08
      const xTicks = niceScale(baseXMin, baseXMax, 8)
      const yTicks = niceScale(baseYMin, baseYMax, 6)
      ctx.strokeStyle = DARK.grid; ctx.lineWidth = 1
      for (const t of xTicks) { const x = toX(t); ctx.beginPath(); ctx.moveTo(x, pad.top); ctx.lineTo(x, pad.top + ph); ctx.stroke() }
      for (const t of yTicks) { const y = toY(t); ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + pw, y); ctx.stroke() }

      // Tick labels
      ctx.fillStyle = DARK.tick; ctx.font = '11px var(--font-mono, monospace)'; ctx.textAlign = 'center'
      for (const t of xTicks) ctx.fillText(formatTick(t), toX(t), pad.top + ph + 18)
      ctx.textAlign = 'right'
      for (const t of yTicks) ctx.fillText(formatTick(t), pad.left - 8, toY(t) + 4)
    }

    // Axes border
    ctx.strokeStyle = DARK.axis; ctx.lineWidth = 1.5
    ctx.strokeRect(pad.left, pad.top, pw, ph)

    // Draw series
    ctx.save()
    ctx.beginPath()
    ctx.rect(pad.left, pad.top, pw, ph)
    ctx.clip()
    figure.series.forEach((s, i) => {
      const color = s.color || PALETTE[i % PALETTE.length]
      const lw = s.lineWidth ?? 2
      switch (s.type) {
        case 'line': drawLine(ctx, s, toX, toY, color, lw); break
        case 'scatter': drawScatter(ctx, s, toX, toY, color, s.markerSize ?? 4); break
        case 'bar': drawBar(ctx, s, toX, toY, pad.top + ph, color, figure.series.length, i); break
        case 'stem': drawStem(ctx, s, toX, toY, pad.top + ph, color, lw); break
        case 'stairs': drawStairs(ctx, s, toX, toY, color, lw); break
        case 'area': drawArea(ctx, s, toX, toY, pad.top + ph, color, lw, s.fillAlpha ?? 0.3); break
        case 'hist': drawBar(ctx, s, toX, toY, pad.top + ph, color, 1, 0); break
      }
    })
    ctx.restore()

    // Annotations
    const annotations = (figure as any).__annotations as { x: number; y: number; text: string }[] | undefined
    if (annotations) {
      ctx.font = '12px var(--font-sans, sans-serif)'
      for (const ann of annotations) {
        const px = toX(ann.x), py = toY(ann.y)
        const tw = ctx.measureText(ann.text).width
        ctx.fillStyle = DARK.annotBg; ctx.globalAlpha = 0.85
        roundRect(ctx, px - 2, py - 14, tw + 8, 18, 4); ctx.fill()
        ctx.globalAlpha = 1
        ctx.fillStyle = '#e4e4ef'
        ctx.textAlign = 'left'; ctx.fillText(ann.text, px + 2, py)
      }
    }

    // Title
    if (figure.title) {
      ctx.fillStyle = DARK.titleText; ctx.font = 'bold 15px var(--font-sans, sans-serif)'; ctx.textAlign = 'center'
      ctx.fillText(figure.title, pad.left + pw / 2, 28)
    }
    // X label
    if (figure.xlabel) {
      ctx.fillStyle = DARK.text; ctx.font = '12px var(--font-sans, sans-serif)'; ctx.textAlign = 'center'
      ctx.fillText(figure.xlabel, pad.left + pw / 2, H - 8)
    }
    // Y label
    if (figure.ylabel) {
      ctx.save(); ctx.fillStyle = DARK.text; ctx.font = '12px var(--font-sans, sans-serif)'; ctx.textAlign = 'center'
      ctx.translate(16, pad.top + ph / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(figure.ylabel, 0, 0); ctx.restore()
    }
    // Legend
    if (figure.legend && figure.series.some(s => s.label)) {
      const legendX = pad.left + pw + 12, legendY = pad.top + 8
      ctx.font = '11px var(--font-sans, sans-serif)'
      figure.series.forEach((s, i) => {
        if (!s.label || s.label === '__heatmap__') return
        const color = s.color || PALETTE[i % PALETTE.length]
        const y = legendY + i * 20
        ctx.fillStyle = color; ctx.fillRect(legendX, y, 14, 3)
        if (s.type === 'scatter') { ctx.beginPath(); ctx.arc(legendX + 7, y + 1.5, 4, 0, Math.PI * 2); ctx.fill() }
        ctx.fillStyle = DARK.text; ctx.textAlign = 'left'
        ctx.fillText(s.label, legendX + 20, y + 5)
      })
    }

    // Crosshair
    if (crosshair) {
      const { x, y } = crosshair
      if (x >= pad.left && x <= pad.left + pw && y >= pad.top && y <= pad.top + ph) {
        ctx.strokeStyle = DARK.crosshair; ctx.lineWidth = 1; ctx.setLineDash([4, 3])
        ctx.beginPath(); ctx.moveTo(x, pad.top); ctx.lineTo(x, pad.top + ph); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + pw, y); ctx.stroke()
        ctx.setLineDash([])
      }
    }

    // Zoom selection box
    if (dragStart && dragCurrent && !isPanning) {
      const x1 = Math.min(dragStart.x, dragCurrent.x), y1 = Math.min(dragStart.y, dragCurrent.y)
      const x2 = Math.max(dragStart.x, dragCurrent.x), y2 = Math.max(dragStart.y, dragCurrent.y)
      ctx.fillStyle = DARK.zoomBox
      ctx.fillRect(x1, y1, x2 - x1, y2 - y1)
      ctx.strokeStyle = DARK.zoomBorder; ctx.lineWidth = 1
      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1)
    }

    // Zoom indicator
    if (zoom) {
      ctx.fillStyle = 'rgba(99,102,241,0.7)'; ctx.font = '10px var(--font-mono, monospace)'; ctx.textAlign = 'left'
      ctx.fillText('Zoomed (dbl-click to reset)', pad.left + 4, pad.top + 14)
    }
  }, [figure, dims, zoom, crosshair, dragStart, dragCurrent, isPanning, getPadding, getBounds])

  useEffect(() => { draw() }, [draw])

  const pixToData = useCallback((mx: number, my: number) => {
    const pad = getPadding()
    const pw = dims.w - pad.left - pad.right, ph = dims.h - pad.top - pad.bottom
    const bounds = getBounds()
    const dataX = bounds.xMin + ((mx - pad.left) / pw) * (bounds.xMax - bounds.xMin)
    const dataY = bounds.yMax - ((my - pad.top) / ph) * (bounds.yMax - bounds.yMin)
    return { dataX, dataY }
  }, [dims, getPadding, getBounds])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current
    if (!canvas || figure.series.length === 0) return
    const rect = canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left, my = e.clientY - rect.top

    // Crosshair tracking
    const { dataX, dataY } = pixToData(mx, my)
    setCrosshair({ x: mx, y: my, dataX, dataY })

    // Pan
    if (isPanning && panStart && panStart.zoom) {
      const dxPix = mx - panStart.mx, dyPix = my - panStart.my
      const pad = getPadding()
      const pw = dims.w - pad.left - pad.right, ph = dims.h - pad.top - pad.bottom
      const z = panStart.zoom
      const dxData = -dxPix / pw * (z.xMax - z.xMin)
      const dyData = dyPix / ph * (z.yMax - z.yMin)
      setZoom({ xMin: z.xMin + dxData, xMax: z.xMax + dxData, yMin: z.yMin + dyData, yMax: z.yMax + dyData })
      return
    }

    // Drag (zoom selection)
    if (dragStart) {
      setDragCurrent({ x: mx, y: my })
      return
    }

    // Tooltip: nearest point
    let best = Infinity, bestText = ''
    const bounds = getBounds()
    const pad = getPadding()
    const pw = dims.w - pad.left - pad.right, ph = dims.h - pad.top - pad.bottom
    const toX = (v: number) => pad.left + ((v - bounds.xMin) / (bounds.xMax - bounds.xMin)) * pw
    const toY = (v: number) => pad.top + ph - ((v - bounds.yMin) / (bounds.yMax - bounds.yMin)) * ph
    for (const s of figure.series) {
      if (s.label === '__heatmap__') continue
      for (let i = 0; i < s.x.length; i++) {
        const px = toX(s.x[i]), py = toY(s.y[i])
        const d = Math.hypot(mx - px, my - py)
        if (d < best && d < 20) {
          best = d
          bestText = s.label ? `${s.label}: (${fmtVal(s.x[i])}, ${fmtVal(s.y[i])})` : `(${fmtVal(s.x[i])}, ${fmtVal(s.y[i])})`
        }
      }
    }
    setTooltip(bestText ? { x: mx, y: my, text: bestText } : null)
  }, [figure, dims, dragStart, isPanning, panStart, pixToData, getPadding, getBounds])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left, my = e.clientY - rect.top
    const pad = getPadding()
    const pw = dims.w - pad.left - pad.right, ph = dims.h - pad.top - pad.bottom
    if (mx < pad.left || mx > pad.left + pw || my < pad.top || my > pad.top + ph) return

    if (e.button === 1 || e.shiftKey) {
      // Middle mouse or shift+click = pan
      e.preventDefault()
      setIsPanning(true)
      setPanStart({ mx, my, zoom: zoom || getBounds() })
    } else if (e.button === 0) {
      // Left click = zoom selection
      setDragStart({ x: mx, y: my })
      setDragCurrent({ x: mx, y: my })
    }
  }, [dims, zoom, getPadding, getBounds])

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (isPanning) { setIsPanning(false); setPanStart(null); return }
    if (!dragStart || !dragCurrent) return

    const dx = Math.abs(dragCurrent.x - dragStart.x)
    const dy = Math.abs(dragCurrent.y - dragStart.y)
    setDragStart(null); setDragCurrent(null)

    if (dx < 5 && dy < 5) return // Too small, not a zoom

    const x1 = Math.min(dragStart.x, dragCurrent.x)
    const y1 = Math.min(dragStart.y, dragCurrent.y)
    const x2 = Math.max(dragStart.x, dragCurrent.x)
    const y2 = Math.max(dragStart.y, dragCurrent.y)
    const d1 = pixToData(x1, y2) // bottom-left
    const d2 = pixToData(x2, y1) // top-right
    setZoomStack(prev => [...prev, zoom])
    setZoom({ xMin: d1.dataX, xMax: d2.dataX, yMin: d1.dataY, yMax: d2.dataY })
  }, [dragStart, dragCurrent, isPanning, pixToData, zoom])

  const handleDoubleClick = useCallback(() => {
    if (zoomStack.length > 0) {
      setZoom(zoomStack[zoomStack.length - 1])
      setZoomStack(prev => prev.slice(0, -1))
    } else {
      setZoom(null)
    }
  }, [zoomStack])

  // Mouse wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left, my = e.clientY - rect.top
    const { dataX, dataY } = pixToData(mx, my)
    const bounds = zoom || getBounds()
    const factor = e.deltaY > 0 ? 1.2 : 1 / 1.2
    const newXMin = dataX - (dataX - bounds.xMin) * factor
    const newXMax = dataX + (bounds.xMax - dataX) * factor
    const newYMin = dataY - (dataY - bounds.yMin) * factor
    const newYMax = dataY + (bounds.yMax - dataY) * factor
    setZoom({ xMin: newXMin, xMax: newXMax, yMin: newYMin, yMax: newYMax })
  }, [zoom, pixToData, getBounds])

  const exportPNG = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const link = document.createElement('a')
    link.download = `matfree-plot-${figure.id}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
  }, [figure.id])

  const exportSVG = useCallback(() => {
    // Quick CSV export of the data
    let csv = ''
    for (const s of figure.series) {
      csv += `# ${s.label || 'series'}\nx,y\n`
      for (let i = 0; i < s.x.length; i++) csv += `${s.x[i]},${s.y[i]}\n`
      csv += '\n'
    }
    const blob = new Blob([csv], { type: 'text/csv' })
    const link = document.createElement('a')
    link.download = `matfree-data-${figure.id}.csv`
    link.href = URL.createObjectURL(blob)
    link.click()
  }, [figure])

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', maxWidth: 800 }}>
      <canvas
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => { setTooltip(null); setCrosshair(null); setDragStart(null); setIsPanning(false) }}
        onDoubleClick={handleDoubleClick}
        onWheel={handleWheel}
        style={{ display: 'block', borderRadius: 8, cursor: isPanning ? 'grabbing' : dragStart ? 'crosshair' : 'crosshair' }}
      />
      {tooltip && (
        <div style={{
          position: 'absolute', left: tooltip.x + 12, top: tooltip.y - 28,
          background: '#1e1e2e', color: '#e4e4ef', padding: '4px 10px',
          borderRadius: 6, fontSize: 12, fontFamily: 'var(--font-mono)',
          pointerEvents: 'none', border: '1px solid #3a3a52', whiteSpace: 'nowrap',
          zIndex: 10,
        }}>{tooltip.text}</div>
      )}
      <div style={{ position: 'absolute', top: 6, right: 6, display: 'flex', gap: 4 }}>
        <button onClick={exportPNG} style={{
          background: 'rgba(30,30,46,0.85)', border: '1px solid #3a3a52', color: '#a0a0b8',
          padding: '3px 10px', borderRadius: 5, fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-mono)',
        }} title="Download as PNG">PNG</button>
        <button onClick={exportSVG} style={{
          background: 'rgba(30,30,46,0.85)', border: '1px solid #3a3a52', color: '#a0a0b8',
          padding: '3px 10px', borderRadius: 5, fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-mono)',
        }} title="Export data as CSV">CSV</button>
        {zoom && <button onClick={() => { setZoom(null); setZoomStack([]) }} style={{
          background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.4)', color: '#818cf8',
          padding: '3px 10px', borderRadius: 5, fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-mono)',
        }} title="Reset zoom">Reset</button>}
      </div>
    </div>
  )
}

// Drawing helpers
function drawLine(ctx: CanvasRenderingContext2D, s: PlotSeries, toX: (v: number) => number, toY: (v: number) => number, color: string, lw: number) {
  ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.lineCap = 'round'
  if (s.lineStyle === 'dashed') ctx.setLineDash([8, 4])
  else if (s.lineStyle === 'dotted') ctx.setLineDash([2, 4])
  else ctx.setLineDash([])
  ctx.beginPath()
  let started = false
  for (let i = 0; i < s.x.length; i++) {
    if (!isFinite(s.x[i]) || !isFinite(s.y[i])) { started = false; continue }
    if (!started) { ctx.moveTo(toX(s.x[i]), toY(s.y[i])); started = true }
    else ctx.lineTo(toX(s.x[i]), toY(s.y[i]))
  }
  ctx.stroke(); ctx.setLineDash([])
  if (s.marker && s.marker !== 'none') drawMarkers(ctx, s, toX, toY, color, s.markerSize ?? 3)
}

function drawScatter(ctx: CanvasRenderingContext2D, s: PlotSeries, toX: (v: number) => number, toY: (v: number) => number, color: string, size: number) {
  ctx.fillStyle = color
  for (let i = 0; i < s.x.length; i++) {
    if (!isFinite(s.x[i]) || !isFinite(s.y[i])) continue
    ctx.beginPath(); ctx.arc(toX(s.x[i]), toY(s.y[i]), size, 0, Math.PI * 2); ctx.fill()
  }
}

function drawBar(ctx: CanvasRenderingContext2D, s: PlotSeries, toX: (v: number) => number, toY: (v: number) => number, baseline: number, color: string, totalSeries: number, seriesIdx: number) {
  const n = s.x.length
  if (n < 2) return
  const barGroupWidth = (toX(s.x[1]) - toX(s.x[0])) * 0.75
  const barWidth = barGroupWidth / totalSeries
  ctx.fillStyle = color
  for (let i = 0; i < n; i++) {
    const x = toX(s.x[i]) - barGroupWidth / 2 + seriesIdx * barWidth
    const y = toY(s.y[i])
    ctx.globalAlpha = 0.85
    roundRect(ctx, x, Math.min(y, baseline), barWidth - 1, Math.abs(baseline - y), 2)
    ctx.fill()
    ctx.globalAlpha = 1
  }
}

function drawStem(ctx: CanvasRenderingContext2D, s: PlotSeries, toX: (v: number) => number, toY: (v: number) => number, baseline: number, color: string, lw: number) {
  ctx.strokeStyle = color; ctx.lineWidth = lw
  ctx.fillStyle = color
  for (let i = 0; i < s.x.length; i++) {
    const x = toX(s.x[i]), y = toY(s.y[i])
    ctx.beginPath(); ctx.moveTo(x, baseline); ctx.lineTo(x, y); ctx.stroke()
    ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill()
  }
}

function drawStairs(ctx: CanvasRenderingContext2D, s: PlotSeries, toX: (v: number) => number, toY: (v: number) => number, color: string, lw: number) {
  if (s.x.length < 2) return
  ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.beginPath()
  ctx.moveTo(toX(s.x[0]), toY(s.y[0]))
  for (let i = 1; i < s.x.length; i++) {
    ctx.lineTo(toX(s.x[i]), toY(s.y[i - 1]))
    ctx.lineTo(toX(s.x[i]), toY(s.y[i]))
  }
  ctx.stroke()
}

function drawArea(ctx: CanvasRenderingContext2D, s: PlotSeries, toX: (v: number) => number, toY: (v: number) => number, baseline: number, color: string, lw: number, alpha: number) {
  ctx.fillStyle = color; ctx.globalAlpha = alpha
  ctx.beginPath(); ctx.moveTo(toX(s.x[0]), baseline)
  for (let i = 0; i < s.x.length; i++) ctx.lineTo(toX(s.x[i]), toY(s.y[i]))
  ctx.lineTo(toX(s.x[s.x.length - 1]), baseline); ctx.closePath(); ctx.fill()
  ctx.globalAlpha = 1
  drawLine(ctx, s, toX, toY, color, lw)
}

function drawMarkers(ctx: CanvasRenderingContext2D, s: PlotSeries, toX: (v: number) => number, toY: (v: number) => number, color: string, size: number) {
  ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineWidth = 1.5
  for (let i = 0; i < s.x.length; i++) {
    const x = toX(s.x[i]), y = toY(s.y[i])
    if (!isFinite(x) || !isFinite(y)) continue
    switch (s.marker) {
      case 'circle': ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill(); break
      case 'square': ctx.fillRect(x - size, y - size, size * 2, size * 2); break
      case 'diamond': ctx.beginPath(); ctx.moveTo(x, y - size * 1.3); ctx.lineTo(x + size, y); ctx.lineTo(x, y + size * 1.3); ctx.lineTo(x - size, y); ctx.closePath(); ctx.fill(); break
      case 'triangle': ctx.beginPath(); ctx.moveTo(x, y - size * 1.2); ctx.lineTo(x + size, y + size * 0.8); ctx.lineTo(x - size, y + size * 0.8); ctx.closePath(); ctx.fill(); break
      case 'x': ctx.beginPath(); ctx.moveTo(x - size, y - size); ctx.lineTo(x + size, y + size); ctx.moveTo(x + size, y - size); ctx.lineTo(x - size, y + size); ctx.stroke(); break
      case 'plus': ctx.beginPath(); ctx.moveTo(x - size, y); ctx.lineTo(x + size, y); ctx.moveTo(x, y - size); ctx.lineTo(x, y + size); ctx.stroke(); break
    }
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath()
}

function niceScale(min: number, max: number, maxTicks: number): number[] {
  const range = max - min; if (range === 0) return [min]
  const roughStep = range / maxTicks
  const mag = Math.pow(10, Math.floor(Math.log10(roughStep)))
  const norm = roughStep / mag
  let step: number
  if (norm <= 1.5) step = 1 * mag
  else if (norm <= 3) step = 2 * mag
  else if (norm <= 7) step = 5 * mag
  else step = 10 * mag
  const ticks: number[] = []
  let v = Math.ceil(min / step) * step
  while (v <= max + step * 0.001) { ticks.push(v); v += step }
  return ticks
}

function formatTick(v: number): string {
  if (Math.abs(v) < 1e-10) return '0'
  if (Math.abs(v) >= 1e6 || (Math.abs(v) < 0.01 && v !== 0)) return v.toExponential(1)
  if (Number.isInteger(v)) return v.toString()
  return v.toPrecision(4).replace(/0+$/, '').replace(/\.$/, '')
}

function fmtVal(v: number): string {
  if (Number.isInteger(v)) return v.toString()
  return v.toPrecision(6)
}

// Viridis colormap (perceptually uniform, colorblind-friendly)
function viridis(t: number): string {
  t = Math.max(0, Math.min(1, t))
  const colors: [number, number, number][] = [
    [68, 1, 84], [72, 23, 105], [72, 43, 115], [67, 62, 133],
    [57, 82, 139], [47, 100, 142], [38, 118, 142], [31, 135, 141],
    [25, 152, 138], [33, 170, 127], [58, 186, 111], [94, 201, 97],
    [137, 213, 72], [184, 222, 41], [225, 227, 24], [253, 231, 37],
  ]
  const idx = t * (colors.length - 1)
  const lo = Math.floor(idx), hi = Math.min(lo + 1, colors.length - 1)
  const f = idx - lo
  const r = Math.round(colors[lo][0] + f * (colors[hi][0] - colors[lo][0]))
  const g = Math.round(colors[lo][1] + f * (colors[hi][1] - colors[lo][1]))
  const b = Math.round(colors[lo][2] + f * (colors[hi][2] - colors[lo][2]))
  return `rgb(${r},${g},${b})`
}
