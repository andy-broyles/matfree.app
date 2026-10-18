'use client'

import { useMemo } from 'react'
import { allBuiltinNames } from '@/engine'

interface Props {
  query: string
  visible: boolean
  selectedIdx: number
  varNames: string[]
  onSelect: (name: string) => void
  style?: React.CSSProperties
}

export function getAutocompleteSuggestions(query: string, varNames: string[]): string[] {
  if (!query) return []
  const q = query.toLowerCase()
  const builtins = allBuiltinNames().filter(n => n.toLowerCase().startsWith(q) && n !== q)
  const vars = varNames.filter(n => n.toLowerCase().startsWith(q) && n !== q)
  return [...new Set([...vars, ...builtins])].sort().slice(0, 12)
}

export default function Autocomplete({ query, visible, selectedIdx, varNames, onSelect, style }: Props) {
  const suggestions = useMemo(
    () => (visible ? getAutocompleteSuggestions(query, varNames) : []),
    [query, visible, varNames],
  )

  if (!visible || suggestions.length === 0) return null

  return (
    <div style={{ ...styles.container, ...style }}>
      {suggestions.map((name, i) => (
        <div
          key={name}
          style={{ ...styles.item, ...(i === selectedIdx ? styles.itemActive : {}) }}
          onMouseDown={(e) => { e.preventDefault(); onSelect(name) }}
        >
          <span style={styles.name}>{name}</span>
        </div>
      ))}
      <div style={styles.hint}>Tab to complete</div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: { position: 'absolute', bottom: '100%', left: 32, background: '#1a1a26', border: '1px solid #2a2a3a', borderRadius: 8, boxShadow: '0 -4px 20px rgba(0,0,0,0.4)', overflow: 'hidden', zIndex: 100, minWidth: 200, marginBottom: 4 },
  item: { padding: '6px 12px', cursor: 'pointer', transition: 'background 0.1s', display: 'flex', alignItems: 'center' },
  itemActive: { background: '#2a2a3a' },
  name: { fontFamily: 'var(--font-mono, monospace)', fontSize: 13, color: '#c8c8dc' },
  hint: { padding: '4px 12px', fontSize: 11, color: '#666680', borderTop: '1px solid #2a2a3a' },
}
