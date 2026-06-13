// MatFree Engine - Built-in Functions

import { Value, Matrix, RuntimeError, CellArray } from './value'
import type { Interpreter } from './interpreter'
import { getScientificBuiltin, hasScientificBuiltin, allScientificNames } from './scientific'
import { getSymbolicBuiltin, hasSymbolicBuiltin, allSymbolicNames } from './symbolic'
import { getAdvancedBuiltin, hasAdvancedBuiltin, allAdvancedNames } from './advanced'
import { getHelp, searchHelp } from './help'

type BuiltinFn = (args: Value[], interp: Interpreter) => Value

const builtins: Map<string, BuiltinFn> = new Map()

function reg(name: string, fn: BuiltinFn) { builtins.set(name, fn) }

function num(v: Value): number {
  if (v === undefined) throw new RuntimeError('Missing required argument')
  return v.toScalar()
}
function mat(v: Value): Matrix {
  if (v === undefined) throw new RuntimeError('Missing required argument')
  return v.toMatrix()
}

// ─── MATLAB reduction semantics ──────────────────────────────────────────────
// Vectors reduce to a scalar; matrices reduce column-wise to a row vector.
// An explicit dim argument (1 = down columns, 2 = across rows) overrides.

function isVecM(m: Matrix): boolean { return m.rows === 1 || m.cols === 1 }

/** Slices of m along dim: dim 1 yields each column, dim 2 yields each row. */
function dimSlices(m: Matrix, dim: number): number[][] {
  const out: number[][] = []
  if (dim === 2) {
    for (let r = 0; r < m.rows; r++) { const v: number[] = []; for (let c = 0; c < m.cols; c++) v.push(m.get(r, c)); out.push(v) }
  } else {
    for (let c = 0; c < m.cols; c++) { const v: number[] = []; for (let r = 0; r < m.rows; r++) v.push(m.get(r, c)); out.push(v) }
  }
  return out
}

function reduceDim(m: Matrix, dimArg: number | null, fn: (v: number[]) => number): Value {
  if (dimArg === null && isVecM(m)) return Value.fromScalar(fn([...m.data]))
  const dim = dimArg ?? 1
  const vals = dimSlices(m, dim).map(fn)
  return Value.fromMatrix(dim === 2 ? new Matrix(vals.length, 1, vals) : new Matrix(1, vals.length, vals))
}

function dimOf(a: Value[], i: number): number | null {
  return a.length > i && a[i] !== undefined ? Math.floor(a[i].toScalar()) : null
}

function sampleVariance(v: number[]): number {
  const mu = v.reduce((s, x) => s + x, 0) / v.length
  return v.reduce((s, x) => s + (x - mu) ** 2, 0) / Math.max(1, v.length - 1)
}

// Math functions
reg('sin', (a) => applyElem(a[0], Math.sin))
reg('cos', (a) => applyElem(a[0], Math.cos))
reg('tan', (a) => applyElem(a[0], Math.tan))
reg('asin', (a) => applyElem(a[0], Math.asin))
reg('acos', (a) => applyElem(a[0], Math.acos))
reg('atan', (a) => applyElem(a[0], Math.atan))
reg('atan2', (a) => { const m1 = mat(a[0]), m2 = mat(a[1]); return Value.fromMatrix(new Matrix(m1.rows, m1.cols, m1.data.map((v, i) => Math.atan2(v, m2.data[i])))) })
reg('sinh', (a) => applyElem(a[0], Math.sinh))
reg('cosh', (a) => applyElem(a[0], Math.cosh))
reg('tanh', (a) => applyElem(a[0], Math.tanh))
reg('exp', (a) => applyElem(a[0], Math.exp))
reg('log', (a) => applyElem(a[0], Math.log))
reg('log2', (a) => applyElem(a[0], Math.log2))
reg('log10', (a) => applyElem(a[0], Math.log10))
reg('sqrt', (a) => applyElem(a[0], Math.sqrt))
reg('abs', (a) => {
  const m = mat(a[0])
  // Complex values (e.g. from fft) -> magnitude
  if (m.imag) {
    const im = m.imag
    return Value.fromMatrix(new Matrix(m.rows, m.cols, m.data.map((re, i) => Math.hypot(re, im[i]))))
  }
  return Value.fromMatrix(new Matrix(m.rows, m.cols, m.data.map(Math.abs)))
})
reg('ceil', (a) => applyElem(a[0], Math.ceil))
reg('floor', (a) => applyElem(a[0], Math.floor))
reg('round', (a) => applyElem(a[0], Math.round))
reg('fix', (a) => applyElem(a[0], (v) => v > 0 ? Math.floor(v) : Math.ceil(v)))
reg('mod', (a) => { const m1 = mat(a[0]), m2 = mat(a[1]); return Value.fromMatrix(new Matrix(m1.rows, m1.cols, m1.data.map((v, i) => v - Math.floor(v / m2.data[i % m2.data.length]) * m2.data[i % m2.data.length]))) })
reg('rem', (a) => Value.fromScalar(num(a[0]) % num(a[1])))
reg('sign', (a) => applyElem(a[0], Math.sign))
// max/min: extremum(A), [m,i] = extremum(A), extremum(A,B) elementwise,
// extremum(A,[],dim). Vector → scalar; matrix → column-wise (MATLAB).
function extremum(a: Value[], interp: Interpreter, better: (x: number, y: number) => boolean): Value {
  // Two-arg elementwise with broadcasting: max(A, B)
  if (a.length === 2 && a[1] !== undefined && mat(a[1]).numel() > 0) {
    const m1 = mat(a[0]), m2 = mat(a[1])
    const rr = Math.max(m1.rows, m2.rows), cc = Math.max(m1.cols, m2.cols)
    const r = new Matrix(rr, cc)
    for (let i = 0; i < rr; i++) for (let j = 0; j < cc; j++) {
      const x = m1.getWithBroadcast(i, j), y = m2.getWithBroadcast(i, j)
      r.set(i, j, better(x, y) ? x : y)
    }
    return r.isScalar() ? Value.fromScalar(r.scalarValue()) : Value.fromMatrix(r)
  }
  // max(A) / max(A, [], dim)
  const m = mat(a[0])
  const dimArg = dimOf(a, 2)
  const wantIdx = interp.getNargout() >= 2
  const pick = (v: number[]): [number, number] => {
    let bi = 0
    for (let i = 1; i < v.length; i++) if (better(v[i], v[bi])) bi = i
    return [v[bi], bi + 1] // 1-based index
  }
  if (dimArg === null && isVecM(m)) {
    const [val, idx] = pick([...m.data])
    if (wantIdx) return Value.fromCell({ rows: 1, cols: 2, data: [Value.fromScalar(val), Value.fromScalar(idx)] })
    return Value.fromScalar(val)
  }
  const dim = dimArg ?? 1
  const results = dimSlices(m, dim).map(pick)
  const shape = (vals: number[]) => dim === 2 ? new Matrix(vals.length, 1, vals) : new Matrix(1, vals.length, vals)
  const vals = shape(results.map(r => r[0]))
  if (wantIdx) {
    const idxs = shape(results.map(r => r[1]))
    return Value.fromCell({ rows: 1, cols: 2, data: [Value.fromMatrix(vals), Value.fromMatrix(idxs)] })
  }
  return Value.fromMatrix(vals)
}
reg('max', (a, interp) => extremum(a, interp, (x, y) => x > y))
reg('min', (a, interp) => extremum(a, interp, (x, y) => x < y))
reg('sum', (a) => reduceDim(mat(a[0]), dimOf(a, 1), v => v.reduce((s, x) => s + x, 0)))
reg('prod', (a) => reduceDim(mat(a[0]), dimOf(a, 1), v => v.reduce((s, x) => s * x, 1)))

// Cumulative ops run down columns for matrices (MATLAB), flat for vectors.
function cumDim(m: Matrix, dimArg: number | null, step: (acc: number, x: number) => number, init: number): Value {
  if (dimArg === null && isVecM(m)) {
    let s = init
    return Value.fromMatrix(new Matrix(m.rows, m.cols, m.data.map(v => (s = step(s, v)))))
  }
  const dim = dimArg ?? 1
  const r = new Matrix(m.rows, m.cols)
  if (dim === 2) {
    for (let row = 0; row < m.rows; row++) { let s = init; for (let c = 0; c < m.cols; c++) { s = step(s, m.get(row, c)); r.set(row, c, s) } }
  } else {
    for (let c = 0; c < m.cols; c++) { let s = init; for (let row = 0; row < m.rows; row++) { s = step(s, m.get(row, c)); r.set(row, c, s) } }
  }
  return Value.fromMatrix(r)
}
reg('cumsum', (a) => cumDim(mat(a[0]), dimOf(a, 1), (s, x) => s + x, 0))
reg('cumprod', (a) => cumDim(mat(a[0]), dimOf(a, 1), (s, x) => s * x, 1))

// Matrix creation
reg('zeros', (a) => {
  if (a.length === 0) return Value.fromScalar(0)
  if (a.length === 1) { const n = num(a[0]); return Value.fromMatrix(Matrix.zeros(n, n)) }
  return Value.fromMatrix(Matrix.zeros(num(a[0]), num(a[1])))
})
reg('ones', (a) => {
  if (a.length === 0) return Value.fromScalar(1)
  if (a.length === 1) { const n = num(a[0]); return Value.fromMatrix(Matrix.ones(n, n)) }
  return Value.fromMatrix(Matrix.ones(num(a[0]), num(a[1])))
})
reg('eye', (a) => { const n = a.length > 0 ? num(a[0]) : 1; return Value.fromMatrix(Matrix.eye(n)) })
reg('rand', (a) => {
  if (a.length === 0) return Value.fromScalar(Math.random())
  if (a.length === 1) { const n = num(a[0]); return Value.fromMatrix(Matrix.rand(n, n)) }
  return Value.fromMatrix(Matrix.rand(num(a[0]), num(a[1])))
})
reg('randn', (a) => {
  if (a.length === 0) { const u1 = Math.random(), u2 = Math.random(); return Value.fromScalar(Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)) }
  if (a.length === 1) { const n = num(a[0]); return Value.fromMatrix(Matrix.randn(n, n)) }
  return Value.fromMatrix(Matrix.randn(num(a[0]), num(a[1])))
})
reg('linspace', (a) => Value.fromMatrix(Matrix.linspace(num(a[0]), num(a[1]), a.length > 2 ? num(a[2]) : 100)))
reg('colon', (a) => {
  if (a.length === 2) return generateRange(num(a[0]), 1, num(a[1]))
  return generateRange(num(a[0]), num(a[1]), num(a[2]))
})
reg('diag', (a) => {
  const m = mat(a[0])
  if (m.rows === 1 || m.cols === 1) {
    const d = m.data; const n = d.length; const r = Matrix.zeros(n, n)
    for (let i = 0; i < n; i++) r.set(i, i, d[i]); return Value.fromMatrix(r)
  }
  const n = Math.min(m.rows, m.cols); const d = new Array(n)
  for (let i = 0; i < n; i++) d[i] = m.get(i, i)
  return Value.fromMatrix(new Matrix(1, n, d))
})
reg('reshape', (a) => Value.fromMatrix(mat(a[0]).reshape(num(a[1]), num(a[2]))))
reg('repmat', (a) => {
  const m = mat(a[0]), rr = num(a[1]), cc = a.length > 2 ? num(a[2]) : rr
  const R = new Matrix(m.rows * rr, m.cols * cc)
  for (let ri = 0; ri < rr; ri++) for (let ci = 0; ci < cc; ci++)
    for (let r = 0; r < m.rows; r++) for (let c = 0; c < m.cols; c++)
      R.set(ri * m.rows + r, ci * m.cols + c, m.get(r, c))
  return Value.fromMatrix(R)
})

// Matrix properties
reg('size', (a, interp) => {
  const m = mat(a[0])
  if (a.length > 1) { const d = num(a[1]); return Value.fromScalar(d === 1 ? m.rows : m.cols) }
  if (interp.getNargout() >= 2) {
    const dims = [Value.fromScalar(m.rows), Value.fromScalar(m.cols)]
    while (dims.length < interp.getNargout()) dims.push(Value.fromScalar(1)) // trailing singleton dims
    return Value.fromCell({ rows: 1, cols: dims.length, data: dims })
  }
  return Value.fromMatrix(new Matrix(1, 2, [m.rows, m.cols]))
})
reg('length', (a) => { const m = mat(a[0]); return Value.fromScalar(Math.max(m.rows, m.cols)) })
reg('numel', (a) => Value.fromScalar(mat(a[0]).numel()))
reg('isempty', (a) => Value.fromLogical(mat(a[0]).numel() === 0))
reg('isscalar', (a) => Value.fromLogical(mat(a[0]).isScalar()))
reg('isvector', (a) => { const m = mat(a[0]); return Value.fromLogical(m.rows === 1 || m.cols === 1) })

// Linear algebra
reg('det', (a) => Value.fromScalar(mat(a[0]).det()))
reg('inv', (a) => Value.fromMatrix(mat(a[0]).inv()))
reg('trace', (a) => Value.fromScalar(mat(a[0]).trace()))
reg('norm', (a) => Value.fromScalar(mat(a[0]).norm()))
reg('rank', (a) => {
  const m = mat(a[0]); const tol = 1e-10; let r = 0
  // Rough SVD-less rank via row echelon
  const a2 = m.clone(); const n = Math.min(m.rows, m.cols)
  for (let i = 0; i < n; i++) {
    let max = i
    for (let j = i + 1; j < m.rows; j++) if (Math.abs(a2.get(j, i)) > Math.abs(a2.get(max, i))) max = j
    if (max !== i) for (let k = 0; k < m.cols; k++) { const t = a2.get(i, k); a2.set(i, k, a2.get(max, k)); a2.set(max, k, t) }
    if (Math.abs(a2.get(i, i)) < tol) continue
    r++
    for (let j = i + 1; j < m.rows; j++) { const f = a2.get(j, i) / a2.get(i, i); for (let k = i; k < m.cols; k++) a2.set(j, k, a2.get(j, k) - f * a2.get(i, k)) }
  }
  return Value.fromScalar(r)
})
reg('dot', (a) => { const m1 = mat(a[0]), m2 = mat(a[1]); return Value.fromScalar(m1.data.reduce((s, v, i) => s + v * m2.data[i], 0)) })
reg('cross', (a) => {
  const u = mat(a[0]).data, v = mat(a[1]).data
  return Value.fromMatrix(new Matrix(1, 3, [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]))
})

// Statistics (vector → scalar; matrix → column-wise, MATLAB semantics)
reg('mean', (a) => reduceDim(mat(a[0]), dimOf(a, 1), v => v.reduce((s, x) => s + x, 0) / v.length))
reg('median', (a) => reduceDim(mat(a[0]), dimOf(a, 1), v => {
  const d = [...v].sort((x, y) => x - y)
  const n = d.length
  return n % 2 ? d[(n - 1) / 2] : (d[n / 2 - 1] + d[n / 2]) / 2
}))
reg('std', (a) => reduceDim(mat(a[0]), dimOf(a, 1), v => Math.sqrt(sampleVariance(v))))
reg('var', (a) => reduceDim(mat(a[0]), dimOf(a, 1), v => sampleVariance(v)))
reg('sort', (a, interp) => {
  const m = mat(a[0])
  const desc = a.length > 1 && a[1] !== undefined && a[1].isString() && a[1].string() === 'descend'
  const cmp = (x: number, y: number) => desc ? y - x : x - y
  const wantIdx = interp.getNargout() >= 2
  const sortSlice = (v: number[]): [number[], number[]] => {
    const order = v.map((_, i) => i).sort((i, j) => cmp(v[i], v[j]))
    return [order.map(i => v[i]), order.map(i => i + 1)] // values, 1-based positions
  }
  if (isVecM(m)) {
    const [vals, idxs] = sortSlice([...m.data])
    const sorted = new Matrix(m.rows, m.cols, vals)
    if (wantIdx) return Value.fromCell({ rows: 1, cols: 2, data: [Value.fromMatrix(sorted), Value.fromMatrix(new Matrix(m.rows, m.cols, idxs))] })
    return Value.fromMatrix(sorted)
  }
  // Matrix: sort each column independently (MATLAB)
  const sorted = new Matrix(m.rows, m.cols), indices = new Matrix(m.rows, m.cols)
  for (let c = 0; c < m.cols; c++) {
    const col: number[] = []
    for (let r = 0; r < m.rows; r++) col.push(m.get(r, c))
    const [vals, idxs] = sortSlice(col)
    for (let r = 0; r < m.rows; r++) { sorted.set(r, c, vals[r]); indices.set(r, c, idxs[r]) }
  }
  if (wantIdx) return Value.fromCell({ rows: 1, cols: 2, data: [Value.fromMatrix(sorted), Value.fromMatrix(indices)] })
  return Value.fromMatrix(sorted)
})

// String functions
reg('num2str', (a) => {
  if (a[0].isString()) return a[0]
  return Value.fromString(String(num(a[0])))
})
reg('str2num', (a) => Value.fromScalar(parseFloat(a[0].string())))
reg('str2double', (a) => Value.fromScalar(parseFloat(a[0].string())))
reg('strcat', (a) => Value.fromString(a.map(v => v.isString() ? v.string() : String(num(v))).join('')))
reg('strsplit', (a) => {
  const s = a[0].string(); const delim = a.length > 1 ? a[1].string() : ' '
  const parts = s.split(delim)
  const c: CellArray = { rows: 1, cols: parts.length, data: parts.map(p => Value.fromString(p)) }
  return Value.fromCell(c)
})
reg('sprintf', (a) => {
  let fmt = a[0].string(); let idx = 1
  const result = fmt.replace(/%[-+0 #]*\d*\.?\d*[diouxXeEfgGcs%]/g, (match) => {
    if (match === '%%') return '%'
    if (idx >= a.length) return match
    const v = a[idx++]
    if (match.includes('d') || match.includes('i')) return String(Math.floor(num(v)))
    if (match.includes('f')) { const prec = match.match(/\.(\d+)/); return num(v).toFixed(prec ? parseInt(prec[1]) : 6) }
    if (match.includes('e') || match.includes('E')) return num(v).toExponential()
    if (match.includes('g') || match.includes('G')) return String(num(v))
    if (match.includes('s')) return v.isString() ? v.string() : String(num(v))
    return match
  })
  return Value.fromString(result)
})
reg('upper', (a) => Value.fromString(a[0].string().toUpperCase()))
reg('lower', (a) => Value.fromString(a[0].string().toLowerCase()))
reg('strtrim', (a) => Value.fromString(a[0].string().trim()))
reg('strcmp', (a) => Value.fromLogical(a[0].string() === a[1].string()))
reg('strcmpi', (a) => Value.fromLogical(a[0].string().toLowerCase() === a[1].string().toLowerCase()))
reg('strlength', (a) => Value.fromScalar(a[0].string().length))
reg('contains', (a) => Value.fromLogical(a[0].string().includes(a[1].string())))
reg('startsWith', (a) => Value.fromLogical(a[0].string().startsWith(a[1].string())))
reg('endsWith', (a) => Value.fromLogical(a[0].string().endsWith(a[1].string())))
reg('replace', (a) => Value.fromString(a[0].string().split(a[1].string()).join(a[2].string())))

// Type functions
reg('class', (a) => Value.fromString(a[0].type === 'matrix' ? 'double' : a[0].type === 'string' ? 'char' : a[0].type))
reg('isa', (a) => Value.fromLogical(a[0].type === a[1].string()))
reg('isnumeric', (a) => Value.fromLogical(a[0].isMatrix()))
reg('ischar', (a) => Value.fromLogical(a[0].isString()))
reg('islogical', (a) => Value.fromLogical(a[0].isMatrix() && a[0].matrix().data.every(v => v === 0 || v === 1)))
reg('isinf', (a) => applyElem(a[0], v => !isFinite(v) && !isNaN(v) ? 1 : 0))
reg('isnan', (a) => applyElem(a[0], v => isNaN(v) ? 1 : 0))
reg('isfinite', (a) => applyElem(a[0], v => isFinite(v) ? 1 : 0))
reg('double', (a) => { if (a[0].isMatrix()) return a[0]; return Value.fromScalar(num(a[0])) })
reg('logical', (a) => applyElem(a[0], v => v !== 0 ? 1 : 0))
reg('char', (a) => {
  if (a[0].isString()) return a[0]
  const m = mat(a[0]); return Value.fromString(String.fromCharCode(...m.data))
})

// I/O (web-adapted)
reg('disp', (a, interp) => { interp.print(a[0].isString() ? a[0].string() + '\n' : a[0].display().replace(/^ans = ?\n?/, '')); return Value.empty() })
reg('fprintf', (a, interp) => {
  let fmt: string, startIdx: number
  if (a[0].isMatrix() && a[0].matrix().isScalar() && (num(a[0]) === 1 || num(a[0]) === 2)) { fmt = a[1].string(); startIdx = 2 }
  else { fmt = a[0].string(); startIdx = 1 }
  let idx = startIdx
  const result = fmt.replace(/%[-+0 #]*\d*\.?\d*[diouxXeEfgGcs%]/g, (match) => {
    if (match === '%%') return '%'; if (idx >= a.length) return match
    const v = a[idx++]
    if (match.includes('d') || match.includes('i')) return String(Math.floor(num(v)))
    if (match.includes('f')) { const prec = match.match(/\.(\d+)/); return num(v).toFixed(prec ? parseInt(prec[1]) : 6) }
    if (match.includes('e') || match.includes('E')) return num(v).toExponential()
    if (match.includes('g') || match.includes('G')) return String(num(v))
    if (match.includes('s')) return v.isString() ? v.string() : String(num(v))
    return match
  }).replace(/\\n/g, '\n').replace(/\\t/g, '\t')
  interp.print(result)
  return Value.empty()
})
reg('error', (a) => { throw new RuntimeError(a[0].isString() ? a[0].string() : a[0].display()) })
reg('warning', (a, interp) => { interp.print('Warning: ' + (a[0].isString() ? a[0].string() : a[0].display()) + '\n'); return Value.empty() })
reg('input', () => Value.fromString('[input not supported in web]'))

// Cell/struct
reg('cell', (a) => {
  const r = a.length > 0 ? num(a[0]) : 0, c = a.length > 1 ? num(a[1]) : r
  return Value.fromCell({ rows: r, cols: c, data: Array(r * c).fill(Value.empty()) })
})
reg('struct', (a) => {
  const s: { [k: string]: Value } = {}
  for (let i = 0; i + 1 < a.length; i += 2) s[a[i].string()] = a[i + 1]
  return Value.fromStruct(s)
})
reg('fieldnames', (a) => {
  const s = a[0].struct()
  const c: CellArray = { rows: Object.keys(s).length, cols: 1, data: Object.keys(s).map(k => Value.fromString(k)) }
  return Value.fromCell(c)
})
reg('isfield', (a) => Value.fromLogical(a[1].string() in a[0].struct()))
reg('rmfield', (a) => {
  const s = { ...a[0].struct() }; delete s[a[1].string()]; return Value.fromStruct(s)
})

// Utility
reg('tic', () => { (globalThis as any).__matfree_tic = performance.now(); return Value.empty() })
reg('toc', (_, interp) => {
  const t = ((performance.now() - ((globalThis as any).__matfree_tic ?? performance.now())) / 1000)
  interp.print(`Elapsed time is ${t.toFixed(6)} seconds.\n`)
  return Value.fromScalar(t)
})
reg('nargin', () => Value.fromScalar(0))
reg('nargout', () => Value.fromScalar(0))

// Logical
reg('any', (a) => {
  const m = mat(a[0])
  if (isVecM(m)) return Value.fromLogical(m.data.some(v => v !== 0))
  return reduceDim(m, dimOf(a, 1), v => v.some(x => x !== 0) ? 1 : 0)
})
reg('all', (a) => {
  const m = mat(a[0])
  if (isVecM(m)) return Value.fromLogical(m.data.every(v => v !== 0))
  return reduceDim(m, dimOf(a, 1), v => v.every(x => x !== 0) ? 1 : 0)
})
reg('find', (a, interp) => {
  const m = mat(a[0])
  if (interp.getNargout() >= 2) {
    // [row, col, val] = find(X): column-major order, 1-based
    const rs: number[] = [], cs: number[] = [], vs: number[] = []
    for (let c = 0; c < m.cols; c++) for (let r = 0; r < m.rows; r++) {
      if (m.get(r, c) !== 0) { rs.push(r + 1); cs.push(c + 1); vs.push(m.get(r, c)) }
    }
    const data = [
      Value.fromMatrix(new Matrix(rs.length, 1, rs)),
      Value.fromMatrix(new Matrix(cs.length, 1, cs)),
      Value.fromMatrix(new Matrix(vs.length, 1, vs)),
    ]
    return Value.fromCell({ rows: 1, cols: 3, data })
  }
  const idx: number[] = []
  for (let i = 0; i < m.data.length; i++) if (m.data[i] !== 0) idx.push(i + 1) // 1-indexed
  return Value.fromMatrix(new Matrix(1, idx.length, idx))
})
reg('not', (a) => applyElem(a[0], v => v === 0 ? 1 : 0))

// Misc math
reg('pi', () => Value.fromScalar(Math.PI))
reg('Inf', () => Value.fromScalar(Infinity))
reg('NaN', () => Value.fromScalar(NaN))
reg('eps', () => Value.fromScalar(2.220446049250313e-16))
reg('realmin', () => Value.fromScalar(2.2250738585072014e-308))
reg('realmax', () => Value.fromScalar(1.7976931348623157e+308))

// Higher-order
reg('feval', (a, interp) => {
  const fn = a[0]
  const args = a.slice(1)
  if (fn.isString()) return interp.callBuiltin(fn.string(), args)
  if (fn.isFuncHandle()) return interp.callFuncHandle(fn.funcHandle(), args)
  throw new RuntimeError('feval: first arg must be string or function handle')
})
reg('arrayfun', (a, interp) => {
  const fh = a[0].funcHandle()
  const m = mat(a[1])
  const results: number[] = []
  for (const v of m.data) {
    const r = interp.callFuncHandle(fh, [Value.fromScalar(v)])
    results.push(r.toScalar())
  }
  return Value.fromMatrix(new Matrix(m.rows, m.cols, results))
})
reg('cellfun', (a, interp) => {
  const fh = a[0].funcHandle()
  const c = a[1].cell()
  const results: Value[] = []
  for (const v of c.data) results.push(interp.callFuncHandle(fh, [v]))
  return Value.fromCell({ rows: c.rows, cols: c.cols, data: results })
})

// Whos / workspace
reg('whos', (_, interp) => {
  const names = interp.currentEnv().variableNames()
  const lines = names.map(n => {
    const v = interp.currentEnv().get(n)!
    const sz = v.isMatrix() ? `${v.matrix().rows}x${v.matrix().cols}` : '1x1'
    return `  ${n.padEnd(15)} ${sz.padEnd(10)} ${v.type}`
  })
  interp.print('  Name           Size       Type\n' + lines.join('\n') + '\n')
  return Value.empty()
})
reg('clear', (a, interp) => { if (a.length === 0) interp.currentEnv().clear(); return Value.empty() })
reg('exist', (a, interp) => {
  const n = a[0].string()
  if (interp.currentEnv().has(n)) return Value.fromScalar(1)
  if (builtins.has(n)) return Value.fromScalar(5)
  return Value.fromScalar(0)
})
reg('typecast_placeholder', () => Value.empty())

// ═══════════════════════════════════════════════════════════════
// PLOTTING FUNCTIONS
// ═══════════════════════════════════════════════════════════════

function parseLineSpec(spec: string): { color?: string, lineStyle?: 'solid' | 'dashed' | 'dotted' | 'none', marker?: 'none' | 'circle' | 'square' | 'diamond' | 'triangle' | 'x' | 'plus' } {
  const colorMap: Record<string, string> = { r: '#ef4444', g: '#22c55e', b: '#3b82f6', k: '#e4e4ef', w: '#ffffff', m: '#d946ef', c: '#06b6d4', y: '#eab308' }
  const result: ReturnType<typeof parseLineSpec> = {}
  for (const [k, v] of Object.entries(colorMap)) { if (spec.includes(k)) { result.color = v; break } }
  if (spec.includes('--')) result.lineStyle = 'dashed'
  else if (spec.includes(':')) result.lineStyle = 'dotted'
  else if (spec.includes('-.')) result.lineStyle = 'dashed'
  if (spec.includes('o')) result.marker = 'circle'
  else if (spec.includes('s')) result.marker = 'square'
  else if (spec.includes('d')) result.marker = 'diamond'
  else if (spec.includes('^')) result.marker = 'triangle'
  else if (spec.includes('x')) result.marker = 'x'
  else if (spec.includes('+')) result.marker = 'plus'
  return result
}

reg('plot', (a, interp) => {
  const fig = interp.getCurrentFigure()
  if (!fig.hold) fig.series = []
  let x: number[], y: number[], specIdx = -1
  if (a.length >= 2 && a[0].isMatrix() && a[1].isMatrix()) {
    x = [...mat(a[0]).data]; y = [...mat(a[1]).data]; specIdx = 2
  } else if (a.length >= 1 && a[0].isMatrix()) {
    y = [...mat(a[0]).data]; x = y.map((_, i) => i + 1); specIdx = 1
  } else { return Value.empty() }
  const spec = specIdx < a.length && a[specIdx].isString() ? parseLineSpec(a[specIdx].string()) : {}
  fig.series.push({ type: 'line', x, y, ...spec })
  interp.emitPlot()
  return Value.empty()
})

reg('scatter', (a, interp) => {
  const fig = interp.getCurrentFigure()
  if (!fig.hold) fig.series = []
  let x: number[], y: number[]
  if (a.length >= 2) { x = [...mat(a[0]).data]; y = [...mat(a[1]).data] }
  else { y = [...mat(a[0]).data]; x = y.map((_, i) => i + 1) }
  const sz = a.length >= 3 && a[2].isMatrix() ? num(a[2]) : 5
  fig.series.push({ type: 'scatter', x, y, markerSize: sz })
  interp.emitPlot()
  return Value.empty()
})

reg('bar', (a, interp) => {
  const fig = interp.getCurrentFigure()
  if (!fig.hold) fig.series = []
  let x: number[], y: number[]
  if (a.length >= 2 && a[0].isMatrix() && a[1].isMatrix()) { x = [...mat(a[0]).data]; y = [...mat(a[1]).data] }
  else { y = [...mat(a[0]).data]; x = y.map((_, i) => i + 1) }
  fig.series.push({ type: 'bar', x, y })
  interp.emitPlot()
  return Value.empty()
})

reg('stem', (a, interp) => {
  const fig = interp.getCurrentFigure()
  if (!fig.hold) fig.series = []
  let x: number[], y: number[]
  if (a.length >= 2) { x = [...mat(a[0]).data]; y = [...mat(a[1]).data] }
  else { y = [...mat(a[0]).data]; x = y.map((_, i) => i + 1) }
  fig.series.push({ type: 'stem', x, y })
  interp.emitPlot()
  return Value.empty()
})

reg('stairs', (a, interp) => {
  const fig = interp.getCurrentFigure()
  if (!fig.hold) fig.series = []
  let x: number[], y: number[]
  if (a.length >= 2) { x = [...mat(a[0]).data]; y = [...mat(a[1]).data] }
  else { y = [...mat(a[0]).data]; x = y.map((_, i) => i + 1) }
  fig.series.push({ type: 'stairs', x, y })
  interp.emitPlot()
  return Value.empty()
})

reg('area', (a, interp) => {
  const fig = interp.getCurrentFigure()
  if (!fig.hold) fig.series = []
  let x: number[], y: number[]
  if (a.length >= 2) { x = [...mat(a[0]).data]; y = [...mat(a[1]).data] }
  else { y = [...mat(a[0]).data]; x = y.map((_, i) => i + 1) }
  fig.series.push({ type: 'area', x, y, fillAlpha: 0.3 })
  interp.emitPlot()
  return Value.empty()
})

reg('hist', (a, interp) => {
  const fig = interp.getCurrentFigure()
  if (!fig.hold) fig.series = []
  const data = [...mat(a[0]).data]
  const nbins = a.length > 1 ? num(a[1]) : Math.max(5, Math.ceil(Math.sqrt(data.length)))
  const lo = Math.min(...data), hi = Math.max(...data)
  const binW = (hi - lo) / nbins || 1
  const counts = new Array(nbins).fill(0)
  const centers = new Array(nbins)
  for (let i = 0; i < nbins; i++) centers[i] = lo + (i + 0.5) * binW
  for (const v of data) { let b = Math.floor((v - lo) / binW); if (b >= nbins) b = nbins - 1; if (b < 0) b = 0; counts[b]++ }
  fig.series.push({ type: 'hist', x: centers, y: counts })
  interp.emitPlot()
  return Value.empty()
})

reg('title', (a, interp) => { interp.getCurrentFigure().title = a[0].string(); interp.emitPlot(); return Value.empty() })
reg('xlabel', (a, interp) => { interp.getCurrentFigure().xlabel = a[0].string(); interp.emitPlot(); return Value.empty() })
reg('ylabel', (a, interp) => { interp.getCurrentFigure().ylabel = a[0].string(); interp.emitPlot(); return Value.empty() })
reg('legend', (a, interp) => {
  const fig = interp.getCurrentFigure(); fig.legend = true
  for (let i = 0; i < a.length && i < fig.series.length; i++) fig.series[i].label = a[i].string()
  interp.emitPlot(); return Value.empty()
})
reg('grid', (a, interp) => {
  const fig = interp.getCurrentFigure()
  if (a.length === 0) fig.grid = !fig.grid
  else fig.grid = a[0].isString() ? a[0].string() === 'on' : a[0].toBool()
  interp.emitPlot(); return Value.empty()
})
reg('hold', (a, interp) => {
  const fig = interp.getCurrentFigure()
  if (a.length === 0) fig.hold = !fig.hold
  else fig.hold = a[0].isString() ? a[0].string() === 'on' : a[0].toBool()
  return Value.empty()
})
reg('figure', (a, interp) => {
  const id = a.length > 0 ? num(a[0]) : interp.getCurrentFigure().id + 1
  interp.setCurrentFigure(id)
  return Value.empty()
})
reg('xlim', (a, interp) => {
  const m = mat(a[0]); interp.getCurrentFigure().xRange = [m.data[0], m.data[1]]; interp.emitPlot(); return Value.empty()
})
reg('ylim', (a, interp) => {
  const m = mat(a[0]); interp.getCurrentFigure().yRange = [m.data[0], m.data[1]]; interp.emitPlot(); return Value.empty()
})
reg('clf', (_, interp) => {
  const fig = interp.getCurrentFigure(); fig.series = []; fig.title = undefined; fig.xlabel = undefined; fig.ylabel = undefined
  interp.emitPlot(); return Value.empty()
})
reg('close', (_, interp) => {
  const fig = interp.getCurrentFigure(); fig.series = []; interp.emitPlot(); return Value.empty()
})

// Log-scale plots
reg('semilogx', (a, interp) => {
  const fig = interp.getCurrentFigure(); if (!fig.hold) fig.series = []
  let x: number[], y: number[]
  if (a.length >= 2 && a[0].isMatrix() && a[1].isMatrix()) { x = mat(a[0]).data.map(Math.log10); y = [...mat(a[1]).data] }
  else { y = [...mat(a[0]).data]; x = y.map((_, i) => Math.log10(i + 1)) }
  fig.series.push({ type: 'line', x, y }); interp.emitPlot(); return Value.empty()
})
reg('semilogy', (a, interp) => {
  const fig = interp.getCurrentFigure(); if (!fig.hold) fig.series = []
  let x: number[], y: number[]
  if (a.length >= 2) { x = [...mat(a[0]).data]; y = mat(a[1]).data.map(Math.log10) }
  else { y = mat(a[0]).data.map(Math.log10); x = y.map((_, i) => i + 1) }
  fig.series.push({ type: 'line', x, y }); interp.emitPlot(); return Value.empty()
})
reg('loglog', (a, interp) => {
  const fig = interp.getCurrentFigure(); if (!fig.hold) fig.series = []
  let x: number[], y: number[]
  if (a.length >= 2) { x = mat(a[0]).data.map(Math.log10); y = mat(a[1]).data.map(Math.log10) }
  else { y = mat(a[0]).data.map(Math.log10); x = y.map((_, i) => Math.log10(i + 1)) }
  fig.series.push({ type: 'line', x, y }); interp.emitPlot(); return Value.empty()
})

// Polar plot (converted to cartesian for rendering)
reg('polar_plot', (a, interp) => {
  const fig = interp.getCurrentFigure(); if (!fig.hold) fig.series = []
  const theta = mat(a[0]).data, r = mat(a[1]).data
  const x = theta.map((t, i) => r[i] * Math.cos(t))
  const y = theta.map((t, i) => r[i] * Math.sin(t))
  fig.series.push({ type: 'line', x, y }); interp.emitPlot(); return Value.empty()
})

// Pie chart
reg('pie_chart', (a, interp) => {
  const fig = interp.getCurrentFigure(); fig.series = []
  const data = mat(a[0]).data
  const total = data.reduce((s, v) => s + v, 0)
  // Encode as special bar chart with angular data
  fig.series.push({ type: 'bar', x: data.map((_, i) => i + 1), y: data.map(v => v / total * 100) })
  fig.title = fig.title ?? 'Pie Chart'
  interp.emitPlot(); return Value.empty()
})

// Heatmap / imagesc
reg('imagesc', (a, interp) => {
  const fig = interp.getCurrentFigure(); fig.series = []
  const m = mat(a[0])
  // Pack matrix data as a special heatmap series
  fig.series.push({
    type: 'line', // we'll detect heatmap in renderer via metadata
    x: Array.from({ length: m.cols }, (_, i) => i + 1),
    y: Array.from({ length: m.rows }, (_, i) => i + 1),
    label: '__heatmap__',
    lineWidth: m.rows,
    markerSize: m.cols,
  })
  // Store raw data on the figure
  ;(fig as any).__heatmapData = [...m.data]
  ;(fig as any).__heatmapRows = m.rows
  ;(fig as any).__heatmapCols = m.cols
  interp.emitPlot(); return Value.empty()
})

// Help function
reg('help', (a, interp) => {
  if (a.length === 0) {
    interp.print('MatFree Help System\n')
    interp.print('  help(\'function_name\')  - Get help for a specific function\n')
    interp.print('  doc(\'topic\')           - Search documentation\n')
    interp.print('  whos                   - List workspace variables\n\n')
    interp.print('Categories: Math, Matrix, Linear Algebra, Statistics, Plotting,\n')
    interp.print('  Signal Processing, Polynomials, Calculus, Optimization,\n')
    interp.print('  Special Functions, I/O, Utility\n')
    return Value.empty()
  }
  const name = a[0].isString() ? a[0].string() : ''
  const entry = getHelp(name)
  if (entry) {
    interp.print(`\n  ${entry.name} - ${entry.description}\n`)
    interp.print(`  Syntax: ${entry.syntax}\n`)
    interp.print(`  Category: ${entry.category}\n`)
    if (entry.examples?.length) {
      interp.print(`  Examples:\n`)
      for (const ex of entry.examples) interp.print(`    ${ex}\n`)
    }
    interp.print('\n')
  } else {
    const results = searchHelp(name)
    if (results.length > 0) {
      interp.print(`  No exact match for '${name}'. Did you mean:\n`)
      for (const r of results.slice(0, 8)) interp.print(`    ${r.name.padEnd(15)} - ${r.description}\n`)
      interp.print('\n')
    } else {
      interp.print(`  No help found for '${name}'.\n`)
    }
  }
  return Value.empty()
})

reg('doc', (a, interp) => {
  const query = a.length > 0 ? (a[0].isString() ? a[0].string() : '') : ''
  const results = searchHelp(query)
  if (results.length === 0) { interp.print(`  No results for '${query}'.\n`); return Value.empty() }
  interp.print(`  Found ${results.length} results for '${query}':\n`)
  for (const r of results.slice(0, 20)) interp.print(`    ${r.name.padEnd(15)} ${r.syntax.padEnd(30)} ${r.description}\n`)
  interp.print('\n')
  return Value.empty()
})

// jsondecode(str) -> struct or cell
function jsonToValue(j: unknown): Value {
  if (j === null) return Value.empty()
  if (typeof j === 'number') return Value.fromScalar(j)
  if (typeof j === 'boolean') return Value.fromLogical(j)
  if (typeof j === 'string') return Value.fromString(j)
  if (Array.isArray(j)) {
    const data = j.map(jsonToValue)
    return Value.fromCell({ rows: 1, cols: data.length, data })
  }
  if (typeof j === 'object') {
    const s: Record<string, Value> = {}
    for (const [k, v] of Object.entries(j)) s[k] = jsonToValue(v)
    return Value.fromStruct(s)
  }
  return Value.empty()
}
reg('jsondecode', (a) => {
  const str = a[0].string()
  try {
    const j = JSON.parse(str)
    return jsonToValue(j)
  } catch (e) {
    throw new RuntimeError(`jsondecode: invalid JSON - ${(e as Error).message}`)
  }
})

// jsonencode(val) -> string
function valueToJson(v: Value): unknown {
  if (v.isEmpty()) return null
  if (v.isMatrix()) {
    const m = v.matrix()
    if (m.isScalar()) return m.scalarValue()
    if (m.numel() === 0) return []
    const rows: number[][] = []
    for (let r = 0; r < m.rows; r++) {
      const row: number[] = []
      for (let c = 0; c < m.cols; c++) row.push(m.get(r, c))
      rows.push(row)
    }
    return m.rows === 1 ? rows[0] : rows
  }
  if (v.isString()) return v.string()
  if (v.isStruct()) {
    const o: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(v.struct())) o[k] = valueToJson(val)
    return o
  }
  if (v.isCell()) {
    return v.cell().data.map(valueToJson)
  }
  return null
}
reg('jsonencode', (a) => {
  try {
    return Value.fromString(JSON.stringify(valueToJson(a[0])))
  } catch (e) {
    throw new RuntimeError(`jsonencode: ${(e as Error).message}`)
  }
})

export function getBuiltin(name: string): BuiltinFn | undefined {
  return builtins.get(name) ??
    (getScientificBuiltin(name) as BuiltinFn | undefined) ??
    (getSymbolicBuiltin(name) as BuiltinFn | undefined) ??
    (getAdvancedBuiltin(name) as BuiltinFn | undefined)
}
export function hasBuiltin(name: string): boolean {
  return builtins.has(name) || hasScientificBuiltin(name) || hasSymbolicBuiltin(name) || hasAdvancedBuiltin(name)
}
export function allBuiltinNames(): string[] {
  return [...builtins.keys(), ...allScientificNames(), ...allSymbolicNames(), ...allAdvancedNames()]
}

function applyElem(v: Value, fn: (x: number) => number): Value {
  const m = mat(v)
  return Value.fromMatrix(new Matrix(m.rows, m.cols, m.data.map(fn)))
}

function generateRange(start: number, step: number, stop: number): Value {
  const vals: number[] = []
  if (step > 0) { for (let v = start; v <= stop + 1e-10; v += step) vals.push(v) }
  else if (step < 0) { for (let v = start; v >= stop - 1e-10; v += step) vals.push(v) }
  else throw new RuntimeError('Range step cannot be zero')
  return Value.fromMatrix(new Matrix(1, vals.length, vals))
}
