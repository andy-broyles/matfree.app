'use client'

import { useState, useRef, useEffect } from 'react'
import katex from 'katex'

function exprToLatex(expr: string): string {
  // Convert MatFree-style expression to LaTeX for preview
  let s = expr
    .replace(/\*/g, ' \\cdot ')
    .replace(/\bsin\b/g, '\\sin')
    .replace(/\bcos\b/g, '\\cos')
    .replace(/\btan\b/g, '\\tan')
    .replace(/\bexp\b/g, '\\exp')
    .replace(/\blog\b/g, '\\ln')
    .replace(/\bsqrt\b/g, '\\sqrt')
    .replace(/\bpi\b/g, '\\pi')
    .replace(/\binf\b/g, '\\infty')
  // sqrt(...) -> \sqrt{...}
  s = s.replace(/\\sqrt\s*\(([^)]+)\)/g, '\\sqrt{$1}')
  return s || '\\quad'
}

const SYMBOLS: { label: string; insert: string; title?: string }[] = [
  { label: 'x', insert: 'x', title: 'variable x' },
  { label: 'y', insert: 'y', title: 'variable y' },
  { label: 't', insert: 't', title: 'variable t' },
  { label: 'n', insert: 'n', title: 'variable n' },
  { label: 'π', insert: 'pi', title: 'pi' },
  { label: 'e', insert: 'e', title: 'euler' },
  { label: '^', insert: '^', title: 'power' },
  { label: '⁄', insert: '/', title: 'divide' },
  { label: '√', insert: 'sqrt(', title: 'square root' },
  { label: '( )', insert: '()', title: 'parentheses' },
  { label: 'sin', insert: 'sin()', title: 'sine' },
  { label: 'cos', insert: 'cos()', title: 'cosine' },
  { label: 'tan', insert: 'tan()', title: 'tangent' },
  { label: 'exp', insert: 'exp()', title: 'exponential' },
  { label: 'log', insert: 'log()', title: 'logarithm' },
  { label: '+', insert: '+' },
  { label: '−', insert: '-' },
  { label: '×', insert: '*' },
]

const TEMPLATES: { label: string; expr: string }[] = [
  { label: 'x²', expr: 'x^2' },
  { label: 'x²−5x+6', expr: 'x^2 - 5*x + 6' },
  { label: 'sin(x)', expr: 'sin(x)' },
  { label: 'cos²(x)', expr: 'cos(x)^2' },
  { label: 'eˣ', expr: 'exp(x)' },
  { label: '√x', expr: 'sqrt(x)' },
  { label: '1/x', expr: '1/x' },
  { label: 'x³+sin(x²)', expr: 'x^3 + sin(x^2)' },
]

interface Props {
  value: string
  onChange: (expr: string) => void
  onSubmit?: (expr: string) => void
  placeholder?: string
  onInsertCode?: (code: string) => void
}

export default function MathEquationEditor({ value, onChange, onSubmit, placeholder = 'Type or tap to build an expression', onInsertCode }: Props) {
  const [preview, setPreview] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!value.trim()) {
      setPreview('')
      return
    }
    try {
      const latex = exprToLatex(value)
      setPreview(katex.renderToString(latex, { throwOnError: false, displayMode: true }))
    } catch {
      setPreview('')
    }
  }, [value])

  const insert = (text: string) => {
    const input = inputRef.current
    const start = input?.selectionStart ?? value.length
    const end = input?.selectionEnd ?? value.length
    const before = value.slice(0, start)
    const after = value.slice(end)
    const newVal = before + text + after
    onChange(newVal)
    requestAnimationFrame(() => {
      input?.focus()
      const pos = start + text.length
      if (text.endsWith('()')) input?.setSelectionRange(pos - 1, pos - 1)
      else input?.setSelectionRange(pos, pos)
    })
  }

  const applyTemplate = (expr: string) => {
    onChange(expr)
    inputRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && onSubmit && value.trim()) {
      e.preventDefault()
      onSubmit(value.trim())
    }
  }

  const insertAsCode = (action: 'diff' | 'int' | 'solve' | 'plot') => {
    const expr = value.trim()
    if (!expr) return
    const varName = 'x'
    let code = ''
    if (action === 'diff') code = `symdiff('${expr}', '${varName}')`
    else if (action === 'int') code = `symint('${expr}', '${varName}')`
    else if (action === 'solve') code = `symsolve('${expr}', '${varName}')`
    else if (action === 'plot') code = `symplot('${expr}', '${varName}', [-10 10])`
    onInsertCode?.(code)
  }

  return (
    <div style={{
      background: '#0e0e16',
      border: '1px solid #2a2a3a',
      borderRadius: 10,
      overflow: 'hidden',
    }}>
      <div style={{ padding: '10px 12px', borderBottom: '1px solid #2a2a3a', display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        {SYMBOLS.map((s, i) => (
          <button
            key={i}
            onClick={() => insert(s.insert)}
            title={s.title ?? s.insert}
            style={{
              background: '#1e1e2e',
              border: '1px solid #3a3a52',
              color: '#c4c4d8',
              padding: '4px 10px',
              borderRadius: 6,
              fontSize: 13,
              cursor: 'pointer',
              fontFamily: 'var(--font-mono)',
              minWidth: 36,
            }}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            ref={inputRef}
            value={value}
            onChange={e => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            spellCheck={false}
            style={{
              flex: 1,
              background: '#13131d',
              border: '1px solid #3a3a52',
              borderRadius: 6,
              color: '#e4e4ef',
              padding: '8px 12px',
              fontSize: 14,
              fontFamily: 'var(--font-mono)',
              outline: 'none',
            }}
          />
          {onSubmit && value.trim() && (
            <button
              onClick={() => onSubmit(value.trim())}
              style={{
                background: '#4f46e5',
                border: 'none',
                color: '#fff',
                padding: '8px 16px',
                borderRadius: 6,
                fontSize: 13,
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              Run
            </button>
          )}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
          <span style={{ color: '#666680', fontSize: 11, marginRight: 4 }}>Templates:</span>
          {TEMPLATES.map((t, i) => (
            <button
              key={i}
              onClick={() => applyTemplate(t.expr)}
              style={{
                background: 'transparent',
                border: '1px solid #3a3a52',
                color: '#a0a0b8',
                padding: '2px 8px',
                borderRadius: 4,
                fontSize: 11,
                cursor: 'pointer',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        {preview && (
          <div
            style={{
              padding: '12px 14px',
              background: '#0a0a0f',
              borderRadius: 6,
              border: '1px solid #1e1e2e',
              overflow: 'auto',
            }}
            dangerouslySetInnerHTML={{ __html: preview }}
          />
        )}
        {onInsertCode && value.trim() && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button onClick={() => insertAsCode('diff')} style={actionBtn}>d/dx</button>
            <button onClick={() => insertAsCode('int')} style={actionBtn}>∫ dx</button>
            <button onClick={() => insertAsCode('solve')} style={actionBtn}>Solve</button>
            <button onClick={() => insertAsCode('plot')} style={actionBtn}>Plot</button>
          </div>
        )}
      </div>
    </div>
  )
}

const actionBtn: React.CSSProperties = {
  background: '#1e1e2e',
  border: '1px solid #3a3a52',
  color: '#818cf8',
  padding: '4px 12px',
  borderRadius: 6,
  fontSize: 12,
  cursor: 'pointer',
  fontWeight: 500,
}
