'use client'

import { useEffect, useRef, useState, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import styles from './playground.module.css'
import { Interpreter, LexerError, ParseError, RuntimeError } from '@/engine'
import type { PlotFigure, HelpEntry } from '@/engine'
import type { Environment } from '@/engine/environment'
import PlotCanvas from '@/components/PlotCanvas'
import Plot3D from '@/components/Plot3D'
import type { Plot3DData } from '@/components/Plot3D'
import VariableExplorer from '@/components/VariableExplorer'
import CommandPalette from '@/components/CommandPalette'
import Autocomplete from '@/components/Autocomplete'
import AIAssistant from '@/components/AIAssistant'
import FileTree from '@/components/FileTree'
import type { MFFile } from '@/components/FileTree'
import { toPython, toJulia } from '@/engine/transpiler'
import katex from 'katex'

interface OutputItem {
  type: 'input' | 'output' | 'error' | 'plot' | 'info' | 'audio' | 'plot3d' | 'latex'
  text?: string
  figure?: PlotFigure
  audioSrc?: string
  plot3d?: Plot3DData
  html?: string
}

const EXAMPLES = [
  { cat: 'Plotting', items: [
    { name: 'Sine Wave', code: "x = linspace(0, 4*pi, 200);\nplot(x, sin(x))\ntitle('Sine Wave')\nxlabel('x')\nylabel('sin(x)')" },
    { name: 'Multi-Plot', code: "x = linspace(0, 2*pi, 100);\nhold('on')\nplot(x, sin(x))\nplot(x, cos(x))\nplot(x, sin(x).*cos(x))\nlegend('sin', 'cos', 'sin*cos')\ntitle('Trigonometric Functions')" },
    { name: 'Scatter', code: "x = randn(1, 200);\ny = x + randn(1, 200) * 0.4;\nscatter(x, y)\ntitle('Scatter with Correlation')\nxlabel('X')\nylabel('Y')" },
    { name: 'Bar Chart', code: "values = [23 45 12 67 34 56 78 42];\nbar(1:8, values)\ntitle('Monthly Revenue')\nxlabel('Month')\nylabel('Revenue ($k)')" },
    { name: 'Histogram', code: "data = randn(1, 2000);\nhist(data, 40)\ntitle('Normal Distribution (n=2000)')\nxlabel('Value')\nylabel('Frequency')" },
    { name: 'Area Plot', code: "x = linspace(0, 10, 100);\ny = exp(-x/3) .* sin(x);\narea(x, y)\ntitle('Damped Oscillation')" },
    { name: 'Heatmap', code: "A = magic(12);\nimagesc(A)\ntitle('Magic Square Heatmap')" },
    { name: 'Line Styles', code: "x = linspace(0, 2*pi, 50);\nhold('on')\nplot(x, sin(x), 'b')\nplot(x, sin(x + pi/4), 'r--')\nplot(x, sin(x + pi/2), 'g:')\nlegend('Phase 0', 'Phase 45', 'Phase 90')\ntitle('Phase Shifted Waves')" },
  ]},
  { cat: 'Symbolic Math', items: [
    { name: 'Differentiation', code: "% Symbolic differentiation\nsymdiff('x^3 + 2*x^2 - 5*x + 1', 'x')\n\n% Chain rule\nsymdiff('sin(x^2)', 'x')\n\n% Second derivative\nsymdiff('x^3 + 2*x^2 - 5*x + 1', 'x', 2)" },
    { name: 'Integration', code: "% Symbolic integration\nsymint('x^2', 'x')\nsymint('sin(x)', 'x')\nsymint('exp(x)', 'x')\nsymint('1/x', 'x')" },
    { name: 'Solve Equations', code: "% Solve x^2 - 5x + 6 = 0\nsymsolve('x^2 - 5*x + 6', 'x')\n\n% Solve cubic\nsymsolve('x^3 - 6*x^2 + 11*x - 6', 'x')" },
    { name: 'Taylor Series', code: "% Taylor expansion of sin(x) around 0, order 7\nsymtaylor('sin(x)', 'x', 0, 7)\n\n% Taylor expansion of exp(x)\nsymtaylor('exp(x)', 'x', 0, 5)" },
    { name: 'Simplify/Expand', code: "% Expand (x+1)^3\nsymexpand('(x+1)^3')\n\n% Simplify\nsymsimplify('x^2 + 2*x + 1')" },
    { name: 'Sym Plot', code: "% Plot a symbolic expression\nsymplot('sin(x)/x', 'x', [-10 10])" },
  ]},
  { cat: 'Scientific', items: [
    { name: 'FFT Spectrum', code: "fs = 100; t = linspace(0, 1, fs);\nx = sin(2*pi*10*t) + 0.5*sin(2*pi*25*t);\nX = abs_fft(x);\nplot(X)\ntitle('Frequency Spectrum')\nxlabel('Frequency bin')" },
    { name: 'ODE Solver', code: "% Solve y' = -0.5*y, y(0) = 2\nresult = ode45(@(t,y) -0.5*y, [0 10], [2]);\nt = result{1}; y = result{2};\nplot(t, y)\ntitle('Exponential Decay (ODE45)')\nxlabel('Time')\nylabel('y(t)')" },
    { name: 'Curve Fitting', code: "x = [1 2 3 4 5 6 7 8];\ny = [1.2 3.8 8.1 16.2 24.8 37.1 49.0 63.9];\np = polyfit(x, y, 2);\nxf = linspace(1, 8, 50);\nyf = polyval(p, xf);\nhold('on')\nscatter(x, y, 6)\nplot(xf, yf, 'r')\nlegend('Data', 'Quadratic Fit')\ntitle('Polynomial Curve Fitting')" },
    { name: 'Root Finding', code: "% Find where x^3 - 2x - 5 = 0\nroot = fzero(@(x) x^3 - 2*x - 5, 2);\nfprintf('Root: x = %f\\n', root)\n\n% Verify\nfprintf('f(root) = %f\\n', root^3 - 2*root - 5)" },
    { name: 'Optimization', code: "% Minimize Rosenbrock function\nf = @(x) (1-x(1))^2 + 100*(x(2)-x(1)^2)^2;\nresult = fminsearch(f, [-1 1]);\nfprintf('Minimum at: [%f, %f]\\n', result(1), result(2))" },
    { name: 'Interpolation', code: "x = [0 1 2 3 4 5];\ny = [0 0.84 0.91 0.14 -0.76 -0.96];\nxq = linspace(0, 5, 100);\nyq = spline(x, y, xq);\nhold('on')\nscatter(x, y, 6)\nplot(xq, yq, 'r')\nlegend('Data', 'Cubic Spline')\ntitle('Spline Interpolation')" },
    { name: 'Integration', code: "% Numerical integration\nresult1 = integral(@(x) sin(x), 0, pi);\nfprintf('integral(sin, 0, pi) = %f\\n', result1)\n\nresult2 = integral(@(x) exp(-x.^2), -10, 10);\nfprintf('integral(exp(-x^2), -inf, inf) ≈ %f\\n', result2)\nfprintf('sqrt(pi) = %f\\n', sqrt(pi))" },
    { name: 'Normal Dist', code: "x = linspace(-4, 4, 200);\ny1 = normpdf(x, 0, 1);\ny2 = normpdf(x, 0, 0.5);\ny3 = normpdf(x, 1, 1.5);\nhold('on')\nplot(x, y1)\nplot(x, y2)\nplot(x, y3)\nlegend('N(0,1)', 'N(0,0.25)', 'N(1,2.25)')\ntitle('Normal Distributions')" },
  ]},
  { cat: '3D Plots', items: [
    { name: 'Surface Plot', code: "[X, Y] = meshgrid(linspace(-2, 2, 30));\nZ = sin(X.^2 + Y.^2) .* exp(-0.3*(X.^2 + Y.^2));\nsurf(X, Y, Z)" },
    { name: 'Mesh Plot', code: "[X, Y] = meshgrid(linspace(-3, 3, 25));\nZ = X .* exp(-X.^2 - Y.^2);\nmesh(X, Y, Z)" },
    { name: 'Contour Plot', code: "[X, Y] = meshgrid(linspace(-3, 3, 40));\nZ = sin(X) .* cos(Y);\ncontour(X, Y, Z)" },
    { name: '3D Helix', code: "t = linspace(0, 10*pi, 500);\nx = cos(t); y = sin(t); z = t / (10*pi);\nplot3(x, y, z)" },
  ]},
  { cat: 'Signal & Audio', items: [
    { name: 'Window Functions', code: "n = 64;\nhold('on')\nplot(hamming(n))\nplot(hanning(n))\nplot(blackman(n))\nplot(bartlett(n))\nlegend('Hamming', 'Hanning', 'Blackman', 'Bartlett')\ntitle('Window Functions')" },
    { name: 'Chirp Signal', code: "t = linspace(0, 1, 8000);\ny = chirp(t, 20, 1, 2000);\nplot(t, y)\ntitle('Chirp Signal (20Hz to 2000Hz)')\nxlabel('Time (s)')" },
    { name: 'Audio Synthesis', code: "% Generate a 440Hz tone (A4 note)\nfs = 8192;\nt = linspace(0, 0.5, fs/2);\ny = 0.5 * sin(2*pi*440*t);\nsound(y, fs)" },
    { name: 'Waveforms', code: "t = linspace(0, 4*pi, 500);\nhold('on')\nplot(t, sin(t))\nplot(t, sawtooth(t))\nplot(t, square(t))\nlegend('Sine', 'Sawtooth', 'Square')\ntitle('Waveform Comparison')" },
    { name: 'Cross-Corr', code: "x = [zeros(1, 20) ones(1, 10) zeros(1, 20)];\ny = [zeros(1, 25) ones(1, 10) zeros(1, 15)];\nr = xcorr(x, y);\nplot(r)\ntitle('Cross-Correlation')\nxlabel('Lag')" },
  ]},
  { cat: 'Math & LA', items: [
    { name: 'Matrix Ops', code: 'A = [2 1; 5 3];\nfprintf(\'det(A) = %f\\n\', det(A))\nB = inv(A);\ndisp(B)\ndisp(A * B)' },
    { name: 'Eigenvalues', code: "A = [4 1 2; 1 3 1; 2 1 5];\ne = eig(A);\nfprintf('Eigenvalues: ');\ndisp(e)" },
    { name: 'Full SVD', code: "A = [1 2; 3 4; 5 6];\nresult = svd_full(A);\nfprintf('U =\\n'); disp(result{1})\nfprintf('S =\\n'); disp(result{2})\nfprintf('V =\\n'); disp(result{3})" },
    { name: 'Matrix Exp', code: "A = [0 -1; 1 0];\nfprintf('A = rotation matrix:\\n'); disp(A)\nE = expm(A);\nfprintf('expm(A) = [cos(1) -sin(1); sin(1) cos(1)]:\\n');\ndisp(E)" },
    { name: 'LU Factor', code: "A = [2 1 1; 4 3 3; 8 7 9];\nresult = lu(A);\nfprintf('L =\\n'); disp(result{1})\nfprintf('U =\\n'); disp(result{2})" },
    { name: 'Functions', code: 'function result = factorial(n)\n  if n <= 1\n    result = 1;\n  else\n    result = n * factorial(n-1);\n  end\nend\nfor i = 1:12\n  fprintf(\'%2d! = %d\\n\', i, factorial(i))\nend' },
    { name: 'Fibonacci Plot', code: 'n = 25;\nfib = zeros(1, n);\nfib(1) = 1; fib(2) = 1;\nfor i = 3:n\n  fib(i) = fib(i-1) + fib(i-2);\nend\nstem(1:n, fib)\ntitle(\'Fibonacci Sequence\')\nxlabel(\'n\')\nylabel(\'F(n)\')' },
    { name: 'Primes & Factors', code: "p = primes(100);\nfprintf('Primes up to 100: '); disp(p)\n\nfprintf('\\nPrime factorization of 360: '); disp(factor(360))\n\nfprintf('Is 97 prime? %d\\n', isprime(97))\nfprintf('GCD(48, 36) = %d\\n', gcd(48, 36))\nfprintf('LCM(12, 18) = %d\\n', lcm(12, 18))" },
    { name: 'Statistics', code: "data = [4 8 15 16 23 42];\nfprintf('Mean:   %f\\n', mean(data))\nfprintf('Std:    %f\\n', std(data))\nfprintf('Median: %f\\n', median(data))\nfprintf('Var:    %f\\n', var(data))\nfprintf('C(42,6) = %d\\n', nchoosek(42, 6))" },
  ]},
]

const SHORTCUTS = [
  { keys: 'Ctrl+K', desc: 'Command palette' },
  { keys: 'Tab', desc: 'Autocomplete' },
  { keys: 'Enter', desc: 'Execute' },
  { keys: 'Shift+Enter', desc: 'Multi-line' },
  { keys: 'Up/Down', desc: 'History' },
  { keys: 'Ctrl+L', desc: 'Clear' },
  { keys: 'Ctrl+Enter', desc: 'Run editor' },
  { keys: 'Ctrl+S', desc: 'Share link' },
]

function PlaygroundInner() {
  const searchParams = useSearchParams()
  const [items, setItems] = useState<OutputItem[]>([])
  const [input, setInput] = useState('')
  const [history, setHistory] = useState<string[]>([])
  const [histIdx, setHistIdx] = useState(-1)
  const [multiline, setMultiline] = useState('')
  const [isEditorMode, setIsEditorMode] = useState(false)
  const [editorCode, setEditorCode] = useState('')
  const [envSnapshot, setEnvSnapshot] = useState<Environment | null>(null)
  const [showVars, setShowVars] = useState(true)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [shareMsg, setShareMsg] = useState('')
  const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false)
  const [acVisible, setAcVisible] = useState(false)
  const [acIdx, setAcIdx] = useState(0)
  const [acWord, setAcWord] = useState('')
  const [isDragOver, setIsDragOver] = useState(false)
  const [showAI, setShowAI] = useState(false)
  const [showFiles, setShowFiles] = useState(false)
  const [fileName, setFileName] = useState('untitled.m')
  const [exportLang, setExportLang] = useState<string | null>(null)

  const interpRef = useRef<Interpreter | null>(null)
  const termRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const interp = new Interpreter()
    interp.setOutput((text) => {
      if (text.startsWith('__audio:')) {
        setItems(prev => [...prev, { type: 'audio', audioSrc: text.slice(8).trim() }])
      } else if (text.startsWith('__plot3d:')) {
        try { const d = JSON.parse(text.slice(9).trim()); setItems(prev => [...prev, { type: 'plot3d', plot3d: d }]) } catch { setItems(prev => [...prev, { type: 'output', text }]) }
      } else if (text.includes('__sym:')) {
        const m = text.match(/__sym:(.+)/)
        if (m) {
          try {
            let latex = m[1].trim()
            latex = latex.replace(/\bsin\b/g, '\\sin').replace(/\bcos\b/g, '\\cos').replace(/\btan\b/g, '\\tan')
            latex = latex.replace(/\bexp\b/g, '\\exp').replace(/\bln\b/g, '\\ln').replace(/\blog\b/g, '\\log')
            latex = latex.replace(/\bsqrt\b/g, '\\sqrt').replace(/\bpi\b/g, '\\pi')
            latex = latex.replace(/\^(\w)/g, '^{$1}').replace(/\*/g, ' \\cdot ')
            const html = katex.renderToString(latex, { throwOnError: false, displayMode: true })
            setItems(prev => [...prev, { type: 'latex', html }])
          } catch { setItems(prev => [...prev, { type: 'output', text }]) }
        } else { setItems(prev => [...prev, { type: 'output', text }]) }
      } else {
        setItems(prev => [...prev, { type: 'output', text }])
      }
    })
    interp.setPlotCallback((fig) => setItems(prev => [...prev, { type: 'plot', figure: JSON.parse(JSON.stringify(fig)) }]))
    interpRef.current = interp
    try { const h = localStorage.getItem('mf_history'); if (h) setHistory(JSON.parse(h)) } catch {}
    try { const c = localStorage.getItem('mf_editor'); if (c) setEditorCode(c) } catch {}
    setItems([
      { type: 'output', text: 'MatFree v0.5.0 \u2014 Free Scientific Computing Environment\n' },
      { type: 'info', text: 'Ctrl+K: Command palette  |  Tab: Autocomplete  |  help(\'topic\'): Documentation\n\n' },
    ])
    const initialCode = searchParams.get('code')
    if (initialCode) { setIsEditorMode(true); setEditorCode(initialCode) }
  }, [searchParams])

  useEffect(() => { try { localStorage.setItem('mf_editor', editorCode) } catch {} }, [editorCode])
  useEffect(() => { if (termRef.current) termRef.current.scrollTop = termRef.current.scrollHeight }, [items])

  // Global keyboard shortcut for command palette
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); setCmdPaletteOpen(v => !v) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const updateEnvSnapshot = useCallback(() => {
    if (interpRef.current) setEnvSnapshot(interpRef.current.currentEnv())
  }, [])

  const executeCode = useCallback((code: string) => {
    if (!interpRef.current || !code.trim()) return
    setItems(prev => [...prev, { type: 'input', text: code }])
    try { interpRef.current.execute(code) }
    catch (e: any) {
      const msg = e instanceof LexerError ? `Lexer Error (line ${e.line}): ${e.message}`
        : e instanceof ParseError ? `Parse Error (line ${e.line}): ${e.message}`
        : e instanceof RuntimeError ? `Error: ${e.message}`
        : `Error: ${e.message ?? e}`
      setItems(prev => [...prev, { type: 'error', text: msg + '\n' }])
    }
    updateEnvSnapshot()
  }, [updateEnvSnapshot])

  const handleSubmit = useCallback(() => {
    if (acVisible) { setAcVisible(false); return }
    const code = multiline ? multiline + '\n' + input : input
    if (!code.trim()) return
    if (checkContinuation(code)) { setMultiline(code); setInput(''); return }
    setMultiline('')
    const newHist = [code, ...history.filter(h => h !== code)].slice(0, 200)
    setHistory(newHist)
    try { localStorage.setItem('mf_history', JSON.stringify(newHist)) } catch {}
    setHistIdx(-1); setInput('')
    executeCode(code)
  }, [input, multiline, executeCode, history, acVisible])

  // Extract current word for autocomplete
  const updateAcWord = useCallback((val: string) => {
    const match = val.match(/([a-zA-Z_]\w*)$/)
    if (match && match[1].length >= 2) { setAcWord(match[1]); setAcVisible(true); setAcIdx(0) }
    else { setAcVisible(false); setAcWord('') }
  }, [])

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value)
    updateAcWord(e.target.value)
  }, [updateAcWord])

  const applyAutocomplete = useCallback((name: string) => {
    const match = input.match(/([a-zA-Z_]\w*)$/)
    if (match) setInput(input.slice(0, input.length - match[1].length) + name)
    else setInput(input + name)
    setAcVisible(false)
    inputRef.current?.focus()
  }, [input])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (acVisible) {
      if (e.key === 'Tab' || (e.key === 'Enter' && acIdx >= 0)) { e.preventDefault(); /* autocomplete picks up via Autocomplete component */ return }
      if (e.key === 'ArrowDown') { e.preventDefault(); setAcIdx(i => i + 1); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setAcIdx(i => Math.max(i - 1, 0)); return }
      if (e.key === 'Escape') { setAcVisible(false); return }
    }
    if (e.key === 'Tab' && !acVisible) { e.preventDefault(); updateAcWord(input); return }
    if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); setMultiline(prev => prev ? prev + '\n' + input : input); setInput(''); return }
    if (e.key === 'Enter') { e.preventDefault(); handleSubmit(); return }
    if (e.key === 'ArrowUp' && !acVisible) { e.preventDefault(); const idx = Math.min(histIdx + 1, history.length - 1); setHistIdx(idx); if (history[idx]) setInput(history[idx]) }
    if (e.key === 'ArrowDown' && !acVisible) { e.preventDefault(); const idx = Math.max(histIdx - 1, -1); setHistIdx(idx); setInput(idx >= 0 ? history[idx] : '') }
    if (e.key === 'l' && e.ctrlKey) { e.preventDefault(); setItems([]) }
    if (e.key === 's' && e.ctrlKey) { e.preventDefault(); shareCode(input || editorCode) }
    if (e.key === 'k' && e.ctrlKey) { e.preventDefault(); setCmdPaletteOpen(true) }
  }, [handleSubmit, histIdx, history, input, editorCode, acVisible, acIdx, updateAcWord])

  const runEditor = useCallback(() => { if (editorCode.trim()) executeCode(editorCode) }, [editorCode, executeCode])

  const handleEditorKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); runEditor(); return }
    if (e.key === 'Tab') {
      e.preventDefault()
      const ta = e.currentTarget; const start = ta.selectionStart, end = ta.selectionEnd
      setEditorCode(editorCode.slice(0, start) + '  ' + editorCode.slice(end))
      setTimeout(() => { ta.selectionStart = ta.selectionEnd = start + 2 }, 0)
    }
    if (e.key === 's' && e.ctrlKey) { e.preventDefault(); shareCode(editorCode) }
  }, [runEditor, editorCode])

  const shareCode = useCallback((code: string) => {
    if (!code.trim()) return
    const url = `${window.location.origin}/playground?code=${encodeURIComponent(code)}`
    navigator.clipboard.writeText(url).then(() => { setShareMsg('Copied!'); setTimeout(() => setShareMsg(''), 2000) })
    .catch(() => { setShareMsg('Failed'); setTimeout(() => setShareMsg(''), 2000) })
  }, [])

  const resetSession = useCallback(() => {
    const interp = new Interpreter()
    interp.setOutput((text) => {
      if (text.startsWith('__audio:')) setItems(prev => [...prev, { type: 'audio', audioSrc: text.slice(8).trim() }])
      else if (text.startsWith('__plot3d:')) { try { const d = JSON.parse(text.slice(9).trim()); setItems(prev => [...prev, { type: 'plot3d', plot3d: d }]) } catch {} }
      else setItems(prev => [...prev, { type: 'output', text }])
    })
    interp.setPlotCallback((fig) => setItems(prev => [...prev, { type: 'plot', figure: JSON.parse(JSON.stringify(fig)) }]))
    interpRef.current = interp; setItems([]); setEnvSnapshot(null)
  }, [])

  // CSV drag & drop
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragOver(false)
    const file = e.dataTransfer.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      if (!text) return
      const lines = text.trim().split('\n')
      const data = lines.map(line => line.split(/[,\t]/).map(v => parseFloat(v.trim())).filter(v => !isNaN(v)))
      const rows = data.length, cols = Math.max(...data.map(r => r.length))
      const flat: number[] = []
      for (const row of data) { for (let c = 0; c < cols; c++) flat.push(row[c] ?? 0) }
      if (interpRef.current) {
        const varName = file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_]/g, '_').replace(/^[0-9]/, '_$&')
        const code = `${varName} = reshape([${flat.join(',')}], ${cols}, ${rows})'`
        executeCode(code)
        setItems(prev => [...prev, { type: 'info', text: `Imported ${file.name} as '${varName}' (${rows}x${cols} matrix)\n` }])
      }
    }
    reader.readAsText(file)
  }, [executeCode])

  const handleCmdSelect = useCallback((entry: HelpEntry) => {
    executeCode(`help('${entry.name}')`)
  }, [executeCode])

  const handleExampleClick = useCallback((code: string) => {
    if (isEditorMode) setEditorCode(code); else executeCode(code)
  }, [isEditorMode, executeCode])

  return (
    <div className={styles.playground}>
      <header className={styles.header}>
        <a href="/" className={styles.headerLogo}>
          <span className={styles.logoIcon}>M</span>
          <span>MatFree</span>
        </a>
        <div className={styles.headerTabs}>
          <button className={`${styles.tab} ${!isEditorMode ? styles.tabActive : ''}`} onClick={() => setIsEditorMode(false)}>Terminal</button>
          <button className={`${styles.tab} ${isEditorMode ? styles.tabActive : ''}`} onClick={() => setIsEditorMode(true)}>Editor</button>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.actionBtn} onClick={() => setShowAI(v => !v)} title="AI Assistant">
            {showAI ? 'Hide AI' : 'AI'}
          </button>
          <button className={styles.actionBtn} onClick={() => setCmdPaletteOpen(true)} title="Command Palette (Ctrl+K)">
            Search
          </button>
          <button className={styles.actionBtn} onClick={() => setShowFiles(v => !v)} title="File browser">
            Files
          </button>
          <button className={styles.actionBtn} onClick={() => setShowVars(v => !v)}>
            {showVars ? 'Hide Vars' : 'Vars'}
          </button>
          <button className={styles.actionBtn} onClick={() => {
            setExportLang(exportLang ? null : 'python')
          }} title="Export to Python/Julia">
            Export
          </button>
          <a href="/notebook" className={styles.actionBtn} style={{ textDecoration: 'none' }}>Notebook</a>
          <button className={styles.actionBtn} onClick={() => setShowShortcuts(s => !s)}>Keys</button>
          <button className={styles.actionBtn} onClick={() => shareCode(isEditorMode ? editorCode : input)}>
            {shareMsg || 'Share'}
          </button>
          <button className={styles.resetBtn} onClick={resetSession}>Reset</button>
        </div>
      </header>

      {showShortcuts && (
        <div className={styles.shortcutsBar}>
          {SHORTCUTS.map((s, i) => (<span key={i} className={styles.shortcut}><kbd>{s.keys}</kbd> {s.desc}</span>))}
          <button className={styles.shortcutsClose} onClick={() => setShowShortcuts(false)}>close</button>
        </div>
      )}

      <div className={styles.body}>
        {showFiles ? (
          <aside className={styles.sidebar}>
            <FileTree
              visible={showFiles}
              onOpen={(f: MFFile) => { setEditorCode(f.content); setIsEditorMode(true) }}
              currentCode={editorCode}
              currentName={fileName}
              onNameChange={setFileName}
            />
          </aside>
        ) : (
          <aside className={styles.sidebar}>
            {EXAMPLES.map((cat, ci) => (
              <div key={ci} className={styles.sideSection}>
                <h3>{cat.cat}</h3>
                {cat.items.map((ex, i) => (
                  <button key={i} className={styles.exBtn} onClick={() => handleExampleClick(ex.code)}>{ex.name}</button>
                ))}
              </div>
            ))}
          </aside>
        )}

        <div
          className={`${styles.mainArea} ${isDragOver ? styles.dragOver : ''}`}
          onDragOver={e => { e.preventDefault(); setIsDragOver(true) }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
        >
          {isDragOver && <div className={styles.dropOverlay}>Drop CSV file to import</div>}

          {isEditorMode && (
            <div className={styles.editor}>
              <div className={styles.editorBar}>
                <span>script.m</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className={styles.runBtn} onClick={runEditor}>Run (Ctrl+Enter)</button>
                </div>
              </div>
              <div className={styles.editorWrap}>
                <div className={styles.lineNumbers}>
                  {editorCode.split('\n').map((_, i) => <div key={i}>{i + 1}</div>)}
                </div>
                <textarea
                  className={styles.editorArea}
                  value={editorCode}
                  onChange={e => setEditorCode(e.target.value)}
                  onKeyDown={handleEditorKeyDown}
                  spellCheck={false}
                  placeholder="Write your code here..."
                />
              </div>
            </div>
          )}

          <div className={`${styles.terminal} ${isEditorMode ? styles.terminalSplit : ''}`} ref={termRef} onClick={() => inputRef.current?.focus()}>
            {items.map((item, i) => {
              if (item.type === 'plot' && item.figure) return <div key={i} className={styles.plotWrap}><PlotCanvas figure={item.figure} /></div>
              if (item.type === 'plot3d' && item.plot3d) return <div key={i} className={styles.plotWrap}><Plot3D data={item.plot3d} /></div>
              if (item.type === 'latex' && item.html) return <div key={i} className={styles.latexWrap} dangerouslySetInnerHTML={{ __html: item.html }} />
              if (item.type === 'audio' && item.audioSrc) return (
                <div key={i} className={styles.audioWrap}>
                  <span style={{ color: '#22c55e', fontSize: 12, marginRight: 8 }}>Audio</span>
                  <audio controls src={item.audioSrc} style={{ height: 28, verticalAlign: 'middle' }} />
                </div>
              )
              return (
                <div key={i} className={`${styles.line} ${styles[item.type]}`}>
                  {item.type === 'input' && <span className={styles.promptChar}>&gt;&gt; </span>}
                  <span style={{ whiteSpace: 'pre-wrap' }}>{item.text}</span>
                </div>
              )
            })}
            <div className={styles.inputLine} style={{ position: 'relative' }}>
              <Autocomplete
                query={acWord}
                visible={acVisible}
                selectedIdx={acIdx}
                env={envSnapshot}
                onSelect={applyAutocomplete}
              />
              <span className={styles.promptChar}>{multiline ? '.. ' : '>> '}</span>
              <input
                ref={inputRef}
                className={styles.inputField}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                onBlur={() => setTimeout(() => setAcVisible(false), 150)}
                autoFocus
                spellCheck={false}
                placeholder={items.length <= 2 ? "Try: x = linspace(0, 2*pi, 100); plot(x, sin(x))" : ""}
              />
            </div>
          </div>
        </div>

        {showVars && (
          <aside className={styles.rightPanel}>
            <h3>Workspace</h3>
            <VariableExplorer env={envSnapshot} onInspect={(name) => executeCode(`disp(${name})`)} />
          </aside>
        )}
      </div>

      <CommandPalette
        open={cmdPaletteOpen}
        onClose={() => setCmdPaletteOpen(false)}
        onSelect={handleCmdSelect}
        onRun={executeCode}
      />

      <AIAssistant
        visible={showAI}
        onClose={() => setShowAI(false)}
        onRunCode={executeCode}
      />

      {exportLang && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setExportLang(null)}>
          <div style={{ background: '#13131d', border: '1px solid #3a3a52', borderRadius: 12, width: 600, maxHeight: '80vh', overflow: 'auto', padding: 20 }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0, color: '#e4e4ef', fontSize: 16 }}>Export Code</h3>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setExportLang('python')} style={{ padding: '4px 12px', borderRadius: 6, border: exportLang === 'python' ? '1px solid #4f46e5' : '1px solid #3a3a52', background: exportLang === 'python' ? 'rgba(79,70,229,0.15)' : 'transparent', color: '#e4e4ef', cursor: 'pointer', fontSize: 12 }}>Python</button>
                <button onClick={() => setExportLang('julia')} style={{ padding: '4px 12px', borderRadius: 6, border: exportLang === 'julia' ? '1px solid #22c55e' : '1px solid #3a3a52', background: exportLang === 'julia' ? 'rgba(34,197,94,0.15)' : 'transparent', color: '#e4e4ef', cursor: 'pointer', fontSize: 12 }}>Julia</button>
              </div>
            </div>
            <pre style={{ background: '#0a0a0f', padding: 16, borderRadius: 8, color: '#c4c4d8', fontSize: 13, fontFamily: 'var(--font-mono)', lineHeight: 1.5, overflow: 'auto', whiteSpace: 'pre-wrap', maxHeight: 400 }}>
              {(() => { try { return exportLang === 'julia' ? toJulia(editorCode || 'x = 1') : toPython(editorCode || 'x = 1') } catch (e: any) { return `% Export error: ${e.message}\n% Make sure your code is valid.` } })()}
            </pre>
            <button onClick={() => {
              try {
                const code = exportLang === 'julia' ? toJulia(editorCode || 'x = 1') : toPython(editorCode || 'x = 1')
                navigator.clipboard.writeText(code)
              } catch {}
            }} style={{ marginTop: 8, background: '#4f46e5', border: 'none', color: '#fff', padding: '6px 16px', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>Copy to Clipboard</button>
          </div>
        </div>
      )}
    </div>
  )
}

function checkContinuation(code: string): boolean {
  const kw = ['if', 'for', 'while', 'switch', 'try', 'function']
  let depth = 0
  for (const t of code.split(/\s+/)) { if (kw.includes(t)) depth++; if (t === 'end') depth-- }
  return depth > 0
}

export default function PlaygroundPage() {
  return (<Suspense fallback={<div style={{ background: '#0a0a0f', height: '100vh' }} />}><PlaygroundInner /></Suspense>)
}
