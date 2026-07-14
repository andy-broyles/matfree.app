'use client'

import { useMemo, useRef, useCallback, useState, useEffect, type KeyboardEvent, type CSSProperties } from 'react'
import { allBuiltinNames } from '@/engine'
import styles from './CodeEditor.module.css'

const KEYWORDS = new Set([
  'function', 'end', 'if', 'else', 'elseif', 'for', 'while', 'return',
  'break', 'continue', 'switch', 'case', 'otherwise', 'try', 'catch',
  'global', 'persistent', 'true', 'false', 'classdef', 'properties',
  'methods', 'events', 'enumeration',
])

const PAIR: Record<string, string> = { '(': ')', '[': ']', '{': '}', "'": "'" }
const builtins = new Set(allBuiltinNames().map(n => n.toLowerCase()))

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Lightweight MATLAB-style highlighter for the script editor. */
export function highlightMatlab(code: string): string {
  let out = ''
  let i = 0
  const n = code.length

  while (i < n) {
    if (code[i] === '%') {
      let j = i
      while (j < n && code[j] !== '\n') j++
      out += `<span class="${styles.tokComment}">${escapeHtml(code.slice(i, j))}</span>`
      i = j
      continue
    }

    if (code[i] === "'") {
      let j = i + 1
      while (j < n) {
        if (code[j] === "'" && code[j + 1] === "'") { j += 2; continue }
        if (code[j] === "'") { j++; break }
        if (code[j] === '\n') break
        j++
      }
      out += `<span class="${styles.tokString}">${escapeHtml(code.slice(i, j))}</span>`
      i = j
      continue
    }

    if (/[0-9]/.test(code[i]) || (code[i] === '.' && /[0-9]/.test(code[i + 1] ?? ''))) {
      let j = i
      while (j < n && /[0-9.]/.test(code[j])) j++
      if (j < n && /[eE]/.test(code[j])) {
        j++
        if (j < n && /[+-]/.test(code[j])) j++
        while (j < n && /[0-9]/.test(code[j])) j++
      }
      out += `<span class="${styles.tokNumber}">${escapeHtml(code.slice(i, j))}</span>`
      i = j
      continue
    }

    if (/[a-zA-Z_]/.test(code[i])) {
      let j = i
      while (j < n && /\w/.test(code[j])) j++
      const word = code.slice(i, j)
      const lower = word.toLowerCase()
      if (KEYWORDS.has(lower)) out += `<span class="${styles.tokKeyword}">${escapeHtml(word)}</span>`
      else if (builtins.has(lower)) out += `<span class="${styles.tokBuiltin}">${escapeHtml(word)}</span>`
      else out += escapeHtml(word)
      i = j
      continue
    }

    out += escapeHtml(code[i])
    i++
  }

  return out || ' '
}

function lineIndent(line: string): string {
  const m = line.match(/^[ \t]*/)
  return m ? m[0] : ''
}

interface Props {
  value: string
  onChange: (value: string) => void
  onKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>) => void
  placeholder?: string
  className?: string
  style?: CSSProperties
  /** Grow with content (notebook cells). Default fills parent. */
  autoHeight?: boolean
  minHeight?: number
}

export default function CodeEditor({
  value,
  onChange,
  onKeyDown,
  placeholder,
  className,
  style,
  autoHeight = false,
  minHeight = 120,
}: Props) {
  const taRef = useRef<HTMLTextAreaElement>(null)
  const preRef = useRef<HTMLPreElement>(null)
  const [findOpen, setFindOpen] = useState(false)
  const [findQuery, setFindQuery] = useState('')
  const [findIdx, setFindIdx] = useState(0)
  const html = useMemo(() => highlightMatlab(value), [value])
  const lineCount = Math.max(1, value.split('\n').length)
  const autoH = autoHeight ? Math.max(minHeight, lineCount * 20.8 + 24) : undefined

  const syncScroll = useCallback(() => {
    const ta = taRef.current
    const pre = preRef.current
    if (!ta || !pre) return
    pre.scrollTop = ta.scrollTop
    pre.scrollLeft = ta.scrollLeft
  }, [])

  const setSelection = (start: number, end: number) => {
    const ta = taRef.current
    if (!ta) return
    requestAnimationFrame(() => {
      ta.focus()
      ta.setSelectionRange(start, end)
      syncScroll()
    })
  }

  const findMatches = useCallback(() => {
    if (!findQuery) return [] as number[]
    const q = findQuery
    const hits: number[] = []
    let from = 0
    const lower = value.toLowerCase()
    const needle = q.toLowerCase()
    while (from <= lower.length) {
      const i = lower.indexOf(needle, from)
      if (i < 0) break
      hits.push(i)
      from = i + Math.max(needle.length, 1)
    }
    return hits
  }, [findQuery, value])

  const jumpFind = useCallback((dir: 1 | -1) => {
    const hits = findMatches()
    if (!hits.length) return
    const next = (findIdx + dir + hits.length * 10) % hits.length
    setFindIdx(next)
    setSelection(hits[next], hits[next] + findQuery.length)
  }, [findMatches, findIdx, findQuery])

  useEffect(() => {
    if (!findOpen || !findQuery) return
    const hits = findMatches()
    if (!hits.length) return
    const idx = Math.min(findIdx, hits.length - 1)
    setFindIdx(idx)
    setSelection(hits[idx], hits[idx] + findQuery.length)
  }, [findQuery, findOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget
    const start = ta.selectionStart
    const end = ta.selectionEnd

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
      e.preventDefault()
      setFindOpen(true)
      return
    }

    if (e.key === 'Escape' && findOpen) {
      e.preventDefault()
      setFindOpen(false)
      return
    }

    // Auto-indent on Enter
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      const before = value.slice(0, start)
      const lineStart = before.lastIndexOf('\n') + 1
      const curLine = value.slice(lineStart, start)
      let indent = lineIndent(curLine)
      if (/\b(function|if|for|while|switch|try|else|elseif|case|otherwise)\b\s*.*$/.test(curLine.trim())
        && !/\bend\b/.test(curLine)) {
        indent += '  '
      }
      e.preventDefault()
      const next = value.slice(0, start) + '\n' + indent + value.slice(end)
      onChange(next)
      setSelection(start + 1 + indent.length, start + 1 + indent.length)
      onKeyDown?.(e)
      return
    }

    // Tab indent / dedent
    if (e.key === 'Tab') {
      e.preventDefault()
      if (start !== end && value.slice(start, end).includes('\n')) {
        const blockStart = value.lastIndexOf('\n', start - 1) + 1
        const blockEnd = end
        const block = value.slice(blockStart, blockEnd)
        const nextBlock = e.shiftKey
          ? block.replace(/^ {1,2}/gm, '')
          : block.replace(/^(?!\s*$)/gm, '  ')
        onChange(value.slice(0, blockStart) + nextBlock + value.slice(blockEnd))
        setSelection(blockStart, blockStart + nextBlock.length)
      } else if (e.shiftKey) {
        const lineStart = value.lastIndexOf('\n', start - 1) + 1
        if (value.slice(lineStart, lineStart + 2) === '  ') {
          onChange(value.slice(0, lineStart) + value.slice(lineStart + 2))
          setSelection(Math.max(lineStart, start - 2), Math.max(lineStart, end - 2))
        }
      } else {
        onChange(value.slice(0, start) + '  ' + value.slice(end))
        setSelection(start + 2, start + 2)
      }
      return
    }

    // Auto-close brackets / quotes
    if (!e.ctrlKey && !e.metaKey && !e.altKey && PAIR[e.key] && start === end) {
      const close = PAIR[e.key]
      // Don't double-insert closing quote if next char is already that quote
      if (e.key === "'" && value[start] === "'") {
        e.preventDefault()
        setSelection(start + 1, start + 1)
        return
      }
      if (e.key !== "'" || /[\s([{=,;]$/.test(value.slice(Math.max(0, start - 1), start)) || start === 0) {
        e.preventDefault()
        const next = value.slice(0, start) + e.key + (start === end ? close : '') + value.slice(end)
        onChange(start === end ? next : value.slice(0, start) + e.key + value.slice(start, end) + close + value.slice(end))
        if (start === end) setSelection(start + 1, start + 1)
        else setSelection(start + 1, end + 1)
        return
      }
    }

    // Skip over closing bracket if already there
    if ((e.key === ')' || e.key === ']' || e.key === '}') && value[start] === e.key && start === end) {
      e.preventDefault()
      setSelection(start + 1, start + 1)
      return
    }

    onKeyDown?.(e)
  }

  return (
    <div
      className={`${styles.wrap} ${autoHeight ? styles.autoHeight : ''} ${className ?? ''}`}
      style={{ ...style, ...(autoH ? { height: autoH, minHeight } : {}) }}
    >
      {findOpen && (
        <div className={styles.findBar}>
          <input
            autoFocus
            className={styles.findInput}
            value={findQuery}
            placeholder="Find…"
            onChange={e => { setFindQuery(e.target.value); setFindIdx(0) }}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); jumpFind(e.shiftKey ? -1 : 1) }
              if (e.key === 'Escape') { setFindOpen(false); taRef.current?.focus() }
            }}
          />
          <span className={styles.findCount}>
            {findQuery ? `${findMatches().length ? findIdx + 1 : 0}/${findMatches().length}` : ''}
          </span>
          <button type="button" className={styles.findBtn} onClick={() => jumpFind(-1)}>↑</button>
          <button type="button" className={styles.findBtn} onClick={() => jumpFind(1)}>↓</button>
          <button type="button" className={styles.findBtn} onClick={() => setFindOpen(false)}>×</button>
        </div>
      )}
      <pre
        ref={preRef}
        aria-hidden
        className={styles.highlight}
        dangerouslySetInnerHTML={{ __html: html + '\n' }}
      />
      <textarea
        ref={taRef}
        className={styles.input}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onScroll={syncScroll}
        spellCheck={false}
        placeholder={placeholder}
        aria-label="Script editor"
      />
    </div>
  )
}
