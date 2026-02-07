// MatFree Engine - Built-in Functions

import { Value, Matrix, RuntimeError, CellArray } from './value'
import type { Interpreter } from './interpreter'

type BuiltinFn = (args: Value[], interp: Interpreter) => Value

const builtins: Map<string, BuiltinFn> = new Map()

function reg(name: string, fn: BuiltinFn) { builtins.set(name, fn) }

function num(v: Value): number { return v.toScalar() }
function mat(v: Value): Matrix { return v.toMatrix() }

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
reg('abs', (a) => applyElem(a[0], Math.abs))
reg('ceil', (a) => applyElem(a[0], Math.ceil))
reg('floor', (a) => applyElem(a[0], Math.floor))
reg('round', (a) => applyElem(a[0], Math.round))
reg('fix', (a) => applyElem(a[0], (v) => v > 0 ? Math.floor(v) : Math.ceil(v)))
reg('mod', (a) => { const m1 = mat(a[0]), m2 = mat(a[1]); return Value.fromMatrix(new Matrix(m1.rows, m1.cols, m1.data.map((v, i) => v - Math.floor(v / m2.data[i % m2.data.length]) * m2.data[i % m2.data.length]))) })
reg('rem', (a) => Value.fromScalar(num(a[0]) % num(a[1])))
reg('sign', (a) => applyElem(a[0], Math.sign))
reg('max', (a) => {
  if (a.length === 1) return Value.fromScalar(mat(a[0]).maxVal())
  return Value.fromScalar(Math.max(num(a[0]), num(a[1])))
})
reg('min', (a) => {
  if (a.length === 1) return Value.fromScalar(mat(a[0]).minVal())
  return Value.fromScalar(Math.min(num(a[0]), num(a[1])))
})
reg('sum', (a) => Value.fromScalar(mat(a[0]).sum()))
reg('prod', (a) => Value.fromScalar(mat(a[0]).prod()))
reg('cumsum', (a) => {
  const m = mat(a[0]); let s = 0
  return Value.fromMatrix(new Matrix(m.rows, m.cols, m.data.map(v => s += v)))
})
reg('cumprod', (a) => {
  const m = mat(a[0]); let s = 1
  return Value.fromMatrix(new Matrix(m.rows, m.cols, m.data.map(v => { s *= v; return s })))
})

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
reg('size', (a) => {
  const m = mat(a[0])
  if (a.length > 1) { const d = num(a[1]); return Value.fromScalar(d === 1 ? m.rows : m.cols) }
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

// Statistics
reg('mean', (a) => Value.fromScalar(mat(a[0]).mean()))
reg('median', (a) => {
  const d = [...mat(a[0]).data].sort((a, b) => a - b)
  const n = d.length
  return Value.fromScalar(n % 2 ? d[(n - 1) / 2] : (d[n / 2 - 1] + d[n / 2]) / 2)
})
reg('std', (a) => {
  const m = mat(a[0]); const mu = m.mean(); const n = m.numel()
  return Value.fromScalar(Math.sqrt(m.data.reduce((s, v) => s + (v - mu) ** 2, 0) / (n - 1)))
})
reg('var', (a) => {
  const m = mat(a[0]); const mu = m.mean(); const n = m.numel()
  return Value.fromScalar(m.data.reduce((s, v) => s + (v - mu) ** 2, 0) / (n - 1))
})
reg('sort', (a) => {
  const m = mat(a[0])
  return Value.fromMatrix(new Matrix(m.rows, m.cols, [...m.data].sort((a, b) => a - b)))
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
reg('any', (a) => Value.fromLogical(mat(a[0]).data.some(v => v !== 0)))
reg('all', (a) => Value.fromLogical(mat(a[0]).data.every(v => v !== 0)))
reg('find', (a) => {
  const m = mat(a[0]); const idx: number[] = []
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

export function getBuiltin(name: string): BuiltinFn | undefined { return builtins.get(name) }
export function hasBuiltin(name: string): boolean { return builtins.has(name) }

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
