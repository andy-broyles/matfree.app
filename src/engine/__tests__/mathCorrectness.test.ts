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
