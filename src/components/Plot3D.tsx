'use client'

import { useRef, useEffect, useCallback, useState } from 'react'

export interface Plot3DData {
  type: 'surf' | 'mesh' | 'contour' | 'plot3'
  X?: number[][]
  Y?: number[][]
  Z?: number[][]
  x?: number[]
  y?: number[]
  z?: number[]
  title?: string
  xlabel?: string
  ylabel?: string
  zlabel?: string
  colormap?: string
}

const DARK = {
  bg: '#13131d', axis: '#3a3a52', grid: '#1e1e2e', text: '#a0a0b8',
  title: '#e4e4ef', plotBg: '#0e0e16',
}

export default function Plot3D({ data }: { data: Plot3DData }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [rotation, setRotation] = useState({ theta: 0.6, phi: 0.5 })
  const [dragging, setDragging] = useState(false)
  const [lastMouse, setLastMouse] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1.0)
  const [dims, setDims] = useState({ w: 600, h: 450 })

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new ResizeObserver((entries) => {
      const { width } = entries[0].contentRect
      if (width > 100) setDims({ w: Math.floor(width), h: Math.floor(width * 0.75) })
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const project = useCallback((x: number, y: number, z: number): [number, number, number] => {
    const { theta, phi } = rotation
    const ct = Math.cos(theta), st = Math.sin(theta)
    const cp = Math.cos(phi), sp = Math.sin(phi)
    const rx = ct * x + st * y
    const ry = -st * cp * x + ct * cp * y + sp * z
    const rz = st * sp * x - ct * sp * y + cp * z
    const scale = zoom * Math.min(dims.w, dims.h) * 0.3
    return [dims.w / 2 + rx * scale, dims.h / 2 - ry * scale, rz]
  }, [rotation, zoom, dims])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = dims.w * dpr; canvas.height = dims.h * dpr
    canvas.style.width = `${dims.w}px`; canvas.style.height = `${dims.h}px`
    ctx.scale(dpr, dpr)

    ctx.fillStyle = DARK.bg; ctx.fillRect(0, 0, dims.w, dims.h)

    // Normalize data to [-1, 1]
    let allX: number[] = [], allY: number[] = [], allZ: number[] = []
    if (data.X && data.Y && data.Z) {
      for (let i = 0; i < data.X.length; i++) for (let j = 0; j < data.X[i].length; j++) {
        allX.push(data.X[i][j]); allY.push(data.Y[i][j]); allZ.push(data.Z[i][j])
      }
    } else if (data.x && data.y && data.z) {
      allX = data.x; allY = data.y; allZ = data.z
    }

    if (allX.length === 0) return

    const xMin = Math.min(...allX), xMax = Math.max(...allX)
    const yMin = Math.min(...allY), yMax = Math.max(...allY)
    const zMin = Math.min(...allZ), zMax = Math.max(...allZ)
    const xR = xMax - xMin || 1, yR = yMax - yMin || 1, zR = zMax - zMin || 1
    const norm = (v: number, min: number, range: number) => (v - min) / range * 2 - 1

    // Draw axes
    ctx.strokeStyle = DARK.axis; ctx.lineWidth = 1
    const axes: [number, number, number, number, number, number][] = [
      [-1, -1, -1, 1, -1, -1], [-1, -1, -1, -1, 1, -1], [-1, -1, -1, -1, -1, 1]
    ]
    for (const [x1, y1, z1, x2, y2, z2] of axes) {
      const [px1, py1] = project(x1, y1, z1)
      const [px2, py2] = project(x2, y2, z2)
      ctx.beginPath(); ctx.moveTo(px1, py1); ctx.lineTo(px2, py2); ctx.stroke()
    }

    // Axis labels
    ctx.fillStyle = DARK.text; ctx.font = '11px var(--font-sans, sans-serif)'; ctx.textAlign = 'center'
    const [lx, ly] = project(1.15, -1, -1); ctx.fillText(data.xlabel || 'X', lx, ly)
    const [lx2, ly2] = project(-1, 1.15, -1); ctx.fillText(data.ylabel || 'Y', lx2, ly2)
    const [lx3, ly3] = project(-1, -1, 1.15); ctx.fillText(data.zlabel || 'Z', lx3, ly3)

    if (data.type === 'plot3' && data.x && data.y && data.z) {
      // 3D line plot
      ctx.strokeStyle = '#818cf8'; ctx.lineWidth = 2; ctx.beginPath()
      for (let i = 0; i < data.x.length; i++) {
        const nx = norm(data.x[i], xMin, xR), ny = norm(data.y[i], yMin, yR), nz = norm(data.z[i], zMin, zR)
        const [px, py] = project(nx, ny, nz)
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py)
      }
      ctx.stroke()
    } else if (data.X && data.Y && data.Z) {
      const rows = data.X.length, cols = data.X[0].length

      if (data.type === 'contour') {
        // Contour plot (top-down projection)
        const nLevels = 12
        for (let l = 0; l < nLevels; l++) {
          const level = zMin + (l + 0.5) * zR / nLevels
          const t = l / (nLevels - 1)
          ctx.strokeStyle = viridis(t); ctx.lineWidth = 1.5
          // March through cells
          for (let i = 0; i < rows - 1; i++) {
            for (let j = 0; j < cols - 1; j++) {
              const z00 = data.Z![i][j], z10 = data.Z![i + 1][j]
              const z01 = data.Z![i][j + 1], z11 = data.Z![i + 1][j + 1]
              const pts: [number, number][] = []
              marchEdge(data.X!, data.Y!, i, j, i + 1, j, z00, z10, level, pts, xMin, xR, yMin, yR)
              marchEdge(data.X!, data.Y!, i + 1, j, i + 1, j + 1, z10, z11, level, pts, xMin, xR, yMin, yR)
              marchEdge(data.X!, data.Y!, i + 1, j + 1, i, j + 1, z11, z01, level, pts, xMin, xR, yMin, yR)
              marchEdge(data.X!, data.Y!, i, j + 1, i, j, z01, z00, level, pts, xMin, xR, yMin, yR)
              if (pts.length >= 2) {
                const [p1x, p1y] = project(pts[0][0], pts[0][1], 0)
                const [p2x, p2y] = project(pts[1][0], pts[1][1], 0)
                ctx.beginPath(); ctx.moveTo(p1x, p1y); ctx.lineTo(p2x, p2y); ctx.stroke()
              }
            }
          }
        }
      } else {
        // Surf or mesh - collect faces, sort by depth, draw back-to-front
        const faces: { depth: number; pts: [number, number][]; color: string; z: number }[] = []
        for (let i = 0; i < rows - 1; i++) {
          for (let j = 0; j < cols - 1; j++) {
            const corners = [
              [i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]
            ].map(([r, c]) => {
              const nx = norm(data.X![r][c], xMin, xR), ny = norm(data.Y![r][c], yMin, yR), nz = norm(data.Z![r][c], zMin, zR)
              return project(nx, ny, nz)
            })
            const avgZ = corners.reduce((s, c) => s + c[2], 0) / 4
            const avgDataZ = ([[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]] as number[][]).map(([r, c]) => data.Z![r][c]).reduce((s, v) => s + v, 0) / 4
            const t = (avgDataZ - zMin) / zR
            faces.push({ depth: avgZ, pts: corners.map(c => [c[0], c[1]]), color: viridis(t), z: t })
          }
        }
        faces.sort((a, b) => a.depth - b.depth) // Painter's algorithm
        for (const face of faces) {
          ctx.beginPath()
          ctx.moveTo(face.pts[0][0], face.pts[0][1])
          for (let k = 1; k < face.pts.length; k++) ctx.lineTo(face.pts[k][0], face.pts[k][1])
          ctx.closePath()
          if (data.type === 'surf') {
            ctx.fillStyle = face.color; ctx.globalAlpha = 0.85; ctx.fill(); ctx.globalAlpha = 1
            ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 0.5; ctx.stroke()
          } else {
            ctx.strokeStyle = face.color; ctx.lineWidth = 1; ctx.stroke()
          }
        }
      }
    }

    // Title
    if (data.title) {
      ctx.fillStyle = DARK.title; ctx.font = 'bold 15px var(--font-sans, sans-serif)'; ctx.textAlign = 'center'
      ctx.fillText(data.title, dims.w / 2, 24)
    }

    // Controls hint
    ctx.fillStyle = '#3a3a52'; ctx.font = '10px var(--font-mono, monospace)'; ctx.textAlign = 'left'
    ctx.fillText('Drag to rotate | Scroll to zoom', 8, dims.h - 8)
  }, [data, dims, project])

  useEffect(() => { draw() }, [draw])

  const handleMouseDown = (e: React.MouseEvent) => {
    setDragging(true); setLastMouse({ x: e.clientX, y: e.clientY })
  }
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return
    const dx = e.clientX - lastMouse.x, dy = e.clientY - lastMouse.y
    setRotation(r => ({ theta: r.theta + dx * 0.01, phi: Math.max(-Math.PI / 2, Math.min(Math.PI / 2, r.phi + dy * 0.01)) }))
    setLastMouse({ x: e.clientX, y: e.clientY })
  }
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    setZoom(z => Math.max(0.3, Math.min(5, z * (e.deltaY > 0 ? 0.9 : 1.1))))
  }

  const exportPNG = () => {
    const canvas = canvasRef.current; if (!canvas) return
    const link = document.createElement('a'); link.download = 'matfree-3d.png'
    link.href = canvas.toDataURL('image/png'); link.click()
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', maxWidth: 800 }}>
      <canvas ref={canvasRef} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove}
        onMouseUp={() => setDragging(false)} onMouseLeave={() => setDragging(false)}
        onWheel={handleWheel} style={{ display: 'block', borderRadius: 8, cursor: dragging ? 'grabbing' : 'grab' }} />
      <button onClick={exportPNG} style={{
        position: 'absolute', top: 6, right: 6, background: 'rgba(30,30,46,0.85)',
        border: '1px solid #3a3a52', color: '#a0a0b8', padding: '3px 10px',
        borderRadius: 5, fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-mono)',
      }}>PNG</button>
    </div>
  )
}

function marchEdge(X: number[][], Y: number[][], i1: number, j1: number, i2: number, j2: number, z1: number, z2: number, level: number, pts: [number, number][], xMin: number, xR: number, yMin: number, yR: number) {
  if ((z1 < level) !== (z2 < level)) {
    const t = (level - z1) / (z2 - z1)
    const x = X[i1][j1] + t * (X[i2][j2] - X[i1][j1])
    const y = Y[i1][j1] + t * (Y[i2][j2] - Y[i1][j1])
    pts.push([(x - xMin) / xR * 2 - 1, (y - yMin) / yR * 2 - 1])
  }
}

function viridis(t: number): string {
  t = Math.max(0, Math.min(1, t))
  const c: [number, number, number][] = [
    [68, 1, 84], [72, 23, 105], [72, 43, 115], [67, 62, 133], [57, 82, 139], [47, 100, 142],
    [38, 118, 142], [31, 135, 141], [25, 152, 138], [33, 170, 127], [58, 186, 111], [94, 201, 97],
    [137, 213, 72], [184, 222, 41], [225, 227, 24], [253, 231, 37],
  ]
  const idx = t * (c.length - 1), lo = Math.floor(idx), hi = Math.min(lo + 1, c.length - 1), f = idx - lo
  return `rgb(${Math.round(c[lo][0] + f * (c[hi][0] - c[lo][0]))},${Math.round(c[lo][1] + f * (c[hi][1] - c[lo][1]))},${Math.round(c[lo][2] + f * (c[hi][2] - c[lo][2]))})`
}
