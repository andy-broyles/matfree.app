/**
 * Execution Guard Test Suite
 *
 * The engine runs on the UI thread and accepts code from shareable ?code= URLs,
 * so runaway programs must be stopped: infinite loops hit a wall-clock budget,
 * and unbounded recursion hits a depth cap instead of blowing the JS stack.
 */

import { describe, it, expect } from 'vitest'
import { Interpreter } from '../interpreter'

function makeInterp(limitMs?: number): Interpreter {
  const interp = new Interpreter()
  interp.setOutput(() => {})
  if (limitMs !== undefined) interp.setExecutionLimitMs(limitMs)
  return interp
}

describe('Execution time limit', () => {
  it('aborts an infinite while loop', () => {
    const interp = makeInterp(100)
    const start = Date.now()
    expect(() => interp.execute('while true\nx = 1;\nend')).toThrow(/time limit/i)
    expect(Date.now() - start).toBeLessThan(5000)
  })

  it('aborts a long-running for loop', () => {
    const interp = makeInterp(100)
    // Range small enough to materialize, body slow enough to exceed the budget
    expect(() => interp.execute('s = 0;\nfor i = 1:1e7\ns = s + i;\nend')).toThrow(/time limit/i)
  })

  it('rejects absurd matrix allocations with a clear error', () => {
    const interp = makeInterp()
    expect(() => interp.execute('x = 1:1e9;')).toThrow(/too large/i)
    expect(() => interp.execute('z = zeros(1e5, 1e5);')).toThrow(/too large/i)
  })

  it('resets the budget on each execute() call', () => {
    const interp = makeInterp(200)
    expect(() => interp.execute('while true\nend')).toThrow(/time limit/i)
    // A fresh call gets a fresh budget and runs fine
    expect(interp.execute('y = 2 + 2').toScalar()).toBe(4)
  })

  it('does not interfere with normal loops', () => {
    const interp = makeInterp()
    const result = interp.execute('s = 0;\nfor i = 1:1000\ns = s + i;\nend\ns')
    expect(result.toScalar()).toBe(500500)
  })

  it('can be disabled with 0', () => {
    const interp = makeInterp(0)
    const result = interp.execute('s = 0;\nfor i = 1:10000\ns = s + 1;\nend\ns')
    expect(result.toScalar()).toBe(10000)
  })
})

describe('Recursion depth limit', () => {
  it('throws a clean error on unbounded recursion instead of overflowing the stack', () => {
    const interp = makeInterp()
    const code = 'function y = f(n)\ny = f(n + 1);\nend\nf(1)'
    expect(() => interp.execute(code)).toThrow(/recursion depth/i)
  })

  it('allows reasonable bounded recursion', () => {
    const interp = makeInterp()
    const code = 'function y = fib(n)\nif n <= 1\ny = n;\nelse\ny = fib(n-1) + fib(n-2);\nend\nend\nfib(15)'
    expect(interp.execute(code).toScalar()).toBe(610)
  })

  it('resets depth across execute() calls', () => {
    const interp = makeInterp()
    expect(() => interp.execute('function y = f(n)\ny = f(n);\nend\nf(0)')).toThrow(/recursion depth/i)
    const code = 'function y = g(n)\nif n <= 0\ny = 0;\nelse\ny = g(n-1) + 1;\nend\nend\ng(50)'
    expect(interp.execute(code).toScalar()).toBe(50)
  })
})
