'use client'

import { useMemo } from 'react'
import { allBuiltinNames } from '@/engine'
import type { Environment } from '@/engine/environment'

interface Props {
  query: string
  visible: boolean
  selectedIdx: number
  env: Environment | null
  onSelect: (name: string) => void
  style?: React.CSSProperties
}

export default function Autocomplete({ query, visible, selectedIdx, env, onSelect, style }: Props) {
  const suggestions = useMemo(() => {
    if (!query || !visible) return []
    const q = query.toLowerCase()
    const builtins = allBuiltinNames().filter(n => n.toLowerCase().startsWith(q) && n !== q)
    const vars = env ? env.variableNames().filter(n => n.toLowerCase().startsWith(q) && n !== q) : []
    const all = [...new Set([...vars, ...builtins])].sort()
    return all.slice(0, 12)
  }, [query, visible, env])

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
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: { position: 'absolute', bottom: '100%', left: 32, background: '#1a1a26', border: '1px solid #2a2a3a', borderRadius: 8, boxShadow: '0 -4px 20px rgba(0,0,0,0.4)', overflow: 'hidden', zIndex: 100, minWidth: 200, marginBottom: 4 },
  item: { padding: '6px 12px', cursor: 'pointer', transition: 'background 0.1s', display: 'flex', alignItems: 'center' },
  itemActive: { background: '#2a2a3a' },
  name: { fontFamily: 'var(--font-mono, monospace)', fontSize: 13, color: '#c8c8dc' },
}
