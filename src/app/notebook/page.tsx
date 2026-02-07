'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Interpreter, Lexer, LexerError, Parser, ParseError, RuntimeError } from '@/engine'
import type { PlotFigure } from '@/engine'
import PlotCanvas from '@/components/PlotCanvas'
import Plot3D from '@/components/Plot3D'
import type { Plot3DData } from '@/components/Plot3D'

// KaTeX for math rendering
import katex from 'katex'

interface Cell {
  id: string
  type: 'code' | 'markdown'
  content: string
  output: CellOutput[]
  running: boolean
}

interface CellOutput {
  type: 'text' | 'error' | 'plot' | 'plot3d' | 'latex' | 'audio'
  text?: string
  figure?: PlotFigure
  plot3d?: Plot3DData
  html?: string
  audioSrc?: string
}

function uid() { return Math.random().toString(36).slice(2, 10) }

function symToLatex(expr: string): string {
  let s = expr
  s = s.replace(/\bsin\b/g, '\\sin').replace(/\bcos\b/g, '\\cos').replace(/\btan\b/g, '\\tan')
  s = s.replace(/\bexp\b/g, '\\exp').replace(/\bln\b/g, '\\ln').replace(/\blog\b/g, '\\log')
  s = s.replace(/\bsqrt\b/g, '\\sqrt')
  s = s.replace(/\bpi\b/g, '\\pi').replace(/\binf\b/g, '\\infty')
  s = s.replace(/\babs\b/g, '|').replace(/\^(\w)/g, '^{$1}').replace(/\^(\([^)]+\))/g, '^{$1}')
  s = s.replace(/\*/g, ' \\cdot ')
  return s
}

export default function NotebookPage() {
  const [cells, setCells] = useState<Cell[]>([
    { id: uid(), type: 'markdown', content: '# MatFree Notebook\nWrite code and markdown in cells. Run cells with **Ctrl+Enter**.', output: [], running: false },
    { id: uid(), type: 'code', content: "x = linspace(0, 2*pi, 100);\nplot(x, sin(x))\ntitle('Hello from Notebook!')", output: [], running: false },
  ])
  const interpRef = useRef<Interpreter | null>(null)

  useEffect(() => {
    interpRef.current = new Interpreter()
  }, [])

  const runCell = useCallback((cellId: string) => {
    const interp = interpRef.current
    if (!interp) return
    setCells(prev => prev.map(c => c.id === cellId ? { ...c, running: true, output: [] } : c))

    const cell = cells.find(c => c.id === cellId)
    if (!cell || cell.type !== 'code') return

    const outputs: CellOutput[] = []

    interp.setOutput((text) => {
      if (text.startsWith('__audio:')) {
        outputs.push({ type: 'audio', audioSrc: text.slice(8).trim() })
      } else if (text.includes('__sym:')) {
        // Symbolic output - render as LaTeX
        const symMatch = text.match(/__sym:(.+)/)
        if (symMatch) {
          try {
            const latex = symToLatex(symMatch[1].trim())
            const html = katex.renderToString(latex, { throwOnError: false, displayMode: true })
            outputs.push({ type: 'latex', html })
          } catch {
            outputs.push({ type: 'text', text })
          }
        } else {
          outputs.push({ type: 'text', text })
        }
      } else {
        outputs.push({ type: 'text', text })
      }
    })
    interp.setPlotCallback((fig) => {
      outputs.push({ type: 'plot', figure: JSON.parse(JSON.stringify(fig)) })
    })

    try {
      interp.execute(cell.content)
    } catch (e: any) {
      const msg = e instanceof LexerError ? `Lexer Error: ${e.message}`
        : e instanceof ParseError ? `Parse Error: ${e.message}`
        : e instanceof RuntimeError ? `Error: ${e.message}`
        : `Error: ${e.message ?? e}`
      outputs.push({ type: 'error', text: msg })
    }

    setCells(prev => prev.map(c => c.id === cellId ? { ...c, output: [...outputs], running: false } : c))
  }, [cells])

  const runAll = useCallback(() => {
    interpRef.current = new Interpreter()
    for (const cell of cells) { if (cell.type === 'code') runCell(cell.id) }
  }, [cells, runCell])

  const addCell = useCallback((afterId: string, type: 'code' | 'markdown') => {
    const idx = cells.findIndex(c => c.id === afterId)
    const newCell: Cell = { id: uid(), type, content: '', output: [], running: false }
    setCells(prev => [...prev.slice(0, idx + 1), newCell, ...prev.slice(idx + 1)])
  }, [cells])

  const deleteCell = useCallback((cellId: string) => {
    if (cells.length <= 1) return
    setCells(prev => prev.filter(c => c.id !== cellId))
  }, [cells])

  const moveCell = useCallback((cellId: string, dir: -1 | 1) => {
    setCells(prev => {
      const idx = prev.findIndex(c => c.id === cellId)
      if (idx + dir < 0 || idx + dir >= prev.length) return prev
      const next = [...prev]
      ;[next[idx], next[idx + dir]] = [next[idx + dir], next[idx]]
      return next
    })
  }, [])

  const updateCell = useCallback((cellId: string, content: string) => {
    setCells(prev => prev.map(c => c.id === cellId ? { ...c, content } : c))
  }, [])

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', color: '#e4e4ef' }}>
      <header style={{
        position: 'sticky', top: 0, zIndex: 50, background: '#0a0a0f', borderBottom: '1px solid #1e1e2e',
        padding: '8px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <a href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ background: 'linear-gradient(135deg, #6366f1, #818cf8)', borderRadius: 8, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14, color: '#fff' }}>M</span>
            <span style={{ fontWeight: 700, color: '#e4e4ef', fontSize: 15 }}>MatFree</span>
          </a>
          <span style={{ color: '#3a3a52', fontSize: 13 }}>Notebook</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <a href="/playground" style={{ color: '#818cf8', fontSize: 12, textDecoration: 'none', padding: '6px 12px', borderRadius: 6, border: '1px solid #3a3a52' }}>Playground</a>
          <button onClick={runAll} style={{ background: '#22c55e', border: 'none', color: '#fff', padding: '6px 14px', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>Run All</button>
        </div>
      </header>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 20px' }}>
        {cells.map((cell, i) => (
          <div key={cell.id} style={{ marginBottom: 8, borderRadius: 8, border: '1px solid #1e1e2e', background: '#0e0e16' }}>
            {/* Cell toolbar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 10px', background: '#13131d', borderRadius: '8px 8px 0 0', borderBottom: '1px solid #1e1e2e' }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ color: cell.type === 'code' ? '#818cf8' : '#22c55e', fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', background: cell.type === 'code' ? 'rgba(99,102,241,0.1)' : 'rgba(34,197,94,0.1)', padding: '2px 8px', borderRadius: 4 }}>
                  {cell.type === 'code' ? `In [${i + 1}]` : 'MD'}
                </span>
                {cell.type === 'code' && (
                  <button onClick={() => runCell(cell.id)} style={{ background: '#22c55e', border: 'none', color: '#fff', padding: '2px 10px', borderRadius: 4, fontSize: 10, cursor: 'pointer', fontWeight: 600 }}>
                    {cell.running ? 'Running...' : 'Run'}
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={() => moveCell(cell.id, -1)} style={tbBtn} title="Move up">↑</button>
                <button onClick={() => moveCell(cell.id, 1)} style={tbBtn} title="Move down">↓</button>
                <button onClick={() => addCell(cell.id, 'code')} style={tbBtn} title="Add code cell">+Code</button>
                <button onClick={() => addCell(cell.id, 'markdown')} style={tbBtn} title="Add markdown cell">+MD</button>
                <button onClick={() => deleteCell(cell.id)} style={{ ...tbBtn, color: '#ef4444' }} title="Delete cell">×</button>
              </div>
            </div>

            {/* Cell content */}
            {cell.type === 'code' ? (
              <textarea
                value={cell.content}
                onChange={e => updateCell(cell.id, e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); runCell(cell.id) } }}
                spellCheck={false}
                style={{
                  width: '100%', minHeight: 60, background: '#0e0e16', color: '#c4c4d8', border: 'none',
                  padding: '12px 14px', fontSize: 13, fontFamily: 'var(--font-mono)', resize: 'vertical',
                  outline: 'none', lineHeight: 1.6, boxSizing: 'border-box',
                }}
                placeholder="Enter code... (Ctrl+Enter to run)"
              />
            ) : (
              <div>
                <textarea
                  value={cell.content}
                  onChange={e => updateCell(cell.id, e.target.value)}
                  spellCheck={false}
                  style={{
                    width: '100%', minHeight: 40, background: '#0e0e16', color: '#c4c4d8', border: 'none',
                    padding: '12px 14px', fontSize: 13, fontFamily: 'var(--font-sans, sans-serif)', resize: 'vertical',
                    outline: 'none', lineHeight: 1.6, boxSizing: 'border-box',
                  }}
                  placeholder="Markdown content..."
                />
                {cell.content && (
                  <div style={{ padding: '8px 14px', borderTop: '1px solid #1e1e2e', color: '#a0a0b8', fontSize: 14, lineHeight: 1.7 }}
                    dangerouslySetInnerHTML={{ __html: simpleMarkdown(cell.content) }} />
                )}
              </div>
            )}

            {/* Cell output */}
            {cell.output.length > 0 && (
              <div style={{ borderTop: '1px solid #1e1e2e', padding: '8px 14px', background: '#0a0a0f' }}>
                {cell.output.map((out, j) => {
                  if (out.type === 'plot' && out.figure) return <div key={j} style={{ margin: '4px 0' }}><PlotCanvas figure={out.figure} /></div>
                  if (out.type === 'latex' && out.html) return <div key={j} style={{ margin: '8px 0', padding: '8px 12px', background: '#13131d', borderRadius: 6, overflow: 'auto' }} dangerouslySetInnerHTML={{ __html: out.html }} />
                  if (out.type === 'audio' && out.audioSrc) return <div key={j} style={{ margin: '4px 0' }}><audio controls src={out.audioSrc} style={{ height: 28 }} /></div>
                  if (out.type === 'error') return <div key={j} style={{ color: '#ef4444', fontSize: 13, fontFamily: 'var(--font-mono)', whiteSpace: 'pre-wrap' }}>{out.text}</div>
                  return <div key={j} style={{ color: '#a0a0b8', fontSize: 13, fontFamily: 'var(--font-mono)', whiteSpace: 'pre-wrap' }}>{out.text}</div>
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

const tbBtn: React.CSSProperties = {
  background: 'none', border: 'none', color: '#666680', cursor: 'pointer', fontSize: 11, padding: '2px 6px',
}

function simpleMarkdown(md: string): string {
  let html = md
  html = html.replace(/^### (.+)$/gm, '<h3 style="margin:8px 0;font-size:16px">$1</h3>')
  html = html.replace(/^## (.+)$/gm, '<h2 style="margin:8px 0;font-size:20px">$1</h2>')
  html = html.replace(/^# (.+)$/gm, '<h1 style="margin:8px 0;font-size:24px;color:#e4e4ef">$1</h1>')
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')
  html = html.replace(/`(.+?)`/g, '<code style="background:#1e1e2e;padding:2px 6px;border-radius:4px;font-size:12px">$1</code>')
  html = html.replace(/\n/g, '<br/>')
  return html
}
