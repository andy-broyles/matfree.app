'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { getAllHelp } from '@/engine'
import type { HelpEntry } from '@/engine'

interface Props {
  open: boolean
  onClose: () => void
  onSelect: (entry: HelpEntry) => void
  onRun: (code: string) => void
}

export default function CommandPalette({ open, onClose, onSelect, onRun }: Props) {
  const [query, setQuery] = useState('')
  const [selectedIdx, setSelectedIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const allDocs = useMemo(() => getAllHelp(), [])

  const results = useMemo(() => {
    if (!query.trim()) return allDocs.slice(0, 30)
    const q = query.toLowerCase()
    return allDocs.filter(d =>
      d.name.toLowerCase().includes(q) ||
      d.description.toLowerCase().includes(q) ||
      d.category.toLowerCase().includes(q) ||
      d.syntax.toLowerCase().includes(q)
    ).slice(0, 30)
  }, [query, allDocs])

  useEffect(() => {
    if (open) {
      setQuery(''); setSelectedIdx(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  useEffect(() => { setSelectedIdx(0) }, [results])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx(i => Math.min(i + 1, results.length - 1)) }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIdx(i => Math.max(i - 1, 0)) }
      if (e.key === 'Enter' && results[selectedIdx]) {
        e.preventDefault()
        onSelect(results[selectedIdx])
        onClose()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, results, selectedIdx, onSelect, onClose])

  // Scroll selected into view
  useEffect(() => {
    const el = listRef.current?.children[selectedIdx] as HTMLElement
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedIdx])

  if (!open) return null

  const catColors: Record<string, string> = {
    'Math': '#6366f1', 'Matrix': '#06b6d4', 'Linear Algebra': '#8b5cf6',
    'Statistics': '#f43f5e', 'Plotting': '#22c55e', 'Signal Processing': '#f59e0b',
    'Polynomials': '#ec4899', 'Calculus': '#14b8a6', 'Optimization': '#f97316',
    'Special Functions': '#a855f7', 'I/O': '#64748b', 'Utility': '#64748b',
    'Interpolation': '#06b6d4', 'Differential Equations': '#ef4444',
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <input
          ref={inputRef}
          style={styles.input}
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search functions, operations, topics..."
          spellCheck={false}
        />
        <div style={styles.list} ref={listRef}>
          {results.map((entry, i) => (
            <div
              key={entry.name}
              style={{ ...styles.item, ...(i === selectedIdx ? styles.itemActive : {}) }}
              onClick={() => { onSelect(entry); onClose() }}
              onMouseEnter={() => setSelectedIdx(i)}
            >
              <div style={styles.itemLeft}>
                <span style={styles.itemName}>{entry.name}</span>
                <span style={styles.itemSyntax}>{entry.syntax}</span>
              </div>
              <div style={styles.itemRight}>
                <span style={{ ...styles.itemCat, color: catColors[entry.category] ?? '#888' }}>{entry.category}</span>
              </div>
            </div>
          ))}
          {results.length === 0 && <div style={styles.empty}>No results found</div>}
        </div>
        <div style={styles.footer}>
          <span><kbd style={styles.kbd}>&#x2191;&#x2193;</kbd> navigate</span>
          <span><kbd style={styles.kbd}>Enter</kbd> select</span>
          <span><kbd style={styles.kbd}>Esc</kbd> close</span>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', paddingTop: 80, zIndex: 1000, backdropFilter: 'blur(4px)' },
  modal: { width: 560, maxHeight: '60vh', background: '#12121a', border: '1px solid #2a2a3a', borderRadius: 12, display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.5)', overflow: 'hidden' },
  input: { background: 'transparent', border: 'none', borderBottom: '1px solid #2a2a3a', padding: '14px 18px', fontSize: 15, color: '#e4e4ef', outline: 'none', fontFamily: 'var(--font-mono, monospace)' },
  list: { flex: 1, overflowY: 'auto', padding: '4px 0' },
  item: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 16px', cursor: 'pointer', transition: 'background 0.1s' },
  itemActive: { background: '#1e1e2e' },
  itemLeft: { display: 'flex', gap: 12, alignItems: 'center' },
  itemName: { fontFamily: 'var(--font-mono, monospace)', fontSize: 13, fontWeight: 600, color: '#818cf8' },
  itemSyntax: { fontSize: 12, color: '#666680', fontFamily: 'var(--font-mono, monospace)' },
  itemRight: {},
  itemCat: { fontSize: 10, fontWeight: 500, letterSpacing: '0.5px', textTransform: 'uppercase' },
  empty: { padding: 24, textAlign: 'center', color: '#666680', fontSize: 13 },
  footer: { display: 'flex', gap: 16, padding: '8px 16px', borderTop: '1px solid #2a2a3a', fontSize: 11, color: '#666680' },
  kbd: { background: '#1e1e2e', border: '1px solid #2a2a3a', borderRadius: 3, padding: '1px 5px', fontFamily: 'var(--font-mono, monospace)', fontSize: 10, color: '#a0a0b8', marginRight: 4 },
}
