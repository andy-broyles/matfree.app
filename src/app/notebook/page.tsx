'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import type { PlotFigure, HelpEntry } from '@/engine'
import PlotCanvas from '@/components/PlotCanvas'
import Plot3D from '@/components/Plot3D'
import type { Plot3DData } from '@/components/Plot3D'
import VariableExplorer from '@/components/VariableExplorer'
import CommandPalette from '@/components/CommandPalette'
import MathEquationEditor from '@/components/MathEquationEditor'
import CodeEditor from '@/components/CodeEditor'
import { getAllNotebooks, saveNotebook, deleteNotebook, loadDraft, saveDraft } from '@/lib/notebookStorage'
import type { MFNotebook, NotebookDraft, StoredCell } from '@/lib/notebookStorage'
import { useEngineSession, useElapsedSeconds, hasTextSelection } from '@/lib/useEngineSession'
import type { RunResult } from '@/lib/engineSession'
import { appendMerged, classifyOutput, upsertPlot } from '@/lib/outputFormat'
import { csvToAssignment, isValidIdentifier } from '@/lib/csvImport'
import { decodeNotebook, encodeNotebook, sharePayloadFromHash, SHARE_HASH_KEY, type SharedNotebook } from '@/lib/notebookShare'

type CellStatus = 'idle' | 'queued' | 'running'

interface Cell {
  id: string
  type: 'code' | 'markdown'
  content: string
  output: CellOutput[]
  status: CellStatus
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

const STARTER: Pick<Cell, 'type' | 'content'>[] = [
  { type: 'markdown', content: '# MatFree Notebook\nWrite code and markdown in cells. Run cells with **Ctrl+Enter**.' },
  { type: 'code', content: "x = linspace(0, 2*pi, 100);\nplot(x, sin(x))\ntitle('Hello from Notebook!')" },
]

const NEW_NOTEBOOK: Pick<Cell, 'type' | 'content'>[] = [
  { type: 'markdown', content: '# New Notebook\nWrite code and markdown in cells.' },
  { type: 'code', content: '' },
]

function makeCells(list: Pick<Cell, 'type' | 'content'>[]): Cell[] {
  return list.map(c => ({ id: uid(), type: c.type, content: c.content, output: [], status: 'idle' }))
}

function sameContent(a: Pick<Cell, 'type' | 'content'>[], b: Pick<Cell, 'type' | 'content'>[]): boolean {
  return a.length === b.length && a.every((c, i) => c.type === b[i].type && c.content === b[i].content)
}

/** True if opening a shared notebook would throw away work in the autosaved draft. */
function draftHasOwnWork(draft: NotebookDraft, shared: SharedNotebook): boolean {
  if (sameContent(draft.cells, STARTER) || sameContent(draft.cells, NEW_NOTEBOOK)) return false
  if (sameContent(draft.cells, shared.cells)) return false
  return draft.cells.some(c => c.content.trim())
}

function toCellOutput(text: string): CellOutput {
  const o = classifyOutput(text)
  if (o.type === 'latex') return { type: 'latex', html: o.html }
  if (o.type === 'plot3d') return { type: 'plot3d', plot3d: o.plot3d }
  if (o.type === 'audio') return { type: 'audio', audioSrc: o.audioSrc }
  return { type: 'text', text: o.text }
}

const stoppedMessage = (workspaceCleared: boolean) => workspaceCleared
  ? 'Stopped. The workspace was too large to keep, so it was cleared.'
  : 'Stopped. Variables are back to how they were before this cell ran.'

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
    id: c.id || uid(),
    type: c.type,
    content: c.content,
    output: (c.output ?? []).map(o => ({
      type: o.type as CellOutput['type'],
      text: o.text,
      figure: o.figure as PlotFigure | undefined,
      plot3d: o.plot3d as Plot3DData | undefined,
      html: o.html,
      audioSrc: o.audioSrc,
    })),
    status: 'idle',
  }))
}

export default function NotebookPage() {
  const [cells, setCells] = useState<Cell[]>(() => makeCells(STARTER))
  const [ready, setReady] = useState(false)
  const [notebookName, setNotebookName] = useState('Untitled')
  const [notebooks, setNotebooks] = useState<MFNotebook[]>([])
  const [showNotebooks, setShowNotebooks] = useState(false)
  const [showVars, setShowVars] = useState(true)
  const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const [loadUrlOpen, setLoadUrlOpen] = useState(false)
  const [loadUrlInput, setLoadUrlInput] = useState('')
  const [loadUrlVar, setLoadUrlVar] = useState('data')
  const [showMathEditor, setShowMathEditor] = useState(false)
  const [mathExpr, setMathExpr] = useState('')
  const [flashMsg, setFlashMsg] = useState('')
  const [notice, setNotice] = useState('')
  const [isRunningAll, setIsRunningAll] = useState(false)

  const { busy, busySince, vars, canStop, run, stop, reset } = useEngineSession()
  const elapsed = useElapsedSeconds(busySince)

  const cellsRef = useRef(cells)
  cellsRef.current = cells
  const nameRef = useRef(notebookName)
  nameRef.current = notebookName
  const activeCells = useRef(new Set<string>())
  const runAllRef = useRef(false)

  const flash = useCallback((msg: string) => {
    setFlashMsg(msg)
    setTimeout(() => setFlashMsg(m => (m === msg ? '' : m)), 2000)
  }, [])

  // Open a shared link (#nb=...) or the autosaved draft.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const payload = sharePayloadFromHash(window.location.hash)
      const draft = loadDraft()
      let shared: SharedNotebook | null = null
      let error = ''
      if (payload) {
        try { shared = await decodeNotebook(payload) } catch (e) { error = (e as Error).message }
      }
      if (cancelled) return
      if (payload) window.history.replaceState(null, '', window.location.pathname + window.location.search)
      if (shared && draft && draftHasOwnWork(draft, shared) &&
        !window.confirm(`Open the shared notebook "${shared.name}"? It replaces the notebook you were working on. Click Cancel to keep yours (you can open the link again after saving it).`)) {
        shared = null
      }
      if (shared) {
        setCells(makeCells(shared.cells))
        setNotebookName(shared.name)
        setNotice(`Opened shared notebook "${shared.name}". Click Run All to run it.`)
      } else if (draft) {
        setCells(storedToCells(draft.cells))
        setNotebookName(draft.name)
      }
      if (error) setNotice(error)
      setReady(true)
    })()
    return () => { cancelled = true }
  }, [])

  // Autosave the working copy.
  useEffect(() => {
    if (!ready) return
    const timer = setTimeout(() => saveDraft({ name: notebookName, cells: cellsToStored(cells) }), 800)
    return () => clearTimeout(timer)
  }, [cells, notebookName, ready])

  useEffect(() => {
    if (!ready) return
    const flushDraft = () => saveDraft({ name: nameRef.current, cells: cellsToStored(cellsRef.current) })
    window.addEventListener('pagehide', flushDraft)
    return () => window.removeEventListener('pagehide', flushDraft)
  }, [ready])

  const refreshNotebooks = useCallback(async () => {
    try { setNotebooks(await getAllNotebooks()) } catch { /* IndexedDB unavailable */ }
  }, [])

  useEffect(() => { refreshNotebooks() }, [refreshNotebooks])

  const appendToCell = useCallback((cellId: string, outs: CellOutput[]) => {
    setCells(prev => prev.map(c => (c.id === cellId ? { ...c, output: appendMerged(c.output, outs, 'text') } : c)))
  }, [])

  const runCell = useCallback((cellId: string): Promise<RunResult> => {
    const cell = cellsRef.current.find(c => c.id === cellId)
    if (!cell || cell.type !== 'code' || activeCells.current.has(cellId)) return Promise.resolve({ status: 'ok' })
    activeCells.current.add(cellId)
    setCells(prev => prev.map(c => (c.id === cellId ? { ...c, status: 'queued' } : c)))
    let started = false
    return run(cell.content, {
      onStart: () => {
        started = true
        setCells(prev => prev.map(c => (c.id === cellId ? { ...c, status: 'running', output: [] } : c)))
      },
      onOutput: texts => appendToCell(cellId, texts.map(toCellOutput)),
      onPlot: figure => setCells(prev => prev.map(c => (c.id === cellId ? { ...c, output: upsertPlot(c.output, figure, 'plot') } : c))),
    }).then(result => {
      activeCells.current.delete(cellId)
      const extra: CellOutput[] = []
      if (result.status === 'error') extra.push({ type: 'error', text: result.error })
      else if (result.status === 'stopped' && result.reason === 'stop' && started) extra.push({ type: 'error', text: stoppedMessage(result.workspaceCleared) })
      setCells(prev => prev.map(c => (c.id === cellId ? { ...c, status: 'idle', output: extra.length ? [...c.output, ...extra] : c.output } : c)))
      return result
    })
  }, [run, appendToCell])

  // Fresh workspace, then every code cell top to bottom, stopping at the first error.
  const runAll = useCallback(async () => {
    if (runAllRef.current) return
    runAllRef.current = true
    setIsRunningAll(true)
    try {
      await reset()
      setCells(prev => prev.map(c => (c.type === 'code' ? { ...c, output: [] } : c)))
      const ids = cellsRef.current.filter(c => c.type === 'code' && c.content.trim()).map(c => c.id)
      for (const id of ids) {
        const result = await runCell(id)
        if (result.status !== 'ok') break
      }
    } finally {
      runAllRef.current = false
      setIsRunningAll(false)
    }
  }, [reset, runCell])

  const stopAll = useCallback(() => { stop() }, [stop])

  // Ctrl+C interrupts running code (as in MATLAB) unless there is text selected to copy.
  useEffect(() => {
    if (!busy || !canStop) return
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'c' && !hasTextSelection()) { e.preventDefault(); stop() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [busy, canStop, stop])

  const addCell = useCallback((afterId: string, type: 'code' | 'markdown', initialContent = '') => {
    setCells(prev => {
      const idx = prev.findIndex(c => c.id === afterId)
      const newCell: Cell = { id: uid(), type, content: initialContent, output: [], status: 'idle' }
      return [...prev.slice(0, idx + 1), newCell, ...prev.slice(idx + 1)]
    })
  }, [])

  const deleteCell = useCallback((cellId: string) => {
    setCells(prev => prev.length <= 1 ? prev : prev.filter(c => c.id !== cellId))
  }, [])

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

  const appendToFirstCodeCell = useCallback((code: string) => {
    const firstCode = cellsRef.current.find(c => c.type === 'code')
    if (firstCode) updateCell(firstCode.id, firstCode.content ? firstCode.content + '\n\n' + code : code)
    else addCell(cellsRef.current[cellsRef.current.length - 1]?.id ?? '', 'code', code)
  }, [updateCell, addCell])

  const clearOutputs = useCallback(() => {
    setCells(prev => prev.map(c => ({ ...c, output: [] })))
  }, [])

  const handleSave = useCallback(async () => {
    const name = notebookName.trim() || 'Untitled'
    try {
      await saveNotebook({ name, cells: cellsToStored(cellsRef.current), modified: Date.now() })
      setNotebookName(name)
      flash('Saved')
      refreshNotebooks()
    } catch {
      flash('Save failed')
    }
  }, [notebookName, refreshNotebooks, flash])

  const handleShare = useCallback(async () => {
    const payload = await encodeNotebook({
      name: notebookName.trim() || 'Untitled',
      cells: cellsRef.current.map(c => ({ type: c.type, content: c.content })),
    })
    const url = `${window.location.origin}/notebook#${SHARE_HASH_KEY}=${payload}`
    try {
      await navigator.clipboard.writeText(url)
      flash('Link copied')
    } catch {
      window.prompt('Copy this link to share the notebook:', url)
    }
  }, [notebookName, flash])

  const handleLoad = useCallback((nb: MFNotebook) => {
    reset()
    setCells(storedToCells(nb.cells))
    setNotebookName(nb.name)
    setShowNotebooks(false)
  }, [reset])

  const handleNew = useCallback(() => {
    reset()
    setCells(makeCells(NEW_NOTEBOOK))
    setNotebookName('Untitled')
    setShowNotebooks(false)
  }, [reset])

  const handleLoadUrl = useCallback(async () => {
    const url = loadUrlInput.trim()
    const name = loadUrlVar.trim()
    if (!url) return
    if (!isValidIdentifier(name)) {
      setNotice(`'${name}' is not a valid variable name (use letters, digits and _; start with a letter).`)
      return
    }
    setLoadUrlOpen(false)
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const text = await res.text()
      const result = await run(`${name} = readcsv(__url_content);`, {}, { __url_content: text })
      if (result.status === 'ok') {
        setNotice(`Loaded CSV from URL as '${name}'.`)
        setLoadUrlInput('')
      } else if (result.status === 'error') {
        setNotice(`Could not read the CSV: ${result.error}`)
      }
    } catch (e) {
      const hint = e instanceof TypeError ? ' (the server may not allow cross-origin requests)' : ''
      setNotice(`Failed to load URL: ${(e as Error).message}${hint}`)
    }
  }, [loadUrlInput, loadUrlVar, run])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragOver(false)
    const file = e.dataTransfer.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const csv = text ? csvToAssignment(file.name, text) : null
      if (!csv) { setNotice(`No numeric data found in ${file.name}.`); return }
      run(csv.code).then(result => {
        if (result.status === 'error') setNotice(`Could not import ${file.name}: ${result.error}`)
        if (result.status !== 'ok') return
        appendToFirstCodeCell(csv.code)
        setNotice(`Imported ${file.name} as '${csv.varName}' (${csv.rows}x${csv.cols} matrix). The import code was added to the first code cell.`)
      })
    }
    reader.readAsText(file)
  }, [run, appendToFirstCodeCell])

  const handleCmdSelect = useCallback((entry: HelpEntry) => {
    appendToFirstCodeCell(entry.examples?.[0] ?? `help('${entry.name}')`)
  }, [appendToFirstCodeCell])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); setCmdPaletteOpen(v => !v) }
      if (e.key === 's' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleSave() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleSave])

  const showBusy = busy && elapsed >= 0.3

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
        padding: '8px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap',
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
            aria-label="Notebook name"
            style={{ background: '#1e1e2e', border: '1px solid #3a3a52', borderRadius: 6, color: '#e4e4ef', padding: '4px 10px', fontSize: 13, width: 140, fontFamily: 'var(--font-mono)' }}
          />
          {flashMsg && <span style={{ color: '#22c55e', fontSize: 12 }}>{flashMsg}</span>}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => setShowNotebooks(v => !v)} style={hdrBtn}>Notebooks</button>
          <button onClick={handleSave} style={{ ...hdrBtn, background: '#4f46e5', border: 'none', color: '#fff', fontWeight: 600 }} title="Save to this browser (Ctrl+S)">Save</button>
          <button onClick={handleShare} style={hdrBtn} title="Copy a link that contains this notebook's code and text (not outputs)">Share</button>
          <button onClick={() => setCmdPaletteOpen(true)} style={hdrBtn}>Search</button>
          <button onClick={() => setLoadUrlOpen(true)} style={hdrBtn} title="Load CSV from URL">Load URL</button>
          <button onClick={() => setShowMathEditor(true)} style={hdrBtn} title="Visual math equation editor">Math</button>
          <button onClick={clearOutputs} style={hdrBtn} title="Remove all cell outputs (variables are kept)">Clear outputs</button>
          <button onClick={() => setShowVars(v => !v)} style={hdrBtn}>{showVars ? 'Hide Vars' : 'Vars'}</button>
          <a href="/playground" style={{ ...hdrBtn, textDecoration: 'none', display: 'inline-block' }}>Playground</a>
          {showBusy && <span style={{ color: '#eab308', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>Running {elapsed.toFixed(1)}s</span>}
          {busy && canStop ? (
            <button onClick={stopAll} style={{ ...hdrBtn, background: '#ef4444', border: 'none', color: '#fff', fontWeight: 600 }} title="Stop running code (Ctrl+C)">Stop</button>
          ) : (
            <button onClick={runAll} disabled={isRunningAll || busy} style={{ ...hdrBtn, background: '#22c55e', border: 'none', color: '#fff', fontWeight: 600 }} title="Clear the workspace and run every code cell from the top">
              Run All
            </button>
          )}
        </div>
      </header>

      {notice && (
        <div style={{ maxWidth: 1200, margin: '12px auto 0', padding: '0 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, background: '#13131d', border: '1px solid #2a2a3a', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#c4c4d8' }}>
            <span>{notice}</span>
            <button onClick={() => setNotice('')} style={{ ...tbBtn, fontSize: 16 }} aria-label="Dismiss">×</button>
          </div>
        </div>
      )}

      {showNotebooks && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowNotebooks(false)}>
          <div style={{ background: '#12121a', border: '1px solid #2a2a3a', borderRadius: 12, padding: 20, maxWidth: 400, width: '90%' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px' }}>Saved Notebooks</h3>
            <button onClick={handleNew} style={{ background: '#4f46e5', border: 'none', color: '#fff', padding: '8px 16px', borderRadius: 6, fontSize: 12, cursor: 'pointer', marginBottom: 12 }}>New Notebook</button>
            {notebooks.length === 0 && <p style={{ color: '#8888a0', fontSize: 13 }}>No saved notebooks yet.</p>}
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
                  appendToFirstCodeCell(code)
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
              <button onClick={() => setLoadUrlOpen(false)} style={hdrBtn}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <CommandPalette open={cmdPaletteOpen} onClose={() => setCmdPaletteOpen(false)} onSelect={handleCmdSelect} onRun={appendToFirstCodeCell} />

      <div style={{ display: 'flex', maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ flex: 1, padding: '24px 20px', maxWidth: showVars ? 720 : 900, minWidth: 0 }}>
          {ready && cells.map((cell, i) => (
            <div key={cell.id} style={{ marginBottom: 8, borderRadius: 8, border: `1px solid ${cell.status === 'running' ? '#3f3f8f' : '#1e1e2e'}`, background: '#0e0e16' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 10px', background: '#13131d', borderRadius: '8px 8px 0 0', borderBottom: '1px solid #1e1e2e' }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ color: cell.type === 'code' ? '#818cf8' : '#22c55e', fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', background: cell.type === 'code' ? 'rgba(99,102,241,0.1)' : 'rgba(34,197,94,0.1)', padding: '2px 8px', borderRadius: 4 }}>
                    {cell.type === 'code' ? `In [${i + 1}]` : 'MD'}
                  </span>
                  {cell.type === 'code' && cell.status === 'running' && canStop && (
                    <button onClick={stopAll} style={{ ...cellBtn, background: '#ef4444' }} title="Stop (Ctrl+C)">Stop</button>
                  )}
                  {cell.type === 'code' && cell.status === 'running' && (
                    <span style={{ color: '#eab308', fontSize: 10, fontVariantNumeric: 'tabular-nums' }}>Running {elapsed.toFixed(1)}s</span>
                  )}
                  {cell.type === 'code' && cell.status === 'queued' && (
                    <span style={{ color: '#8888a0', fontSize: 10 }}>Queued</span>
                  )}
                  {cell.type === 'code' && cell.status === 'idle' && (
                    <button onClick={() => runCell(cell.id)} style={cellBtn}>Run</button>
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
                <CodeEditor
                  value={cell.content}
                  onChange={v => updateCell(cell.id, v)}
                  onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); runCell(cell.id) } }}
                  autoHeight
                  minHeight={72}
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
          <aside style={{ width: 240, borderLeft: '1px solid #1e1e2e', padding: 12, background: '#0a0a0f', flexShrink: 0 }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 13 }}>Workspace</h3>
            <VariableExplorer vars={vars} />
          </aside>
        )}
      </div>
    </div>
  )
}

const hdrBtn: React.CSSProperties = {
  background: '#1e1e2e', border: '1px solid #3a3a52', color: '#a0a0b8', padding: '6px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
}

const tbBtn: React.CSSProperties = {
  background: 'none', border: 'none', color: '#666680', cursor: 'pointer', fontSize: 11, padding: '2px 6px',
}

const cellBtn: React.CSSProperties = {
  background: '#22c55e', border: 'none', color: '#fff', padding: '2px 10px', borderRadius: 4, fontSize: 10, cursor: 'pointer', fontWeight: 600,
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function simpleMarkdown(md: string): string {
  let html = escapeHtml(md)
  html = html.replace(/^### (.+)$/gm, '<h3 style="margin:8px 0;font-size:16px">$1</h3>')
  html = html.replace(/^## (.+)$/gm, '<h2 style="margin:8px 0;font-size:20px">$1</h2>')
  html = html.replace(/^# (.+)$/gm, '<h1 style="margin:8px 0;font-size:24px;color:#e4e4ef">$1</h1>')
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')
  html = html.replace(/`(.+?)`/g, '<code style="background:#1e1e2e;padding:2px 6px;border-radius:4px;font-size:12px">$1</code>')
  html = html.replace(/\n/g, '<br/>')
  return html
}
