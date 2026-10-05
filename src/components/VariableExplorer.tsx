'use client'

import type { VarSummary } from '@/engine/workspace'

interface Props {
  vars: VarSummary[]
  onInspect?: (name: string) => void
}

export default function VariableExplorer({ vars, onInspect }: Props) {
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
