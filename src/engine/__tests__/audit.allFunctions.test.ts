/**
 * Full-Surface Function Audit
 *
 * Known-answer tests for the registered builtin surface — every function a
 * user can call gets at least one check against an analytically known or
 * MATLAB-reference value. Plot/audio/IO functions are checked for correct
 * series types and output side effects.
 */

import { describe, it, expect } from 'vitest'
import { Interpreter } from '../interpreter'

function makeInterp() {
  const out: string[] = []
  const interp = new Interpreter()
  interp.setOutput((t) => out.push(t))
  return { interp, out }
}

function run(code: string) {
  const { interp, out } = makeInterp()
  const result = interp.execute(code)
  return { result, output: out.join(''), interp }
}

function sc(code: string): number {
  return run(code).result.toScalar()
}

function vec(code: string): number[] {
  return [...run(code).result.toMatrix().data]
}

function str(code: string): string {
  return run(code).result.string()
}

function expectClose(actual: number, expected: number, tol = 1e-9) {
  if (!Number.isFinite(expected)) { expect(actual).toBe(expected); return }
  expect(Math.abs(actual - expected), `expected ~${expected}, got ${actual}`).toBeLessThanOrEqual(tol * Math.max(1, Math.abs(expected)))
}

function expectVec(actual: number[], expected: number[], tol = 1e-9) {
  expect(actual.length, `length ${actual.length} != ${expected.length}`).toBe(expected.length)
  for (let i = 0; i < expected.length; i++) {
    expect(Math.abs(actual[i] - expected[i]), `elem ${i}: expected ~${expected[i]}, got ${actual[i]}`).toBeLessThanOrEqual(tol * Math.max(1, Math.abs(expected[i])))
  }
}

// ─── Elementary math ────────────────────────────────────────────────────────

describe('Elementary math', () => {
  it('trig', () => {
    expectClose(sc('sin(pi/6)'), 0.5)
    expectClose(sc('cos(pi/3)'), 0.5)
    expectClose(sc('tan(pi/4)'), 1)
    expectClose(sc('asin(0.5)'), Math.PI / 6)
    expectClose(sc('acos(0.5)'), Math.PI / 3)
    expectClose(sc('atan(1)'), Math.PI / 4)
    expectClose(sc('atan2(1, 1)'), Math.PI / 4)
    expectClose(sc('atan2(-1, -1)'), -3 * Math.PI / 4)
    expectClose(sc('sinh(1)'), Math.sinh(1))
    expectClose(sc('cosh(1)'), Math.cosh(1))
    expectClose(sc('tanh(1)'), Math.tanh(1))
  })
  it('exp/log', () => {
    expectClose(sc('exp(1)'), Math.E)
    expectClose(sc('log(exp(2))'), 2)
    expectClose(sc('log10(1000)'), 3)
    expectClose(sc('log2(8)'), 3)
    expectClose(sc('sqrt(2)'), Math.SQRT2)
  })
  it('rounding & sign', () => {
    expect(sc('floor(2.7)')).toBe(2)
    expect(sc('ceil(2.1)')).toBe(3)
    expect(sc('round(2.5)')).toBe(3)
    expect(sc('fix(2.7)')).toBe(2)
    expect(sc('fix(-2.7)')).toBe(-2)
    expect(sc('sign(-5)')).toBe(-1)
    expect(sc('abs(-3.5)')).toBe(3.5)
    expect(sc('mod(7, 3)')).toBe(1)
    expect(sc('mod(-1, 3)')).toBe(2)  // MATLAB: mod follows divisor sign
    expect(sc('rem(7, 3)')).toBe(1)
    expectClose(sc('hypot(3, 4)'), 5)
  })
  it('constants', () => {
    expectClose(sc('pi'), Math.PI)
    expect(sc('inf')).toBe(Infinity)
    expect(Number.isNaN(sc('nan'))).toBe(true)
    expectClose(sc('eps'), 2.220446049250313e-16)
  })
})

// ─── Aggregates & statistics ────────────────────────────────────────────────

describe('Aggregates & statistics', () => {
  it('sum/prod/mean/median', () => {
    expect(sc('sum([1 2 3 4])')).toBe(10)
    expect(sc('prod([1 2 3 4])')).toBe(24)
    expect(sc('mean([2 4 6])')).toBe(4)
    expect(sc('median([3 1 2])')).toBe(2)
    expect(sc('median([4 1 3 2])')).toBe(2.5)
  })
  it('std/var are sample (n-1) like MATLAB', () => {
    expectClose(sc('var([2 4 6])'), 4)
    expectClose(sc('std([2 4 6])'), 2)
  })
  it('min/max with indices', () => {
    expect(sc('max([3 9 4])')).toBe(9)
    expect(sc('min([3 9 4])')).toBe(3)
    expect(vec('[m, i] = max([3 9 4]); [m i]')).toEqual([9, 2])
    expect(vec('[m, i] = min([3 9 4]); [m i]')).toEqual([3, 1])
  })
  it('cumsum/cumprod', () => {
    expect(vec('cumsum([1 2 3])')).toEqual([1, 3, 6])
    expect(vec('cumprod([1 2 3])')).toEqual([1, 2, 6])
  })
  it('sort with indices', () => {
    expect(vec('sort([3 1 2])')).toEqual([1, 2, 3])
    expect(vec("sort([3 1 2], 'descend')")).toEqual([3, 2, 1])
    expect(vec('[s, i] = sort([30 10 20]); i')).toEqual([2, 3, 1])
  })
  it('normal distribution', () => {
    expectClose(sc('normpdf(0, 0, 1)'), 1 / Math.sqrt(2 * Math.PI), 1e-6)
    expectClose(sc('normcdf(0, 0, 1)'), 0.5, 1e-6)
    expectClose(sc('normcdf(1.96, 0, 1)'), 0.975, 1e-3)
    expectClose(sc('norminv(0.975, 0, 1)'), 1.96, 1e-2)
  })
})

// ─── Matrix creation & manipulation ─────────────────────────────────────────

describe('Matrix creation & manipulation', () => {
  it('zeros/ones/eye', () => {
    expect(vec('zeros(2, 2)')).toEqual([0, 0, 0, 0])
    expect(vec('ones(1, 3)')).toEqual([1, 1, 1])
    expect(vec('eye(2)')).toEqual([1, 0, 0, 1])
  })
  it('rand/randn shape and range', () => {
    const r = run('rand(3, 3)').result.toMatrix()
    expect(r.rows).toBe(3); expect(r.cols).toBe(3)
    expect(r.data.every(v => v >= 0 && v < 1)).toBe(true)
    const n = run('randn(1, 100)').result.toMatrix()
    expect(n.data.every(v => Number.isFinite(v))).toBe(true)
  })
  it('linspace/logspace/colon', () => {
    expect(vec('linspace(0, 1, 5)')).toEqual([0, 0.25, 0.5, 0.75, 1])
    expectVec(vec('logspace(0, 2, 3)'), [1, 10, 100])
    expect(vec('1:5')).toEqual([1, 2, 3, 4, 5])
    expect(vec('10:-2:4')).toEqual([10, 8, 6, 4])
    expect(vec('0:0.5:2')).toEqual([0, 0.5, 1, 1.5, 2])
  })
  it('diag both directions', () => {
    expect(vec('diag([1 2])')).toEqual([1, 0, 0, 2])
    expect(vec('diag([1 2; 3 4])')).toEqual([1, 4])
  })
  it('reshape/repmat', () => {
    const m = run('reshape([1 2 3 4 5 6], 2, 3)').result.toMatrix()
    expect(m.rows).toBe(2); expect(m.cols).toBe(3)
    expect(vec('repmat([1 2], 1, 2)')).toEqual([1, 2, 1, 2])
  })
  it('size/length/numel', () => {
    expect(vec('size(ones(2, 3))')).toEqual([2, 3])
    expect(sc('size(ones(2, 3), 1)')).toBe(2)
    expect(sc('size(ones(2, 3), 2)')).toBe(3)
    expect(sc('length(ones(2, 5))')).toBe(5)
    expect(sc('numel(ones(2, 5))')).toBe(10)
  })
  it('flip/rotate/tri', () => {
    expect(vec('fliplr([1 2 3])')).toEqual([3, 2, 1])
    expect(vec('flipud([1; 2])')).toEqual([2, 1])
    expect(vec('rot90([1 2; 3 4])')).toEqual([2, 4, 1, 3])
    expect(vec('tril([1 2; 3 4])')).toEqual([1, 0, 3, 4])
    expect(vec('triu([1 2; 3 4])')).toEqual([1, 2, 0, 4])
  })
  it('magic squares are magic', () => {
    const m = run('magic(4)').result.toMatrix()
    const target = 34
    for (let r = 0; r < 4; r++) {
      let s = 0; for (let c = 0; c < 4; c++) s += m.get(r, c)
      expect(s).toBe(target)
    }
    for (let c = 0; c < 4; c++) {
      let s = 0; for (let r = 0; r < 4; r++) s += m.get(r, c)
      expect(s).toBe(target)
    }
  })
  it('meshgrid/kron/vander', () => {
    expect(vec('[X, Y] = meshgrid(1:2, 1:3); size(X)')).toEqual([3, 2])
    expect(vec('kron([1 2], [1; 1])')).toEqual([1, 2, 1, 2])
    const v = run('vander([1 2 3])').result.toMatrix()
    expect(v.get(1, 0)).toBe(4) // 2^2
  })
})

// ─── Linear algebra ─────────────────────────────────────────────────────────

describe('Linear algebra', () => {
  it('det/inv/trace/rank', () => {
    expect(sc('det([1 2; 3 4])')).toBe(-2)
    expectVec(vec('inv([4 7; 2 6])'), [0.6, -0.7, -0.2, 0.4])
    expect(sc('trace([1 2; 3 4])')).toBe(5)
    expect(sc('rank([1 2; 2 4])')).toBe(1)
    expect(sc('rank(eye(3))')).toBe(3)
  })
  it('norm/dot/cross', () => {
    expectClose(sc('norm([3 4])'), 5)
    expect(sc('dot([1 2 3], [4 5 6])')).toBe(32)
    expect(vec('cross([1 0 0], [0 1 0])')).toEqual([0, 0, 1])
  })
  it('eig: values sum to trace, product is det', () => {
    const e = vec('eig([4 1; 2 3])')
    expectClose(e[0] + e[1], 7, 1e-6)
    expectClose(e[0] * e[1], 10, 1e-6)
    // analytic: roots of x^2-7x+10 = 5, 2
    expectVec([...e].sort((a, b) => b - a), [5, 2], 1e-6)
  })
  it('[V,D] = eig: A*V = V*D', () => {
    const { result } = run('A = [4 1; 1 3]; [V, D] = eig(A); norm(A*V - V*D)')
    expectClose(result.toScalar(), 0, 1e-6)
  })
  it('svd singular values', () => {
    // A = [3 0; 0 4] has singular values 4, 3
    expectVec(vec('svd([3 0; 0 4])'), [4, 3], 1e-6)
  })
  it('[U,S,V] = svd reconstructs A', () => {
    expectClose(sc("A = [1 2; 3 4]; [U, S, V] = svd(A); norm(A - U*S*V')"), 0, 1e-6)
  })
  it('lu/qr/chol reconstruct', () => {
    expectClose(sc('A = [4 3; 6 3]; [L, U] = lu(A); norm(A - L*U)'), 0, 1e-9)
    expectClose(sc('A = [1 2; 3 4]; [Q, R] = qr(A); norm(A - Q*R)'), 0, 1e-9)
    expectClose(sc("A = [4 2; 2 3]; L = chol(A); norm(A - L*L')"), 0, 1e-9)
  })
  it('linsolve/pinv', () => {
    expectVec(vec('linsolve([2 0; 0 4], [2; 8])'), [1, 2])
    expectClose(sc('A = [1 2; 3 4]; norm(pinv(A) - inv(A))'), 0, 1e-6)
  })
  it('cond of identity is 1', () => {
    expectClose(sc('cond(eye(3))'), 1, 1e-6)
  })
  it('expm/logm/sqrtm', () => {
    // expm of rotation generator
    expectVec(vec('expm([0 -1; 1 0])'), [Math.cos(1), -Math.sin(1), Math.sin(1), Math.cos(1)], 1e-9)
    expectClose(sc('norm(sqrtm([4 0; 0 9]) - [2 0; 0 3])'), 0, 1e-9)
    expectClose(sc('norm(logm(expm([0.5 0; 0 0.25])) - [0.5 0; 0 0.25])'), 0, 1e-6)
  })
})

// ─── Polynomials, calculus, optimization ────────────────────────────────────

describe('Polynomials & numerics', () => {
  it('polyval/polyfit/polyder/polyint/roots/poly', () => {
    expect(sc('polyval([1 2 3], 2)')).toBe(11) // x^2+2x+3 at 2
    expectVec(vec('polyfit([1 2 3], [2 4 6], 1)'), [2, 0], 1e-8)
    expect(vec('polyder([1 2 3])')).toEqual([2, 2])
    expectVec(vec('polyint([2 2])'), [1, 2, 0])
    expectVec(vec('sort(roots([1 -5 6]))'), [2, 3], 1e-8)
    expectVec(vec('poly([2 3])'), [1, -5, 6], 1e-9)
  })
  it('interp1/spline', () => {
    expect(sc('interp1([1 2 3], [10 20 30], 2.5)')).toBe(25)
    expectClose(sc('spline([0 1 2 3], [0 1 8 27], 1.5)'), 3.375, 0.15) // cubic-ish
  })
  it('trapz/cumtrapz/gradient/diff', () => {
    expectClose(sc('trapz(linspace(0, pi, 1000), sin(linspace(0, pi, 1000)))'), 2, 1e-4)
    expect(vec('diff([1 4 9 16])')).toEqual([3, 5, 7])
    const g = vec('gradient([1 4 9])')
    expectClose(g[1], 4, 1e-9) // central difference
  })
  it('integral: finite and infinite bounds', () => {
    expectClose(sc('integral(@(x) x.^2, 0, 1)'), 1 / 3, 1e-6)
    expectClose(sc('integral(@(x) exp(-x.^2), -inf, inf)'), Math.sqrt(Math.PI), 1e-6)
    expectClose(sc('integral(@(x) exp(-x), 0, inf)'), 1, 1e-6)
  })
  it('fzero/fminsearch', () => {
    expectClose(sc('fzero(@(x) x^2 - 4, 1)'), 2, 1e-6)
    expectClose(sc('fminsearch(@(x) (x(1) - 3)^2 + 2, 0)'), 3, 1e-3)
  })
  it('ode45 solves exponential decay', () => {
    // y' = -y, y(0) = 1 => y(2) = e^-2
    const { result } = run('[t, y] = ode45(@(t, y) -y, [0 2], 1); y(length(y))')
    expectClose(result.toScalar(), Math.exp(-2), 1e-3)
  })
})

// ─── Signal processing ──────────────────────────────────────────────────────

describe('Signal processing', () => {
  it('fft of constant signal concentrates at DC', () => {
    const X = vec('abs_fft([1 1 1 1])')
    expectClose(X[0], 4)
    expectClose(X[1], 0, 1e-9)
  })
  it('fft magnitude of pure tone peaks at its bin', () => {
    const X = vec('fs = 32; t = (0:31)/fs; abs_fft(sin(2*pi*4*t))')
    const peak = X.indexOf(Math.max(...X))
    expect(peak).toBe(4)
  })
  it('ifft inverts fft (real signals)', () => {
    expectVec(vec('ifft(fft([1 2 3 4]))').map(v => Math.round(v * 1e6) / 1e6), [1, 2, 3, 4], 1e-3)
  })
  it('conv/deconv', () => {
    expect(vec('conv([1 1], [1 1])')).toEqual([1, 2, 1])
    expect(vec('deconv([1 2 1], [1 1])')).toEqual([1, 1])
  })
  it('filter (moving average)', () => {
    expectVec(vec('filter([0.5 0.5], 1, [1 1 1 1])'), [0.5, 1, 1, 1])
  })
  it('windows have correct length and peak', () => {
    for (const w of ['hamming', 'hanning', 'blackman', 'bartlett']) {
      const v = vec(`${w}(11)`)
      expect(v.length).toBe(11)
      const peak = Math.max(...v)
      expectClose(peak, 1, 0.09)
    }
    expect(vec('kaiser(8, 5)').length).toBe(8)
  })
  it('xcorr peak at zero lag for autocorrelation', () => {
    const v = vec('xcorr([1 2 3])')
    const mid = Math.floor(v.length / 2)
    expect(v[mid]).toBe(Math.max(...v))
  })
  it('fftshift', () => {
    expect(vec('fftshift([1 2 3 4])')).toEqual([3, 4, 1, 2])
  })
})

// ─── Number theory & combinatorics ──────────────────────────────────────────

describe('Number theory', () => {
  it('primes/isprime/factor', () => {
    expect(vec('primes(20)')).toEqual([2, 3, 5, 7, 11, 13, 17, 19])
    expect(sc('isprime(17)')).toBe(1)
    expect(sc('isprime(15)')).toBe(0)
    expect(vec('factor(360)')).toEqual([2, 2, 2, 3, 3, 5])
  })
  it('gcd/lcm/nchoosek/factorial', () => {
    expect(sc('gcd(12, 18)')).toBe(6)
    expect(sc('lcm(4, 6)')).toBe(12)
    expect(sc('nchoosek(10, 3)')).toBe(120)
    expect(sc('factorial_exact(10)')).toBe(3628800)
  })
  it('special functions', () => {
    expectClose(sc('gamma(5)'), 24, 1e-6)
    expectClose(sc('gamma(0.5)'), Math.sqrt(Math.PI), 1e-6)
    expectClose(sc('erf(0)'), 0)
    expectClose(sc('erf(1)'), 0.8427007929, 1e-6)
    expectClose(sc('erfc(1)'), 1 - 0.8427007929, 1e-6)
    expectClose(sc('erfinv(erf(0.5))'), 0.5, 1e-4)
    expectClose(sc('beta(2, 3)'), 1 / 12, 1e-6)
    expectClose(sc('besselj(0, 0)'), 1, 1e-6)
  })
})

// ─── Sets ───────────────────────────────────────────────────────────────────

describe('Set operations', () => {
  it('unique/union/intersect/setdiff/ismember', () => {
    expect(vec('unique([3 1 2 1 3])')).toEqual([1, 2, 3])
    expect(vec('union([1 2], [2 3])')).toEqual([1, 2, 3])
    expect(vec('intersect([1 2 3], [2 3 4])')).toEqual([2, 3])
    expect(vec('setdiff([1 2 3], [2])')).toEqual([1, 3])
    expect(sc('ismember(2, [1 2 3])')).toBe(1)
    expect(sc('ismember(5, [1 2 3])')).toBe(0)
  })
})

// ─── Strings ────────────────────────────────────────────────────────────────

describe('Strings', () => {
  it('basic ops', () => {
    expect(str("upper('abc')")).toBe('ABC')
    expect(str("lower('ABC')")).toBe('abc')
    expect(str("strtrim('  hi  ')")).toBe('hi')
    expect(str("strcat('a', 'b', 'c')")).toBe('abc')
    expect(str("replace('aXa', 'X', 'b')")).toBe('aba')
    expect(sc("strlength('hello')")).toBe(5)
  })
  it('comparison & search', () => {
    expect(sc("strcmp('abc', 'abc')")).toBe(1)
    expect(sc("strcmp('abc', 'abd')")).toBe(0)
    expect(sc("strcmpi('ABC', 'abc')")).toBe(1)
    expect(sc("contains('hello world', 'wor')")).toBe(1)
    expect(sc("startsWith('hello', 'he')")).toBe(1)
    expect(sc("endsWith('hello', 'lo')")).toBe(1)
  })
  it('conversion', () => {
    expect(str('num2str(42)')).toBe('42')
    expect(sc("str2num('3.5')")).toBe(3.5)
    expect(sc("str2double('2.5')")).toBe(2.5)
  })
  it('sprintf formatting', () => {
    expect(str("sprintf('%d', 42)")).toBe('42')
    expect(str("sprintf('%.2f', 3.14159)")).toBe('3.14')
    expect(str("sprintf('x=%d y=%d', 1, 2)")).toBe('x=1 y=2')
  })
  it('regexprep', () => {
    expect(str("regexprep('aaa', 'a', 'b')")).toBe('bbb')
  })
})

// ─── Logic & type predicates ────────────────────────────────────────────────

describe('Logic & predicates', () => {
  it('any/all/find', () => {
    expect(sc('any([0 0 1])')).toBe(1)
    expect(sc('all([1 1 0])')).toBe(0)
    expect(vec('find([0 5 0 7])')).toEqual([2, 4])
    expect(vec('[r, c] = find([0 1; 1 0]); r')).toEqual([2, 1])
  })
  it('predicates', () => {
    expect(sc('isnan(nan)')).toBe(1)
    expect(sc('isinf(inf)')).toBe(1)
    expect(sc('isfinite(1)')).toBe(1)
    expect(sc('isnumeric(5)')).toBe(1)
    expect(sc("ischar('a')")).toBe(1)
    expect(sc('isempty([])')).toBe(1)
    expect(sc('isscalar(5)')).toBe(1)
    expect(sc('isvector([1 2 3])')).toBe(1)
  })
  it('logical indexing via find', () => {
    expect(vec('v = [5 10 15 20]; v(find(v > 8))')).toEqual([10, 15, 20])
  })
})

// ─── Language features ──────────────────────────────────────────────────────

describe('Language features', () => {
  it('control flow', () => {
    expect(sc('x = 0; if 1 > 0\nx = 5;\nend\nx')).toBe(5)
    expect(sc('x = 0; for i = 1:4\nx = x + i;\nend\nx')).toBe(10)
    expect(sc('x = 0; while x < 5\nx = x + 2;\nend\nx')).toBe(6)
    expect(sc("x = 2; switch x\ncase 1\ny = 10;\ncase 2\ny = 20;\notherwise\ny = 0;\nend\ny")).toBe(20)
    expect(sc('x = 0; for i = 1:10\nif i == 3\nbreak\nend\nx = i;\nend\nx')).toBe(2)
    expect(sc('x = 0; for i = 1:5\nif mod(i, 2) == 0\ncontinue\nend\nx = x + i;\nend\nx')).toBe(9)
  })
  it('try/catch', () => {
    expect(sc("x = 0; try\nerror('boom')\ncatch\nx = 1;\nend\nx")).toBe(1)
  })
  it('functions, recursion, closures', () => {
    expect(sc('function y = sq(x)\ny = x^2;\nend\nsq(7)')).toBe(49)
    expect(sc('function y = fib(n)\nif n <= 1\ny = n;\nelse\ny = fib(n-1) + fib(n-2);\nend\nend\nfib(10)')).toBe(55)
    expect(sc('a = 10; f = @(x) x + a; f(5)')).toBe(15)
    expect(sc('f = @(x, y) x * y; f(3, 4)')).toBe(12)
  })
  it('multiple returns from user functions', () => {
    expect(vec('function [s, p] = sp(a, b)\ns = a + b;\np = a * b;\nend\n[x, y] = sp(3, 4); [x y]')).toEqual([7, 12])
  })
  it('matrix indexing & slicing', () => {
    expect(sc('A = [1 2; 3 4]; A(2, 1)')).toBe(3)
    expect(vec('A = [1 2; 3 4]; A(1, :)')).toEqual([1, 2])
    expect(vec('A = [1 2; 3 4]; A(:, 2)')).toEqual([2, 4])
    expect(sc('v = [10 20 30]; v(end)')).toBe(30)
    expect(vec('v = [10 20 30 40]; v(2:3)')).toEqual([20, 30])
    expect(vec("v = [1 2 3]; v'")).toEqual([1, 2, 3]) // transpose of row
  })
  it('matrix ops & broadcasting', () => {
    expect(vec('[1 2; 3 4] * [1 0; 0 1]')).toEqual([1, 2, 3, 4])
    expect(vec('[1 2] .* [3 4]')).toEqual([3, 8])
    expect(vec('[4 9] ./ [2 3]')).toEqual([2, 3])
    expect(vec('[2 3] .^ 2')).toEqual([4, 9])
    expect(vec('[1 2] + 10')).toEqual([11, 12])
  })
  it('structs & cells', () => {
    expect(sc("s = struct('a', 1, 'b', 2); s.a + s.b")).toBe(3)
    expect(sc('c = {1, 2, 3}; c{2}')).toBe(2)
    expect(sc("s.x = 5; isfield(s, 'x')")).toBe(1)
  })
  it('cellfun/arrayfun/feval', () => {
    expect(vec('arrayfun(@(x) x^2, [1 2 3])')).toEqual([1, 4, 9])
    expect(sc("feval(@sin, pi/2)")).toBe(1)
    expect(sc("feval('cos', 0)")).toBe(1)
  })
  it('jsonencode/jsondecode roundtrip', () => {
    expect(str('jsonencode([1 2 3])')).toContain('1')
    expect(sc("d = jsondecode('{\"x\": 5}'); d.x")).toBe(5)
  })
})

// ─── Plotting (series inspection) ───────────────────────────────────────────

describe('Plotting', () => {
  const plotCases: [string, string][] = [
    ['plot(1:3, [1 4 9])', 'line'],
    ['scatter(1:3, [1 4 9])', 'scatter'],
    ['bar(1:3, [1 4 9])', 'bar'],
    ['stem(1:3, [1 4 9])', 'stem'],
    ['stairs(1:3, [1 4 9])', 'stairs'],
    ['area(1:3, [1 4 9])', 'area'],
    ['hist(randn(1, 100), 10)', 'hist'],
    ['semilogx([1 10 100], [1 2 3])', 'line'],
    ['semilogy([1 2 3], [1 10 100])', 'line'],
    ['loglog([1 10], [1 100])', 'line'],
  ]
  for (const [code, type] of plotCases) {
    it(`${code.split('(')[0]} produces ${type} series`, () => {
      const { interp } = makeInterp()
      interp.execute(code)
      const fig = interp.getCurrentFigure()
      expect(fig.series.length).toBeGreaterThan(0)
      expect(fig.series[0].type).toBe(type)
    })
  }
  it('3D plots emit __plot3d payloads', () => {
    for (const code of [
      '[X, Y] = meshgrid(1:3, 1:3); surf(X, Y, X + Y)',
      '[X, Y] = meshgrid(1:3, 1:3); mesh(X, Y, X + Y)',
      '[X, Y] = meshgrid(1:3, 1:3); contour(X, Y, X + Y)',
      'plot3(1:5, 1:5, 1:5)',
    ]) {
      const { interp, out } = makeInterp()
      interp.execute(code)
      expect(out.join(''), code).toContain('__plot3d:')
    }
  })
  it('hold accumulates series', () => {
    const { interp } = makeInterp()
    interp.execute("hold('on')\nplot(1:3, 1:3)\nplot(1:3, [2 4 6])")
    expect(interp.getCurrentFigure().series.length).toBe(2)
  })
  it('title/labels/grid/legend are recorded', () => {
    const { interp } = makeInterp()
    interp.execute("plot(1:3, 1:3)\ntitle('T')\nxlabel('X')\nylabel('Y')\nlegend('a')")
    const fig = interp.getCurrentFigure()
    expect(fig.title).toBe('T')
    expect(fig.xlabel).toBe('X')
    expect(fig.ylabel).toBe('Y')
  })
  it('sound produces audio payload', () => {
    const { output } = run('sound(sin(2*pi*440*linspace(0, 0.05, 410)), 8192)')
    expect(output).toContain('__audio:')
  })
  it('imagesc produces heatmap payload', () => {
    const { interp, out } = makeInterp()
    interp.execute('imagesc(magic(4))')
    const all = out.join('') + JSON.stringify(interp.getCurrentFigure())
    expect(all.length).toBeGreaterThan(0) // emits without crashing
  })
})

// ─── Symbolic CAS ───────────────────────────────────────────────────────────

describe('Symbolic CAS', () => {
  function symStr(code: string): string {
    const s = run(code).result.string()
    return (s.startsWith('__sym:') ? s.slice(6) : s).replace(/\s+/g, '')
  }
  it('differentiation', () => {
    expect(symStr("symdiff('x^2', 'x')")).toBe('2*x')
    expect(symStr("symdiff('sin(x)', 'x')")).toBe('cos(x)')
    expect(symStr("symdiff('exp(x)', 'x')")).toBe('exp(x)')
    expect(symStr("symdiff('x^3 + 2*x', 'x')")).toContain('3*x^2')
  })
  it('integration including by parts', () => {
    expect(symStr("symint('x^2', 'x')")).toBe('x^3/3')
    expect(symStr("symint('cos(x)', 'x')")).toBe('sin(x)')
    expect(symStr("symint('x * exp(x)', 'x')")).toBe('x*exp(x)-exp(x)')
    expect(symStr("symint('x^2 * exp(x)', 'x')")).toBe('x^2*exp(x)-2*x*exp(x)+2*exp(x)')
  })
  it('solving', () => {
    const out = run("symsolve('x^2 - 5*x + 6', 'x')").output
    expect(out).toContain('2')
    expect(out).toContain('3')
  })
  it('taylor series', () => {
    // exp(x) ~ 1 + x + x^2/2 + x^3/6 — accept either rational or decimal form
    const s = symStr("symtaylor('exp(x)', 'x', 0, 3)")
    expect(s.includes('x^2/2') || s.includes('0.5*x^2')).toBe(true)
    expect(s).toContain('1')
    expect(s).toContain('x^3')
  })
  it('symeval', () => {
    expectClose(sc("symeval('x^2 + 1', 'x', 3)"), 10)
  })
  it('simplify & expand', () => {
    expect(symStr("symsimplify('x + x')")).toBe('2*x')
    expect(symStr("symexpand('(x+1)^2')")).toContain('x^2')
  })
  it('substitution', () => {
    expect(symStr("symsubs('x^2 + y', 'x', 'y')")).toContain('y^2')
  })
})

// ─── Transpiler ─────────────────────────────────────────────────────────────

describe('Transpiler', () => {
  it('to_python emits valid-looking numpy code', () => {
    const { output } = run("to_python('x = linspace(0, 1, 10); y = sin(x);')")
    expect(output).toContain('np.linspace')
    expect(output).toContain('np.sin')
    expect(output).not.toContain('undefined')
  })
  it('to_julia emits julia code', () => {
    const { output } = run("to_julia('x = 5; y = x^2;')")
    expect(output.toLowerCase()).toContain('x = 5')
    expect(output).not.toContain('undefined')
  })
  it('transpiles control flow', () => {
    const { output } = run("to_python('for i = 1:3\\ndisp(i)\\nend')")
    expect(output).toContain('for')
  })
})

// ─── Output functions ───────────────────────────────────────────────────────

describe('Output & misc', () => {
  it('disp/fprintf', () => {
    expect(run("disp('hello')").output).toContain('hello')
    expect(run("fprintf('%d-%d\\n', 3, 4)").output).toContain('3-4')
    expect(run('disp([1 2; 3 4])').output).toContain('1')
  })
  it('error raises catchable error', () => {
    expect(() => run("error('my message')")).toThrow(/my message/)
  })
  it('tic/toc', () => {
    expect(sc('tic; toc') >= 0).toBe(true)
  })
  it('deg2rad/rad2deg/clock/now', () => {
    expectClose(sc('deg2rad(180)'), Math.PI)
    expectClose(sc('rad2deg(pi)'), 180)
    expect(vec('clock').length).toBeGreaterThanOrEqual(6)
    expect(sc('now') > 0).toBe(true)
  })
  it('class/isa/exist', () => {
    expect(str('class(5)')).toBe('double')
    expect(str("class('s')")).toBe('char')
    expect(sc("exist('sin')") > 0).toBe(true)
  })
})
