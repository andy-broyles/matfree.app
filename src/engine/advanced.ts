// MatFree Engine - Advanced Functions
// Enhanced LA, signal processing windows, audio, regex, matrix functions

import { Value, Matrix, RuntimeError } from './value'
import type { Interpreter } from './interpreter'

type BFn = (args: Value[], interp: Interpreter) => Value
const fns: Map<string, BFn> = new Map()
function reg(name: string, fn: BFn) { fns.set(name, fn) }
function num(v: Value): number { return v.toScalar() }
function mat(v: Value): Matrix { return v.toMatrix() }

// ═══════════════════════════════════════════════════════════════
// MATRIX FUNCTIONS (expm, logm, sqrtm)
// ═══════════════════════════════════════════════════════════════

// Matrix exponential via Padé approximation (scaling and squaring)
reg('expm', (a) => {
  const A = mat(a[0])
  if (A.rows !== A.cols) throw new RuntimeError('expm requires square matrix')
  const n = A.rows
  // Scale: find s such that ||A/2^s|| < 1
  let s = 0, norm = A.norm()
  while (norm > 1) { norm /= 2; s++ }
  let scaled = A.clone()
  for (let i = 0; i < s; i++) scaled = scaled.scalarOp(0.5, '*')
  // Padé(6) approximation
  let N_mat = Matrix.eye(n), D_mat = Matrix.eye(n)
  let Ak = Matrix.eye(n)
  const c = [1, 1/2, 1/10, 1/120, 1/1680, 1/30240, 1/665280]
  for (let k = 1; k <= 6; k++) {
    Ak = Ak.mul(scaled)
    const term = Ak.scalarOp(c[k], '*')
    N_mat = N_mat.add(term)
    D_mat = k % 2 === 0 ? D_mat.add(term) : D_mat.sub(term)
  }
  let result = D_mat.inv().mul(N_mat)
  // Unsquare
  for (let i = 0; i < s; i++) result = result.mul(result)
  return Value.fromMatrix(result)
})

// Matrix logarithm via inverse scaling and squaring
reg('logm', (a) => {
  const A = mat(a[0])
  if (A.rows !== A.cols) throw new RuntimeError('logm requires square matrix')
  const n = A.rows
  let X = A.clone()
  let s = 0
  // Repeatedly take sqrt until close to I
  for (let i = 0; i < 20; i++) { X = sqrtMatrix(X); s++ }
  // log(X) ≈ (X-I) - (X-I)^2/2 + (X-I)^3/3 - ... for X near I
  const I = Matrix.eye(n)
  const D = X.sub(I)
  let result = Matrix.zeros(n, n), Dk = D.clone()
  for (let k = 1; k <= 15; k++) {
    const term = Dk.scalarOp(k % 2 === 1 ? 1/k : -1/k, '*')
    result = result.add(term)
    Dk = Dk.mul(D)
  }
  return Value.fromMatrix(result.scalarOp(Math.pow(2, s), '*'))
})

// Matrix square root via Denman-Beavers iteration
reg('sqrtm', (a) => Value.fromMatrix(sqrtMatrix(mat(a[0]))))

function sqrtMatrix(A: Matrix): Matrix {
  const n = A.rows
  let Y = A.clone(), Z = Matrix.eye(n)
  for (let i = 0; i < 30; i++) {
    const Ynew = Y.add(Z.inv()).scalarOp(0.5, '*')
    const Znew = Z.add(Y.inv()).scalarOp(0.5, '*')
    const diff = Ynew.sub(Y).norm()
    Y = Ynew; Z = Znew
    if (diff < 1e-14) break
  }
  return Y
}

// ═══════════════════════════════════════════════════════════════
// ENHANCED LINEAR ALGEBRA
// ═══════════════════════════════════════════════════════════════

// Full eigenvalue decomposition returning [V, D] where A*V = V*D
reg('eig_full', (a) => {
  const A = mat(a[0]), n = A.rows
  if (n !== A.cols) throw new RuntimeError('eig requires square matrix')
  // QR algorithm for eigenvalues
  let T = A.clone()
  let Q_total = Matrix.eye(n)
  for (let iter = 0; iter < 200; iter++) {
    const { Q, R } = qrDecomp(T)
    T = R.mul(Q)
    Q_total = Q_total.mul(Q)
    // Check convergence
    let offDiag = 0
    for (let i = 1; i < n; i++) for (let j = 0; j < i; j++) offDiag += Math.abs(T.get(i, j))
    if (offDiag < 1e-12) break
  }
  const D = Matrix.zeros(n, n)
  for (let i = 0; i < n; i++) D.set(i, i, T.get(i, i))
  return Value.fromCell({ rows: 1, cols: 2, data: [Value.fromMatrix(Q_total), Value.fromMatrix(D)] })
})

// Full SVD: [U, S, V] = svd_full(A)
reg('svd_full', (a) => {
  const A = mat(a[0]), m = A.rows, n = A.cols
  const AtA = A.transpose().mul(A)
  const AAt = A.mul(A.transpose())
  // Eigendecompose AtA for V and singular values
  let T = AtA.clone(), V = Matrix.eye(n)
  for (let iter = 0; iter < 200; iter++) {
    const { Q, R } = qrDecomp(T); T = R.mul(Q); V = V.mul(Q)
    let off = 0; for (let i = 1; i < n; i++) for (let j = 0; j < i; j++) off += Math.abs(T.get(i, j))
    if (off < 1e-12) break
  }
  const sv: number[] = []
  for (let i = 0; i < Math.min(m, n); i++) sv.push(Math.sqrt(Math.max(0, T.get(i, i))))
  // Sort by descending singular value
  const idx = sv.map((v, i) => i).sort((a, b) => sv[b] - sv[a])
  const S = Matrix.zeros(m, n)
  const Vsorted = Matrix.zeros(n, n)
  for (let j = 0; j < n; j++) {
    S.set(j, j, sv[idx[j]])
    for (let i = 0; i < n; i++) Vsorted.set(i, j, V.get(i, idx[j]))
  }
  // U = A * V * S^-1
  const U = Matrix.zeros(m, m)
  for (let j = 0; j < Math.min(m, n); j++) {
    if (sv[idx[j]] > 1e-14) {
      const col = new Matrix(n, 1)
      for (let i = 0; i < n; i++) col.set(i, 0, Vsorted.get(i, j))
      const u = A.mul(col).scalarOp(1 / sv[idx[j]], '*')
      for (let i = 0; i < m; i++) U.set(i, j, u.get(i, 0))
    }
  }
  return Value.fromCell({ rows: 1, cols: 3, data: [Value.fromMatrix(U), Value.fromMatrix(S), Value.fromMatrix(Vsorted)] })
})

// Null space
reg('null_space', (a) => {
  const A = mat(a[0])
  // Use SVD to find null space
  const AtA = A.transpose().mul(A)
  const n = A.cols
  let T = AtA.clone(), V = Matrix.eye(n)
  for (let iter = 0; iter < 100; iter++) {
    const { Q, R } = qrDecomp(T); T = R.mul(Q); V = V.mul(Q)
  }
  // Find columns corresponding to zero singular values
  const result: number[][] = []
  for (let j = 0; j < n; j++) {
    if (Math.abs(T.get(j, j)) < 1e-10) {
      const col: number[] = []
      for (let i = 0; i < n; i++) col.push(V.get(i, j))
      result.push(col)
    }
  }
  if (result.length === 0) return Value.fromMatrix(Matrix.zeros(n, 0))
  const m = new Matrix(n, result.length)
  for (let j = 0; j < result.length; j++) for (let i = 0; i < n; i++) m.set(i, j, result[j][i])
  return Value.fromMatrix(m)
})

function qrDecomp(A: Matrix): { Q: Matrix; R: Matrix } {
  const n = A.rows, m = A.cols
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
  return { Q, R }
}

// ═══════════════════════════════════════════════════════════════
// SIGNAL PROCESSING - Window Functions
// ═══════════════════════════════════════════════════════════════

reg('hamming', (a) => {
  const n = num(a[0])
  const w = new Array(n)
  for (let i = 0; i < n; i++) w[i] = 0.54 - 0.46 * Math.cos(2 * Math.PI * i / (n - 1))
  return Value.fromMatrix(new Matrix(n, 1, w))
})

reg('hanning', (a) => {
  const n = num(a[0])
  const w = new Array(n)
  for (let i = 0; i < n; i++) w[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (n - 1)))
  return Value.fromMatrix(new Matrix(n, 1, w))
})

reg('blackman', (a) => {
  const n = num(a[0])
  const w = new Array(n)
  for (let i = 0; i < n; i++) w[i] = 0.42 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1)) + 0.08 * Math.cos(4 * Math.PI * i / (n - 1))
  return Value.fromMatrix(new Matrix(n, 1, w))
})

reg('kaiser', (a) => {
  const n = num(a[0]), beta = a.length > 1 ? num(a[1]) : 5
  const w = new Array(n)
  const i0b = besselI0(beta)
  for (let i = 0; i < n; i++) {
    const t = 2 * i / (n - 1) - 1
    w[i] = besselI0(beta * Math.sqrt(1 - t * t)) / i0b
  }
  return Value.fromMatrix(new Matrix(n, 1, w))
})

reg('bartlett', (a) => {
  const n = num(a[0])
  const w = new Array(n)
  for (let i = 0; i < n; i++) w[i] = 1 - Math.abs(2 * i / (n - 1) - 1)
  return Value.fromMatrix(new Matrix(n, 1, w))
})

function besselI0(x: number): number {
  let sum = 1, term = 1
  for (let k = 1; k <= 25; k++) { term *= (x / (2 * k)) * (x / (2 * k)); sum += term }
  return sum
}

// Power spectral density
reg('pwelch', (a, interp) => {
  const x = mat(a[0]).data
  const nfft = a.length > 1 ? num(a[1]) : Math.min(256, x.length)
  const w = new Array(nfft)
  for (let i = 0; i < nfft; i++) w[i] = 0.54 - 0.46 * Math.cos(2 * Math.PI * i / (nfft - 1)) // Hamming
  // Welch's method with 50% overlap
  const hop = Math.floor(nfft / 2)
  const psd = new Array(Math.floor(nfft / 2) + 1).fill(0)
  let nseg = 0
  for (let start = 0; start + nfft <= x.length; start += hop) {
    const seg = x.slice(start, start + nfft).map((v, i) => v * w[i])
    const re = [...seg], im = new Array(nfft).fill(0)
    const [fR, fI] = fftDirect(re, im)
    for (let i = 0; i <= nfft / 2; i++) psd[i] += (fR[i] * fR[i] + fI[i] * fI[i]) / nfft
    nseg++
  }
  for (let i = 0; i < psd.length; i++) psd[i] = 10 * Math.log10(psd[i] / nseg + 1e-30)
  return Value.fromMatrix(new Matrix(1, psd.length, psd))
})

// Cross-correlation
reg('xcorr', (a) => {
  const x = mat(a[0]).data
  const y = a.length > 1 ? mat(a[1]).data : x
  const n = x.length, m = y.length
  const len = n + m - 1
  const result = new Array(len).fill(0)
  for (let lag = -(m - 1); lag < n; lag++) {
    let sum = 0
    for (let i = 0; i < m; i++) { const j = i + lag; if (j >= 0 && j < n) sum += x[j] * y[i] }
    result[lag + m - 1] = sum
  }
  return Value.fromMatrix(new Matrix(1, len, result))
})

function fftDirect(re: number[], im: number[]): [number[], number[]] {
  const n = re.length
  if (n <= 1) return [re, im]
  if (n & (n - 1)) {
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
  const eR: number[] = [], eI: number[] = [], oR: number[] = [], oI: number[] = []
  for (let i = 0; i < n; i += 2) { eR.push(re[i]); eI.push(im[i]); oR.push(re[i + 1]); oI.push(im[i + 1]) }
  const [ER, EI] = fftDirect(eR, eI), [OR, OI] = fftDirect(oR, oI)
  const outRe = new Array(n), outIm = new Array(n)
  for (let k = 0; k < n / 2; k++) {
    const a = -2 * Math.PI * k / n, wR = Math.cos(a), wI = Math.sin(a)
    const tR = wR * OR[k] - wI * OI[k], tI = wR * OI[k] + wI * OR[k]
    outRe[k] = ER[k] + tR; outIm[k] = EI[k] + tI
    outRe[k + n / 2] = ER[k] - tR; outIm[k + n / 2] = EI[k] - tI
  }
  return [outRe, outIm]
}

// ═══════════════════════════════════════════════════════════════
// AUDIO SYNTHESIS (Web Audio API)
// ═══════════════════════════════════════════════════════════════

reg('sound', (a, interp) => {
  const y = mat(a[0]).data
  const fs = a.length > 1 ? num(a[1]) : 8192
  // Encode as base64 WAV and create an audio tag via output
  const wav = encodeWAV(y, fs)
  const b64 = btoa(String.fromCharCode(...new Uint8Array(wav)))
  interp.print(`__audio:data:audio/wav;base64,${b64}\n`)
  return Value.empty()
})

reg('sawtooth', (a) => {
  const t = mat(a[0])
  return Value.fromMatrix(new Matrix(t.rows, t.cols, t.data.map(v => 2 * (v / (2 * Math.PI) - Math.floor(v / (2 * Math.PI) + 0.5)))))
})

reg('square', (a) => {
  const t = mat(a[0])
  const duty = a.length > 1 ? num(a[1]) : 0.5
  return Value.fromMatrix(new Matrix(t.rows, t.cols, t.data.map(v => {
    const phase = (v / (2 * Math.PI)) % 1
    return (phase >= 0 ? phase : phase + 1) < duty ? 1 : -1
  })))
})

reg('chirp', (a) => {
  const t = mat(a[0])
  const f0 = a.length > 1 ? num(a[1]) : 0
  const t1 = a.length > 2 ? num(a[2]) : 1
  const f1 = a.length > 3 ? num(a[3]) : 100
  const k = (f1 - f0) / t1
  return Value.fromMatrix(new Matrix(t.rows, t.cols, t.data.map(v => Math.sin(2 * Math.PI * (f0 * v + k / 2 * v * v)))))
})

function encodeWAV(samples: number[], sampleRate: number): ArrayBuffer {
  const n = samples.length
  const buf = new ArrayBuffer(44 + n * 2)
  const view = new DataView(buf)
  const writeStr = (off: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)) }
  writeStr(0, 'RIFF'); view.setUint32(4, 36 + n * 2, true); writeStr(8, 'WAVE')
  writeStr(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true)
  writeStr(36, 'data'); view.setUint32(40, n * 2, true)
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true)
  }
  return buf
}

// ═══════════════════════════════════════════════════════════════
// REGULAR EXPRESSIONS
// ═══════════════════════════════════════════════════════════════

reg('regexp', (a) => {
  const str = a[0].string(), pat = a[1].string()
  const re = new RegExp(pat, 'g')
  const starts: number[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(str)) !== null) starts.push(m.index + 1) // 1-indexed
  return Value.fromMatrix(new Matrix(1, starts.length, starts))
})

reg('regexpi', (a) => {
  const str = a[0].string(), pat = a[1].string()
  const re = new RegExp(pat, 'gi')
  const starts: number[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(str)) !== null) starts.push(m.index + 1)
  return Value.fromMatrix(new Matrix(1, starts.length, starts))
})

reg('regexprep', (a) => {
  const str = a[0].string(), pat = a[1].string(), rep = a[2].string()
  return Value.fromString(str.replace(new RegExp(pat, 'g'), rep))
})

// ═══════════════════════════════════════════════════════════════
// SUBPLOT system
// ═══════════════════════════════════════════════════════════════

reg('subplot', (a, interp) => {
  const rows = num(a[0]), cols = num(a[1]), idx = num(a[2])
  const fig = interp.getCurrentFigure()
  if (!(fig as any).__subplots) (fig as any).__subplots = {}
  ;(fig as any).__subplotLayout = [rows, cols]
  ;(fig as any).__activeSubplot = idx
  // Each subplot gets its own series array
  if (!(fig as any).__subplots[idx]) (fig as any).__subplots[idx] = { series: [], title: '', xlabel: '', ylabel: '' }
  return Value.empty()
})

// ═══════════════════════════════════════════════════════════════
// TEXT annotation on plots
// ═══════════════════════════════════════════════════════════════

reg('text', (a, interp) => {
  const x = num(a[0]), y = num(a[1]), str = a[2].string()
  const fig = interp.getCurrentFigure()
  if (!(fig as any).__annotations) (fig as any).__annotations = []
  ;(fig as any).__annotations.push({ x, y, text: str })
  interp.emitPlot()
  return Value.empty()
})

// ═══════════════════════════════════════════════════════════════
// TIMING / PROFILING
// ═══════════════════════════════════════════════════════════════

reg('timeit', (a, interp) => {
  const fh = a[0].funcHandle()
  const n = 10
  const start = performance.now()
  for (let i = 0; i < n; i++) interp.callFuncHandle(fh, [])
  const elapsed = (performance.now() - start) / n / 1000
  interp.print(`  Average time: ${elapsed.toExponential(4)} seconds (${n} runs)\n`)
  return Value.fromScalar(elapsed)
})

reg('pause', (a) => {
  // In browser context, this is a no-op but recognized
  return Value.empty()
})

// ═══════════════════════════════════════════════════════════════
// ADDITIONAL MATH
// ═══════════════════════════════════════════════════════════════

reg('deg2rad', (a) => Value.fromMatrix(new Matrix(mat(a[0]).rows, mat(a[0]).cols, mat(a[0]).data.map(v => v * Math.PI / 180))))
reg('rad2deg', (a) => Value.fromMatrix(new Matrix(mat(a[0]).rows, mat(a[0]).cols, mat(a[0]).data.map(v => v * 180 / Math.PI))))
reg('hypot', (a) => Value.fromScalar(Math.hypot(num(a[0]), num(a[1]))))
reg('gcd', (a) => Value.fromScalar(gcd(Math.round(num(a[0])), Math.round(num(a[1])))))
reg('lcm', (a) => { const aa = Math.round(num(a[0])), bb = Math.round(num(a[1])); return Value.fromScalar(Math.abs(aa * bb) / gcd(aa, bb)) })
reg('nchoosek', (a) => {
  const n = Math.round(num(a[0])), k = Math.round(num(a[1]))
  let result = 1; for (let i = 0; i < k; i++) result = result * (n - i) / (i + 1)
  return Value.fromScalar(Math.round(result))
})
reg('factorial_exact', (a) => {
  const n = Math.round(num(a[0]))
  let r = 1; for (let i = 2; i <= n; i++) r *= i
  return Value.fromScalar(r)
})
reg('primes', (a) => {
  const n = num(a[0])
  const sieve = new Uint8Array(n + 1)
  for (let i = 2; i * i <= n; i++) if (!sieve[i]) for (let j = i * i; j <= n; j += i) sieve[j] = 1
  const result: number[] = []
  for (let i = 2; i <= n; i++) if (!sieve[i]) result.push(i)
  return Value.fromMatrix(new Matrix(1, result.length, result))
})
reg('isprime', (a) => {
  const n = Math.round(num(a[0]))
  if (n < 2) return Value.fromLogical(false)
  for (let i = 2; i * i <= n; i++) if (n % i === 0) return Value.fromLogical(false)
  return Value.fromLogical(true)
})
reg('factor', (a) => {
  let n = Math.round(num(a[0]))
  const factors: number[] = []
  for (let d = 2; d * d <= n; d++) while (n % d === 0) { factors.push(d); n /= d }
  if (n > 1) factors.push(n)
  return Value.fromMatrix(new Matrix(1, factors.length, factors))
})

function gcd(a: number, b: number): number { a = Math.abs(a); b = Math.abs(b); while (b) { const t = b; b = a % b; a = t } return a }

// Date/time
reg('now', () => Value.fromScalar(Date.now() / 86400000 + 719529)) // datenum format
reg('datestr', (a, interp) => {
  const d = new Date((num(a[0]) - 719529) * 86400000)
  return Value.fromString(d.toISOString().slice(0, 19).replace('T', ' '))
})
reg('clock', () => {
  const d = new Date()
  return Value.fromMatrix(new Matrix(1, 6, [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()]))
})

// ═══════════════════════════════════════════════════════════════
// 3D PLOTS
// ═══════════════════════════════════════════════════════════════

reg('surf', (a, interp) => {
  const X = mat(a[0]), Y = mat(a[1]), Z = mat(a[2])
  const data = build3DGrid(X, Y, Z)
  interp.print(`__plot3d:${JSON.stringify({ type: 'surf', ...data, title: 'Surface Plot' })}\n`)
  return Value.empty()
})

reg('mesh', (a, interp) => {
  const X = mat(a[0]), Y = mat(a[1]), Z = mat(a[2])
  const data = build3DGrid(X, Y, Z)
  interp.print(`__plot3d:${JSON.stringify({ type: 'mesh', ...data, title: 'Mesh Plot' })}\n`)
  return Value.empty()
})

reg('contour', (a, interp) => {
  const X = mat(a[0]), Y = mat(a[1]), Z = mat(a[2])
  const data = build3DGrid(X, Y, Z)
  interp.print(`__plot3d:${JSON.stringify({ type: 'contour', ...data, title: 'Contour Plot' })}\n`)
  return Value.empty()
})

reg('plot3', (a, interp) => {
  const x = mat(a[0]).data, y = mat(a[1]).data, z = mat(a[2]).data
  interp.print(`__plot3d:${JSON.stringify({ type: 'plot3', x, y, z, title: '3D Line Plot' })}\n`)
  return Value.empty()
})

function build3DGrid(X: Matrix, Y: Matrix, Z: Matrix) {
  const rows = X.rows, cols = X.cols
  const Xg: number[][] = [], Yg: number[][] = [], Zg: number[][] = []
  for (let i = 0; i < rows; i++) {
    const xr: number[] = [], yr: number[] = [], zr: number[] = []
    for (let j = 0; j < cols; j++) { xr.push(X.get(i, j)); yr.push(Y.get(i, j)); zr.push(Z.get(i, j)) }
    Xg.push(xr); Yg.push(yr); Zg.push(zr)
  }
  return { X: Xg, Y: Yg, Z: Zg }
}

// ═══════════════════════════════════════════════════════════════
// CODE TRANSPILER (built-in functions)
// ═══════════════════════════════════════════════════════════════

reg('to_python', (a, interp) => {
  try {
    const { toPython } = require('./transpiler')
    const code = a[0].string()
    const py = toPython(code)
    interp.print(py + '\n')
    return Value.fromString(py)
  } catch (e: any) {
    interp.print(`Transpiler error: ${e.message}\n`)
    return Value.empty()
  }
})

reg('to_julia', (a, interp) => {
  try {
    const { toJulia } = require('./transpiler')
    const code = a[0].string()
    const jl = toJulia(code)
    interp.print(jl + '\n')
    return Value.fromString(jl)
  } catch (e: any) {
    interp.print(`Transpiler error: ${e.message}\n`)
    return Value.empty()
  }
})

export function getAdvancedBuiltin(name: string): BFn | undefined { return fns.get(name) }
export function hasAdvancedBuiltin(name: string): boolean { return fns.has(name) }
export function allAdvancedNames(): string[] { return [...fns.keys()] }
