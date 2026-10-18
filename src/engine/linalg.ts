// MatFree Engine - Dense linear solves behind the \ and / operators, and matrix powers.

import { Matrix, RuntimeError } from './value'

const EPS = 2.220446049250313e-16

export interface SolveResult { x: Matrix; warning?: string }

/**
 * MATLAB mldivide (A\B) for real matrices: LU with partial pivoting for square
 * systems, column-pivoted Householder QR (least squares / basic solution) otherwise.
 */
export function mldivide(A: Matrix, B: Matrix): SolveResult {
  if (A.rows !== B.rows) throw new RuntimeError('Matrix dimensions must agree.')
  if (A.imag || B.imag) throw new RuntimeError('Complex linear systems are not supported by \\ yet.')
  if (A.numel() === 0 || B.numel() === 0) return { x: new Matrix(A.cols, B.cols) }
  return A.rows === A.cols ? solveSquare(A, B) : solveLeastSquares(A, B)
}

function solveSquare(A: Matrix, B: Matrix): SolveResult {
  const n = A.rows, k = B.cols
  const lu = A.data.slice()
  const perm = Array.from({ length: n }, (_, i) => i)
  for (let col = 0; col < n; col++) {
    let p = col, best = Math.abs(lu[col * n + col])
    for (let r = col + 1; r < n; r++) {
      const v = Math.abs(lu[r * n + col])
      if (v > best) { best = v; p = r }
    }
    if (best === 0) continue
    if (p !== col) {
      for (let c = 0; c < n; c++) { const t = lu[col * n + c]; lu[col * n + c] = lu[p * n + c]; lu[p * n + c] = t }
      const t = perm[col]; perm[col] = perm[p]; perm[p] = t
    }
    const pivot = lu[col * n + col]
    for (let r = col + 1; r < n; r++) {
      const f = lu[r * n + col] / pivot
      lu[r * n + col] = f
      if (f === 0) continue
      for (let c = col + 1; c < n; c++) lu[r * n + c] -= f * lu[col * n + c]
    }
  }

  let minPivot = Infinity, maxPivot = 0
  for (let i = 0; i < n; i++) {
    const v = Math.abs(lu[i * n + i])
    if (v < minPivot) minPivot = v
    if (v > maxPivot) maxPivot = v
  }

  const x = new Matrix(n, k)
  const y = new Array<number>(n)
  for (let j = 0; j < k; j++) {
    for (let i = 0; i < n; i++) {
      let s = B.data[perm[i] * k + j]
      for (let c = 0; c < i; c++) s -= lu[i * n + c] * y[c]
      y[i] = s
    }
    for (let i = n - 1; i >= 0; i--) {
      let s = y[i]
      for (let c = i + 1; c < n; c++) s -= lu[i * n + c] * x.data[c * k + j]
      x.data[i * k + j] = s / lu[i * n + i]
    }
  }

  let warning: string | undefined
  if (minPivot === 0) warning = 'Matrix is singular to working precision.'
  else if (minPivot / maxPivot < EPS) warning = 'Matrix is close to singular or badly scaled. Results may be inaccurate.'
  return { x, warning }
}

function solveLeastSquares(A: Matrix, B: Matrix): SolveResult {
  const m = A.rows, n = A.cols, k = B.cols
  // Column-major working copies: a[c][r], b[j][r].
  const a: number[][] = []
  for (let c = 0; c < n; c++) {
    const col = new Array<number>(m)
    for (let r = 0; r < m; r++) col[r] = A.data[r * n + c]
    a.push(col)
  }
  const b: number[][] = []
  for (let j = 0; j < k; j++) {
    const col = new Array<number>(m)
    for (let r = 0; r < m; r++) col[r] = B.data[r * k + j]
    b.push(col)
  }
  const perm = Array.from({ length: n }, (_, i) => i)
  const steps = Math.min(m, n)
  const diag: number[] = []

  for (let s = 0; s < steps; s++) {
    let p = s, best = -1
    for (let c = s; c < n; c++) {
      let v = 0
      for (let r = s; r < m; r++) v += a[c][r] * a[c][r]
      if (v > best) { best = v; p = c }
    }
    if (p !== s) {
      const t = a[s]; a[s] = a[p]; a[p] = t
      const q = perm[s]; perm[s] = perm[p]; perm[p] = q
    }
    const col = a[s]
    let alpha = 0
    for (let r = s; r < m; r++) alpha += col[r] * col[r]
    alpha = Math.sqrt(alpha)
    if (alpha === 0) { diag.push(0); continue }
    if (col[s] > 0) alpha = -alpha
    const v = new Array<number>(m - s)
    for (let r = s; r < m; r++) v[r - s] = col[r]
    v[0] -= alpha
    let vv = 0
    for (const t of v) vv += t * t
    const reflect = (x: number[]) => {
      let dot = 0
      for (let r = s; r < m; r++) dot += v[r - s] * x[r]
      const f = (2 * dot) / vv
      for (let r = s; r < m; r++) x[r] -= f * v[r - s]
    }
    if (vv > 0) {
      for (let c = s; c < n; c++) reflect(a[c])
      for (const bj of b) reflect(bj)
    }
    diag.push(a[s][s])
  }

  const tol = Math.max(m, n) * EPS * Math.abs(diag[0] ?? 0)
  let rank = 0
  while (rank < diag.length && Math.abs(diag[rank]) > tol) rank++

  const x = new Matrix(n, k)
  const z = new Array<number>(rank)
  for (let j = 0; j < k; j++) {
    for (let i = rank - 1; i >= 0; i--) {
      let sum = b[j][i]
      for (let c = i + 1; c < rank; c++) sum -= a[c][i] * z[c]
      z[i] = sum / a[i][i]
    }
    for (let i = 0; i < rank; i++) x.data[perm[i] * k + j] = z[i]
  }
  const warning = rank < steps ? `Rank deficient, rank = ${rank}, tol = ${tol.toExponential(6)}.` : undefined
  return { x, warning }
}

/** A^p for a square matrix and integer p (negative powers invert first). */
export function matrixPower(A: Matrix, p: number): Matrix {
  if (A.rows !== A.cols) {
    throw new RuntimeError('Incorrect dimensions for raising a matrix to a power. Check that the matrix is square and the power is a scalar. To operate on each element of the matrix individually, use POWER (.^) for elementwise power.')
  }
  let base = p < 0 ? A.inv() : A
  let e = Math.abs(p)
  let result = Matrix.eye(A.rows)
  while (e > 0) {
    if (e % 2 === 1) result = result.mul(base)
    e = Math.floor(e / 2)
    if (e > 0) base = base.mul(base)
  }
  return result
}
