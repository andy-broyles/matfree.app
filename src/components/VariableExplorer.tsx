'use client'

import { useMemo } from 'react'
import type { Environment } from '@/engine/environment'
import type { Value } from '@/engine/value'

interface VarInfo {
  name: string
  typeLabel: string
  size: string
  preview: string
}

interface Props {
  env: Environment | null
  onInspect?: (name: string) => void
}

export default function VariableExplorer({ env, onInspect }: Props) {
  const vars = useMemo<VarInfo[]>(() => {
    if (!env) return []
    const names = env.variableNames()
    const SKIP = new Set(['pi', 'inf', 'Inf', 'nan', 'NaN', 'true', 'false', 'eps', 'i', 'j', 'ans', 'nargin', 'nargout'])
    return names
      .filter(n => !SKIP.has(n))
      .map(name => {
        const v = env.get(name) as Value
        if (!v) return null
        let typeLabel: string = v.type
        let size = '1x1'
        let preview = ''
        if (v.isMatrix()) {
          const m = v.matrix()
          size = `${m.rows}x${m.cols}`
          typeLabel = 'double'
          if (m.isScalar()) preview = String(m.scalarValue())
          else if (m.numel() <= 6) preview = `[${m.data.slice(0, 6).map(v => fmtShort(v)).join(', ')}]`
          else preview = `[${m.data.slice(0, 4).map(v => fmtShort(v)).join(', ')}, ...]`
        } else if (v.isString()) {
          typeLabel = 'char'
          size = `1x${v.string().length}`
          preview = `'${v.string().length > 20 ? v.string().slice(0, 20) + '...' : v.string()}'`
        } else if (v.isStruct()) {
          typeLabel = 'struct'
          const keys = Object.keys(v.struct())
          size = `1x1`
          preview = `{${keys.slice(0, 3).join(', ')}${keys.length > 3 ? ', ...' : ''}}`
        } else if (v.isCell()) {
          typeLabel = 'cell'
          size = `${v.cell().rows}x${v.cell().cols}`
          preview = '{...}'
        } else if (v.isFuncHandle()) {
          typeLabel = 'function_handle'
          preview = '@handle'
        }
        return { name, typeLabel, size, preview }
      })
      .filter(Boolean) as VarInfo[]
  }, [env])

  if (vars.length === 0) {
    return (
      <div style={styles.empty}>
        <div style={styles.emptyIcon}>{ }</div>
        <div style={styles.emptyText}>No variables in workspace</div>
      </div>
    )
  }

  return (
    <div style={styles.container}>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>Name</th>
            <th style={styles.th}>Value</th>
            <th style={styles.thSmall}>Size</th>
            <th style={styles.thSmall}>Type</th>
          </tr>
        </thead>
        <tbody>
          {vars.map(v => (
            <tr
              key={v.name}
              style={styles.row}
              onClick={() => onInspect?.(v.name)}
              title={`Click to inspect ${v.name}`}
            >
              <td style={styles.tdName}>{v.name}</td>
              <td style={styles.tdPreview}>{v.preview}</td>
              <td style={styles.tdSmall}>{v.size}</td>
              <td style={styles.tdType}>{v.typeLabel}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function fmtShort(v: number): string {
  if (Number.isNaN(v)) return 'NaN'
  if (!Number.isFinite(v)) return v > 0 ? 'Inf' : '-Inf'
  if (Number.isInteger(v)) return v.toString()
  return v.toPrecision(4)
}

const styles: Record<string, React.CSSProperties> = {
  container: { overflowX: 'auto', fontSize: 12, fontFamily: 'var(--font-mono, monospace)' },
  empty: { padding: 24, textAlign: 'center' },
  emptyIcon: { fontSize: 20, color: '#3a3a52', marginBottom: 6 },
  emptyText: { color: '#666680', fontSize: 12 },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', padding: '6px 8px', color: '#666680', fontWeight: 500, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid #2a2a3a' },
  thSmall: { textAlign: 'left', padding: '6px 8px', color: '#666680', fontWeight: 500, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid #2a2a3a', width: 60 },
  row: { cursor: 'pointer', transition: 'background 0.1s' },
  tdName: { padding: '5px 8px', color: '#818cf8', fontWeight: 600 },
  tdPreview: { padding: '5px 8px', color: '#c8c8dc', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  tdSmall: { padding: '5px 8px', color: '#888', width: 60 },
  tdType: { padding: '5px 8px', color: '#666680', width: 60, fontStyle: 'italic' },
}
