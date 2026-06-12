/**
 * User-Facing Example Regression Tests
 *
 * Every example shipped on the landing page (and the common destructuring
 * idioms users will type) must execute cleanly. These are the first things
 * a new user clicks — they can never break.
 */

import { describe, it, expect } from 'vitest'
import { Interpreter } from '../interpreter'

function runExample(code: string) {
  const out: string[] = []
  let plots = 0
  const interp = new Interpreter()
  interp.setOutput((t) => out.push(t))
  interp.setPlotCallback(() => plots++)
  interp.execute(code)
  return { output: out.join(''), plots, interp }
}

describe('Landing page examples (verbatim)', () => {
  it('Symbolic Calculus', () => {
    const { output } = runExample(
      "symdiff('x^3 + sin(x^2)', 'x')\nsymint('x^2 * exp(x)', 'x')\nsymsolve('x^2 - 5*x + 6', 'x')"
    )
    expect(output).toContain('3*x^2')          // derivative
    expect(output).toContain('x^2*exp(x)')     // integral leading term
    expect(output).toContain('2')              // roots 2 and 3
    expect(output).toContain('3')
  })

  it('Interactive Plot', () => {
    const { plots, interp } = runExample(
      "x = linspace(0, 4*pi, 200);\nhold('on')\nplot(x, sin(x))\nplot(x, cos(x))\nlegend('sin(x)', 'cos(x)')\ntitle('Zoom: drag select. Pan: shift+drag')"
    )
    expect(plots).toBeGreaterThan(0)
    expect(interp.getCurrentFigure().series.length).toBe(2)
  })

  it('Audio Synthesis', () => {
    const { output } = runExample(
      "fs = 8192;\nt = linspace(0, 1, fs);\ny = 0.3*sin(2*pi*440*t) + 0.3*sin(2*pi*554*t) + 0.3*sin(2*pi*659*t);\nsound(y, fs)"
    )
    expect(output).toContain('__audio:data:audio/wav')
  })

  it('Matrix Exponential', () => {
    const { output } = runExample(
      "A = [0 -1; 1 0];\nE = expm(A);\nfprintf('expm([0 -1; 1 0]):\\n')\ndisp(E)"
    )
    // expm of the rotation generator = [cos(1) -sin(1); sin(1) cos(1)]
    expect(output).toContain('0.5403')
    expect(output).toContain('0.8415')
  })

  it('Quick-start tutorial step 2', () => {
    const { plots } = runExample('x = 1:10; plot(x, x.^2)')
    expect(plots).toBe(1)
  })
})

describe('Multi-output idioms', () => {
  it('[X, Y] = meshgrid + surf renders a 3D payload', () => {
    const { output } = runExample(
      '[X, Y] = meshgrid(linspace(-3,3,40), linspace(-3,3,40));\nZ = sin(sqrt(X.^2 + Y.^2));\nsurf(X, Y, Z)'
    )
    expect(output).toContain('__plot3d:')
    expect(output).toContain('"type":"surf"')
  })

  it('[t, Y] = ode45 (van der Pol) plots the solution', () => {
    const { plots } = runExample(
      'f = @(t, y) [y(2); 2*(1 - y(1)^2)*y(2) - y(1)];\n[t, Y] = ode45(f, [0 20], [2; 0]);\nplot(t, Y(:,1))'
    )
    expect(plots).toBe(1)
  })

  it('ode45 is numerically accurate (exp decay, 0.1% tolerance)', () => {
    const { interp } = runExample('[t, y] = ode45(@(t, y) -y, [0 2], 1);')
    const y = interp.getGlobalEnv().get('y')!.toMatrix()
    const final = y.data[y.data.length - 1]
    expect(Math.abs(final - Math.exp(-2)) / Math.exp(-2)).toBeLessThan(1e-3)
  })

  it('[U, S, V] = svd low-rank approximation has decreasing error', () => {
    const code = (k: number) =>
      `A = magic(6);\n[U, S, V] = svd(A);\nA_approx = U(:,1:${k}) * S(1:${k},1:${k}) * V(:,1:${k})';\nerr = norm(A - A_approx);`
    const e1 = runExample(code(1)).interp.getGlobalEnv().get('err')!.toScalar()
    const e4 = runExample(code(4)).interp.getGlobalEnv().get('err')!.toScalar()
    expect(e4).toBeLessThan(e1)
  })

  it('[V, D] = eig diag(D) prints all eigenvalues', () => {
    const { output } = runExample('A = [4 1 2; 1 3 1; 2 1 5];\n[V, D] = eig(A);\ndisp(diag(D))')
    const nums = output.match(/\d+\.\d+/g) ?? []
    expect(nums.length).toBe(3)
    const sum = nums.reduce((s, n) => s + parseFloat(n), 0)
    expect(Math.abs(sum - 12)).toBeLessThan(0.01) // trace(A) = 12
  })

  it('spectrum via abs(fft(x)) peaks at the tone frequency', () => {
    const { interp } = runExample(
      'fs = 64; t = (0:63)/fs;\nx = sin(2*pi*10*t);\nX = abs(fft(x));'
    )
    const X = interp.getGlobalEnv().get('X')!.toMatrix().data
    const peak = X.indexOf(Math.max(...X))
    expect(peak).toBe(10) // bin 10 = 10 Hz with this setup
  })
})
