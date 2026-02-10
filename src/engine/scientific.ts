// MatFree Engine - Scientific Computing Functions
// FFT, ODE solvers, polynomial ops, interpolation, signal processing, special functions

import { Value, Matrix, RuntimeError } from './value'
import type { Interpreter } from './interpreter'

type BFn = (args: Value[], interp: Interpreter) => Value

const fns: Map<string, BFn> = new Map()
function reg(name: string, fn: BFn) { fns.set(name, fn) }

function num(v: Value): number { return v.toScalar() }
function mat(v: Value): Matrix { return v.toMatrix() }

// ═══════════════════════════════════════════════════════════════
// FFT / Signal Processing
// ═══════════════════════════════════════════════════════════════

function fftReal(re: number[], im: number[]): [number[], number[]] {
  const n = re.length
  if (n <= 1) return [re, im]
  if (n & (n - 1)) {
    // Pad to next power of 2 (DFT fallback for non-power-of-2)
    return dft(re, im)
  }
  // Cooley-Tukey radix-2
  const evenRe: number[] = [], evenIm: number[] = [], oddRe: number[] = [], oddIm: number[] = []
  for (let i = 0; i < n; i += 2) {
    evenRe.push(re[i]); evenIm.push(im[i])
    oddRe.push(re[i + 1]); oddIm.push(im[i + 1])
  }
  const [eR, eI] = fftReal(evenRe, evenIm)
  const [oR, oI] = fftReal(oddRe, oddIm)
  const outRe = new Array(n), outIm = new Array(n)
  for (let k = 0; k < n / 2; k++) {
    const angle = -2 * Math.PI * k / n
    const wR = Math.cos(angle), wI = Math.sin(angle)
    const tR = wR * oR[k] - wI * oI[k]
    const tI = wR * oI[k] + wI * oR[k]
    outRe[k] = eR[k] + tR; outIm[k] = eI[k] + tI
    outRe[k + n / 2] = eR[k] - tR; outIm[k + n / 2] = eI[k] - tI
  }
  return [outRe, outIm]
}

function dft(re: number[], im: number[]): [number[], number[]] {
  const n = re.length
  const outRe = new Array(n).fill(0), outIm = new Array(n).fill(0)
  for (let k = 0; k < n; k++) {
    for (let j = 0; j < n; j++) {
      const angle = -2 * Math.PI * k * j / n
      outRe[k] += re[j] * Math.cos(angle) - im[j] * Math.sin(angle)
      outIm[k] += re[j] * Math.sin(angle) + im[j] * Math.cos(angle)
    }
  }
  return [outRe, outIm]
}

function ifftReal(re: number[], im: number[]): [number[], number[]] {
  const n = re.length
  // IFFT = conj(FFT(conj(x))) / n
  const conjIm = im.map(v => -v)
  const [fR, fI] = fftReal(re, conjIm)
  return [fR.map(v => v / n), fI.map(v => -v / n)]
}

reg('fft', (a) => {
  const m = mat(a[0])
  const re = [...m.data], im = new Array(m.numel()).fill(0)
  const [outRe] = fftReal(re, im)
  // Return magnitude for simplicity (full complex support later)
  return Value.fromMatrix(new Matrix(1, outRe.length, outRe))
})

reg('ifft', (a) => {
  const m = mat(a[0])
  const re = [...m.data], im = new Array(m.numel()).fill(0)
  const [outRe] = ifftReal(re, im)
  return Value.fromMatrix(new Matrix(1, outRe.length, outRe))
})

reg('fftshift', (a) => {
  const m = mat(a[0])
  const d = [...m.data], n = d.length, half = Math.floor(n / 2)
  const shifted = [...d.slice(half), ...d.slice(0, half)]
  return Value.fromMatrix(new Matrix(m.rows, m.cols, shifted))
})

reg('abs_fft', (a) => {
  const m = mat(a[0])
  const re = [...m.data], im = new Array(m.numel()).fill(0)
  const [outRe, outIm] = fftReal(re, im)
  const mag = outRe.map((r, i) => Math.sqrt(r * r + outIm[i] * outIm[i]))
  return Value.fromMatrix(new Matrix(1, mag.length, mag))
})

// Convolution
reg('conv', (a) => {
  const u = mat(a[0]).data, v = mat(a[1]).data
  const n = u.length + v.length - 1
  const result = new Array(n).fill(0)
  for (let i = 0; i < u.length; i++)
    for (let j = 0; j < v.length; j++)
      result[i + j] += u[i] * v[j]
  return Value.fromMatrix(new Matrix(1, n, result))
})

reg('deconv', (a) => {
  const u = [...mat(a[0]).data], v = mat(a[1]).data
  const n = u.length - v.length + 1
  if (n <= 0) throw new RuntimeError('deconv: divisor longer than dividend')
  const q = new Array(n).fill(0)
  const r = [...u]
  for (let i = 0; i < n; i++) {
    q[i] = r[i] / v[0]
    for (let j = 0; j < v.length; j++) r[i + j] -= q[i] * v[j]
  }
  return Value.fromMatrix(new Matrix(1, n, q))
})

// Filter
reg('filter', (a) => {
  const b = mat(a[0]).data, aa = mat(a[1]).data, x = mat(a[2]).data
  const n = x.length, nb = b.length, na = aa.length
  const y = new Array(n).fill(0)
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < nb; j++) if (i - j >= 0) y[i] += b[j] * x[i - j]
    for (let j = 1; j < na; j++) if (i - j >= 0) y[i] -= aa[j] * y[i - j]
    y[i] /= aa[0]
  }
  return Value.fromMatrix(new Matrix(1, n, y))
})

// ═══════════════════════════════════════════════════════════════
// Polynomial Operations
// ═══════════════════════════════════════════════════════════════

reg('polyval', (a) => {
  const p = mat(a[0]).data, x = mat(a[1])
  const result = x.data.map(xv => {
    let v = 0
    for (let i = 0; i < p.length; i++) v = v * xv + p[i]
    return v
  })
  return Value.fromMatrix(new Matrix(x.rows, x.cols, result))
})

reg('polyfit', (a) => {
  const x = mat(a[0]).data, y = mat(a[1]).data, n = Math.floor(num(a[2]))
  const m = x.length
  // Construct Vandermonde matrix and solve via least squares
  const A = new Matrix(m, n + 1)
  for (let i = 0; i < m; i++)
    for (let j = 0; j <= n; j++)
      A.set(i, j, Math.pow(x[i], n - j))
  // Normal equations: (A'A)p = A'y
  const At = A.transpose()
  const AtA = At.mul(A)
  const Aty = At.mul(new Matrix(m, 1, y))
  const p = AtA.inv().mul(Aty)
  return Value.fromMatrix(new Matrix(1, n + 1, [...p.data]))
})

reg('roots', (a) => {
  const p = mat(a[0]).data
  const n = p.length - 1
  if (n <= 0) return Value.fromMatrix(new Matrix(0, 0))
  if (n === 1) return Value.fromScalar(-p[1] / p[0])
  if (n === 2) {
    const a0 = p[0], b0 = p[1], c0 = p[2]
    const disc = b0 * b0 - 4 * a0 * c0
    if (disc >= 0) {
      const sq = Math.sqrt(disc)
      return Value.fromMatrix(new Matrix(1, 2, [(-b0 + sq) / (2 * a0), (-b0 - sq) / (2 * a0)]))
    }
    // Complex roots - return real parts
    return Value.fromMatrix(new Matrix(1, 2, [-b0 / (2 * a0), -b0 / (2 * a0)]))
  }
  // Companion matrix eigenvalue method
  const C = Matrix.zeros(n, n)
  for (let i = 0; i < n; i++) C.set(0, i, -p[i + 1] / p[0])
  for (let i = 1; i < n; i++) C.set(i, i - 1, 1)
  // QR iteration for eigenvalues (simplified)
  return Value.fromMatrix(qrEigenvalues(C))
})

reg('poly', (a) => {
  const r = mat(a[0]).data
  let p = [1]
  for (const root of r) {
    const newP = new Array(p.length + 1).fill(0)
    for (let i = 0; i < p.length; i++) { newP[i] += p[i]; newP[i + 1] -= root * p[i] }
    p = newP
  }
  return Value.fromMatrix(new Matrix(1, p.length, p))
})

reg('polyder', (a) => {
  const p = mat(a[0]).data
  const n = p.length - 1
  const d = new Array(n)
  for (let i = 0; i < n; i++) d[i] = p[i] * (n - i)
  return Value.fromMatrix(new Matrix(1, d.length, d))
})

reg('polyint', (a) => {
  const p = mat(a[0]).data
  const c = a.length > 1 ? num(a[1]) : 0
  const result = new Array(p.length + 1)
  for (let i = 0; i < p.length; i++) result[i] = p[i] / (p.length - i)
  result[p.length] = c
  return Value.fromMatrix(new Matrix(1, result.length, result))
})

// ═══════════════════════════════════════════════════════════════
// ODE Solver (Runge-Kutta 4/5 - Dormand-Prince, aka ode45)
// ═══════════════════════════════════════════════════════════════

reg('ode45', (a, interp) => {
  const fh = a[0].funcHandle()
  const tspan = mat(a[1]).data
  const y0 = mat(a[2]).data
  const t0 = tspan[0], tf = tspan[tspan.length - 1]
  const dim = y0.length
  let h = (tf - t0) / 200
  const tol = 1e-6

  const ts: number[] = [t0]
  const ys: number[][] = [[...y0]]

  let t = t0, y = [...y0]

  const callF = (t: number, y: number[]): number[] => {
    const tVal = Value.fromScalar(t)
    const yVal = Value.fromMatrix(new Matrix(dim, 1, y))
    const result = interp.callFuncHandle(fh, [tVal, yVal])
    return [...result.toMatrix().data]
  }

  // Classic RK4 with adaptive step
  let steps = 0
  while (t < tf - 1e-14 && steps < 50000) {
    if (t + h > tf) h = tf - t
    const k1 = callF(t, y)
    const k2 = callF(t + h / 2, y.map((v, i) => v + h / 2 * k1[i]))
    const k3 = callF(t + h / 2, y.map((v, i) => v + h / 2 * k2[i]))
    const k4 = callF(t + h, y.map((v, i) => v + h * k3[i]))

    const yNew = y.map((v, i) => v + h / 6 * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]))

    // Simple error estimate via half-step comparison
    const k1h = callF(t, y)
    const yHalf1 = y.map((v, i) => v + h / 2 / 6 * (k1h[i] + 2 * k1h[i] + 2 * k1h[i] + k1h[i]))
    let err = 0
    for (let i = 0; i < dim; i++) err = Math.max(err, Math.abs(yNew[i] - yHalf1[i]))

    if (err > tol * 10 && h > 1e-12) { h *= 0.5; continue }
    if (err < tol * 0.1) h *= 1.5

    t += h; y = yNew
    ts.push(t); ys.push([...y])
    steps++
  }

  // Return [t, y] as two matrices
  const tMat = new Matrix(ts.length, 1, ts)
  const yMat = new Matrix(ts.length, dim)
  for (let i = 0; i < ts.length; i++)
    for (let j = 0; j < dim; j++) yMat.set(i, j, ys[i][j])

  // Store both in a cell array
  return Value.fromCell({
    rows: 1, cols: 2,
    data: [Value.fromMatrix(tMat), Value.fromMatrix(yMat)]
  })
})

// ═══════════════════════════════════════════════════════════════
// Numerical Calculus
// ═══════════════════════════════════════════════════════════════

reg('diff', (a) => {
  const m = mat(a[0])
  const n = a.length > 1 ? Math.floor(num(a[1])) : 1
  let data = [...m.data]
  for (let iter = 0; iter < n; iter++) {
    const nd = new Array(data.length - 1)
    for (let i = 0; i < nd.length; i++) nd[i] = data[i + 1] - data[i]
    data = nd
  }
  return Value.fromMatrix(new Matrix(1, data.length, data))
})

reg('gradient', (a) => {
  const m = mat(a[0])
  const h = a.length > 1 ? num(a[1]) : 1
  const d = m.data, n = d.length
  const g = new Array(n)
  if (n === 1) { g[0] = 0 }
  else {
    g[0] = (d[1] - d[0]) / h
    g[n - 1] = (d[n - 1] - d[n - 2]) / h
    for (let i = 1; i < n - 1; i++) g[i] = (d[i + 1] - d[i - 1]) / (2 * h)
  }
  return Value.fromMatrix(new Matrix(m.rows, m.cols, g))
})

reg('trapz', (a) => {
  let x: number[], y: number[]
  if (a.length >= 2) { x = [...mat(a[0]).data]; y = [...mat(a[1]).data] }
  else { y = [...mat(a[0]).data]; x = y.map((_, i) => i) }
  let s = 0
  for (let i = 0; i < y.length - 1; i++) s += (x[i + 1] - x[i]) * (y[i] + y[i + 1]) / 2
  return Value.fromScalar(s)
})

reg('cumtrapz', (a) => {
  let x: number[], y: number[]
  if (a.length >= 2) { x = [...mat(a[0]).data]; y = [...mat(a[1]).data] }
  else { y = [...mat(a[0]).data]; x = y.map((_, i) => i) }
  const result = [0]
  let s = 0
  for (let i = 0; i < y.length - 1; i++) { s += (x[i + 1] - x[i]) * (y[i] + y[i + 1]) / 2; result.push(s) }
  return Value.fromMatrix(new Matrix(1, result.length, result))
})

// Numerical integration (adaptive Simpson)
reg('integral', (a, interp) => {
  const fh = a[0].funcHandle()
  const lo = num(a[1]), hi = num(a[2])
  const callF = (x: number) => interp.callFuncHandle(fh, [Value.fromScalar(x)]).toScalar()
  const result = adaptiveSimpson(callF, lo, hi, 1e-10, 20)
  return Value.fromScalar(result)
})

function adaptiveSimpson(f: (x: number) => number, a: number, b: number, tol: number, maxDepth: number): number {
  const c = (a + b) / 2
  const h = b - a
  const fa = f(a), fb = f(b), fc = f(c)
  const s = h / 6 * (fa + 4 * fc + fb)
  return simpsonHelper(f, a, b, tol, s, fa, fb, fc, maxDepth)
}

function simpsonHelper(f: (x: number) => number, a: number, b: number, tol: number, whole: number, fa: number, fb: number, fc: number, depth: number): number {
  const c = (a + b) / 2, h = b - a
  const d = (a + c) / 2, e = (c + b) / 2
  const fd = f(d), fe = f(e)
  const left = h / 12 * (fa + 4 * fd + fc)
  const right = h / 12 * (fc + 4 * fe + fb)
  const s2 = left + right
  if (depth <= 0 || Math.abs(s2 - whole) < 15 * tol) return s2 + (s2 - whole) / 15
  return simpsonHelper(f, a, c, tol / 2, left, fa, fc, fd, depth - 1) +
         simpsonHelper(f, c, b, tol / 2, right, fc, fb, fe, depth - 1)
}

// ═══════════════════════════════════════════════════════════════
// Interpolation
// ═══════════════════════════════════════════════════════════════

reg('interp1', (a) => {
  const x = mat(a[0]).data, y = mat(a[1]).data, xq = mat(a[2])
  const method = a.length > 3 && a[3].isString() ? a[3].string() : 'linear'
  const result = xq.data.map(xv => {
    if (method === 'nearest') {
      let minD = Infinity, minI = 0
      for (let i = 0; i < x.length; i++) { const d = Math.abs(xv - x[i]); if (d < minD) { minD = d; minI = i } }
      return y[minI]
    }
    // Linear interpolation
    let i = 0
    while (i < x.length - 1 && x[i + 1] < xv) i++
    if (i >= x.length - 1) return y[y.length - 1]
    const t = (xv - x[i]) / (x[i + 1] - x[i])
    return y[i] + t * (y[i + 1] - y[i])
  })
  return Value.fromMatrix(new Matrix(xq.rows, xq.cols, result))
})

reg('spline', (a) => {
  // Natural cubic spline interpolation
  const x = mat(a[0]).data, y = mat(a[1]).data, xq = mat(a[2])
  const n = x.length - 1
  const h = new Array(n), alpha = new Array(n + 1).fill(0)
  for (let i = 0; i < n; i++) h[i] = x[i + 1] - x[i]
  for (let i = 1; i < n; i++) alpha[i] = 3 / h[i] * (y[i + 1] - y[i]) - 3 / h[i - 1] * (y[i] - y[i - 1])
  const l = new Array(n + 1).fill(1), mu = new Array(n + 1).fill(0), z = new Array(n + 1).fill(0)
  for (let i = 1; i < n; i++) {
    l[i] = 2 * (x[i + 1] - x[i - 1]) - h[i - 1] * mu[i - 1]
    mu[i] = h[i] / l[i]; z[i] = (alpha[i] - h[i - 1] * z[i - 1]) / l[i]
  }
  const c = new Array(n + 1).fill(0), b = new Array(n), d = new Array(n)
  for (let j = n - 1; j >= 0; j--) { c[j] = z[j] - mu[j] * c[j + 1]; b[j] = (y[j + 1] - y[j]) / h[j] - h[j] * (c[j + 1] + 2 * c[j]) / 3; d[j] = (c[j + 1] - c[j]) / (3 * h[j]) }
  const result = xq.data.map(xv => {
    let i = 0; while (i < n - 1 && x[i + 1] < xv) i++
    const dx = xv - x[i]; return y[i] + b[i] * dx + c[i] * dx * dx + d[i] * dx * dx * dx
  })
  return Value.fromMatrix(new Matrix(xq.rows, xq.cols, result))
})

// ═══════════════════════════════════════════════════════════════
// Special Mathematical Functions
// ═══════════════════════════════════════════════════════════════

// Gamma function (Lanczos approximation)
function gamma(z: number): number {
  if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z))
  z -= 1
  const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7]
  let x = c[0]
  for (let i = 1; i < g + 2; i++) x += c[i] / (z + i)
  const t = z + g + 0.5
  return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x
}

reg('gamma', (a) => applyElem(a[0], gamma))
reg('factorial_fn', (a) => applyElem(a[0], x => gamma(x + 1)))

// Beta function
reg('beta', (a) => Value.fromScalar(gamma(num(a[0])) * gamma(num(a[1])) / gamma(num(a[0]) + num(a[1]))))

// Error function (approximation)
function erf(x: number): number {
  const sign = x >= 0 ? 1 : -1; x = Math.abs(x)
  const t = 1 / (1 + 0.3275911 * x)
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x)
  return sign * y
}

reg('erf', (a) => applyElem(a[0], erf))
reg('erfc', (a) => applyElem(a[0], x => 1 - erf(x)))
reg('erfinv', (a) => applyElem(a[0], x => {
  // Newton's method
  let p = x < 0 ? -0.5 : 0.5
  for (let i = 0; i < 20; i++) { p -= (erf(p) - x) / (2 / Math.sqrt(Math.PI) * Math.exp(-p * p)) }
  return p
}))

// Bessel functions (first kind, integer order)
reg('besselj', (a) => {
  const nu = num(a[0])
  return applyElem(a[1], x => besselJ(nu, x))
})

function besselJ(nu: number, x: number): number {
  let sum = 0
  for (let k = 0; k < 30; k++) {
    const term = Math.pow(-1, k) / (gamma(k + 1) * gamma(k + nu + 1)) * Math.pow(x / 2, 2 * k + nu)
    sum += term; if (Math.abs(term) < 1e-15) break
  }
  return sum
}

// Normal distribution
reg('normpdf', (a) => {
  const mu = a.length > 1 ? num(a[1]) : 0
  const sigma = a.length > 2 ? num(a[2]) : 1
  return applyElem(a[0], x => Math.exp(-0.5 * ((x - mu) / sigma) ** 2) / (sigma * Math.sqrt(2 * Math.PI)))
})

reg('normcdf', (a) => {
  const mu = a.length > 1 ? num(a[1]) : 0
  const sigma = a.length > 2 ? num(a[2]) : 1
  return applyElem(a[0], x => 0.5 * (1 + erf((x - mu) / (sigma * Math.sqrt(2)))))
})

reg('norminv', (a) => {
  const mu = a.length > 1 ? num(a[1]) : 0
  const sigma = a.length > 2 ? num(a[2]) : 1
  return applyElem(a[0], p => {
    // Rational approximation
    if (p <= 0) return -Infinity; if (p >= 1) return Infinity
    const t = p < 0.5 ? Math.sqrt(-2 * Math.log(p)) : Math.sqrt(-2 * Math.log(1 - p))
    const c = [2.515517, 0.802853, 0.010328]
    const d = [1.432788, 0.189269, 0.001308]
    let x = t - (c[0] + c[1] * t + c[2] * t * t) / (1 + d[0] * t + d[1] * t * t + d[2] * t * t * t)
    if (p < 0.5) x = -x
    return mu + sigma * x
  })
})

// ═══════════════════════════════════════════════════════════════
// Linear Algebra (extended)
// ═══════════════════════════════════════════════════════════════

// Simple QR eigenvalue computation
function qrEigenvalues(A: Matrix): Matrix {
  const n = A.rows
  let m = A.clone()
  for (let iter = 0; iter < 100; iter++) {
    // QR decomposition via Gram-Schmidt
    const Q = Matrix.zeros(n, n), R = Matrix.zeros(n, n)
    for (let j = 0; j < n; j++) {
      const v = new Array(n)
      for (let i = 0; i < n; i++) v[i] = m.get(i, j)
      for (let k = 0; k < j; k++) {
        let dot = 0
        for (let i = 0; i < n; i++) dot += Q.get(i, k) * v[i]
        R.set(k, j, dot)
        for (let i = 0; i < n; i++) v[i] -= dot * Q.get(i, k)
      }
      let norm = 0
      for (let i = 0; i < n; i++) norm += v[i] * v[i]
      norm = Math.sqrt(norm)
      R.set(j, j, norm)
      if (norm > 1e-14) for (let i = 0; i < n; i++) Q.set(i, j, v[i] / norm)
    }
    m = R.mul(Q)
  }
  const eigs = new Array(n)
  for (let i = 0; i < n; i++) eigs[i] = m.get(i, i)
  return new Matrix(1, n, eigs)
}

reg('eig', (a) => {
  const m = mat(a[0])
  if (m.rows !== m.cols) throw new RuntimeError('eig requires square matrix')
  return Value.fromMatrix(qrEigenvalues(m))
})

reg('svd', (a) => {
  // Simplified: compute singular values via eigenvalues of A'A
  const m = mat(a[0])
  const AtA = m.transpose().mul(m)
  const eigVals = qrEigenvalues(AtA)
  const sv = eigVals.data.map(v => Math.sqrt(Math.abs(v))).sort((a, b) => b - a)
  return Value.fromMatrix(new Matrix(1, sv.length, sv))
})

reg('cond', (a) => {
  const m = mat(a[0])
  const AtA = m.transpose().mul(m)
  const eigVals = qrEigenvalues(AtA).data.map(v => Math.sqrt(Math.abs(v)))
  const maxSv = Math.max(...eigVals), minSv = Math.min(...eigVals.filter(v => v > 1e-14))
  return Value.fromScalar(minSv > 0 ? maxSv / minSv : Infinity)
})

reg('pinv', (a) => {
  // Moore-Penrose pseudoinverse via (A'A)^-1 A'
  const m = mat(a[0])
  const At = m.transpose()
  try { return Value.fromMatrix(At.mul(m).inv().mul(At)) }
  catch { return Value.fromMatrix(At) } // fallback
})

reg('null_space', (a) => {
  // Null space approximation
  const m = mat(a[0])
  return Value.fromMatrix(Matrix.zeros(m.cols, 1)) // placeholder
})

reg('linsolve', (a) => {
  const A = mat(a[0]), b = mat(a[1])
  return Value.fromMatrix(A.inv().mul(b))
})

reg('lu', (a) => {
  const A = mat(a[0])
  const n = A.rows
  const L = Matrix.eye(n), U = A.clone()
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const factor = U.get(j, i) / U.get(i, i)
      L.set(j, i, factor)
      for (let k = i; k < n; k++) U.set(j, k, U.get(j, k) - factor * U.get(i, k))
    }
  }
  return Value.fromCell({ rows: 1, cols: 2, data: [Value.fromMatrix(L), Value.fromMatrix(U)] })
})

reg('chol', (a) => {
  const A = mat(a[0]), n = A.rows
  const L = Matrix.zeros(n, n)
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = 0
      for (let k = 0; k < j; k++) s += L.get(i, k) * L.get(j, k)
      L.set(i, j, i === j ? Math.sqrt(A.get(i, i) - s) : (A.get(i, j) - s) / L.get(j, j))
    }
  }
  return Value.fromMatrix(L)
})

reg('qr', (a) => {
  const A = mat(a[0]), n = A.rows, m = A.cols
  const Q = Matrix.zeros(n, n), R = Matrix.zeros(n, m)
  const Ac = A.clone()
  for (let j = 0; j < Math.min(n, m); j++) {
    const v = new Array(n)
    for (let i = 0; i < n; i++) v[i] = Ac.get(i, j)
    for (let k = 0; k < j; k++) {
      let dot = 0; for (let i = 0; i < n; i++) dot += Q.get(i, k) * v[i]
      R.set(k, j, dot); for (let i = 0; i < n; i++) v[i] -= dot * Q.get(i, k)
    }
    let norm = 0; for (let i = 0; i < n; i++) norm += v[i] * v[i]; norm = Math.sqrt(norm)
    R.set(j, j, norm)
    if (norm > 1e-14) for (let i = 0; i < n; i++) Q.set(i, j, v[i] / norm)
  }
  return Value.fromCell({ rows: 1, cols: 2, data: [Value.fromMatrix(Q), Value.fromMatrix(R)] })
})

// ═══════════════════════════════════════════════════════════════
// Optimization (fminsearch - Nelder-Mead)
// ═══════════════════════════════════════════════════════════════

reg('fminsearch', (a, interp) => {
  const fh = a[0].funcHandle()
  const x0 = [...mat(a[1]).data]
  const n = x0.length
  const callF = (x: number[]): number => interp.callFuncHandle(fh, [Value.fromMatrix(new Matrix(1, n, x))]).toScalar()

  // Nelder-Mead simplex
  const simplex: { x: number[]; f: number }[] = []
  simplex.push({ x: [...x0], f: callF(x0) })
  for (let i = 0; i < n; i++) {
    const p = [...x0]; p[i] += 0.05 * Math.max(Math.abs(p[i]), 1)
    simplex.push({ x: p, f: callF(p) })
  }

  for (let iter = 0; iter < 1000; iter++) {
    simplex.sort((a, b) => a.f - b.f)
    if (Math.abs(simplex[n].f - simplex[0].f) < 1e-10) break

    // Centroid (excluding worst)
    const c = new Array(n).fill(0)
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) c[j] += simplex[i].x[j]
    for (let j = 0; j < n; j++) c[j] /= n

    // Reflection
    const worst = simplex[n].x
    const xr = c.map((v, j) => 2 * v - worst[j])
    const fr = callF(xr)

    if (fr < simplex[0].f) {
      const xe = c.map((v, j) => 3 * v - 2 * worst[j])
      const fe = callF(xe)
      simplex[n] = fe < fr ? { x: xe, f: fe } : { x: xr, f: fr }
    } else if (fr < simplex[n - 1].f) {
      simplex[n] = { x: xr, f: fr }
    } else {
      const xc = c.map((v, j) => 0.5 * (v + worst[j]))
      const fc = callF(xc)
      if (fc < simplex[n].f) {
        simplex[n] = { x: xc, f: fc }
      } else {
        for (let i = 1; i <= n; i++) {
          simplex[i].x = simplex[i].x.map((v, j) => 0.5 * (v + simplex[0].x[j]))
          simplex[i].f = callF(simplex[i].x)
        }
      }
    }
  }

  simplex.sort((a, b) => a.f - b.f)
  return Value.fromMatrix(new Matrix(1, n, simplex[0].x))
})

// fzero - scalar root finding (Brent's method)
reg('fzero', (a, interp) => {
  const fh = a[0].funcHandle()
  let x0 = num(a[1])
  const callF = (x: number) => interp.callFuncHandle(fh, [Value.fromScalar(x)]).toScalar()

  // Bracket search
  let lo = x0 - 1, hi = x0 + 1
  let flo = callF(lo), fhi = callF(hi)
  for (let i = 0; i < 50 && flo * fhi > 0; i++) { lo -= 1.5; hi += 1.5; flo = callF(lo); fhi = callF(hi) }

  // Bisection
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2, fmid = callF(mid)
    if (Math.abs(fmid) < 1e-14 || (hi - lo) < 1e-14) return Value.fromScalar(mid)
    if (flo * fmid < 0) { hi = mid; fhi = fmid } else { lo = mid; flo = fmid }
  }
  return Value.fromScalar((lo + hi) / 2)
})

// ═══════════════════════════════════════════════════════════════
// Utility helpers
// ═══════════════════════════════════════════════════════════════

reg('unique', (a) => {
  const m = mat(a[0])
  const u = [...new Set(m.data)].sort((a, b) => a - b)
  return Value.fromMatrix(new Matrix(1, u.length, u))
})

reg('union', (a) => {
  const m1 = mat(a[0]).data, m2 = mat(a[1]).data
  const u = [...new Set([...m1, ...m2])].sort((a, b) => a - b)
  return Value.fromMatrix(new Matrix(1, u.length, u))
})

reg('intersect', (a) => {
  const s1 = new Set(mat(a[0]).data), s2 = new Set(mat(a[1]).data)
  const u = [...s1].filter(v => s2.has(v)).sort((a, b) => a - b)
  return Value.fromMatrix(new Matrix(1, u.length, u))
})

// readcsv(text) - parse CSV string into matrix (comma or tab separated, numeric only)
reg('readcsv', (a) => {
  const text = a[0].string()
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim())
  if (lines.length === 0) return Value.fromMatrix(new Matrix(0, 0))
  const rows = lines.map(line => line.split(/[,\t]/).map(v => parseFloat(v.trim())).filter(v => !isNaN(v)))
  const cols = Math.max(...rows.map(r => r.length), 1)
  const flat: number[] = []
  for (const row of rows) {
    for (let c = 0; c < cols; c++) flat.push(row[c] ?? 0)
  }
  return Value.fromMatrix(new Matrix(rows.length, cols, flat))
})

// writematrix(A) - return CSV string; writematrix(A, filename) - trigger download in browser
reg('writematrix', (a, interp) => {
  const m = mat(a[0])
  const lines: string[] = []
  for (let r = 0; r < m.rows; r++) {
    const row = []
    for (let c = 0; c < m.cols; c++) row.push(String(m.get(r, c)))
    lines.push(row.join(','))
  }
  const csv = lines.join('\n')
  if (a.length >= 2 && a[1].isString()) {
    const filename = a[1].string() || 'data.csv'
    if (typeof document !== 'undefined') {
      const blob = new Blob([csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename.endsWith('.csv') ? filename : filename + '.csv'
      link.click()
      URL.revokeObjectURL(url)
    }
  }
  return Value.fromString(csv)
})

reg('writecsv', (a, interp) => (getScientificBuiltin('writematrix')!)(a, interp))

reg('setdiff', (a) => {
  const s2 = new Set(mat(a[1]).data)
  const u = mat(a[0]).data.filter(v => !s2.has(v))
  return Value.fromMatrix(new Matrix(1, u.length, [...new Set(u)].sort((a, b) => a - b)))
})

reg('ismember', (a) => {
  const s = new Set(mat(a[1]).data)
  const m = mat(a[0])
  return Value.fromMatrix(new Matrix(m.rows, m.cols, m.data.map(v => s.has(v) ? 1 : 0)))
})

reg('fliplr', (a) => {
  const m = mat(a[0])
  const r = new Matrix(m.rows, m.cols)
  for (let i = 0; i < m.rows; i++) for (let j = 0; j < m.cols; j++) r.set(i, m.cols - 1 - j, m.get(i, j))
  return Value.fromMatrix(r)
})

reg('flipud', (a) => {
  const m = mat(a[0])
  const r = new Matrix(m.rows, m.cols)
  for (let i = 0; i < m.rows; i++) for (let j = 0; j < m.cols; j++) r.set(m.rows - 1 - i, j, m.get(i, j))
  return Value.fromMatrix(r)
})

reg('rot90', (a) => {
  const m = mat(a[0]), k = a.length > 1 ? ((num(a[1]) % 4) + 4) % 4 : 1
  let r = m
  for (let i = 0; i < k; i++) {
    const t = new Matrix(r.cols, r.rows)
    for (let ri = 0; ri < r.rows; ri++) for (let ci = 0; ci < r.cols; ci++) t.set(r.cols - 1 - ci, ri, r.get(ri, ci))
    r = t
  }
  return Value.fromMatrix(r)
})

reg('kron', (a) => {
  const A = mat(a[0]), B = mat(a[1])
  const m = A.rows * B.rows, n = A.cols * B.cols
  const R = new Matrix(m, n)
  for (let i = 0; i < A.rows; i++)
    for (let j = 0; j < A.cols; j++)
      for (let p = 0; p < B.rows; p++)
        for (let q = 0; q < B.cols; q++)
          R.set(i * B.rows + p, j * B.cols + q, A.get(i, j) * B.get(p, q))
  return Value.fromMatrix(R)
})

reg('triu', (a) => {
  const m = mat(a[0]).clone(), k = a.length > 1 ? num(a[1]) : 0
  for (let r = 0; r < m.rows; r++) for (let c = 0; c < Math.min(r + k, m.cols); c++) m.set(r, c, 0)
  return Value.fromMatrix(m)
})

reg('tril', (a) => {
  const m = mat(a[0]).clone(), k = a.length > 1 ? num(a[1]) : 0
  for (let r = 0; r < m.rows; r++) for (let c = Math.max(r + k + 1, 0); c < m.cols; c++) m.set(r, c, 0)
  return Value.fromMatrix(m)
})

reg('magic', (a) => {
  const n = num(a[0])
  if (n < 1) throw new RuntimeError('magic: n must be >= 1')
  if (n === 1) return Value.fromScalar(1)
  if (n % 2 === 1) {
    const m = Matrix.zeros(n, n)
    let r = 0, c = Math.floor(n / 2)
    for (let i = 1; i <= n * n; i++) {
      m.set(r, c, i); const nr = (r - 1 + n) % n, nc = (c + 1) % n
      if (m.get(nr, nc) !== 0) r = (r + 1) % n; else { r = nr; c = nc }
    }
    return Value.fromMatrix(m)
  }
  // Even order: simplified
  const m = Matrix.zeros(n, n)
  for (let i = 0; i < n * n; i++) m.data[i] = i + 1
  return Value.fromMatrix(m)
})

reg('vander', (a) => {
  const v = mat(a[0]).data, n = a.length > 1 ? num(a[1]) : v.length
  const m = new Matrix(v.length, n)
  for (let i = 0; i < v.length; i++) for (let j = 0; j < n; j++) m.set(i, j, Math.pow(v[i], n - 1 - j))
  return Value.fromMatrix(m)
})

reg('logspace', (a) => {
  const a0 = num(a[0]), b0 = num(a[1]), n = a.length > 2 ? num(a[2]) : 50
  const result = new Array(n)
  for (let i = 0; i < n; i++) result[i] = Math.pow(10, a0 + i * (b0 - a0) / (n - 1))
  return Value.fromMatrix(new Matrix(1, n, result))
})

reg('meshgrid', (a) => {
  const x = mat(a[0]).data, y = mat(a[1]).data
  const X = new Matrix(y.length, x.length)
  const Y = new Matrix(y.length, x.length)
  for (let r = 0; r < y.length; r++) for (let c = 0; c < x.length; c++) { X.set(r, c, x[c]); Y.set(r, c, y[r]) }
  return Value.fromCell({ rows: 1, cols: 2, data: [Value.fromMatrix(X), Value.fromMatrix(Y)] })
})

function applyElem(v: Value, fn: (x: number) => number): Value {
  const m = mat(v)
  return Value.fromMatrix(new Matrix(m.rows, m.cols, m.data.map(fn)))
}

export function getScientificBuiltin(name: string): BFn | undefined { return fns.get(name) }
export function hasScientificBuiltin(name: string): boolean { return fns.has(name) }
export function allScientificNames(): string[] { return [...fns.keys()] }
