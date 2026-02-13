'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Interpreter, Lexer, LexerError, Parser, ParseError, RuntimeError, Value } from '@/engine'
import type { PlotFigure, HelpEntry } from '@/engine'
import type { Environment } from '@/engine/environment'
import PlotCanvas from '@/components/PlotCanvas'
import Plot3D from '@/components/Plot3D'
import type { Plot3DData } from '@/components/Plot3D'
import VariableExplorer from '@/components/VariableExplorer'
import CommandPalette from '@/components/CommandPalette'
import MathEquationEditor from '@/components/MathEquationEditor'
import { getAllNotebooks, saveNotebook, loadNotebook, deleteNotebook } from '@/lib/notebookStorage'
import type { MFNotebook, StoredCell } from '@/lib/notebookStorage'
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

function cellsToStored(cells: Cell[]): StoredCell[] {
  return cells.map(c => ({
    id: c.id,
    type: c.type,
    content: c.content,
    output: c.output.map(o => ({
      type: o.type,
      text: o.text,
      figure: o.figure,
      plot3d: o.plot3d,
      html: o.html,
      audioSrc: o.audioSrc,
    })),
  }))
}

function storedToCells(stored: StoredCell[]): Cell[] {
  return stored.map(c => ({
    ...c,
    output: c.output.map(o => ({
      type: o.type as CellOutput['type'],
      text: o.text,
      figure: o.figure as PlotFigure | undefined,
      plot3d: o.plot3d as Plot3DData | undefined,
      html: o.html,
      audioSrc: o.audioSrc,
    })),
    running: false,
  }))
}

export default function NotebookPage() {
  const [cells, setCells] = useState<Cell[]>([
    { id: uid(), type: 'markdown', content: '# MatFree Notebook\nWrite code and markdown in cells. Run cells with **Ctrl+Enter**.', output: [], running: false },
    { id: uid(), type: 'code', content: "x = linspace(0, 2*pi, 100);\nplot(x, sin(x))\ntitle('Hello from Notebook!')", output: [], running: false },
  ])
  const [notebookName, setNotebookName] = useState('Untitled')
  const [notebooks, setNotebooks] = useState<MFNotebook[]>([])
  const [showNotebooks, setShowNotebooks] = useState(false)
  const [showVars, setShowVars] = useState(false)
  const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false)
  const [envSnapshot, setEnvSnapshot] = useState<Environment | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [loadUrlOpen, setLoadUrlOpen] = useState(false)
  const [loadUrlInput, setLoadUrlInput] = useState('')
  const [loadUrlVar, setLoadUrlVar] = useState('data')
  const [showMathEditor, setShowMathEditor] = useState(false)
  const [mathExpr, setMathExpr] = useState('')
  const interpRef = useRef<Interpreter | null>(null)

  useEffect(() => { interpRef.current = new Interpreter() }, [])

  const refreshNotebooks = useCallback(async () => { setNotebooks(await getAllNotebooks()) }, [])

  useEffect(() => { refreshNotebooks() }, [refreshNotebooks])

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
      } else if (text.startsWith('__plot3d:')) {
        try {
          const d = JSON.parse(text.slice(9).trim()) as Plot3DData
          outputs.push({ type: 'plot3d', plot3d: d })
        } catch {
          outputs.push({ type: 'text', text })
        }
      } else if (text.includes('__sym:')) {
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
    } catch (e: unknown) {
      const msg = e instanceof LexerError ? `Lexer Error: ${e.message}`
        : e instanceof ParseError ? `Parse Error: ${e.message}`
        : e instanceof RuntimeError ? `Error: ${e.message}`
        : `Error: ${(e as Error).message ?? e}`
      outputs.push({ type: 'error', text: msg })
    }

    setCells(prev => prev.map(c => c.id === cellId ? { ...c, output: [...outputs], running: false } : c))
    setEnvSnapshot(interp.currentEnv())
  }, [cells])

  const runAll = useCallback(() => {
    interpRef.current = new Interpreter()
    for (const cell of cells) { if (cell.type === 'code') runCell(cell.id) }
  }, [cells, runCell])

  const addCell = useCallback((afterId: string, type: 'code' | 'markdown', initialContent = '') => {
    const idx = cells.findIndex(c => c.id === afterId)
    const newCell: Cell = { id: uid(), type, content: initialContent, output: [], running: false }
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

  const handleSave = useCallback(async () => {
    const name = notebookName.trim() || 'Untitled'
    await saveNotebook({ name, cells: cellsToStored(cells), modified: Date.now() })
    setNotebookName(name)
    refreshNotebooks()
  }, [cells, notebookName, refreshNotebooks])

  const handleLoad = useCallback(async (nb: MFNotebook) => {
    setCells(storedToCells(nb.cells))
    setNotebookName(nb.name)
    setShowNotebooks(false)
  }, [])

  const handleNew = useCallback(() => {
    setCells([
      { id: uid(), type: 'markdown', content: '# New Notebook\nWrite code and markdown in cells.', output: [], running: false },
      { id: uid(), type: 'code', content: '', output: [], running: false },
    ])
    setNotebookName('Untitled')
    setShowNotebooks(false)
  }, [])

  const handleLoadUrl = useCallback(async () => {
    const url = loadUrlInput.trim()
    if (!url) return
    try {
      const res = await fetch(url)
      const text = await res.text()
      const interp = interpRef.current
      if (!interp) return
      interp.injectVariable('__url_content', Value.fromString(text))
      interp.execute(`${loadUrlVar} = readcsv(__url_content)`)
      setEnvSnapshot(interp.currentEnv())
      setLoadUrlOpen(false)
      setLoadUrlInput('')
    } catch (e) {
      alert(`Failed to load URL: ${(e as Error).message}`)
    }
  }, [loadUrlInput, loadUrlVar])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragOver(false)
    const file = e.dataTransfer.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      if (!text) return
      const lines = text.trim().split(/\r?\n/)
      const data = lines.map(line => line.split(/[,\t]/).map(v => parseFloat(v.trim())).filter(v => !isNaN(v)))
      const rows = data.length, cols = Math.max(...data.map(r => r.length), 1)
      const flat: number[] = []
      for (const row of data) { for (let c = 0; c < cols; c++) flat.push(row[c] ?? 0) }
      const varName = file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_]/g, '_').replace(/^[0-9]/, '_$&')
      const code = `${varName} = reshape([${flat.join(',')}], ${cols}, ${rows})'`
      const interp = interpRef.current
      if (interp) {
        interp.execute(code)
        setEnvSnapshot(interp.currentEnv())
      }
      setCells(prev => {
        const codeCell = prev.find(c => c.type === 'code')
        if (codeCell) {
          return prev.map(c => c.id === codeCell.id ? { ...c, content: c.content ? c.content + '\n\n' + code : code } : c)
        }
        const newCell: Cell = { id: uid(), type: 'code', content: code, output: [], running: false }
        return [...prev, newCell]
      })
    }
    reader.readAsText(file)
  }, [])

  const handleCmdSelect = useCallback((entry: HelpEntry) => {
    const firstCode = cells.find(c => c.type === 'code')
    if (firstCode) {
      const code = entry.examples?.[0] ?? `help('${entry.name}')`
      updateCell(firstCode.id, firstCode.content ? firstCode.content + '\n\n' + code : code)
    }
  }, [cells, updateCell])

  const handleCmdRun = useCallback((code: string) => {
    const firstCode = cells.find(c => c.type === 'code')
    if (firstCode) updateCell(firstCode.id, firstCode.content ? firstCode.content + '\n\n' + code : code)
  }, [cells, updateCell])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); setCmdPaletteOpen(v => !v) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <div
      style={{ minHeight: '100vh', background: '#0a0a0f', color: '#e4e4ef' }}
      onDragOver={e => { e.preventDefault(); setIsDragOver(true) }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
    >
      {isDragOver && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 100, fontSize: 18, color: '#fff',
        }}>Drop CSV file to import</div>
      )}

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
          <input
            value={notebookName}
            onChange={e => setNotebookName(e.target.value)}
            style={{ background: '#1e1e2e', border: '1px solid #3a3a52', borderRadius: 6, color: '#e4e4ef', padding: '4px 10px', fontSize: 13, width: 140, fontFamily: 'var(--font-mono)' }}
          />
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={() => setShowNotebooks(v => !v)} style={{ background: '#1e1e2e', border: '1px solid #3a3a52', color: '#a0a0b8', padding: '6px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>Notebooks</button>
          <button onClick={handleSave} style={{ background: '#4f46e5', border: 'none', color: '#fff', padding: '6px 14px', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>Save</button>
          <button onClick={() => setCmdPaletteOpen(true)} style={{ background: '#1e1e2e', border: '1px solid #3a3a52', color: '#a0a0b8', padding: '6px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>Search (Ctrl+K)</button>
          <button onClick={() => setLoadUrlOpen(true)} style={{ background: '#1e1e2e', border: '1px solid #3a3a52', color: '#a0a0b8', padding: '6px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>Load URL</button>
          <button onClick={() => setShowMathEditor(v => !v)} style={{ background: '#1e1e2e', border: '1px solid #3a3a52', color: '#a0a0b8', padding: '6px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>Math</button>
          <button onClick={() => setShowVars(v => !v)} style={{ background: '#1e1e2e', border: '1px solid #3a3a52', color: '#a0a0b8', padding: '6px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>{showVars ? 'Hide Vars' : 'Vars'}</button>
          <a href="/playground" style={{ color: '#818cf8', fontSize: 12, textDecoration: 'none', padding: '6px 12px', borderRadius: 6, border: '1px solid #3a3a52' }}>Playground</a>
          <button onClick={runAll} style={{ background: '#22c55e', border: 'none', color: '#fff', padding: '6px 14px', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>Run All</button>
        </div>
      </header>

      {showNotebooks && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowNotebooks(false)}>
          <div style={{ background: '#12121a', border: '1px solid #2a2a3a', borderRadius: 12, padding: 20, maxWidth: 400, width: '90%' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px' }}>Saved Notebooks</h3>
            <button onClick={handleNew} style={{ background: '#4f46e5', border: 'none', color: '#fff', padding: '8px 16px', borderRadius: 6, fontSize: 12, cursor: 'pointer', marginBottom: 12 }}>New Notebook</button>
            {notebooks.map(nb => (
              <div key={nb.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #2a2a3a' }}>
                <button onClick={() => handleLoad(nb)} style={{ background: 'none', border: 'none', color: '#818cf8', cursor: 'pointer', fontSize: 13, textAlign: 'left', flex: 1 }}>{nb.name}</button>
                <button onClick={async () => { await deleteNotebook(nb.name); refreshNotebooks() }} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 11 }}>Delete</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {showMathEditor && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={() => setShowMathEditor(false)}>
          <div style={{ width: '100%', maxWidth: 560, background: '#0e0e16', borderRadius: 12, border: '1px solid #2a2a3a', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #2a2a3a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, color: '#e4e4ef', fontSize: 14 }}>Equation Editor</span>
              <button onClick={() => setShowMathEditor(false)} style={{ background: 'none', border: 'none', color: '#666680', cursor: 'pointer', fontSize: 18 }}>×</button>
            </div>
            <div style={{ padding: 16 }}>
              <MathEquationEditor
                value={mathExpr}
                onChange={setMathExpr}
                onInsertCode={(code) => {
                  const firstCode = cells.find(c => c.type === 'code')
                  if (firstCode) updateCell(firstCode.id, firstCode.content ? firstCode.content + '\n\n' + code : code)
                  else addCell(cells[0]?.id ?? '', 'code', code)
                  setShowMathEditor(false)
                }}
              />
            </div>
          </div>
        </div>
      )}

      {loadUrlOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setLoadUrlOpen(false)}>
          <div style={{ background: '#12121a', border: '1px solid #2a2a3a', borderRadius: 12, padding: 20, width: 400 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 12px' }}>Load CSV from URL</h3>
            <input value={loadUrlInput} onChange={e => setLoadUrlInput(e.target.value)} placeholder="https://example.com/data.csv"
              style={{ width: '100%', background: '#1e1e2e', border: '1px solid #3a3a52', borderRadius: 6, color: '#e4e4ef', padding: '8px 12px', fontSize: 13, marginBottom: 8, boxSizing: 'border-box' }} />
            <input value={loadUrlVar} onChange={e => setLoadUrlVar(e.target.value)} placeholder="Variable name"
              style={{ width: '100%', background: '#1e1e2e', border: '1px solid #3a3a52', borderRadius: 6, color: '#e4e4ef', padding: '8px 12px', fontSize: 13, marginBottom: 12, boxSizing: 'border-box' }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleLoadUrl} style={{ background: '#22c55e', border: 'none', color: '#fff', padding: '8px 16px', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>Load</button>
              <button onClick={() => setLoadUrlOpen(false)} style={{ background: '#1e1e2e', border: '1px solid #3a3a52', color: '#a0a0b8', padding: '8px 16px', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <CommandPalette open={cmdPaletteOpen} onClose={() => setCmdPaletteOpen(false)} onSelect={handleCmdSelect} onRun={handleCmdRun} />

      <div style={{ display: 'flex', maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ flex: 1, padding: '24px 20px', maxWidth: showVars ? 720 : 900 }}>
          {cells.map((cell, i) => (
            <div key={cell.id} style={{ marginBottom: 8, borderRadius: 8, border: '1px solid #1e1e2e', background: '#0e0e16' }}>
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
              {cell.output.length > 0 && (
                <div style={{ borderTop: '1px solid #1e1e2e', padding: '8px 14px', background: '#0a0a0f' }}>
                  {cell.output.map((out, j) => {
                    if (out.type === 'plot' && out.figure) return <div key={j} style={{ margin: '4px 0' }}><PlotCanvas figure={out.figure} /></div>
                    if (out.type === 'plot3d' && out.plot3d) return <div key={j} style={{ margin: '4px 0' }}><Plot3D data={out.plot3d} /></div>
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
        {showVars && (
          <aside style={{ width: 220, borderLeft: '1px solid #1e1e2e', padding: 12, background: '#0a0a0f' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 13 }}>Workspace</h3>
            <VariableExplorer env={envSnapshot} />
          </aside>
        )}
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
