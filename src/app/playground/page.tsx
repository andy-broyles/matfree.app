'use client'

import { useEffect, useRef, useState, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import styles from './playground.module.css'
import { Interpreter, LexerError, ParseError, RuntimeError } from '@/engine'

interface OutputLine {
  type: 'input' | 'output' | 'error'
  text: string
}

const EXAMPLES = [
  { name: 'Matrix Basics', code: 'A = [1 2 3; 4 5 6; 7 8 9];\ndisp(A)\nsize(A)' },
  { name: 'Linear Algebra', code: 'A = [2 1; 5 3];\ndisp(det(A))\nB = inv(A);\ndisp(B)\ndisp(A * B)' },
  { name: 'Functions', code: 'function result = factorial(n)\n  if n <= 1\n    result = 1;\n  else\n    result = n * factorial(n-1);\n  end\nend\nfactorial(10)' },
  { name: 'Statistics', code: 'x = [2 4 4 4 5 5 7 9];\nfprintf(\'Mean: %f\\n\', mean(x))\nfprintf(\'Std:  %f\\n\', std(x))\nfprintf(\'Med:  %f\\n\', median(x))' },
  { name: 'Anonymous Funcs', code: 'square = @(x) x^2;\ncube = @(x) x^3;\nfprintf(\'5^2 = %d\\n\', square(5))\nfprintf(\'3^3 = %d\\n\', cube(3))' },
  { name: 'Fibonacci', code: 'n = 15;\nfib = zeros(1, n);\nfib(1) = 1; fib(2) = 1;\nfor i = 3:n\n  fib(i) = fib(i-1) + fib(i-2);\nend\ndisp(fib)' },
]

function PlaygroundInner() {
  const searchParams = useSearchParams()
  const [lines, setLines] = useState<OutputLine[]>([])
  const [input, setInput] = useState('')
  const [history, setHistory] = useState<string[]>([])
  const [histIdx, setHistIdx] = useState(-1)
  const [multiline, setMultiline] = useState('')
  const [isEditorMode, setIsEditorMode] = useState(false)
  const [editorCode, setEditorCode] = useState('')
  const interpRef = useRef<Interpreter | null>(null)
  const termRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const editorRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const interp = new Interpreter()
    interp.setOutput((text) => {
      setLines(prev => [...prev, { type: 'output', text }])
    })
    interpRef.current = interp
    setLines([
      { type: 'output', text: 'MatFree v0.1.0 — Free Scientific Computing Environment\n' },
      { type: 'output', text: 'Type expressions below. Use Shift+Enter for multi-line input.\n\n' },
    ])

    const initialCode = searchParams.get('code')
    if (initialCode) {
      setIsEditorMode(true)
      setEditorCode(initialCode)
    }
  }, [searchParams])

  useEffect(() => {
    if (termRef.current) termRef.current.scrollTop = termRef.current.scrollHeight
  }, [lines])

  const executeCode = useCallback((code: string) => {
    if (!interpRef.current || !code.trim()) return
    setLines(prev => [...prev, { type: 'input', text: code }])
    try {
      const result = interpRef.current.execute(code)
      if (!result.isEmpty() && code.trim().slice(-1) !== ';') {
        // Result is already printed via output callback if it should be
      }
    } catch (e: any) {
      const msg = e instanceof LexerError ? `Lexer Error (line ${e.line}): ${e.message}`
        : e instanceof ParseError ? `Parse Error (line ${e.line}): ${e.message}`
        : e instanceof RuntimeError ? `Error: ${e.message}`
        : `Error: ${e.message ?? e}`
      setLines(prev => [...prev, { type: 'error', text: msg + '\n' }])
    }
  }, [])

  const handleSubmit = useCallback(() => {
    const code = multiline ? multiline + '\n' + input : input
    if (!code.trim()) return

    // Check if we need continuation (unmatched keywords)
    const needsContinuation = checkContinuation(code)
    if (needsContinuation) {
      setMultiline(code)
      setInput('')
      return
    }

    setMultiline('')
    setHistory(prev => [code, ...prev])
    setHistIdx(-1)
    setInput('')
    executeCode(code)
  }, [input, multiline, executeCode])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault()
      setMultiline(prev => prev ? prev + '\n' + input : input)
      setInput('')
      return
    }
    if (e.key === 'Enter') { e.preventDefault(); handleSubmit(); return }
    if (e.key === 'ArrowUp') { e.preventDefault(); const idx = Math.min(histIdx + 1, history.length - 1); setHistIdx(idx); if (history[idx]) setInput(history[idx]) }
    if (e.key === 'ArrowDown') { e.preventDefault(); const idx = Math.max(histIdx - 1, -1); setHistIdx(idx); setInput(idx >= 0 ? history[idx] : '') }
    if (e.key === 'l' && e.ctrlKey) { e.preventDefault(); setLines([]) }
  }, [handleSubmit, histIdx, history, input])

  const runEditor = useCallback(() => {
    if (!editorCode.trim()) return
    executeCode(editorCode)
  }, [editorCode, executeCode])

  const handleExampleClick = useCallback((code: string) => {
    if (isEditorMode) {
      setEditorCode(code)
    } else {
      executeCode(code)
    }
  }, [isEditorMode, executeCode])

  const focusInput = () => inputRef.current?.focus()

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
          <button className={styles.clearBtn} onClick={() => { setLines([]); interpRef.current = new Interpreter(); interpRef.current.setOutput((text) => setLines(prev => [...prev, { type: 'output', text }])) }}>
            Reset
          </button>
        </div>
      </header>

      <div className={styles.body}>
        <aside className={styles.sidebar}>
          <h3>Examples</h3>
          {EXAMPLES.map((ex, i) => (
            <button key={i} className={styles.exBtn} onClick={() => handleExampleClick(ex.code)}>{ex.name}</button>
          ))}
        </aside>

        <div className={styles.mainArea}>
          {isEditorMode && (
            <div className={styles.editor}>
              <div className={styles.editorBar}>
                <span>script.m</span>
                <button className={styles.runBtn} onClick={runEditor}>Run</button>
              </div>
              <textarea
                ref={editorRef}
                className={styles.editorArea}
                value={editorCode}
                onChange={e => setEditorCode(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); runEditor() } }}
                spellCheck={false}
                placeholder="Write your code here... (Ctrl+Enter to run)"
              />
            </div>
          )}

          <div className={`${styles.terminal} ${isEditorMode ? styles.terminalSplit : ''}`} ref={termRef} onClick={focusInput}>
            {lines.map((line, i) => (
              <div key={i} className={`${styles.line} ${styles[line.type]}`}>
                {line.type === 'input' && <span className={styles.promptChar}>&gt;&gt; </span>}
                <span style={{ whiteSpace: 'pre-wrap' }}>{line.text}</span>
              </div>
            ))}
            <div className={styles.inputLine}>
              <span className={styles.promptChar}>{multiline ? '.. ' : '>> '}</span>
              <input
                ref={inputRef}
                className={styles.inputField}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                autoFocus
                spellCheck={false}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function checkContinuation(code: string): boolean {
  const keywords = ['if', 'for', 'while', 'switch', 'try', 'function']
  let depth = 0
  const tokens = code.split(/\s+/)
  for (const t of tokens) {
    if (keywords.includes(t)) depth++
    if (t === 'end') depth--
  }
  return depth > 0
}

export default function PlaygroundPage() {
  return (
    <Suspense fallback={<div style={{ background: '#0a0a0f', height: '100vh' }} />}>
      <PlaygroundInner />
    </Suspense>
  )
}
