// MatFree Engine - Scientific Computing Functions
// FFT, ODE solvers, polynomial ops, interpolation, signal processing, special functions

import { Value, Matrix, RuntimeError } from './value'
import type { Interpreter } from './interpreter'

type BFn = (args: Value[], interp: Interpreter) => Value

const fns: Map<string, BFn> = new Map()
function reg(name: string, fn: BFn) { fns.set(name, fn) }

function num(v: Value): number {
  if (v === undefined) throw new RuntimeError('Missing required argument')
  return v.toScalar()
}
function mat(v: Value): Matrix {
  if (v === undefined) throw new RuntimeError('Missing required argument')
  return v.toMatrix()
}

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
  const re = [...m.data], im = m.imag ? [...m.imag] : new Array(m.numel()).fill(0)
  const [outRe, outIm] = fftReal(re, im)
  // Complex result: real parts in data, imaginary parts alongside,
  // so abs(fft(x)) gives true magnitudes and ifft(fft(x)) == x.
  const result = new Matrix(1, outRe.length, outRe)
  result.imag = outIm
  return Value.fromMatrix(result)
})

reg('ifft', (a) => {
  const m = mat(a[0])
  const re = [...m.data], im = m.imag ? [...m.imag] : new Array(m.numel()).fill(0)
  const [outRe, outIm] = ifftReal(re, im)
  const result = new Matrix(1, outRe.length, outRe)
  if (outIm.some(v => Math.abs(v) > 1e-9)) result.imag = outIm
  return Value.fromMatrix(result)
})

reg('fftshift', (a) => {
  const m = mat(a[0])
  const d = [...m.data], n = d.length, half = Math.floor(n / 2)
  const shifted = [...d.slice(half), ...d.slice(0, half)]
  const result = new Matrix(m.rows, m.cols, shifted)
  if (m.imag) result.imag = [...m.imag.slice(half), ...m.imag.slice(0, half)]
  return Value.fromMatrix(result)
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
  let h = (tf - t0) / 100
  const rtol = 1e-6, atol = 1e-9

  const ts: number[] = [t0]
  const ys: number[][] = [[...y0]]

  let t = t0, y = [...y0]

  const callF = (t: number, y: number[]): number[] => {
    const tVal = Value.fromScalar(t)
    const yVal = Value.fromMatrix(new Matrix(dim, 1, y))
    const result = interp.callFuncHandle(fh, [tVal, yVal])
    return [...result.toMatrix().data]
  }

  // Dormand-Prince 5(4) embedded pair — the actual ode45 method.
  // Butcher tableau coefficients:
  const A = [
    [],
    [1 / 5],
    [3 / 40, 9 / 40],
    [44 / 45, -56 / 15, 32 / 9],
    [19372 / 6561, -25360 / 2187, 64448 / 6561, -212 / 729],
    [9017 / 3168, -355 / 33, 46732 / 5247, 49 / 176, -5103 / 18656],
    [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84],
  ]
  const C = [0, 1 / 5, 3 / 10, 4 / 5, 8 / 9, 1, 1]
  const B5 = [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84, 0]        // 5th order
  const B4 = [5179 / 57600, 0, 7571 / 16695, 393 / 640, -92097 / 339200, 187 / 2100, 1 / 40] // 4th order

  let steps = 0
  while (t < tf - 1e-14 && steps < 100000) {
    if (t + h > tf) h = tf - t
    // Compute the 7 stages
    const k: number[][] = []
    k.push(callF(t, y))
    for (let s = 1; s < 7; s++) {
      const ys2 = y.map((v, i) => {
        let acc = v
        for (let j = 0; j < s; j++) acc += h * A[s][j] * k[j][i]
        return acc
      })
      k.push(callF(t + C[s] * h, ys2))
    }
    const y5 = y.map((v, i) => { let acc = v; for (let s = 0; s < 7; s++) acc += h * B5[s] * k[s][i]; return acc })
    const y4 = y.map((v, i) => { let acc = v; for (let s = 0; s < 7; s++) acc += h * B4[s] * k[s][i]; return acc })

    // Scaled error norm
    let err = 0
    for (let i = 0; i < dim; i++) {
      const sc = atol + rtol * Math.max(Math.abs(y[i]), Math.abs(y5[i]))
      err = Math.max(err, Math.abs(y5[i] - y4[i]) / sc)
    }

    if (err > 1 && h > 1e-12 * Math.max(1, Math.abs(t))) {
      h *= Math.max(0.1, 0.9 * Math.pow(err, -0.2)) // reject, shrink
      steps++
      continue
    }

    t += h; y = y5
    ts.push(t); ys.push([...y])
    // Grow step (capped at 5x)
    h *= Math.min(5, Math.max(0.2, 0.9 * Math.pow(Math.max(err, 1e-10), -0.2)))
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
  const rawF = (x: number) => interp.callFuncHandle(fh, [Value.fromScalar(x)]).toScalar()
  // Guard against NaN/Inf from the integrand at extreme substituted points
  const safe = (f: (t: number) => number) => (t: number) => { const v = f(t); return Number.isFinite(v) ? v : 0 }

  let result: number
  const E = 1e-12 // keep substitutions off their singular endpoints
  if (lo === -Infinity && hi === Infinity) {
    // x = t/(1-t^2), dx = (1+t^2)/(1-t^2)^2 dt, t in (-1, 1)
    const g = safe((t: number) => { const d = 1 - t * t; return rawF(t / d) * (1 + t * t) / (d * d) })
    result = adaptiveSimpson(g, -1 + E, 1 - E, 1e-10, 24)
  } else if (hi === Infinity) {
    // x = lo + t/(1-t), dx = 1/(1-t)^2 dt, t in [0, 1)
    const g = safe((t: number) => { const d = 1 - t; return rawF(lo + t / d) / (d * d) })
    result = adaptiveSimpson(g, 0, 1 - E, 1e-10, 24)
  } else if (lo === -Infinity) {
    // x = hi - t/(1-t), dx = 1/(1-t)^2 dt, t in [0, 1)
    const g = safe((t: number) => { const d = 1 - t; return rawF(hi - t / d) / (d * d) })
    result = adaptiveSimpson(g, 0, 1 - E, 1e-10, 24)
  } else {
    result = adaptiveSimpson(rawF, lo, hi, 1e-10, 20)
  }
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

reg('eig', (a, interp) => {
  const m = mat(a[0])
  if (m.rows !== m.cols) throw new RuntimeError('eig requires square matrix')
  // [V, D] = eig(A): delegate to the full decomposition
  if (interp.getNargout() >= 2) return interp.callBuiltin('eig_full', a)
  return Value.fromMatrix(qrEigenvalues(m))
})

reg('svd', (a, interp) => {
  // [U, S, V] = svd(A): delegate to the full decomposition
  if (interp.getNargout() >= 2) return interp.callBuiltin('svd_full', a)
  // Single output: singular values via eigenvalues of A'A
  const m = mat(a[0])
  const AtA = m.transpose().mul(m)
  const eigVals = qrEigenvalues(AtA)
  const sv = eigVals.data.map(v => Math.sqrt(Math.abs(v))).sort((a, b) => b - a)
  return Value.fromMatrix(new Matrix(sv.length, 1, sv))
})

reg('cond', (a, interp) => {
  const m = mat(a[0])
  const pArg = a.length > 1 ? a[1] : null
  const p = pArg ? (pArg.isString() ? pArg.string().toLowerCase() : num(pArg)) : 2
  // 2-norm via SVD (preferred)
  if (p === 2 || p === '2') {
    function condFromSvs(svsIn: number[]): number {
      if (!svsIn.length) return Infinity
      const svs = [...svsIn]
      const maxSv = Math.max(...svs)
      if (maxSv === 0) return Infinity
      const relTol = Math.max(1, maxSv) * 1e-12
      const pos = svs.filter(v => v > relTol)
      const minSv = pos.length ? Math.min(...pos) : 0
      return minSv > 0 ? maxSv / minSv : Infinity
    }
    try {
      const res = interp.callBuiltin('svd_full', [a[0]])
      if (res.isCell()) {
        const S = res.cell().data[1].matrix()
        const svs: number[] = []
        const k = Math.min(S.rows, S.cols)
        for (let i = 0; i < k; i++) svs.push(S.get(i, i))
        return Value.fromScalar(condFromSvs(svs))
      }
    } catch {}
    try {
      const sv = interp.callBuiltin('svd', [a[0]])
      return Value.fromScalar(condFromSvs([...sv.toMatrix().data]))
    } catch {
      const AtA = m.transpose().mul(m)
      const eigVals = qrEigenvalues(AtA).data.map(v => Math.sqrt(Math.abs(v)))
      return Value.fromScalar(condFromSvs(eigVals))
    }
  }
  // 1-norm: max column sum
  if (p === 1) {
    let maxc = 0
    for (let c = 0; c < m.cols; c++) {
      let s = 0; for (let r = 0; r < m.rows; r++) s += Math.abs(m.get(r, c))
      if (s > maxc) maxc = s
    }
    // For 1-norm cond, use ||A||_1 * ||inv(A)||_1 (approx via pinv for demo)
    const n1 = maxc
    let ni1 = 0
    try {
      const invA = m.inv()
      for (let c = 0; c < invA.cols; c++) { let s = 0; for (let r = 0; r < invA.rows; r++) s += Math.abs(invA.get(r, c)); if (s > ni1) ni1 = s }
    } catch { ni1 = Infinity }
    return Value.fromScalar(n1 * ni1)
  }
  // inf-norm: max row sum
  if (p === Infinity || p === 'inf') {
    let maxr = 0
    for (let r = 0; r < m.rows; r++) {
      let s = 0; for (let c = 0; c < m.cols; c++) s += Math.abs(m.get(r, c))
      if (s > maxr) maxr = s
    }
    const ni = maxr
    let nii = 0
    try {
      const invA = m.inv()
      for (let r = 0; r < invA.rows; r++) { let s = 0; for (let c = 0; c < invA.cols; c++) s += Math.abs(invA.get(r, c)); if (s > nii) nii = s }
    } catch { nii = Infinity }
    return Value.fromScalar(ni * nii)
  }
  // frobenius: ||A||_F * ||inv(A)||_F
  let nf = 0; for (let i = 0; i < m.numel(); i++) nf += m.data[i] * m.data[i]; nf = Math.sqrt(nf)
  let nif = 0
  try {
    const invA = m.inv(); for (let i = 0; i < invA.numel(); i++) nif += invA.data[i] * invA.data[i]; nif = Math.sqrt(nif)
  } catch { nif = Infinity }
  return Value.fromScalar(nf * nif)
})

reg('rcond', (a, interp) => {
  // Reciprocal of condition number (2-norm via SVD)
  const c = interp.callBuiltin('cond', [a[0]])
  const cv = c.toScalar()
  return Value.fromScalar(cv > 0 && isFinite(cv) ? 1 / cv : 0)
})

reg('pinv', (a) => {
  // Moore-Penrose pseudoinverse via (A'A)^-1 A'
  const m = mat(a[0])
  const At = m.transpose()
  try { return Value.fromMatrix(At.mul(m).inv().mul(At)) }
  catch { return Value.fromMatrix(At) } // fallback
})

// null_space: real implementation lives in advanced.ts (SVD-based). The
// scientific registry is consulted first, so no placeholder may live here.

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

  for (let iter = 0; iter < 2000; iter++) {
    simplex.sort((a, b) => a.f - b.f)
    // Converge on BOTH function spread and simplex size — f-spread alone
    // terminates early when vertices straddle the minimum symmetrically.
    const fConverged = Math.abs(simplex[n].f - simplex[0].f) < 1e-12 * (1 + Math.abs(simplex[0].f))
    let diam = 0
    for (let i = 1; i <= n; i++)
      for (let j = 0; j < n; j++)
        diam = Math.max(diam, Math.abs(simplex[i].x[j] - simplex[0].x[j]))
    if (fConverged && diam < 1e-8 * (1 + Math.abs(simplex[0].x.reduce((s, v) => s + Math.abs(v), 0)))) break

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
  // Support optional 2nd arg: 'header' to skip first line, or number of header lines
  let headerLines = 0
  if (a.length > 1) {
    if (a[1].isString() && a[1].string().toLowerCase() === 'header') headerLines = 1
    else if (a[1].isMatrix()) headerLines = Math.floor(mat(a[1]).data[0]) || 0
  }
  const lines = text.split(/\r?\n/)
  const dataLines = lines.filter(l => l.trim()).slice(headerLines)
  if (dataLines.length === 0) return Value.fromMatrix(new Matrix(0, 0))
  // Simple CSV parser supporting quotes and commas
  function parseCSVLine(line: string): (number | null)[] {
    const out: (number | null)[] = []
    let cur = '', inQ = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') { inQ = !inQ; continue }
      if ((ch === ',' || ch === '\t') && !inQ) {
        const t = cur.trim()
        out.push(t === '' || t.toLowerCase() === 'nan' || t.toLowerCase() === 'na' ? NaN : (isNaN(parseFloat(t)) ? NaN : parseFloat(t)))
        cur = ''
      } else cur += ch
    }
    const t = cur.trim()
    out.push(t === '' || t.toLowerCase() === 'nan' || t.toLowerCase() === 'na' ? NaN : (isNaN(parseFloat(t)) ? NaN : parseFloat(t)))
    return out
  }
  const rows = dataLines.map(parseCSVLine)
  const cols = Math.max(1, ...rows.map(r => r.length))
  const flat: number[] = []
  for (const row of rows) for (let c = 0; c < cols; c++) {
    const v = row[c]
    flat.push((v === null || Number.isNaN(v as number)) ? NaN : (v as number))
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

// readtable lite: treat first line as headers if 'header' or auto-detect non-numeric
reg('readtable', (a) => {
  if (!a[0] || !a[0].isString()) throw new RuntimeError('readtable: csv text required')
  const text = a[0].string()
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim())
  if (lines.length === 0) return Value.fromStruct({})
  // parse with our csv logic
  const rows = lines.map((ln) => {
    // reuse readcsv logic by calling it would be circular; simple split with quote handling
    const out: string[] = []; let cur = '', inQ = false
    for (let i = 0; i < ln.length; i++) {
      const ch = ln[i]
      if (ch === '"') { inQ = !inQ; continue }
      if ((ch === ',' || ch === '\t') && !inQ) { out.push(cur.trim()); cur = '' }
      else cur += ch
    }
    out.push(cur.trim())
    return out
  })
  const hasHeader = a.length > 1 && a[1] && ((a[1].isString() && a[1].string().toLowerCase() === 'header') || true)
  let headers: string[] = []
  let start = 0
  if (hasHeader && rows.length > 0) {
    headers = rows[0]
    start = 1
  } else {
    headers = rows[0].map((_, i) => 'Var' + (i + 1))
  }
  const dataRows = rows.slice(start)
  const n = Math.max(0, ...dataRows.map(r => r.length))
  const s: any = {}
  for (let c = 0; c < headers.length; c++) {
    const key = headers[c] || ('Var' + (c + 1))
    const col: number[] = []
    for (const r of dataRows) {
      const v = (r[c] ?? '').trim()
      col.push(v === '' || v.toLowerCase() === 'nan' ? NaN : (isNaN(parseFloat(v)) ? NaN : parseFloat(v)))
    }
    s[key] = Value.fromMatrix(new Matrix(col.length, 1, col))
  }
  return Value.fromStruct(s)
})

reg('writetable', (a, interp) => {
  // Accept struct of column vectors; write CSV with headers
  if (!a[0] || !a[0].isStruct()) throw new RuntimeError('writetable: struct expected')
  // also guard empty struct case handled below
  const s = a[0].struct()
  const keys = Object.keys(s)
  const lens = keys.map(k => s[k].isMatrix() ? s[k].matrix().numel() : 0)
  const N = Math.max(0, ...lens)
  const lines: string[] = []
  lines.push(keys.join(','))
  for (let i = 0; i < N; i++) {
    const row = keys.map(k => {
      const m = s[k].isMatrix() ? s[k].matrix() : null
      const v = m ? m.data[Math.min(i, m.numel() - 1)] : ''
      return String(v)
    })
    lines.push(row.join(','))
  }
  const csv = lines.join('\n')
  if (a.length > 1 && a[1].isString()) {
    const fn = a[1].string() || 'table.csv'
    if (typeof document !== 'undefined') {
      const blob = new Blob([csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a'); link.href = url; link.download = fn.endsWith('.csv') ? fn : fn + '.csv'; link.click(); URL.revokeObjectURL(url)
    }
  }
  return Value.fromString(csv)
})

// load/save lite using JSON (browser download for save)
reg('save', (a, interp) => {
  // save('file.mat', 'var1', 'var2', ...) or save('file.mat') saves all
  // Serialize known variables from current env
  const env = interp.currentEnv()
  const names: string[] = (env as any).variableNames ? (env as any).variableNames() : []
  const snap: any = {}
  for (const nm of names) {
    try {
      const v = (env as any).get ? (env as any).get(nm) : null
      if (v && v.isMatrix && v.isMatrix()) snap[nm] = { rows: v.matrix().rows, cols: v.matrix().cols, data: [...v.matrix().data] }
      else if (v && v.isString && v.isString()) snap[nm] = v.string()
      else snap[nm] = v ? v.display ? v.display(nm).trim() : String(nm) : null
    } catch {}
  }
  const json = JSON.stringify(snap)
  const name = a.length > 0 && a[0].isString() ? a[0].string() : 'workspace.mat.json'
  if (typeof document !== 'undefined') {
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a'); link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url)
  }
  return Value.fromString(json)
})

reg('load', (a) => {
  // load('json string or assume preloaded'); for browser demo accept json string
  if (!a[0] || !a[0].isString()) throw new RuntimeError('load: json string required')
  let txt = a[0].isString() ? a[0].string() : ''
  try {
    const obj = JSON.parse(txt)
    // Convert plain numbers/objects to Values best-effort (return struct)
    const toVal = (v: any): Value => {
      if (typeof v === 'number') return Value.fromScalar(v)
      if (Array.isArray(v)) return Value.fromMatrix(new Matrix(1, v.length, v))
      if (v && typeof v === 'object') {
        const s: any = {}
        for (const k of Object.keys(v)) s[k] = toVal(v[k])
        return Value.fromStruct(s)
      }
      return Value.fromString(String(v))
    }
    return toVal(obj)
  } catch {
    return Value.fromString(txt)
  }
})

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
  const n = Math.floor(num(a[0]))
  if (n < 1) throw new RuntimeError('magic: n must be >= 1')
  if (n === 1) return Value.fromScalar(1)
  if (n === 2) return Value.fromMatrix(new Matrix(2, 2, [1, 3, 4, 2])) // no true 2x2 magic square exists; MATLAB returns this
  if (n % 2 === 1) {
    // Odd order: siamese method
    const m = Matrix.zeros(n, n)
    let r = 0, c = Math.floor(n / 2)
    for (let i = 1; i <= n * n; i++) {
      m.set(r, c, i); const nr = (r - 1 + n) % n, nc = (c + 1) % n
      if (m.get(nr, nc) !== 0) r = (r + 1) % n; else { r = nr; c = nc }
    }
    return Value.fromMatrix(m)
  }
  if (n % 4 === 0) {
    // Doubly-even: fill sequentially, then complement cells where
    // (r mod 4, c mod 4) lies on the main/anti block diagonals
    const m = Matrix.zeros(n, n)
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const v = r * n + c + 1
      const rm = r % 4, cm = c % 4
      const onPattern = (rm === cm) || (rm + cm === 3)
      m.set(r, c, onPattern ? n * n + 1 - v : v)
    }
    return Value.fromMatrix(m)
  }
  // Singly-even (n = 4k+2): LUX method built on the odd magic square of size n/2
  const half = n / 2
  const odd = Matrix.zeros(half, half)
  {
    let r = 0, c = Math.floor(half / 2)
    for (let i = 1; i <= half * half; i++) {
      odd.set(r, c, i); const nr = (r - 1 + half) % half, nc = (c + 1) % half
      if (odd.get(nr, nc) !== 0) r = (r + 1) % half; else { r = nr; c = nc }
    }
  }
  const m = Matrix.zeros(n, n)
  const k = (n - 2) / 4
  for (let r = 0; r < half; r++) {
    for (let c = 0; c < half; c++) {
      const base = (odd.get(r, c) - 1) * 4
      // L for rows < k, U for row k (except center swap), X for rows > k+1
      let kind: 'L' | 'U' | 'X'
      if (r < k) kind = 'L'
      else if (r === k) kind = c === Math.floor(half / 2) ? 'U' : 'L'
      else if (r === k + 1) kind = c === Math.floor(half / 2) ? 'L' : 'U'
      else kind = 'X'
      // L: 4 1 / 2 3   U: 1 4 / 2 3   X: 1 4 / 3 2
      const quad = kind === 'L' ? [4, 1, 2, 3] : kind === 'U' ? [1, 4, 2, 3] : [1, 4, 3, 2]
      m.set(2 * r, 2 * c, base + quad[0])
      m.set(2 * r, 2 * c + 1, base + quad[1])
      m.set(2 * r + 1, 2 * c, base + quad[2])
      m.set(2 * r + 1, 2 * c + 1, base + quad[3])
    }
  }
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
  const x = mat(a[0]).data, y = a.length > 1 ? mat(a[1]).data : mat(a[0]).data // meshgrid(x) == meshgrid(x, x)
  const X = new Matrix(y.length, x.length)
  const Y = new Matrix(y.length, x.length)
  for (let r = 0; r < y.length; r++) for (let c = 0; c < x.length; c++) { X.set(r, c, x[c]); Y.set(r, c, y[r]) }
  return Value.fromCell({ rows: 1, cols: 2, data: [Value.fromMatrix(X), Value.fromMatrix(Y)] })
})

// ═══════════════════════════════════════════════════════════════
// QUICK-WIN: Statistics & Random
// ═══════════════════════════════════════════════════════════════

function quantileSorted(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN
  const idx = p * (sorted.length - 1)
  const lo = Math.floor(idx), hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
}

reg('quantile', (a) => {
  if (!a[0]) throw new RuntimeError('quantile: x required')
  const data = [...mat(a[0]).data].filter(v => isFinite(v))
  data.sort((x, y) => x - y)
  const p = a.length > 1 ? num(a[1]) : 0.5
  if (p < 0 || p > 1) throw new RuntimeError('quantile: p must be in [0,1]')
  // scalar p -> scalar; vector p -> vector of quantiles
  const pm = mat(a.length > 1 ? a[1] : Value.fromScalar(0.5))
  const qs = pm.data.map(pp => quantileSorted(data, Math.max(0, Math.min(1, pp))))
  return Value.fromMatrix(new Matrix(pm.rows, pm.cols, qs))
})

reg('prctile', (a) => {
  // prctile(x, p) where p in [0,100]
  if (!a[0]) throw new RuntimeError('prctile: x required')
  const data = [...mat(a[0]).data].filter(v => isFinite(v))
  data.sort((x, y) => x - y)
  const p = a.length > 1 ? num(a[1]) : 50
  const pm = mat(a.length > 1 ? a[1] : Value.fromScalar(50))
  const qs = pm.data.map(pp => quantileSorted(data, Math.max(0, Math.min(100, pp)) / 100))
  return Value.fromMatrix(new Matrix(pm.rows, pm.cols, qs))
})

// ═══════════════════════════════════════════════════════════════
// QUICK-WIN: Signal processing additions
// ═══════════════════════════════════════════════════════════════

// Hilbert transform -> analytic signal (x + i*H(x))
reg('hilbert', (a) => {
  if (!a[0]) throw new RuntimeError('hilbert: x required')
  const m = mat(a[0])
  const n = m.numel()
  const re = [...m.data]
  const im0 = m.imag ? [...m.imag] : new Array(n).fill(0)
  // FFT(x)
  const [fR, fI] = fftReal(re, im0)
  // Double positive freqs, zero negative, keep DC/Nyquist
  const h = new Array(n).fill(0)
  if (n > 0) h[0] = 1
  if (n > 1) h[Math.floor(n / 2)] = 1
  for (let i = 1; i < Math.floor((n + 1) / 2); i++) h[i] = 2
  const yR = fR.map((v, i) => v * h[i])
  const yI = fI.map((v, i) => v * h[i])
  // IFFT
  const [oR, oI] = ifftReal(yR, yI)
  const out = new Matrix(m.rows, m.cols, oR)
  out.imag = oI
  return Value.fromMatrix(out)
})

// histcounts(x, nbins|edges) -> [counts, edges] cell when nargout>=2 else counts
reg('histcounts', (a, interp) => {
  if (!a[0]) throw new RuntimeError('histcounts: x required')
  const x = [...mat(a[0]).data].filter(v => isFinite(v))
  let edges: number[]
  if (a.length >= 2 && a[1].isMatrix() && mat(a[1]).numel() > 1) {
    edges = [...mat(a[1]).data]
  } else {
    const nb = a.length > 1 ? Math.max(1, Math.floor(num(a[1]))) : Math.max(1, Math.ceil(Math.sqrt(x.length)))
    const lo = Math.min(...x), hi = Math.max(...x)
    edges = Array.from({ length: nb + 1 }, (_, i) => lo + (hi - lo) * (i / nb))
  }
  const nb = edges.length - 1
  const counts = new Array(nb).fill(0)
  for (const v of x) {
    // find bin (right-closed except last)
    let b = edges.findIndex((e, i) => i < nb && v >= e && (i === nb - 1 ? v <= edges[i + 1] : v < edges[i + 1]))
    if (b < 0) b = 0
    if (b >= nb) b = nb - 1
    counts[b]++
  }
  const cvec = new Matrix(1, nb, counts)
  const evec = new Matrix(1, edges.length, edges)
  if (interp.getNargout() >= 2) return Value.fromCell({ rows: 1, cols: 2, data: [Value.fromMatrix(cvec), Value.fromMatrix(evec)] })
  return Value.fromMatrix(cvec)
})

// medfilt1(x, n)
reg('medfilt1', (a) => {
  if (!a[0]) throw new RuntimeError('medfilt1: x required')
  const x = [...mat(a[0]).data]
  const n = a.length > 1 ? Math.max(1, Math.floor(num(a[1]))) : 3
  const half = Math.floor(n / 2)
  const y = x.map((_, i) => {
    const win: number[] = []
    for (let k = -half; k <= half; k++) {
      const j = i + k
      if (j >= 0 && j < x.length) win.push(x[j])
    }
    win.sort((p, q) => p - q)
    return win[Math.floor(win.length / 2)] ?? x[i]
  })
  return Value.fromMatrix(new Matrix(1, y.length, y))
})

// sgolayfilt(x, order, framelen) - Savitzky-Golay via local poly fit (educational impl)
reg('sgolayfilt', (a) => {
  if (!a[0]) throw new RuntimeError('sgolayfilt: x required')
  const x = [...mat(a[0]).data]
  const order = a.length > 1 ? Math.floor(num(a[1])) : 1
  let framelen = Math.floor(num(a[2]))
  if (framelen % 2 === 0) framelen += 1 // must be odd
  framelen = Math.max(framelen, order + 2)
  const half = Math.floor(framelen / 2)
  // Precompute design matrix for centered window
  const out = x.slice()
  for (let i = 0; i < x.length; i++) {
    const xs: number[] = [], ys: number[] = []
    for (let k = -half; k <= half; k++) {
      const j = i + k
      if (j >= 0 && j < x.length) { xs.push(k); ys.push(x[j]) }
    }
    if (xs.length <= order) { out[i] = x[i]; continue }
    // Vandermonde for poly fit
    const m = xs.length, p = order + 1
    const A = new Matrix(m, p)
    for (let r = 0; r < m; r++) for (let c = 0; c < p; c++) A.set(r, c, Math.pow(xs[r], c))
    // (A'A)^-1 A' y , eval at 0 (center)
    const At = A.transpose()
    const AtA = At.mul(A)
    try {
      const pinv = AtA.inv().mul(At)
      let yhat = 0
      for (let c = 0; c < p; c++) yhat += pinv.get(0, c) * ys[c] // row 0 is for center coeff? wait, we want value at k=0
      // Actually evaluate poly at 0: coeffs[0]
      // Better: solve for coeffs then eval
      const coeffs = AtA.inv().mul(At.mul(new Matrix(m, 1, ys)))
      out[i] = coeffs.data[0] // constant term is value at 0 after centering
    } catch { out[i] = x[i] }
  }
  return Value.fromMatrix(new Matrix(1, out.length, out))
})

// ═══════════════════════════════════════════════════════════════
// QUICK-WIN: findpeaks with prominence/width
// Return pks (and locs when nargout>=2) as [pks, locs] cell or just pks
// ═══════════════════════════════════════════════════════════════

reg('findpeaks', (a, interp) => {
  if (!a[0]) throw new RuntimeError('findpeaks: x required')
  const y = [...mat(a[0]).data]
  // Options: 'MinPeakProminence', val; 'MinPeakWidth', val (samples); 'MinPeakDistance', val
  let minProm = 0, minWidth = 1, minDist = 1
  for (let i = 1; i < a.length; i += 2) {
    if (a[i] && a[i].isString()) {
      const key = a[i].string().toLowerCase()
      const val = a[i + 1] ? num(a[i + 1]) : 0
      if (key.includes('prom')) minProm = val
      else if (key.includes('width')) minWidth = Math.max(1, val)
      else if (key.includes('dist')) minDist = Math.max(1, val)
    }
  }
  // Simple peak detection: strict local max
  const peaks: { val: number; idx: number }[] = []
  for (let i = 1; i < y.length - 1; i++) {
    if (y[i] > y[i - 1] && y[i] > y[i + 1]) peaks.push({ val: y[i], idx: i + 1 }) // 1-based
  }
  // Compute crude prominence (height above nearest higher neighbor valley)
  function prominence(i0: number): number {
    const h = y[i0]
    // left valley
    let lv = h
    for (let j = i0 - 1; j >= 0; j--) { lv = Math.min(lv, y[j]); if (y[j] > h) break }
    // right valley
    let rv = h
    for (let j = i0 + 1; j < y.length; j++) { rv = Math.min(rv, y[j]); if (y[j] > h) break }
    return h - Math.max(lv, rv)
  }
  let kept = peaks.filter(p => prominence((p.idx - 1)) >= minProm)
  // Enforce min distance (greedy keep highest)
  kept.sort((a, b) => b.val - a.val)
  const final: typeof kept = []
  for (const p of kept) {
    if (final.every(q => Math.abs(q.idx - p.idx) >= minDist)) final.push(p)
  }
  final.sort((a, b) => a.idx - b.idx)
  // Width proxy: count samples above half-prominence around peak (very rough)
  // For demo we just return peaks; width can be added later if needed.
  const pks = final.map(p => p.val)
  const locs = final.map(p => p.idx)
  const wantLocs = interp.getNargout() >= 2
  if (wantLocs) return Value.fromCell({ rows: 1, cols: 2, data: [Value.fromMatrix(new Matrix(1, pks.length, pks)), Value.fromMatrix(new Matrix(1, locs.length, locs))] })
  return Value.fromMatrix(new Matrix(1, pks.length, pks))
})

// ═══════════════════════════════════════════════════════════════
// QUICK-WIN: lsqcurvefit(@model, p0, xdata, ydata)
// Simple Gauss-Newton / Levenberg-Marquardt style using finite-diff J and fminsearch fallback
// ═══════════════════════════════════════════════════════════════

reg('lsqcurvefit', (a, interp) => {
  if (a.length < 4 || !a[0] || !a[0].isFuncHandle()) throw new RuntimeError('lsqcurvefit: requires @(model), p0, xdata, ydata')
  const fh = a[0].funcHandle()
  const p0 = [...mat(a[1]).data]
  const xdata = [...mat(a[2]).data]
  const ydata = [...mat(a[3]).data]
  const n = p0.length
  // residual vector function
  const callModel = (p: number[], x: number): number => {
    const pv = Value.fromMatrix(new Matrix(1, p.length, p))
    const xv = Value.fromScalar(x)
    const r = interp.callFuncHandle(fh, [pv, xv])
    return r.toScalar()
  }
  // objective: sum(res.^2)
  const obj = (p: number[]) => {
    let s = 0
    for (let i = 0; i < xdata.length; i++) {
      const r = callModel(p, xdata[i]) - ydata[i]
      s += r * r
    }
    return s
  }
  // Use fminsearch on the sumsq objective (robust, simple)
  // Wrap via a tiny handle we can call
  const pBest = [...p0]
  // Simple coordinate + Nelder style hybrid (reuse fminsearch for convenience)
  // Build a wrapper function handle stringlessly by using interp call to fminsearch on a synthetic objective
  // Since we have direct access, run a few Gauss-Newton steps then polish with fminsearch-like.
  let p = [...p0]
  const lambda = 1e-4
  for (let iter = 0; iter < 30; iter++) {
    // residuals and jacobian (finite diff)
    const res: number[] = []
    for (let i = 0; i < xdata.length; i++) res.push(callModel(p, xdata[i]) - ydata[i])
    // J: m x n
    const m = xdata.length
    const J = new Matrix(m, n)
    const eps = 1e-6
    for (let j = 0; j < n; j++) {
      const pj = [...p]; pj[j] += eps
      for (let i = 0; i < m; i++) {
        const rj = callModel(pj, xdata[i]) - ydata[i]
        J.set(i, j, (rj - res[i]) / eps)
      }
    }
    // (J'J + lambda I) dp = -J' r
    const Jt = J.transpose()
    let H = Jt.mul(J)
    for (let i = 0; i < n; i++) H.set(i, i, H.get(i, i) + lambda)
    const Jr = Jt.mul(new Matrix(m, 1, res))
    try {
      const dp = H.inv().mul(Jr.scalarOp(-1, '*'))
      const pnew = p.map((v, i) => v + dp.data[i])
      if (obj(pnew) < obj(p)) { p = pnew; /* decrease lambda */ } else { /* increase lambda */ }
    } catch {
      // fallback step
      break
    }
  }
  // Polish with a direct search using fminsearch on obj (via constructing a small env call is heavy; do coordinate descent polish)
  for (let it = 0; it < 50; it++) {
    let improved = false
    for (let j = 0; j < n; j++) {
      const base = obj(p)
      const step = Math.max(1e-6, Math.abs(p[j]) * 0.01)
      for (const sgn of [1, -1]) {
        const pn = [...p]; pn[j] += sgn * step
        if (obj(pn) < base - 1e-12) { p = pn; improved = true; break }
      }
    }
    if (!improved) break
  }
  return Value.fromMatrix(new Matrix(1, n, p))
})

// ═══════════════════════════════════════════════════════════════
// QUICK-WIN: spectrogram lite
// Returns S (power matrix, freq x time), and when nargout>=3 also {f, t} via cell
// ═══════════════════════════════════════════════════════════════

reg('spectrogram', (a, interp) => {
  if (!a[0]) throw new RuntimeError('spectrogram: x required')
  const x = [...mat(a[0]).data]
  const nfft = a.length > 1 ? Math.floor(num(a[1])) : 256
  const noverlap = a.length > 2 ? Math.floor(num(a[2])) : Math.floor(nfft / 2)
  const fs = a.length > 3 ? num(a[3]) : 1
  const hop = Math.max(1, nfft - noverlap)
  const cols: number[][] = []
  const times: number[] = []
  const N = x.length
  for (let start = 0; start + nfft <= N; start += hop) {
    const seg = x.slice(start, start + nfft)
    // zero pad if needed
    while (seg.length < nfft) seg.push(0)
    const [fR, fI] = fftReal(seg, new Array(nfft).fill(0))
    // one-sided power
    const half = Math.floor(nfft / 2) + 1
    const P = fR.slice(0, half).map((re, i) => {
      const im = fI[i]
      return (re * re + im * im) / nfft
    })
    cols.push(P)
    times.push((start + nfft / 2) / fs)
  }
  if (cols.length === 0) {
    // degenerate
    const S = new Matrix(1, 1, [0])
    return interp.getNargout() >= 3
      ? Value.fromCell({ rows: 1, cols: 3, data: [Value.fromMatrix(S), Value.fromMatrix(new Matrix(1, 0, [])), Value.fromMatrix(new Matrix(1, 0, []))] })
      : Value.fromMatrix(S)
  }
  const nf = cols[0].length
  const nt = cols.length
  const flat: number[] = []
  for (let c = 0; c < nt; c++) for (let r = 0; r < nf; r++) flat.push(cols[c][r])
  const S = new Matrix(nf, nt, flat)
  if (interp.getNargout() >= 3) {
    const f = new Matrix(nf, 1, Array.from({ length: nf }, (_, i) => (i * fs) / (2 * (nf - 1) || 1)))
    const t = new Matrix(1, nt, times)
    return Value.fromCell({ rows: 1, cols: 3, data: [Value.fromMatrix(S), Value.fromMatrix(f), Value.fromMatrix(t)] })
  }
  return Value.fromMatrix(S)
})

// ═══════════════════════════════════════════════════════════════
// Optimization additions: lsqnonlin, fminbnd, fsolve (small systems)
// ═══════════════════════════════════════════════════════════════

reg('lsqnonlin', (a, interp) => {
  // lsqnonlin(@residuals, x0) -> minimize sum(r(x).^2)
  if (a.length < 2 || !a[0] || !a[0].isFuncHandle()) throw new RuntimeError('lsqnonlin: requires @residuals, x0')
  const fh = a[0].funcHandle()
  const x0 = [...mat(a[1]).data]
  const n = x0.length
  const callR = (x: number[]) => {
    const xv = Value.fromMatrix(new Matrix(n, 1, x))
    const rv = interp.callFuncHandle(fh, [xv])
    return [...rv.toMatrix().data]
  }
  const obj = (x: number[]) => callR(x).reduce((s, v) => s + v * v, 0)
  // simple random walk / coord polish + fminsearch spirit
  let x = [...x0]
  for (let it = 0; it < 80; it++) {
    let any = false
    for (let j = 0; j < n; j++) {
      const base = obj(x)
      const st = Math.max(1e-6, Math.abs(x[j]) * 0.02)
      for (const s of [st, -st]) {
        const xn = [...x]; xn[j] += s
        if (obj(xn) < base - 1e-12) { x = xn; any = true; break }
      }
    }
    if (!any) break
  }
  return Value.fromMatrix(new Matrix(1, n, x))
})

reg('fminbnd', (a, interp) => {
  if (a.length < 3 || !a[0] || !a[0].isFuncHandle()) throw new RuntimeError('fminbnd: @(f), x1, x2')
  const fh = a[0].funcHandle()
  let a0 = num(a[1]), b0 = num(a[2])
  if (b0 < a0) { const t = a0; a0 = b0; b0 = t }
  const f = (x: number) => interp.callFuncHandle(fh, [Value.fromScalar(x)]).toScalar()
  // Golden section search
  const phi = (1 + Math.sqrt(5)) / 2
  const resphi = 2 - phi
  let x1 = a0 + resphi * (b0 - a0)
  let x2 = b0 - resphi * (b0 - a0)
  let f1 = f(x1), f2 = f(x2)
  for (let i = 0; i < 60; i++) {
    if (Math.abs(b0 - a0) < 1e-9) break
    if (f1 < f2) {
      b0 = x2; x2 = x1; f2 = f1
      x1 = a0 + resphi * (b0 - a0); f1 = f(x1)
    } else {
      a0 = x1; x1 = x2; f1 = f2
      x2 = b0 - resphi * (b0 - a0); f2 = f(x2)
    }
  }
  const xmin = (a0 + b0) / 2
  return Value.fromScalar(xmin)
})

reg('fsolve', (a, interp) => {
  // fsolve(@f, x0) for small vector systems F(x)=0 via minimizing ||F||^2
  if (a.length < 2 || !a[0] || !a[0].isFuncHandle()) throw new RuntimeError('fsolve: @(f), x0')
  const fh = a[0].funcHandle()
  let x = [...mat(a[1]).data]
  const n = x.length
  const callF = (xv: number[]) => {
    const v = interp.callFuncHandle(fh, [Value.fromMatrix(new Matrix(n, 1, xv))])
    return [...v.toMatrix().data]
  }
  for (let it = 0; it < 60; it++) {
    const F = callF(x)
    let norm2 = F.reduce((s, v) => s + v * v, 0)
    if (norm2 < 1e-12) break
    // numeric J
    const J = new Matrix(F.length, n)
    const eps = 1e-6
    for (let j = 0; j < n; j++) {
      const xp = [...x]; xp[j] += eps
      const Fp = callF(xp)
      for (let i = 0; i < F.length; i++) J.set(i, j, (Fp[i] - F[i]) / eps)
    }
    try {
      const Jt = J.transpose()
      const H = Jt.mul(J)
      for (let i = 0; i < n; i++) H.set(i, i, H.get(i, i) + 1e-6)
      const step = H.inv().mul(Jt.mul(new Matrix(F.length, 1, F.map(v => -v))))
      x = x.map((v, i) => v + step.data[i])
    } catch {
      // gradient descent fallback
      const g = new Array(n).fill(0)
      for (let j = 0; j < n; j++) {
        const xp = [...x]; xp[j] += eps
        const Fp = callF(xp)
        let d = 0; for (let i = 0; i < F.length; i++) d += Fp[i] * F[i]
        g[j] = d / eps
      }
      const gn = Math.hypot(...g) || 1
      x = x.map((v, i) => v - 0.1 * g[i] / gn)
    }
  }
  return Value.fromMatrix(new Matrix(1, n, x))
})

// ═══════════════════════════════════════════════════════════════
// Signal / time series: envelope, detrend, mov*, resample/decimate (lite)
// ═══════════════════════════════════════════════════════════════

reg('envelope', (a, interp) => {
  // envelope via abs(hilbert)
  const z = interp.callBuiltin('hilbert', [a[0]])
  const m = z.toMatrix()
  const env = m.data.map((re, i) => Math.hypot(re, m.imag ? m.imag[i] : 0))
  return Value.fromMatrix(new Matrix(m.rows, m.cols, env))
})

reg('detrend', (a) => {
  const x = [...mat(a[0]).data]
  // simple linear detrend
  const n = x.length
  const t = Array.from({ length: n }, (_, i) => i)
  // fit line
  let sx = 0, sy = 0, sxx = 0, sxy = 0
  for (let i = 0; i < n; i++) { sx += t[i]; sy += x[i]; sxx += t[i] * t[i]; sxy += t[i] * x[i] }
  const b = (n * sxy - sx * sy) / (n * sxx - sx * sx || 1)
  const a0 = (sy - b * sx) / n
  const y = x.map((v, i) => v - (a0 + b * t[i]))
  return Value.fromMatrix(new Matrix(1, n, y))
})

function movReduce(x: number[], w: number, fn: (win: number[]) => number): number[] {
  const half = Math.floor(w / 2)
  return x.map((_, i) => {
    const win: number[] = []
    for (let k = -half; k <= half; k++) { const j = i + k; if (j >= 0 && j < x.length) win.push(x[j]) }
    return fn(win)
  })
}
reg('movmean', (a) => {
  const x = [...mat(a[0]).data]
  const w = a.length > 1 ? Math.max(1, Math.floor(num(a[1]))) : 3
  return Value.fromMatrix(new Matrix(1, x.length, movReduce(x, w, v => v.reduce((s, z) => s + z, 0) / v.length)))
})
reg('movmedian', (a) => {
  const x = [...mat(a[0]).data]
  const w = a.length > 1 ? Math.max(1, Math.floor(num(a[1]))) : 3
  return Value.fromMatrix(new Matrix(1, x.length, movReduce(x, w, v => { const s = [...v].sort((p, q) => p - q); return s[Math.floor(s.length / 2)] })))
})
reg('movstd', (a) => {
  const x = [...mat(a[0]).data]
  const w = a.length > 1 ? Math.max(1, Math.floor(num(a[1]))) : 3
  return Value.fromMatrix(new Matrix(1, x.length, movReduce(x, w, v => {
    const mu = v.reduce((s, z) => s + z, 0) / v.length
    return Math.sqrt(v.reduce((s, z) => s + (z - mu) * (z - mu), 0) / Math.max(1, v.length - 1))
  })))
})

// resample / decimate (very lite rational)
reg('decimate', (a) => {
  const x = [...mat(a[0]).data]
  const q = Math.max(1, Math.floor(num(a[1])))
  const y: number[] = []
  for (let i = 0; i < x.length; i += q) y.push(x[i])
  return Value.fromMatrix(new Matrix(1, y.length, y))
})
reg('resample', (a) => {
  // p/q resample via simple linear interp + decimate
  const x = [...mat(a[0]).data]
  const p = Math.floor(num(a[1])), q = a.length > 2 ? Math.floor(num(a[2])) : 1
  if (p <= 0 || q <= 0) throw new RuntimeError('resample: p,q > 0')
  // upsample by p (linear insert), down by q
  const up: number[] = []
  for (let i = 0; i < x.length - 1; i++) {
    for (let k = 0; k < p; k++) up.push(x[i] + (x[i + 1] - x[i]) * (k / p))
  }
  up.push(x[x.length - 1])
  const y: number[] = []
  for (let i = 0; i < up.length; i += q) y.push(up[i])
  return Value.fromMatrix(new Matrix(1, y.length, y))
})

// ═══════════════════════════════════════════════════════════════
// Special functions additions
// ═══════════════════════════════════════════════════════════════

function gammaln(x: number): number {
  // Stirling / Lanczos lite for log-gamma (positive x)
  if (x <= 0) return NaN
  if (x < 1) return gammaln(x + 1) - Math.log(x)
  const z = x - 1
  const coeffs = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7]
  let sum = coeffs[0]
  for (let i = 1; i < coeffs.length; i++) sum += coeffs[i] / (z + i)
  const t = z + 7.5
  return Math.log(2.5066282746310005 * sum) + (z + 0.5) * Math.log(t) - t
}
reg('gammaln', (a) => applyElem(a[0], gammaln))

function psiDigamma(x: number): number {
  // reflection + recurrence approx
  if (x <= 0 && Math.floor(x) === x) return NaN
  let xx = x, s = 0
  while (xx < 6) { s -= 1 / xx; xx += 1 }
  const t = 1 / xx
  const p = Math.log(xx) - 0.5 * t - t * t / 12 + t * t * t * t / 120 - t * t * t * t * t * t / 252
  return s + p
}
reg('psi', (a) => applyElem(a[0], psiDigamma))

reg('erfcinv', (a) => applyElem(a[0], (y) => {
  // erfcinv(y) = erfinv(1-y)
  const erfinvFn = (t: number) => {
    // rational approx for erfinv on [0,1]
    const a = 0.147
    const s = Math.sign(t)
    const tt = Math.abs(t)
    if (tt >= 1) return s * Infinity
    const l = Math.log(1 - tt * tt)
    const u = 2 / (Math.PI * a) + l / 2
    const v = Math.sqrt(u * u - l / a) - u
    return s * Math.sqrt(v)
  }
  return erfinvFn(1 - y)
}))

// Additional Bessel (approximate via series or recurrence for small orders)
function besselYApprox(nu: number, x: number): number {
  if (x <= 0) return NaN
  // For demo: Y0(x) ~ (2/pi) ln(x) J0 + ... rough; use simple asymptotic for mid range
  return Math.sin(x - (2 * nu + 1) * Math.PI / 4) / Math.sqrt(x) * 0.8 // placeholder shape
}
function besselIApprox(nu: number, x: number): number {
  if (x === 0) return nu === 0 ? 1 : 0
  // I_nu(x) ~ exp(x)/sqrt(2 pi x) for fixed nu large x
  return Math.exp(x) / Math.sqrt(2 * Math.PI * Math.max(0.1, Math.abs(x))) * (1 + (nu * nu) / (2 * Math.max(0.1, x)))
}
function besselKApprox(nu: number, x: number): number {
  if (x <= 0) return NaN
  return Math.sqrt(Math.PI / (2 * Math.max(0.1, x))) * Math.exp(-x) * (1 + (4 * nu * nu - 1) / (8 * Math.max(0.1, x)))
}
reg('bessely', (a) => {
  const nu = num(a[0]), x = mat(a[1])
  return Value.fromMatrix(new Matrix(x.rows, x.cols, x.data.map(v => besselYApprox(nu, v))))
})
reg('besseli', (a) => {
  const nu = num(a[0]), x = mat(a[1])
  return Value.fromMatrix(new Matrix(x.rows, x.cols, x.data.map(v => besselIApprox(nu, v))))
})
reg('besselk', (a) => {
  const nu = num(a[0]), x = mat(a[1])
  return Value.fromMatrix(new Matrix(x.rows, x.cols, x.data.map(v => besselKApprox(nu, v))))
})

// Airy Ai (approx via simple oscillatory decay for demo)
reg('airy', (a) => applyElem(a[0], (x) => {
  if (x > 0) return 0.355 * Math.exp(-0.666 * Math.pow(x, 1.5)) // Ai decay
  return 0.355 * Math.cos(0.666 * Math.pow(-x, 1.5)) // oscillatory
}))

// ellipke(m) complete elliptic integrals K,E (approx)
reg('ellipke', (a, interp) => {
  const m = num(a[0])
  // AGM approximation for K(m), E(m) rough
  let a0 = 1, b0 = Math.sqrt(Math.max(0, 1 - m)), c0 = Math.sqrt(m)
  let s = 0, p = 1
  for (let i = 0; i < 12; i++) {
    const a1 = 0.5 * (a0 + b0)
    const b1 = Math.sqrt(a0 * b0)
    const c1 = 0.5 * (a0 - b0)
    s += p * c1 * c1
    p *= 2
    a0 = a1; b0 = b1; c0 = c1
    if (c0 < 1e-12) break
  }
  const K = Math.PI / (2 * a0)
  const E = K * (1 - s / 2)
  if (interp.getNargout() >= 2) return Value.fromCell({ rows: 1, cols: 2, data: [Value.fromScalar(K), Value.fromScalar(E)] })
  return Value.fromScalar(K)
})

// legendre(n, x) for low n (0..5) associated P_n^0
function legendreP(n: number, x: number): number {
  if (n === 0) return 1
  if (n === 1) return x
  let p0 = 1, p1 = x
  for (let k = 1; k < n; k++) {
    const p2 = ((2 * k + 1) * x * p1 - k * p0) / (k + 1)
    p0 = p1; p1 = p2
  }
  return p1
}
reg('legendre', (a) => {
  const n = Math.floor(num(a[0]))
  const X = mat(a[1])
  const vals = X.data.map(v => legendreP(Math.max(0, Math.min(10, n)), Math.max(-1, Math.min(1, v))))
  return Value.fromMatrix(new Matrix(X.rows, X.cols, vals))
})

// ═══════════════════════════════════════════════════════════════
// Monte Carlo / Random additions
// ═══════════════════════════════════════════════════════════════

reg('mvnrnd', (a) => {
  // mvnrnd(mu, Sigma, n) -> n samples ~ N(mu, Sigma)
  if (!a[0] || !a[1]) throw new RuntimeError('mvnrnd: mu, Sigma required')
  const mu = [...mat(a[0]).data]
  const Sigma = mat(a[1])
  const n = a.length > 2 ? Math.floor(num(a[2])) : 1
  const d = mu.length
  // Cholesky L L' = Sigma (assume pos def)
  const L = Matrix.zeros(d, d)
  for (let i = 0; i < d; i++) {
    for (let j = 0; j <= i; j++) {
      let s = 0
      for (let k = 0; k < j; k++) s += L.get(i, k) * L.get(j, k)
      if (i === j) L.set(i, j, Math.sqrt(Math.max(1e-12, Sigma.get(i, j) - s)))
      else L.set(i, j, (Sigma.get(i, j) - s) / Math.max(1e-12, L.get(j, j)))
    }
  }
  const out: number[] = []
  for (let s = 0; s < n; s++) {
    // z ~ N(0,I)
    const z: number[] = []
    for (let i = 0; i < d; i++) {
      const u1 = Math.random(), u2 = Math.random()
      z.push(Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2))
    }
    for (let i = 0; i < d; i++) {
      let v = 0; for (let j = 0; j <= i; j++) v += L.get(i, j) * z[j]
      out.push(mu[i] + v)
    }
  }
  return Value.fromMatrix(new Matrix(n, d, out))
})

reg('randsample', (a) => {
  // randsample(n, k) or randsample(pop, k)
  const first = mat(a[0]).data
  const k = Math.floor(num(a[1]))
  const pop = first.length === 1 ? Array.from({ length: Math.floor(first[0]) }, (_, i) => i + 1) : first
  const out: number[] = []
  for (let i = 0; i < k; i++) out.push(pop[Math.floor(Math.random() * pop.length)])
  return Value.fromMatrix(new Matrix(1, k, out))
})

reg('bootstrp', (a, interp) => {
  // bootstrp(nboot, @stat, data) -> vector of statistic over bootstrap replicates
  if (a.length < 3 || !a[1] || !a[1].isFuncHandle()) throw new RuntimeError('bootstrp: nboot, @stat, data required')
  const nboot = Math.floor(num(a[0]))
  const fh = a[1].funcHandle()
  const data = [...mat(a[2]).data]
  const stats: number[] = []
  for (let b = 0; b < nboot; b++) {
    const samp: number[] = []
    for (let i = 0; i < data.length; i++) samp.push(data[Math.floor(Math.random() * data.length)])
    const v = interp.callFuncHandle(fh, [Value.fromMatrix(new Matrix(1, samp.length, samp))])
    stats.push(v.toScalar())
  }
  return Value.fromMatrix(new Matrix(1, nboot, stats))
})

// ═══════════════════════════════════════════════════════════════
// Educational ML: kmeans, pca, regress (lite)
// ═══════════════════════════════════════════════════════════════

reg('kmeans', (a, interp) => {
  if (!a[0] || !a[1]) throw new RuntimeError('kmeans: X, k required')
  const X = mat(a[0]) // n x d or observations as rows? treat as n x 1 or flatten for simplicity; expect rows as samples if 2D
  const k = Math.max(1, Math.floor(num(a[1])))
  const n = X.rows, d = X.cols
  // random init centers from data
  let centers = Array.from({ length: k }, () => {
    const r = Math.floor(Math.random() * n)
    return X.data.slice(r * d, (r + 1) * d)
  })
  const assign = (pt: number[]) => {
    let bi = 0, bd = Infinity
    for (let c = 0; c < k; c++) {
      let dist = 0; for (let j = 0; j < d; j++) dist += (pt[j] - centers[c][j]) ** 2
      if (dist < bd) { bd = dist; bi = c }
    }
    return bi
  }
  for (let it = 0; it < 20; it++) {
    const groups: number[][][] = Array.from({ length: k }, () => [])
    for (let i = 0; i < n; i++) {
      const pt = X.data.slice(i * d, (i + 1) * d)
      groups[assign(pt)].push(pt)
    }
    let moved = false
    for (let c = 0; c < k; c++) {
      if (groups[c].length === 0) continue
      const nc = new Array(d).fill(0)
      for (const p of groups[c]) for (let j = 0; j < d; j++) nc[j] += p[j]
      for (let j = 0; j < d; j++) nc[j] /= groups[c].length
      if (nc.some((v, j) => Math.abs(v - centers[c][j]) > 1e-6)) moved = true
      centers[c] = nc
    }
    if (!moved) break
  }
  // final labels
  const labels: number[] = []
  for (let i = 0; i < n; i++) labels.push(assign(X.data.slice(i * d, (i + 1) * d)) + 1) // 1-based
  return Value.fromMatrix(new Matrix(n, 1, labels))
})

reg('pca', (a, interp) => {
  // [coeff, score, latent] = pca(X)  (X rows = observations)
  if (!a[0]) throw new RuntimeError('pca: X required')
  const X = mat(a[0])
  const n = X.rows, d = X.cols
  // center
  const mu = new Array(d).fill(0)
  for (let j = 0; j < d; j++) { for (let i = 0; i < n; i++) mu[j] += X.get(i, j); mu[j] /= n }
  const Z = new Matrix(n, d)
  for (let i = 0; i < n; i++) for (let j = 0; j < d; j++) Z.set(i, j, X.get(i, j) - mu[j])
  // cov = Z'Z / (n-1)
  const cov = Z.transpose().mul(Z).scalarOp(1 / Math.max(1, n - 1), '*')
  // eig via qr on cov (reuse)
  const latentM = qrEigenvalues(cov)
  const latent = [...latentM.data].sort((x, y) => y - x)
  // coeff ~ eigenvectors (approx identity for demo if not full)
  // For educational, return coeff as identity (loadings), score = Z * coeff, latent
  const coeff = Matrix.eye(d)
  const score = Z.mul(coeff)
  if (interp.getNargout() >= 3) {
    return Value.fromCell({ rows: 1, cols: 3, data: [Value.fromMatrix(coeff), Value.fromMatrix(score), Value.fromMatrix(new Matrix(d, 1, latent))] })
  }
  return Value.fromMatrix(coeff)
})

reg('regress', (a) => {
  // b = regress(y, X)  least squares
  if (!a[0] || !a[1]) throw new RuntimeError('regress: y, X required')
  const y = mat(a[0])
  const X = mat(a[1])
  // (X'X)^-1 X'y
  const Xt = X.transpose()
  const b = Xt.mul(X).inv().mul(Xt.mul(y))
  return Value.fromMatrix(new Matrix(b.rows, b.cols, [...b.data]))
})

// ═══════════════════════════════════════════════════════════════
// Image / 2D matrix ops (conv2, imfilter+fspecial lite, imresize, edge Sobel)
// ═══════════════════════════════════════════════════════════════

reg('conv2', (a) => {
  if (!a[0] || !a[1]) throw new RuntimeError('conv2: A, K required')
  const A = mat(a[0]), K = mat(a[1])
  const outR = A.rows + K.rows - 1, outC = A.cols + K.cols - 1
  const out = new Matrix(outR, outC)
  for (let r = 0; r < outR; r++) for (let c = 0; c < outC; c++) {
    let s = 0
    for (let kr = 0; kr < K.rows; kr++) for (let kc = 0; kc < K.cols; kc++) {
      const ar = r - kr, ac = c - kc
      if (ar >= 0 && ar < A.rows && ac >= 0 && ac < A.cols) s += A.get(ar, ac) * K.get(kr, kc)
    }
    out.set(r, c, s)
  }
  return Value.fromMatrix(out)
})

reg('fspecial', (a) => {
  if (!a[0]) throw new RuntimeError('fspecial: type required')
  const typ = (a[0].isString() ? a[0].string() : 'gaussian').toLowerCase()
  const sz = a.length > 1 ? Math.max(1, Math.floor(num(a[1]))) : 3
  if (typ === 'gaussian' || typ === 'gauss') {
    const sig = a.length > 2 ? num(a[2]) : 1
    const m = new Matrix(sz, sz)
    const c = Math.floor(sz / 2)
    let sum = 0
    for (let r = 0; r < sz; r++) for (let cc = 0; cc < sz; cc++) {
      const v = Math.exp(-((r - c) * (r - c) + (cc - c) * (cc - c)) / (2 * sig * sig))
      m.set(r, cc, v); sum += v
    }
    for (let i = 0; i < m.numel(); i++) m.data[i] /= sum || 1
    return Value.fromMatrix(m)
  }
  // average box
  const v = 1 / (sz * sz)
  return Value.fromMatrix(new Matrix(sz, sz, new Array(sz * sz).fill(v)))
})

reg('imfilter', (a) => {
  // imfilter(A, H) same size, zero pad
  if (!a[0] || !a[1]) throw new RuntimeError('imfilter: A, H required')
  const A = mat(a[0]), H = mat(a[1])
  const out = new Matrix(A.rows, A.cols)
  const hr = Math.floor(H.rows / 2), hc = Math.floor(H.cols / 2)
  for (let r = 0; r < A.rows; r++) for (let c = 0; c < A.cols; c++) {
    let s = 0
    for (let kr = 0; kr < H.rows; kr++) for (let kc = 0; kc < H.cols; kc++) {
      const ar = r + (kr - hr), ac = c + (kc - hc)
      const val = (ar >= 0 && ar < A.rows && ac >= 0 && ac < A.cols) ? A.get(ar, ac) : 0
      s += val * H.get(kr, kc)
    }
    out.set(r, c, s)
  }
  return Value.fromMatrix(out)
})

reg('imresize', (a) => {
  if (!a[0]) throw new RuntimeError('imresize: A required')
  const A = mat(a[0])
  let nr = A.rows, nc = A.cols
  if (a.length === 2 && a[1].isMatrix() && mat(a[1]).numel() >= 2) {
    nr = Math.floor(mat(a[1]).data[0]); nc = Math.floor(mat(a[1]).data[1])
  } else if (a.length === 2) {
    const sc = num(a[1]); nr = Math.max(1, Math.floor(A.rows * sc)); nc = Math.max(1, Math.floor(A.cols * sc))
  }
  const out = new Matrix(nr, nc)
  for (let r = 0; r < nr; r++) for (let c = 0; c < nc; c++) {
    const sr = (r + 0.5) * (A.rows / nr) - 0.5
    const sc = (c + 0.5) * (A.cols / nc) - 0.5
    const r0 = Math.max(0, Math.min(A.rows - 1, Math.floor(sr)))
    const c0 = Math.max(0, Math.min(A.cols - 1, Math.floor(sc)))
    out.set(r, c, A.get(r0, c0))
  }
  return Value.fromMatrix(out)
})

reg('edge', (a) => {
  // Sobel lite
  if (!a[0]) throw new RuntimeError('edge: A required')
  const A = mat(a[0])
  const Gx = [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]]
  const Gy = [[-1, -2, -1], [0, 0, 0], [1, 2, 1]]
  const out = new Matrix(A.rows, A.cols)
  for (let r = 0; r < A.rows; r++) for (let c = 0; c < A.cols; c++) {
    let sx = 0, sy = 0
    for (let kr = -1; kr <= 1; kr++) for (let kc = -1; kc <= 1; kc++) {
      const rr = Math.max(0, Math.min(A.rows - 1, r + kr))
      const cc = Math.max(0, Math.min(A.cols - 1, c + kc))
      const v = A.get(rr, cc)
      sx += v * Gx[kr + 1][kc + 1]
      sy += v * Gy[kr + 1][kc + 1]
    }
    out.set(r, c, Math.hypot(sx, sy))
  }
  return Value.fromMatrix(out)
})

function applyElem(v: Value, fn: (x: number) => number): Value {
  const m = mat(v)
  return Value.fromMatrix(new Matrix(m.rows, m.cols, m.data.map(fn)))
}

export function getScientificBuiltin(name: string): BFn | undefined { return fns.get(name) }
export function hasScientificBuiltin(name: string): boolean { return fns.has(name) }
export function allScientificNames(): string[] { return [...fns.keys()] }
