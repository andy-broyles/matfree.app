/**
 * Math Correctness Test Suite
 *
 * These tests verify that MatFree produces mathematically correct results using:
 * - Analytical solutions (calculus, algebra)
 * - MATLAB/textbook reference values (linear algebra, numerical methods)
 *
 * Correctness of math and user experience is the top priority.
 */

import { describe, it, expect } from 'vitest'
import { Interpreter } from '../interpreter'
import {
  parseSym,
  differentiate,
  integrate,
  solveSymbolic,
  symToString,
  evaluate,
} from '../symbolic'
import { Matrix } from '../value'

// ─── Test Helpers ───────────────────────────────────────────────────────────

function run(code: string): { result: ReturnType<Interpreter['execute']>; output: string } {
  const out: string[] = []
  const interp = new Interpreter()
  interp.setOutput((t) => out.push(t))
  const result = interp.execute(code)
  return { result, output: out.join('') }
}

function scalar(v: ReturnType<Interpreter['execute']>): number {
  return v.toScalar()
}

function approxEqual(actual: number, expected: number, tol = 1e-10): boolean {
  if (!Number.isFinite(actual) || !Number.isFinite(expected)) return actual === expected
  if (Math.abs(expected) < 1e-10) return Math.abs(actual - expected) < tol
  return Math.abs(actual - expected) / Math.abs(expected) < tol
}

function expectApprox(actual: number, expected: number, tol = 1e-10): void {
  expect(approxEqual(actual, expected, tol), `expected ~${expected}, got ${actual}`).toBe(true)
}

// Symdiff returns "__sym:result" - extract the expression part
function symResult(v: ReturnType<Interpreter['execute']>): string {
  const s = v.string()
  return s.startsWith('__sym:') ? s.slice(6) : s
}

// Normalize symbolic string for comparison (e.g. "2*x" vs "2x")
function normalizeSym(s: string): string {
  return s.replace(/\s+/g, '').replace(/\*1(?!\d)/g, '')
}

// ─── Symbolic: Differentiation (analytical) ────────────────────────────────────

describe('Symbolic differentiation', () => {
  it('d/dx(x^2) = 2x', () => {
    const expr = parseSym('x^2')
    const deriv = differentiate(expr, 'x')
    expect(normalizeSym(symToString(deriv))).toMatch(/^2\*?x$|^x\*?2$/)
    expect(evaluate(deriv, { x: 3 })).toBe(6)
  })

  it('d/dx(x^3) = 3x^2', () => {
    const expr = parseSym('x^3')
    const deriv = differentiate(expr, 'x')
    expect(evaluate(deriv, { x: 2 })).toBe(12)
  })

  it('d/dx(sin(x)) = cos(x)', () => {
    const expr = parseSym('sin(x)')
    const deriv = differentiate(expr, 'x')
    expect(Math.abs(evaluate(deriv, { x: 0 }) - 1) < 1e-10).toBe(true)
    expect(Math.abs(evaluate(deriv, { x: Math.PI / 2 }) - 0) < 1e-10).toBe(true)
  })

  it('symdiff via interpreter', () => {
    const { result } = run("symdiff('x^2', 'x')")
    const s = normalizeSym(symResult(result))
    expect(s).toMatch(/2.*x|2x/)
  })
})

// ─── Symbolic: Integration (analytical) ─────────────────────────────────────────

describe('Symbolic integration', () => {
  it('∫x dx = x²/2', () => {
    const expr = parseSym('x')
    const antideriv = integrate(expr, 'x')
    expect(evaluate(antideriv, { x: 2 }) - evaluate(antideriv, { x: 0 })).toBe(2)
  })

  it('∫x^2 dx = x³/3', () => {
    const expr = parseSym('x^2')
    const antideriv = integrate(expr, 'x')
    const F = (x: number) => evaluate(antideriv, { x })
    expect(Math.abs(F(1) - F(0) - 1 / 3) < 1e-10).toBe(true)
  })

  it('∫sin(x) dx = -cos(x)', () => {
    const expr = parseSym('sin(x)')
    const antideriv = integrate(expr, 'x')
    const F = (x: number) => evaluate(antideriv, { x })
    // ∫₀^π sin(x) dx = 2
    expect(Math.abs(F(Math.PI) - F(0) - 2) < 1e-10).toBe(true)
  })

  it('symint via interpreter', () => {
    const { result } = run("symint('x^2', 'x')")
    const s = normalizeSym(symResult(result))
    expect(s).toMatch(/x\^3| x³|power.*3/)
  })
})

// ─── Symbolic: Equation solving ───────────────────────────────────────────────

describe('Symbolic equation solving', () => {
  it('x^2 - 4 = 0 ⇒ x = ±2', () => {
    const roots = solveSymbolic(parseSym('x^2 - 4'), 'x')
    expect(roots.length).toBe(2)
    const vals = roots.map((r) => (r.kind === 'num' ? r.value : evaluate(r, {})))
    expect(vals).toContainEqual(2)
    expect(vals).toContainEqual(-2)
  })

  it('x^2 - 5*x + 6 = 0 ⇒ x = 2, 3', () => {
    const roots = solveSymbolic(parseSym('x^2 - 5*x + 6'), 'x')
    expect(roots.length).toBe(2)
    const vals = roots.map((r) => (r.kind === 'num' ? r.value : evaluate(r, {})))
    expect(vals).toContainEqual(2)
    expect(vals).toContainEqual(3)
  })

  it('x^2 - 3*x + 2 = 0 ⇒ x = 1, 2', () => {
    const roots = solveSymbolic(parseSym('x^2 - 3*x + 2'), 'x')
    expect(roots.length).toBe(2)
    const vals = roots.map((r) => (r.kind === 'num' ? r.value : evaluate(r, {})))
    expect(vals).toContainEqual(1)
    expect(vals).toContainEqual(2)
  })

  it('symsolve via interpreter', () => {
    const { result } = run("symsolve('x^2 - 4', 'x')")
    expect(result.isMatrix()).toBe(true)
    const data = result.toMatrix().data
    expect(data).toContainEqual(2)
    expect(data).toContainEqual(-2)
  })
})

// ─── Linear algebra (reference: MATLAB, textbooks) ──────────────────────────────

describe('Linear algebra', () => {
  it('det([1 2; 3 4]) = -2', () => {
    const { result } = run('det([1 2; 3 4])')
    expect(scalar(result)).toBe(-2)
  })

  it('det of 3x3', () => {
    // [1 0 0; 0 2 0; 0 0 3] has det = 6
    const { result } = run('det([1 0 0; 0 2 0; 0 0 3])')
    expect(scalar(result)).toBe(6)
  })

  it('inv([1 2; 3 4]) * [1 2; 3 4] ≈ I', () => {
    const { result } = run('inv([1 2; 3 4]) * [1 2; 3 4]')
    const m = result.toMatrix()
    expect(m.rows).toBe(2)
    expect(m.cols).toBe(2)
    expectApprox(m.get(0, 0), 1)
    expectApprox(m.get(0, 1), 0)
    expectApprox(m.get(1, 0), 0)
    expectApprox(m.get(1, 1), 1)
  })

  it('eig([2 1; 1 2]) = [1, 3] (symmetric 2x2)', () => {
    const { result } = run('eig([2 1; 1 2])')
    const vals = [...result.toMatrix().data].sort((a, b) => a - b)
    expectApprox(vals[0], 1)
    expectApprox(vals[1], 3)
  })
})

// ─── Numerical integration ───────────────────────────────────────────────────

describe('Numerical integration', () => {
  it('∫₀^π sin(x) dx = 2', () => {
    const { result } = run('integral(@(x) sin(x), 0, pi)')
    expectApprox(scalar(result), 2, 1e-6)
  })

  it('∫₀¹ x² dx = 1/3', () => {
    const { result } = run('integral(@(x) x.^2, 0, 1)')
    expectApprox(scalar(result), 1 / 3, 1e-6)
  })

  it('∫₀¹ x dx = 0.5', () => {
    const { result } = run('integral(@(x) x, 0, 1)')
    expectApprox(scalar(result), 0.5, 1e-8)
  })
})

// ─── Root finding (fzero) ─────────────────────────────────────────────────────

describe('Root finding (fzero)', () => {
  it('fzero(x² - 2) ≈ √2', () => {
    const { result } = run('fzero(@(x) x.^2 - 2, 1)')
    expectApprox(scalar(result), Math.SQRT2, 1e-8)
  })

  it('fzero(sin) ≈ π', () => {
    const { result } = run('fzero(@(x) sin(x), 3)')
    expectApprox(scalar(result), Math.PI, 1e-8)
  })
})

// ─── ODE solver ───────────────────────────────────────────────────────────────

describe('ODE solver (ode45)', () => {
  it("y' = -y, y(0)=1 ⇒ y(1) ≈ 1/e", () => {
    const { result } = run('r = ode45(@(t,y) -y, [0 1], [1]); y = r{2}; n = size(y,1); y(n,1)')
    const y1 = scalar(result)
    expectApprox(y1, Math.exp(-1), 0.03)
  })

  it("y' = y, y(0)=1 ⇒ y(1) ≈ e", () => {
    const { result } = run('r = ode45(@(t,y) y, [0 1], [1]); y = r{2}; n = size(y,1); y(n,1)')
    const y1 = scalar(result)
    expectApprox(y1, Math.E, 0.5)
  })
})

// ─── Matrix operations (sanity) ───────────────────────────────────────────────

describe('Matrix operations', () => {
  it('A * inv(A) ≈ I for well-conditioned 3x3', () => {
    const { result } = run(`
      A = [1 2 0; 0 2 1; 1 0 2];
      B = A * inv(A);
      I = eye(3);
      max(max(abs(B - I)))
    `)
    const err = scalar(result)
    expect(err < 1e-10).toBe(true)
  })

  it('det(A*B) = det(A)*det(B)', () => {
    const { result } = run(`
      A = [1 2; 3 4];
      B = [5 6; 7 8];
      det(A*B) - det(A)*det(B)
    `)
    expectApprox(scalar(result), 0)
  })
})

// ─── Complex numbers (basic support) ──────────────────────────────────────────

describe('Complex numbers', () => {
  it('i and j are sqrt(-1)', () => {
    const { result: ri } = run('i')
    const { result: rj } = run('j')
    // i should be 0 + 1i; real part 0, imag part 1
    expect(ri.toScalar()).toBe(0)
    expect(rj.toScalar()).toBe(0)
    // Use imag() to inspect
    const { result: imi } = run('imag(i)')
    const { result: imj } = run('imag(j)')
    expect(scalar(imi)).toBe(1)
    expect(scalar(imj)).toBe(1)
  })

  it('3i parses as pure imaginary', () => {
    const { result } = run('3i')
    expect(result.toScalar()).toBe(0)
    const { result: im } = run('imag(3i)')
    expect(scalar(im)).toBe(3)
    const { result: re } = run('real(3i)')
    expect(scalar(re)).toBe(0)
  })

  it('real/imag/conj/angle work on complex scalars', () => {
    const { result: re } = run('real(3+4i)')
    const { result: im } = run('imag(3+4i)')
    const { result: cj } = run('conj(3+4i)')
    const { result: an } = run('angle(1+i)')
    expect(scalar(re)).toBe(3)
    expect(scalar(im)).toBe(4)
    // conj(3+4i) = 3-4i
    const { result: imcj } = run('imag(conj(3+4i))')
    expect(scalar(imcj)).toBe(-4)
    // angle(1+i) = pi/4
    expectApprox(scalar(an), Math.PI / 4, 1e-9)
  })

  it('complex arithmetic + - * / on scalars', () => {
    // (1+i) + (1-i) = 2
    const { result: s } = run('(1+i)+(1-i)')
    expectApprox(scalar(s), 2)
    // (1+i) * i = i + i^2 = i -1 = -1 + i
    const { result: p } = run('(1+i)*i')
    const { result: pr } = run('real((1+i)*i)')
    const { result: pi } = run('imag((1+i)*i)')
    expectApprox(scalar(pr), -1)
    expectApprox(scalar(pi), 1)
    // (1+i) / (1-i) should be i (rationalize)
    const { result: d } = run('(1+i)/(1-i)')
    const { result: dr } = run('real((1+i)/(1-i))')
    const { result: di } = run('imag((1+i)/(1-i))')
    expectApprox(scalar(dr), 0)
    expectApprox(scalar(di), 1)
  })

  it('abs on complex computes magnitude', () => {
    const { result } = run('abs(3+4i)')
    expectApprox(scalar(result), 5)
  })

  it('i^2 == -1', () => {
    const { result } = run('i^2')
    expectApprox(scalar(result), -1)
  })
})

// ─── cond / rank improvements ─────────────────────────────────────────────────

describe('cond and rank (improved)', () => {
  it('cond(eye(3)) == 1', () => {
    const { result } = run('cond(eye(3))')
    expectApprox(scalar(result), 1, 1e-9)
  })

  it('rank of full-rank vs rank-deficient', () => {
    const { result: r1 } = run('rank([1 2; 3 4])')
    expect(scalar(r1)).toBe(2)
    const { result: r2 } = run('rank([1 2; 2 4])')
    expect(scalar(r2)).toBe(1)
  })

  it('rank accepts tolerance', () => {
    // nearly rank-1 with tiny perturbation
    const { result } = run('rank([1 2; 2 4; 1e-12 2e-12], 1e-9)')
    expect(scalar(result)).toBe(1)
  })

  it('cond wires to SVD path; rank detects deficiency', () => {
    const { result: cI } = run('cond(eye(2))')
    expect(scalar(cI)).toBeCloseTo(1, 6)
    // rank of singular matrix is 1 (our SVD-based rank)
    const { result: rk } = run('rank([1 1; 1 1])')
    expect(scalar(rk)).toBe(1)
    // cond on well-conditioned tall is finite and >=1
    const { result: cTall } = run('cond([1 2 3; 4 5 6; 7 8 10])')
    expect(scalar(cTall) >= 1).toBe(true)
  })
})

// ─── New quick-win tools: quantile, rand*, hilbert, peaks, filters, lsq, spectrogram ───

describe('Quantile and prctile', () => {
  it('median via quantile ≈ 0.5 quantile', () => {
    const { result } = run('quantile([1 2 3 4 5], 0.5)')
    expectApprox(scalar(result), 3)
  })
  it('prctile 50 == median for odd length', () => {
    const { result } = run('prctile([10 20 30], 50)')
    expectApprox(scalar(result), 20)
  })
})

describe('randperm / randi / rng', () => {
  it('randperm(n) returns permutation of 1..n', () => {
    const { result } = run('sort(randperm(6))')
    const m = result.toMatrix().data
    expect(m).toEqual([1,2,3,4,5,6])
  })
  it('randperm(n,k) length k and unique', () => {
    const { result } = run('p = randperm(20, 5); [length(p), length(unique(p))]')
    const m = result.toMatrix().data
    expect(m[0]).toBe(5)
    expect(m[1]).toBe(5)
  })
  it('randi([1 3], 100) yields only 1,2,3', () => {
    const { result } = run('r = randi([1 3], 1, 100); [min(r) max(r)]')
    const m = result.toMatrix().data
    expect(m[0]).toBeGreaterThanOrEqual(1)
    expect(m[1]).toBeLessThanOrEqual(3)
  })
  it('rng seed makes rand reproducible', () => {
    const { result: a } = run('rng(123); rand(1,3)')
    const { result: b } = run('rng(123); rand(1,3)')
    const da = a.toMatrix().data, db = b.toMatrix().data
    expect(da).toEqual(db)
  })
})

describe('hilbert analytic signal', () => {
  it('hilbert of real cosine has ~same magnitude envelope', () => {
    const { result } = run('t=linspace(0,2*pi,128); z=hilbert(cos(t)); max(abs(abs(z)-1))')
    // envelope of cos should be ~1
    expect(scalar(result)).toBeLessThan(0.2)
  })
})

describe('findpeaks', () => {
  it('finds peaks in simple signal', () => {
    const { result } = run('findpeaks([0 1 0 2 0])')
    const p = result.toMatrix().data
    expect(p.length).toBeGreaterThanOrEqual(1)
  })
  it('[pks,locs] = findpeaks returns two outputs', () => {
    const { result } = run('[p,l] = findpeaks([0 1 0 2 0]); l')
    // locs should be 1-based indices
    const locs = result.toMatrix().data
    expect(locs.some(v => v >= 1 && v <= 5)).toBe(true)
  })
})

describe('histcounts / medfilt1 / sgolayfilt', () => {
  it('histcounts returns counts and optionally edges', () => {
    const { result } = run('histcounts([1 1 2 3], 2)')
    // at least some positive counts
    const c = result.toMatrix().data
    expect(c.some(v => v > 0)).toBe(true)
  })
  it('medfilt1 smooths impulses', () => {
    const { result } = run('medfilt1([0 0 10 0 0], 3)')
    const y = result.toMatrix().data
    // center should be reduced
    expect(y[2]).toBeLessThan(5)
  })
  it('sgolayfilt runs without error on short data', () => {
    const { result } = run('sgolayfilt([1 2 3 4 5], 1, 3)')
    expect(result.toMatrix().data.length).toBe(5)
  })
})

describe('lsqcurvefit basic fit', () => {
  it('fits a line y = a*x + b roughly', () => {
    // model(p,x) = p(1)*x + p(2)
    const code = `
      x = [1 2 3 4 5];
      y = 2*x + 1 + 0.01*randn(1,5);
      p = lsqcurvefit(@(p,x) p(1)*x + p(2), [0 0], x, y);
      abs(p(1)-2) + abs(p(2)-1)
    `
    const { result } = run(code)
    expect(scalar(result)).toBeLessThan(0.5)
  })
})

describe('spectrogram lite shape', () => {
  it('returns a matrix with positive freqs x times', () => {
    const { result } = run('S = spectrogram(sin(linspace(0,10*pi,512)), 64, 32); size(S)')
    const dims = result.toMatrix().data
    expect(dims[0]).toBeGreaterThan(1) // freq bins
    expect(dims[1]).toBeGreaterThan(1) // time frames
  })
})

describe('Optimization additions', () => {
  it('fminbnd finds min of (x-2)^2 near [0 4]', () => {
    const { result } = run('fminbnd(@(x) (x-2)^2, 0, 4)')
    expectApprox(scalar(result), 2, 1e-3)
  })
  it('fsolve solves x^2-2=0 near 1', () => {
    const { result } = run('fsolve(@(x) x.^2-2, 1)')
    expectApprox(scalar(result), Math.SQRT2, 0.05)
  })
})

describe('Moving stats and detrend/envelope', () => {
  it('movmean smooths constant + noise', () => {
    const { result } = run('mean(movmean(ones(1,20)+0.01*randn(1,20), 5))')
    expectApprox(scalar(result), 1, 0.05)
  })
  it('detrend removes linear trend', () => {
    const { result } = run('max(abs(detrend(linspace(0,5,20))))')
    expect(scalar(result)).toBeLessThan(1e-6)
  })
})

describe('Special function additions', () => {
  it('gammaln(5) ≈ log(24)', () => {
    const { result } = run('gammaln(5)')
    expectApprox(scalar(result), Math.log(24), 1e-6)
  })
  it('psi(1) ≈ -gamma (Euler-Mascheroni)', () => {
    const { result } = run('psi(1) + 0.5772156649')
    expectApprox(scalar(result), 0, 0.02)
  })
  it('erfcinv(erfc(0.5)) ≈ 0.5', () => {
    const { result } = run('erfcinv(erfc(0.5))')
    expectApprox(scalar(result), 0.5, 0.02)
  })
  it('ellipke(0) = pi/2', () => {
    const { result } = run('ellipke(0)')
    expectApprox(scalar(result), Math.PI / 2, 1e-6)
  })
})

describe('Monte Carlo / ML / I/O / 2D image (smoke + basic)', () => {
  it('mvnrnd shape and rough mean', () => {
    const { result } = run('mu=[0 0]; S=[1 0;0 1]; R=mvnrnd(mu,S,200); mean(R,1)')
    const m = result.toMatrix().data
    expect(m.length).toBe(2)
    expect(Math.abs(m[0])).toBeLessThan(0.3)
  })
  it('kmeans labels in range', () => {
    const { result } = run('lab = kmeans([1;2;10;11], 2); [min(lab) max(lab)]')
    const r = result.toMatrix().data
    expect(r[0]).toBeGreaterThanOrEqual(1)
    expect(r[1]).toBeLessThanOrEqual(2)
  })
  it('conv2 basic kernel sum', () => {
    const { result } = run('sum(sum(conv2(ones(3), ones(2))))')
    // 3x3 convolved with 2x2 ones -> interior 4s
    expect(scalar(result)).toBeGreaterThan(10)
  })
  it('readtable parses without crash (smoke)', () => {
    const { result } = run("T=readtable('a,b\\n1,2\\n3,4'); 1")
    expect(scalar(result)).toBe(1)
  })
})
