export interface CsvAssignment {
  varName: string
  /** MATLAB code that recreates the data, ending in ';' so it runs without echoing the matrix. */
  code: string
  rows: number
  cols: number
}

function toNumber(cell: string): number {
  const t = cell.trim().replace(/^"(.*)"$/, '$1').trim()
  if (t === '') return NaN
  if (/^[+-]?inf$/i.test(t)) return t.startsWith('-') ? -Infinity : Infinity
  return Number(t)
}

function literal(v: number): string {
  if (Number.isNaN(v)) return 'NaN'
  if (v === Infinity) return 'Inf'
  if (v === -Infinity) return '-Inf'
  return String(v)
}

/**
 * Parses the numeric part of a dropped CSV/TSV file. Rows without any number (headers,
 * blank lines) are skipped; empty or non-numeric cells become NaN, like readmatrix.
 */
export function csvToAssignment(fileName: string, text: string): CsvAssignment | null {
  const data = text.split(/\r?\n/)
    .map(line => line.split(/[,\t]/).map(toNumber))
    .filter(row => row.some(v => !Number.isNaN(v)))
  if (data.length === 0) return null
  const rows = data.length
  const cols = Math.max(...data.map(r => r.length))
  const body = data.map(row => Array.from({ length: cols }, (_, c) => literal(row[c] ?? NaN)).join(',')).join(';')
  const base = fileName.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_]/g, '_')
  const varName = !base ? 'data' : /^[a-zA-Z]/.test(base) ? base : 'x' + base
  return { varName, code: `${varName} = [${body}];`, rows, cols }
}

export const isValidIdentifier = (name: string) => /^[a-zA-Z]\w*$/.test(name)
