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
}

export default function PlotCanvas({ figure }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null)
  const [dims, setDims] = useState({ w: figure.width, h: figure.height })

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
    const pad = { top: 48, right: 24, bottom: 52, left: 64 }
    if (figure.title) pad.top = 56
    if (figure.legend && figure.series.some(s => s.label)) pad.right = 140
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

    // Compute data bounds
    let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity
    for (const s of figure.series) {
      for (const v of s.x) { if (isFinite(v)) { xMin = Math.min(xMin, v); xMax = Math.max(xMax, v) } }
      for (const v of s.y) { if (isFinite(v)) { yMin = Math.min(yMin, v); yMax = Math.max(yMax, v) } }
    }
    if (figure.xRange) { xMin = figure.xRange[0]; xMax = figure.xRange[1] }
    if (figure.yRange) { yMin = figure.yRange[0]; yMax = figure.yRange[1] }
    // Padding
    const xPad = (xMax - xMin) * 0.05 || 1, yPad = (yMax - yMin) * 0.08 || 1
    xMin -= xPad; xMax += xPad; yMin -= yPad; yMax += yPad

    const toX = (v: number) => pad.left + ((v - xMin) / (xMax - xMin)) * pw
    const toY = (v: number) => pad.top + ph - ((v - yMin) / (yMax - yMin)) * ph

    // Grid
    if (figure.grid) {
      const xTicks = niceScale(xMin + xPad, xMax - xPad, 8)
      const yTicks = niceScale(yMin + yPad, yMax - yPad, 6)
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
    figure.series.forEach((s, i) => {
      const color = s.color || PALETTE[i % PALETTE.length]
      const lw = s.lineWidth ?? 2
      ctx.save()
      ctx.beginPath()
      ctx.rect(pad.left, pad.top, pw, ph)
      ctx.clip()

      switch (s.type) {
        case 'line': drawLine(ctx, s, toX, toY, color, lw); break
        case 'scatter': drawScatter(ctx, s, toX, toY, color, s.markerSize ?? 4); break
        case 'bar': drawBar(ctx, s, toX, toY, pad.top + ph, color, figure.series.length, i); break
        case 'stem': drawStem(ctx, s, toX, toY, pad.top + ph, color, lw); break
        case 'stairs': drawStairs(ctx, s, toX, toY, color, lw); break
        case 'area': drawArea(ctx, s, toX, toY, pad.top + ph, color, lw, s.fillAlpha ?? 0.3); break
        case 'hist': drawBar(ctx, s, toX, toY, pad.top + ph, color, 1, 0); break
      }
      ctx.restore()
    })

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
        if (!s.label) return
        const color = s.color || PALETTE[i % PALETTE.length]
        const y = legendY + i * 20
        ctx.fillStyle = color; ctx.fillRect(legendX, y, 14, 3)
        if (s.type === 'scatter') { ctx.beginPath(); ctx.arc(legendX + 7, y + 1.5, 4, 0, Math.PI * 2); ctx.fill() }
        ctx.fillStyle = DARK.text; ctx.textAlign = 'left'
        ctx.fillText(s.label, legendX + 20, y + 5)
      })
    }
  }, [figure, dims])

  useEffect(() => { draw() }, [draw])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current
    if (!canvas || figure.series.length === 0) return
    const rect = canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left, my = e.clientY - rect.top
    // Simple nearest point tooltip
    let best = Infinity, bestText = ''
    for (const s of figure.series) {
      for (let i = 0; i < s.x.length; i++) {
        const pad = { top: 48, left: 64 }
        const pw = dims.w - 88, ph = dims.h - 100
        let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity
        for (const v of s.x) { if (isFinite(v)) { xMin = Math.min(xMin, v); xMax = Math.max(xMax, v) } }
        for (const v of s.y) { if (isFinite(v)) { yMin = Math.min(yMin, v); yMax = Math.max(yMax, v) } }
        const xPd = (xMax - xMin) * 0.05 || 1, yPd = (yMax - yMin) * 0.08 || 1
        xMin -= xPd; xMax += xPd; yMin -= yPd; yMax += yPd
        const px = pad.left + ((s.x[i] - xMin) / (xMax - xMin)) * pw
        const py = pad.top + ph - ((s.y[i] - yMin) / (yMax - yMin)) * ph
        const d = Math.hypot(mx - px, my - py)
        if (d < best && d < 20) { best = d; bestText = `(${fmtVal(s.x[i])}, ${fmtVal(s.y[i])})` }
      }
    }
    setTooltip(bestText ? { x: mx, y: my, text: bestText } : null)
  }, [figure, dims])

  const exportPNG = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const link = document.createElement('a')
    link.download = `matfree-plot-${figure.id}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
  }, [figure.id])

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', maxWidth: 800 }}>
      <canvas
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setTooltip(null)}
        style={{ display: 'block', borderRadius: 8, cursor: 'crosshair' }}
      />
      {tooltip && (
        <div style={{
          position: 'absolute', left: tooltip.x + 12, top: tooltip.y - 28,
          background: '#1e1e2e', color: '#e4e4ef', padding: '4px 10px',
          borderRadius: 6, fontSize: 12, fontFamily: 'var(--font-mono)',
          pointerEvents: 'none', border: '1px solid #3a3a52', whiteSpace: 'nowrap',
        }}>{tooltip.text}</div>
      )}
      <button onClick={exportPNG} style={{
        position: 'absolute', top: 6, right: 6, background: 'rgba(30,30,46,0.85)',
        border: '1px solid #3a3a52', color: '#a0a0b8', padding: '3px 10px',
        borderRadius: 5, fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-mono)',
      }} title="Download as PNG">PNG</button>
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
  // Draw markers if set
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
  // Fill
  ctx.fillStyle = color; ctx.globalAlpha = alpha
  ctx.beginPath(); ctx.moveTo(toX(s.x[0]), baseline)
  for (let i = 0; i < s.x.length; i++) ctx.lineTo(toX(s.x[i]), toY(s.y[i]))
  ctx.lineTo(toX(s.x[s.x.length - 1]), baseline); ctx.closePath(); ctx.fill()
  ctx.globalAlpha = 1
  // Line on top
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
