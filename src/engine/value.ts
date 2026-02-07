// MatFree Engine - Runtime Value System

export class RuntimeError extends Error {
  constructor(msg: string) { super(msg); this.name = 'RuntimeError' }
}

export class Matrix {
  data: number[]
  rows: number
  cols: number

  constructor(rows: number, cols: number, data?: number[]) {
    this.rows = rows; this.cols = cols
    this.data = data ?? new Array(rows * cols).fill(0)
  }

  static scalar(v: number): Matrix { return new Matrix(1, 1, [v]) }
  static zeros(r: number, c: number): Matrix { return new Matrix(r, c) }
  static ones(r: number, c: number): Matrix { return new Matrix(r, c, new Array(r * c).fill(1)) }
  static eye(n: number): Matrix { const m = new Matrix(n, n); for (let i = 0; i < n; i++) m.set(i, i, 1); return m }

  static rand(r: number, c: number): Matrix {
    const m = new Matrix(r, c)
    for (let i = 0; i < r * c; i++) m.data[i] = Math.random()
    return m
  }

  static randn(r: number, c: number): Matrix {
    const m = new Matrix(r, c)
    for (let i = 0; i < r * c; i++) {
      const u1 = Math.random(), u2 = Math.random()
      m.data[i] = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
    }
    return m
  }

  static linspace(a: number, b: number, n: number): Matrix {
    const m = new Matrix(1, n)
    for (let i = 0; i < n; i++) m.data[i] = n > 1 ? a + i * (b - a) / (n - 1) : a
    return m
  }

  get(r: number, c: number): number { return this.data[r * this.cols + c] }
  set(r: number, c: number, v: number): void { this.data[r * this.cols + c] = v }
  numel(): number { return this.rows * this.cols }
  isScalar(): boolean { return this.rows === 1 && this.cols === 1 }
  scalarValue(): number { return this.data[0] }

  getWithBroadcast(r: number, c: number): number {
    const rr = this.rows === 1 ? 0 : r
    const cc = this.cols === 1 ? 0 : c
    return this.data[rr * this.cols + cc]
  }

  clone(): Matrix { return new Matrix(this.rows, this.cols, [...this.data]) }

  transpose(): Matrix {
    const m = new Matrix(this.cols, this.rows)
    for (let r = 0; r < this.rows; r++)
      for (let c = 0; c < this.cols; c++) m.set(c, r, this.get(r, c))
    return m
  }

  add(o: Matrix): Matrix {
    const [rr, cc] = this.broadcastSize(o)
    const m = new Matrix(rr, cc)
    for (let r = 0; r < rr; r++) for (let c = 0; c < cc; c++) m.set(r, c, this.getWithBroadcast(r, c) + o.getWithBroadcast(r, c))
    return m
  }

  sub(o: Matrix): Matrix {
    const [rr, cc] = this.broadcastSize(o)
    const m = new Matrix(rr, cc)
    for (let r = 0; r < rr; r++) for (let c = 0; c < cc; c++) m.set(r, c, this.getWithBroadcast(r, c) - o.getWithBroadcast(r, c))
    return m
  }

  mul(o: Matrix): Matrix {
    if (this.cols !== o.rows) throw new RuntimeError(`Matrix dimensions do not agree for multiplication: ${this.rows}x${this.cols} * ${o.rows}x${o.cols}`)
    const m = new Matrix(this.rows, o.cols)
    for (let r = 0; r < this.rows; r++)
      for (let c = 0; c < o.cols; c++) { let s = 0; for (let k = 0; k < this.cols; k++) s += this.get(r, k) * o.get(k, c); m.set(r, c, s) }
    return m
  }

  elementMul(o: Matrix): Matrix {
    const [rr, cc] = this.broadcastSize(o)
    const m = new Matrix(rr, cc)
    for (let r = 0; r < rr; r++) for (let c = 0; c < cc; c++) m.set(r, c, this.getWithBroadcast(r, c) * o.getWithBroadcast(r, c))
    return m
  }

  elementDiv(o: Matrix): Matrix {
    const [rr, cc] = this.broadcastSize(o)
    const m = new Matrix(rr, cc)
    for (let r = 0; r < rr; r++) for (let c = 0; c < cc; c++) m.set(r, c, this.getWithBroadcast(r, c) / o.getWithBroadcast(r, c))
    return m
  }

  elementPow(o: Matrix): Matrix {
    const [rr, cc] = this.broadcastSize(o)
    const m = new Matrix(rr, cc)
    for (let r = 0; r < rr; r++) for (let c = 0; c < cc; c++) m.set(r, c, Math.pow(this.getWithBroadcast(r, c), o.getWithBroadcast(r, c)))
    return m
  }

  neg(): Matrix { return new Matrix(this.rows, this.cols, this.data.map(v => -v)) }

  scalarOp(s: number, op: string): Matrix {
    return new Matrix(this.rows, this.cols, this.data.map(v => {
      switch (op) { case '+': return v + s; case '-': return v - s; case '*': return v * s; case '/': return v / s; case '^': return Math.pow(v, s); default: return v }
    }))
  }

  sum(): number { return this.data.reduce((a, b) => a + b, 0) }
  prod(): number { return this.data.reduce((a, b) => a * b, 1) }
  mean(): number { return this.sum() / this.numel() }
  minVal(): number { return Math.min(...this.data) }
  maxVal(): number { return Math.max(...this.data) }
  norm(): number { return Math.sqrt(this.data.reduce((s, v) => s + v * v, 0)) }

  det(): number {
    if (this.rows !== this.cols) throw new RuntimeError('det requires square matrix')
    const n = this.rows
    if (n === 1) return this.data[0]
    if (n === 2) return this.data[0] * this.data[3] - this.data[1] * this.data[2]
    const a = this.clone().data
    let d = 1
    for (let i = 0; i < n; i++) {
      let max = i
      for (let j = i + 1; j < n; j++) if (Math.abs(a[j * n + i]) > Math.abs(a[max * n + i])) max = j
      if (max !== i) { for (let k = 0; k < n; k++) { const t = a[i * n + k]; a[i * n + k] = a[max * n + k]; a[max * n + k] = t }; d = -d }
      if (Math.abs(a[i * n + i]) < 1e-14) return 0
      d *= a[i * n + i]
      for (let j = i + 1; j < n; j++) { const f = a[j * n + i] / a[i * n + i]; for (let k = i; k < n; k++) a[j * n + k] -= f * a[i * n + k] }
    }
    return d
  }

  inv(): Matrix {
    if (this.rows !== this.cols) throw new RuntimeError('inv requires square matrix')
    const n = this.rows
    const aug = Matrix.zeros(n, 2 * n)
    for (let r = 0; r < n; r++) { for (let c = 0; c < n; c++) aug.set(r, c, this.get(r, c)); aug.set(r, r + n, 1) }
    for (let i = 0; i < n; i++) {
      let max = i
      for (let j = i + 1; j < n; j++) if (Math.abs(aug.get(j, i)) > Math.abs(aug.get(max, i))) max = j
      if (max !== i) for (let k = 0; k < 2 * n; k++) { const t = aug.get(i, k); aug.set(i, k, aug.get(max, k)); aug.set(max, k, t) }
      const pivot = aug.get(i, i); if (Math.abs(pivot) < 1e-14) throw new RuntimeError('Matrix is singular')
      for (let k = 0; k < 2 * n; k++) aug.set(i, k, aug.get(i, k) / pivot)
      for (let j = 0; j < n; j++) if (j !== i) { const f = aug.get(j, i); for (let k = 0; k < 2 * n; k++) aug.set(j, k, aug.get(j, k) - f * aug.get(i, k)) }
    }
    const result = Matrix.zeros(n, n)
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) result.set(r, c, aug.get(r, c + n))
    return result
  }

  trace(): number {
    if (this.rows !== this.cols) throw new RuntimeError('trace requires square matrix')
    let s = 0; for (let i = 0; i < this.rows; i++) s += this.get(i, i); return s
  }

  horzcat(o: Matrix): Matrix {
    if (this.rows !== o.rows) throw new RuntimeError('Horizontal cat: row mismatch')
    const m = new Matrix(this.rows, this.cols + o.cols)
    for (let r = 0; r < this.rows; r++) { for (let c = 0; c < this.cols; c++) m.set(r, c, this.get(r, c)); for (let c = 0; c < o.cols; c++) m.set(r, this.cols + c, o.get(r, c)) }
    return m
  }

  vertcat(o: Matrix): Matrix {
    if (this.cols !== o.cols) throw new RuntimeError('Vertical cat: col mismatch')
    const m = new Matrix(this.rows + o.rows, this.cols)
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) m.set(r, c, this.get(r, c))
    for (let r = 0; r < o.rows; r++) for (let c = 0; c < this.cols; c++) m.set(this.rows + r, c, o.get(r, c))
    return m
  }

  reshape(r: number, c: number): Matrix {
    if (r * c !== this.numel()) throw new RuntimeError('reshape: numel mismatch')
    return new Matrix(r, c, [...this.data])
  }

  toString(): string {
    if (this.numel() === 0) return '[]'
    if (this.isScalar()) return formatNum(this.data[0])
    const lines: string[] = []
    for (let r = 0; r < this.rows; r++) {
      const vals: string[] = []
      for (let c = 0; c < this.cols; c++) vals.push(formatNum(this.get(r, c)).padStart(10))
      lines.push('  ' + vals.join('  '))
    }
    return lines.join('\n')
  }

  private broadcastSize(o: Matrix): [number, number] {
    const rr = Math.max(this.rows, o.rows), cc = Math.max(this.cols, o.cols)
    if (this.rows !== o.rows && this.rows !== 1 && o.rows !== 1) throw new RuntimeError('Matrix dimensions not compatible')
    if (this.cols !== o.cols && this.cols !== 1 && o.cols !== 1) throw new RuntimeError('Matrix dimensions not compatible')
    return [rr, cc]
  }
}

function formatNum(v: number): string {
  if (Number.isNaN(v)) return 'NaN'
  if (!Number.isFinite(v)) return v > 0 ? 'Inf' : '-Inf'
  if (Number.isInteger(v) && Math.abs(v) < 1e15) return v.toString()
  const s = v.toPrecision(4)
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s
}

// Value types
export type FuncHandle = { type: 'builtin'; name: string } | { type: 'anonymous'; params: string[]; body: any; closure: any }
export type CellArray = { rows: number; cols: number; data: Value[] }
export type MFStruct = { [key: string]: Value }

export type ValueType = 'matrix' | 'string' | 'cell' | 'struct' | 'funcHandle' | 'logical' | 'empty'

export class Value {
  private constructor(
    public readonly type: ValueType,
    private _matrix?: Matrix,
    private _string?: string,
    private _cell?: CellArray,
    private _struct?: MFStruct,
    private _funcHandle?: FuncHandle,
  ) {}

  static fromMatrix(m: Matrix): Value { return new Value('matrix', m) }
  static fromScalar(v: number): Value { return new Value('matrix', Matrix.scalar(v)) }
  static fromString(s: string): Value { return new Value('string', undefined, s) }
  static fromLogical(b: boolean): Value { return new Value('matrix', Matrix.scalar(b ? 1 : 0)) }
  static fromCell(c: CellArray): Value { return new Value('cell', undefined, undefined, c) }
  static fromStruct(s: MFStruct): Value { return new Value('struct', undefined, undefined, undefined, s) }
  static fromFuncHandle(f: FuncHandle): Value { return new Value('funcHandle', undefined, undefined, undefined, undefined, f) }
  static empty(): Value { return new Value('empty') }

  isMatrix(): boolean { return this.type === 'matrix' }
  isString(): boolean { return this.type === 'string' }
  isCell(): boolean { return this.type === 'cell' }
  isStruct(): boolean { return this.type === 'struct' }
  isFuncHandle(): boolean { return this.type === 'funcHandle' }
  isEmpty(): boolean { return this.type === 'empty' }

  matrix(): Matrix {
    if (this._matrix) return this._matrix
    throw new RuntimeError('Value is not a matrix')
  }

  string(): string {
    if (this._string !== undefined) return this._string
    throw new RuntimeError('Value is not a string')
  }

  cell(): CellArray {
    if (this._cell) return this._cell
    throw new RuntimeError('Value is not a cell array')
  }

  struct(): MFStruct {
    if (this._struct) return this._struct
    throw new RuntimeError('Value is not a struct')
  }

  funcHandle(): FuncHandle {
    if (this._funcHandle) return this._funcHandle
    throw new RuntimeError('Value is not a function handle')
  }

  toScalar(): number {
    if (this.isMatrix()) return this.matrix().scalarValue()
    if (this.isString()) return this._string!.length === 1 ? this._string!.charCodeAt(0) : NaN
    throw new RuntimeError('Cannot convert to scalar')
  }

  toBool(): boolean {
    if (this.isMatrix()) return this.matrix().data.every(v => v !== 0)
    if (this.isString()) return this._string!.length > 0
    return false
  }

  toMatrix(): Matrix {
    if (this.isMatrix()) return this.matrix()
    if (this.isString()) {
      const d = [...this._string!].map(c => c.charCodeAt(0))
      return new Matrix(1, d.length, d)
    }
    throw new RuntimeError('Cannot convert to matrix')
  }

  display(name?: string): string {
    const label = name ?? 'ans'
    if (this.isMatrix()) {
      const m = this.matrix()
      if (m.isScalar()) return `${label} = ${formatNum(m.scalarValue())}\n`
      if (m.numel() === 0) return `${label} = []\n`
      return `${label} =\n${m.toString()}\n`
    }
    if (this.isString()) return `${label} = '${this._string}'\n`
    if (this.isStruct()) {
      const s = this._struct!
      const lines = Object.keys(s).map(k => `    ${k}: ${s[k].display().trim()}`)
      return `${label} =\n  struct with fields:\n${lines.join('\n')}\n`
    }
    if (this.isCell()) return `${label} = {${this._cell!.rows}x${this._cell!.cols} cell}\n`
    if (this.isFuncHandle()) return `${label} = @function_handle\n`
    return `${label} = [empty]\n`
  }
}
