// MatFree Engine - MATLAB indexing: subscripts, reads, indexed assignment and deletion.
//
// Arrays are stored row-major (data[r * cols + c]) but MATLAB linear indices,
// growth and element order are column-major; everything here translates.

import { Matrix, Value, RuntimeError, type CellArray } from './value'

/** An evaluated subscript: ':' or 0-based positions (column-major) plus the index's own shape. */
export type Subscript =
  | { all: true }
  | { all: false; idx: number[]; rows: number; cols: number }

export const COLON: Subscript = { all: true }

interface Grid<T> { rows: number; cols: number; data: T[] }

function range(n: number): number[] {
  const out = new Array<number>(n)
  for (let i = 0; i < n; i++) out[i] = i
  return out
}

function colMajor<T>(g: Grid<T>): T[] {
  if (g.rows === 1 || g.cols === 1) return g.data.slice()
  const out = new Array<T>(g.data.length)
  let k = 0
  for (let c = 0; c < g.cols; c++) for (let r = 0; r < g.rows; r++) out[k++] = g.data[r * g.cols + c]
  return out
}

function fromColMajor<T>(rows: number, cols: number, values: T[]): Grid<T> {
  if (rows === 1 || cols === 1) return { rows, cols, data: values }
  const data = new Array<T>(rows * cols)
  for (let k = 0; k < values.length; k++) {
    const r = k % rows
    data[r * cols + (k - r) / rows] = values[k]
  }
  return { rows, cols, data }
}

export function toSubscript(v: Value, position: number): Subscript {
  if (v.isString() && v.string() === ':') return COLON
  if (v.isCell() || v.isStruct() || v.isFuncHandle()) {
    throw new RuntimeError(`Unable to use a value of type ${v.className()} as an index.`)
  }
  const m = v.toMatrix()
  const values = m.columnMajor()
  if (m.logical) {
    const idx: number[] = []
    for (let k = 0; k < values.length; k++) if (values[k] !== 0) idx.push(k)
    return m.rows === 1 ? { all: false, idx, rows: 1, cols: idx.length } : { all: false, idx, rows: idx.length, cols: 1 }
  }
  const idx = new Array<number>(values.length)
  for (let k = 0; k < values.length; k++) {
    const x = values[k]
    if (!(x >= 1) || !Number.isInteger(x)) {
      throw new RuntimeError(`Index in position ${position} is invalid. Array indices must be positive integers or logical values.`)
    }
    idx[k] = x - 1
  }
  return { all: false, idx, rows: m.rows, cols: m.cols }
}

export function isFirstElement(s: Subscript): boolean {
  return s.all || (s.idx.length === 1 && s.idx[0] === 0)
}

const isVector = (rows: number, cols: number) => rows === 1 || cols === 1

/** Shape of A(idx): a vector indexed by a vector keeps A's orientation; otherwise idx's shape. */
function linearShape(rows: number, cols: number, s: { idx: number[]; rows: number; cols: number }): [number, number] {
  const n = s.idx.length
  if (isVector(rows, cols) && !(rows === 1 && cols === 1) && isVector(s.rows, s.cols)) return rows === 1 ? [1, n] : [n, 1]
  return [s.rows, s.cols]
}

function checkLinear(idx: number[], n: number): void {
  for (const i of idx) {
    if (i >= n) throw new RuntimeError(`Index exceeds the number of array elements. Index must not exceed ${n}.`)
  }
}

function resolveDim(s: Subscript, extent: number, position: number): number[] {
  if (s.all) return range(extent)
  for (const i of s.idx) {
    if (i >= extent) throw new RuntimeError(`Index in position ${position} exceeds array bounds. Index must not exceed ${extent}.`)
  }
  return s.idx
}

/** MatFree arrays are 2-D: subscripts past the second must address page 1. */
function twoD(subs: Subscript[], assigning: boolean): [Subscript, Subscript] {
  for (let p = 2; p < subs.length; p++) {
    const s = subs[p]
    if (s.all || s.idx.every(i => i === 0)) continue
    if (assigning) throw new RuntimeError('N-dimensional arrays are not supported yet; use at most two indices.')
    throw new RuntimeError(`Index in position ${p + 1} exceeds array bounds. Index must not exceed 1.`)
  }
  return [subs[0], subs[1]]
}

function readGrid<T>(g: Grid<T>, subs: Subscript[]): Grid<T> {
  if (subs.length === 0) return { rows: g.rows, cols: g.cols, data: g.data.slice() }
  if (subs.length === 1) {
    const s = subs[0]
    const n = g.rows * g.cols
    if (s.all) return { rows: n, cols: 1, data: colMajor(g) }
    checkLinear(s.idx, n)
    const [rr, cc] = linearShape(g.rows, g.cols, s)
    const picked = new Array<T>(s.idx.length)
    for (let k = 0; k < s.idx.length; k++) {
      const src = s.idx[k], r = src % g.rows
      picked[k] = g.data[r * g.cols + (src - r) / g.rows]
    }
    return fromColMajor(rr, cc, picked)
  }
  const [rs, cs] = twoD(subs, false)
  const R = resolveDim(rs, g.rows, 1), C = resolveDim(cs, g.cols, 2)
  const data = new Array<T>(R.length * C.length)
  for (let i = 0; i < R.length; i++) {
    const base = R[i] * g.cols
    for (let j = 0; j < C.length; j++) data[i * C.length + j] = g.data[base + C[j]]
  }
  return { rows: R.length, cols: C.length, data }
}

const NUMEL_MISMATCH = 'Unable to perform assignment because the left and right sides have a different number of elements.'

/** Length a ':' takes on an empty dimension, inferred from the right-hand side. */
function colonSpan(rhs: Grid<unknown>, otherLen: number, dim: 'rows' | 'cols'): number {
  const n = rhs.rows * rhs.cols
  if (n === 1) return 1
  if (dim === 'rows' ? rhs.cols === otherLen : rhs.rows === otherLen) return dim === 'rows' ? rhs.rows : rhs.cols
  if (otherLen > 0 && n % otherLen === 0) return n / otherLen
  return dim === 'rows' ? rhs.rows : rhs.cols
}

/**
 * A(subs) = rhs. With inPlace the input grid's data array is reused when possible
 * (the caller guarantees nothing else references it); check the returned grid's data.
 */
function assignGrid<T>(g: Grid<T>, subs: Subscript[], rhs: Grid<T>, fill: T, inPlace: boolean): Grid<T> {
  const rhsN = rhs.rows * rhs.cols
  if (subs.length === 0) throw new RuntimeError('Indexed assignment requires at least one index.')
  if (subs.length === 1) {
    const s = subs[0]
    const n = g.rows * g.cols
    if (s.all) {
      if (rhsN === 1) {
        const data = inPlace ? g.data : new Array<T>(n)
        data.fill(rhs.data[0])
        return { rows: g.rows, cols: g.cols, data }
      }
      if (rhsN !== n) throw new RuntimeError(NUMEL_MISMATCH)
      return fromColMajor(g.rows, g.cols, colMajor(rhs))
    }
    if (rhsN !== 1 && rhsN !== s.idx.length) throw new RuntimeError(NUMEL_MISMATCH)
    let maxIdx = -1
    for (const i of s.idx) if (i > maxIdx) maxIdx = i
    let rows = g.rows, cols = g.cols
    const data = inPlace ? g.data : g.data.slice()
    if (maxIdx >= n) {
      if (g.rows === 1 || (g.rows === 0 && g.cols === 0)) { rows = 1; cols = maxIdx + 1 }
      else if (g.cols === 1) rows = maxIdx + 1
      else throw new RuntimeError('Attempt to grow array along ambiguous dimension.')
      // Vectors store elements in the same order row- or column-major, so growth appends.
      while (data.length < rows * cols) data.push(fill)
    }
    const values = rhsN === 1 ? null : colMajor(rhs)
    for (let k = 0; k < s.idx.length; k++) {
      const t = s.idx[k], r = t % rows
      data[r * cols + (t - r) / rows] = values ? values[k] : rhs.data[0]
    }
    return { rows, cols, data }
  }

  const [rs, cs] = twoD(subs, true)
  let R = rs.all ? null : rs.idx
  const C0 = cs.all ? null : cs.idx
  if (!R) R = range(g.rows > 0 ? g.rows : C0 ? colonSpan(rhs, C0.length, 'rows') : rhs.rows)
  const C = C0 ?? range(g.cols > 0 ? g.cols : colonSpan(rhs, R.length, 'cols'))
  if (rhsN !== 1) {
    const left = [R.length, C.length].filter(d => d !== 1)
    const right = [rhs.rows, rhs.cols].filter(d => d !== 1)
    if (left.length !== right.length || left.some((d, i) => d !== right[i])) {
      throw new RuntimeError(`Unable to perform assignment because the size of the left side is ${R.length}-by-${C.length} and the size of the right side is ${rhs.rows}-by-${rhs.cols}.`)
    }
  }
  let maxR = g.rows - 1, maxC = g.cols - 1
  for (const i of R) if (i > maxR) maxR = i
  for (const j of C) if (j > maxC) maxC = j
  const rows = maxR + 1, cols = maxC + 1
  let data: T[]
  if (rows === g.rows && cols === g.cols) data = inPlace ? g.data : g.data.slice()
  else {
    data = new Array<T>(rows * cols).fill(fill)
    for (let r = 0; r < g.rows; r++) for (let c = 0; c < g.cols; c++) data[r * cols + c] = g.data[r * g.cols + c]
  }
  const values = rhsN === 1 ? null : colMajor(rhs)
  let k = 0
  for (const c of C) for (const r of R) data[r * cols + c] = values ? values[k++] : rhs.data[0]
  return { rows, cols, data }
}

const DELETE_RANGE = 'Matrix index is out of range for deletion.'

function deleteGrid<T>(g: Grid<T>, subs: Subscript[]): Grid<T> {
  const n = g.rows * g.cols
  if (subs.length === 0) throw new RuntimeError('Deletion requires at least one index.')
  if (subs.length === 1) {
    const s = subs[0]
    if (s.all) return { rows: 0, cols: 0, data: [] }
    for (const i of s.idx) if (i >= n) throw new RuntimeError(DELETE_RANGE)
    if (s.idx.length === 0) return { rows: g.rows, cols: g.cols, data: g.data.slice() }
    const drop = new Set(s.idx)
    const kept = colMajor(g).filter((_, k) => !drop.has(k))
    return g.cols === 1 && g.rows !== 1 ? { rows: kept.length, cols: 1, data: kept } : { rows: 1, cols: kept.length, data: kept }
  }
  const [rs, cs] = twoD(subs, true)
  const covers = (s: Subscript, extent: number) => s.all || (new Set(s.idx).size === extent && s.idx.every(i => i < extent))
  const positions = (s: Subscript, extent: number) => {
    if (s.all) return range(extent)
    for (const i of s.idx) if (i >= extent) throw new RuntimeError(DELETE_RANGE)
    return s.idx
  }
  if (covers(cs, g.cols)) {
    const drop = new Set(positions(rs, g.rows))
    const data: T[] = []
    let rows = 0
    for (let r = 0; r < g.rows; r++) {
      if (drop.has(r)) continue
      rows++
      for (let c = 0; c < g.cols; c++) data.push(g.data[r * g.cols + c])
    }
    return { rows, cols: g.cols, data }
  }
  if (covers(rs, g.rows)) {
    const drop = new Set(positions(cs, g.cols))
    const keep = range(g.cols).filter(c => !drop.has(c))
    const data: T[] = []
    for (let r = 0; r < g.rows; r++) for (const c of keep) data.push(g.data[r * g.cols + c])
    return { rows: g.rows, cols: keep.length, data }
  }
  throw new RuntimeError('A null assignment can have only one non-colon index.')
}

// ── Matrices ──────────────────────────────────────────────────────────────────

const realGrid = (m: Matrix): Grid<number> => ({ rows: m.rows, cols: m.cols, data: m.data })
const imagGrid = (m: Matrix): Grid<number> => ({ rows: m.rows, cols: m.cols, data: m.imag ?? new Array<number>(m.data.length).fill(0) })

function buildMatrix(re: Grid<number>, im: Grid<number> | null, logical: boolean): Matrix {
  const out = new Matrix(re.rows, re.cols, re.data)
  if (im && im.data.some(v => v !== 0)) out.imag = im.data
  if (logical) out.logical = true
  return out
}

export function readMatrix(m: Matrix, subs: Subscript[]): Matrix {
  return buildMatrix(readGrid(realGrid(m), subs), m.imag ? readGrid(imagGrid(m), subs) : null, !!m.logical)
}

/** m(subs) = rhs. A logical target stays logical. With inPlace, m itself may be updated and returned. */
export function assignMatrix(m: Matrix, subs: Subscript[], rhs: Matrix, logical: boolean, inPlace = false): Matrix {
  let src = rhs
  if (logical && !rhs.logical) src = new Matrix(rhs.rows, rhs.cols, rhs.data.map(v => (v !== 0 ? 1 : 0)))
  const reuse = inPlace && !!m.logical === logical && (!src.imag || !!m.imag)
  const re = assignGrid(realGrid(m), subs, realGrid(src), 0, reuse)
  const im = !logical && (m.imag || src.imag) ? assignGrid(imagGrid(m), subs, imagGrid(src), 0, reuse) : null
  if (reuse && re.data === m.data) {
    m.rows = re.rows
    m.cols = re.cols
    if (im) m.imag = im.data
    return m
  }
  return buildMatrix(re, im, logical)
}

export function deleteMatrix(m: Matrix, subs: Subscript[]): Matrix {
  return buildMatrix(deleteGrid(realGrid(m), subs), m.imag ? deleteGrid(imagGrid(m), subs) : null, !!m.logical)
}

// ── Character vectors ─────────────────────────────────────────────────────────

function charGrid(s: string): Grid<number> {
  const codes = new Array<number>(s.length)
  for (let i = 0; i < s.length; i++) codes[i] = s.charCodeAt(i)
  return { rows: s.length === 0 ? 0 : 1, cols: s.length, data: codes }
}

export function codesToString(codes: number[]): string {
  let out = ''
  for (let i = 0; i < codes.length; i += 4096) out += String.fromCharCode(...codes.slice(i, i + 4096))
  return out
}

function charsFromGrid(g: Grid<number>): string {
  if (g.rows > 1 && g.cols > 1) {
    throw new RuntimeError('Character arrays with more than one row are not supported yet. Use a cell array of character vectors instead.')
  }
  return codesToString(g.data)
}

// ── Cells ─────────────────────────────────────────────────────────────────────

const emptyElement = () => Value.fromMatrix(new Matrix(0, 0))
const cellValue = (g: Grid<Value>) => Value.fromCell({ rows: g.rows, cols: g.cols, data: g.data })

function countTargets(g: { rows: number; cols: number }, subs: Subscript[]): number {
  if (subs.length === 1) return subs[0].all ? g.rows * g.cols : subs[0].idx.length
  let n = 1
  subs.forEach((s, p) => { n *= s.all ? (p === 0 ? g.rows : p === 1 ? g.cols : 1) : s.idx.length })
  return n
}

/** Storage offset of the single in-bounds element subs refers to, or null. */
function singleOffset(g: { rows: number; cols: number }, subs: Subscript[]): number | null {
  const pick = (s: Subscript, extent: number) => (s.all ? (extent === 1 ? 0 : -1) : s.idx[0])
  if (subs.length === 1) {
    const k = pick(subs[0], g.rows * g.cols)
    if (k < 0 || k >= g.rows * g.cols) return null
    const r = k % g.rows
    return r * g.cols + (k - r) / g.rows
  }
  const r = pick(subs[0], g.rows), c = pick(subs[1], g.cols)
  if (r < 0 || c < 0 || r >= g.rows || c >= g.cols) return null
  return r * g.cols + c
}

export function transposeCell(c: CellArray): CellArray {
  const data = new Array<Value>(c.data.length)
  for (let r = 0; r < c.rows; r++) for (let k = 0; k < c.cols; k++) data[k * c.rows + r] = c.data[r * c.cols + k]
  return { rows: c.cols, cols: c.rows, data }
}

// ── Value-level API used by the interpreter ───────────────────────────────────

function checkScalarSubscripts(subs: Subscript[]): void {
  subs.forEach((s, p) => {
    if (s.all) return
    if (s.idx.some(i => i > 0)) {
      throw new RuntimeError(subs.length === 1
        ? 'Index exceeds the number of array elements. Index must not exceed 1.'
        : `Index in position ${p + 1} exceeds array bounds. Index must not exceed 1.`)
    }
    if (s.idx.length !== 1) throw new RuntimeError('Struct arrays are not supported yet.')
  })
}

/** base(subs) */
export function indexValue(base: Value, subs: Subscript[]): Value {
  if (base.isString()) return Value.fromString(charsFromGrid(readGrid(charGrid(base.string()), subs)))
  if (base.isCell()) return cellValue(readGrid(base.cell(), subs))
  if (base.isStruct() || base.isFuncHandle()) {
    checkScalarSubscripts(subs)
    return base
  }
  return Value.fromMatrix(readMatrix(base.toMatrix(), subs))
}

/** base{subs}, as the list of values it expands to (column-major order). */
export function braceValues(base: Value, subs: Subscript[]): Value[] {
  if (!base.isCell()) throw new RuntimeError('Brace indexing is not supported for variables of this type.')
  return colMajor(readGrid(base.cell(), subs))
}

/** The element base{subs} refers to when updating it in place (c{2}.x = 1, c{2}(3) = 4). */
export function braceElement(base: Value | undefined, subs: Subscript[]): Value | undefined {
  if (!base || !base.isCell()) return undefined
  const c = base.cell()
  if (countTargets(c, subs) !== 1) return undefined
  const offset = singleOffset(c, subs)
  return offset === null ? undefined : c.data[offset]
}

/** MATLAB deletes elements when the right side of an indexed assignment is [] or ''. */
export function isDeletion(rhs: Value): boolean {
  if (rhs.isEmpty()) return true
  if (rhs.isMatrix()) { const m = rhs.matrix(); return m.rows === 0 && m.cols === 0 }
  return rhs.isString() && rhs.string().length === 0
}

const isEmptyArray = (v: Value | undefined) => !v || (v.isMatrix() && v.matrix().numel() === 0)

/** base(subs) = rhs, including growth and deletion. base is undefined for a new variable. */
export function assignIndexed(base: Value | undefined, subs: Subscript[], rhs: Value, inPlace = false): Value {
  const deleting = isDeletion(rhs)
  const target = base && !base.isEmpty() ? base : undefined

  if (target?.isCell()) {
    const c = target.cell()
    if (deleting) return cellValue(deleteGrid(c, subs))
    if (!rhs.isCell()) throw new RuntimeError(`Conversion to cell from ${rhs.className()} is not possible.`)
    const g = assignGrid(c, subs, rhs.cell(), emptyElement(), inPlace)
    if (inPlace && g.data === c.data) { c.rows = g.rows; c.cols = g.cols; return target }
    return cellValue(g)
  }
  if (target?.isStruct() || (!deleting && rhs.isStruct() && isEmptyArray(target))) {
    if (rhs.isStruct() && subs.every(isFirstElement)) return rhs
    throw new RuntimeError('Struct arrays are not supported yet.')
  }
  if (target?.isFuncHandle()) throw new RuntimeError('Function handles cannot be indexed into.')
  if (!deleting && rhs.isCell() && isEmptyArray(target)) {
    return cellValue(assignGrid({ rows: 0, cols: 0, data: [] }, subs, rhs.cell(), emptyElement(), false))
  }
  if (target?.isString() || (!deleting && rhs.isString() && isEmptyArray(target))) {
    const g = charGrid(target?.isString() ? target.string() : '')
    if (deleting) return Value.fromString(charsFromGrid(deleteGrid(g, subs)))
    if (!rhs.isString() && !rhs.isMatrix()) throw new RuntimeError(`Conversion to char from ${rhs.className()} is not possible.`)
    const src = rhs.isString() ? charGrid(rhs.string()) : realGrid(rhs.matrix())
    return Value.fromString(charsFromGrid(assignGrid(g, subs, src, 0, false)))
  }

  const m = target ? target.toMatrix() : new Matrix(0, 0)
  if (deleting) return Value.fromMatrix(deleteMatrix(m, subs))
  if (rhs.isCell() || rhs.isStruct() || rhs.isFuncHandle()) {
    throw new RuntimeError(`Conversion to double from ${rhs.className()} is not possible.`)
  }
  const r = rhs.toMatrix()
  const logical = !!m.logical || (!target && !!r.logical)
  const result = assignMatrix(m, subs, r, logical, inPlace && !!target)
  return result === m ? target! : Value.fromMatrix(result)
}

/** base{subs} = value. base is undefined for a new variable. */
export function assignBraced(base: Value | undefined, subs: Subscript[], value: Value, inPlace = false): Value {
  const target = base && !base.isEmpty() ? base : undefined
  let c: CellArray
  if (isEmptyArray(target)) c = { rows: 0, cols: 0, data: [] }
  else if (target!.isCell()) c = target!.cell()
  else throw new RuntimeError('Unable to perform assignment because brace indexing is not supported for variables of this type.')
  if (countTargets(c, subs) !== 1) {
    throw new RuntimeError('Brace assignment must refer to exactly one cell element, for example c{2} = value.')
  }
  const reuse = inPlace && !!target && target.isCell()
  const g = assignGrid(c, subs, { rows: 1, cols: 1, data: [value] }, emptyElement(), reuse)
  if (reuse && g.data === c.data) { c.rows = g.rows; c.cols = g.cols; return target! }
  return cellValue(g)
}
