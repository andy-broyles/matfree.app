// MatFree Engine - Symbolic Mathematics
// Full CAS: symbolic variables, differentiation, integration, solving, simplification

import { Value, Matrix, RuntimeError } from './value'
import type { Interpreter } from './interpreter'

// ═══════════════════════════════════════════════════════════════
// Symbolic Expression Tree
// ═══════════════════════════════════════════════════════════════

export type SymExpr =
  | { kind: 'num'; value: number }
  | { kind: 'var'; name: string }
  | { kind: 'add'; left: SymExpr; right: SymExpr }
  | { kind: 'mul'; left: SymExpr; right: SymExpr }
  | { kind: 'pow'; base: SymExpr; exp: SymExpr }
  | { kind: 'neg'; arg: SymExpr }
  | { kind: 'div'; num: SymExpr; den: SymExpr }
  | { kind: 'fn'; name: string; arg: SymExpr }

// Constructors
const N = (v: number): SymExpr => ({ kind: 'num', value: v })
const V = (n: string): SymExpr => ({ kind: 'var', name: n })
const ADD = (a: SymExpr, b: SymExpr): SymExpr => ({ kind: 'add', left: a, right: b })
const MUL = (a: SymExpr, b: SymExpr): SymExpr => ({ kind: 'mul', left: a, right: b })
const POW = (b: SymExpr, e: SymExpr): SymExpr => ({ kind: 'pow', base: b, exp: e })
const NEG = (a: SymExpr): SymExpr => ({ kind: 'neg', arg: a })
const DIV = (n: SymExpr, d: SymExpr): SymExpr => ({ kind: 'div', num: n, den: d })
const FN = (name: string, arg: SymExpr): SymExpr => ({ kind: 'fn', name, arg })

function isNum(e: SymExpr, v?: number): boolean { return e.kind === 'num' && (v === undefined || e.value === v) }
function isVar(e: SymExpr, n?: string): boolean { return e.kind === 'var' && (n === undefined || e.name === n) }
function eq(a: SymExpr, b: SymExpr): boolean { return symToString(a) === symToString(b) }

// ═══════════════════════════════════════════════════════════════
// Pretty printer
// ═══════════════════════════════════════════════════════════════

export function symToString(e: SymExpr): string {
  switch (e.kind) {
    case 'num': return Number.isInteger(e.value) ? e.value.toString() : e.value.toPrecision(6).replace(/0+$/, '').replace(/\.$/, '')
    case 'var': return e.name
    case 'neg': return isNum(e.arg) || isVar(e.arg) ? `-${symToString(e.arg)}` : `-(${symToString(e.arg)})`
    case 'add': {
      const r = symToString(e.right)
      if (e.right.kind === 'neg') return `${wrap(e.left, e)} - ${symToString(e.right.arg)}`
      if (e.right.kind === 'num' && e.right.value < 0) return `${wrap(e.left, e)} - ${Math.abs(e.right.value)}`
      return `${wrap(e.left, e)} + ${wrap(e.right, e)}`
    }
    case 'mul': {
      if (isNum(e.left, -1)) return `-${wrap(e.right, e)}`
      if (isNum(e.left) && e.right.kind !== 'num') return `${symToString(e.left)}*${wrap(e.right, e)}`
      return `${wrap(e.left, e)}*${wrap(e.right, e)}`
    }
    case 'div': return `${wrap(e.num, e)}/${wrap(e.den, e)}`
    case 'pow': {
      const base = wrap(e.base, e), exp = symToString(e.exp)
      return `${base}^${e.exp.kind === 'num' || e.exp.kind === 'var' ? exp : `(${exp})`}`
    }
    case 'fn': return `${e.name}(${symToString(e.arg)})`
  }
}

function wrap(inner: SymExpr, outer: SymExpr): string {
  const needsParens = (inner.kind === 'add' && (outer.kind === 'mul' || outer.kind === 'pow' || outer.kind === 'div')) ||
    (inner.kind === 'neg' && outer.kind === 'mul')
  const s = symToString(inner)
  return needsParens ? `(${s})` : s
}

// ═══════════════════════════════════════════════════════════════
// Parser: string -> SymExpr
// ═══════════════════════════════════════════════════════════════

export function parseSym(input: string): SymExpr {
  let pos = 0
  const skip = () => { while (pos < input.length && input[pos] === ' ') pos++ }
  const peek = () => input[pos] || ''
  const advance = () => input[pos++]

  function expr(): SymExpr { return addSub() }

  function addSub(): SymExpr {
    let left = mulDiv()
    skip()
    while (peek() === '+' || peek() === '-') {
      const op = advance(); skip()
      const right = mulDiv()
      left = op === '+' ? ADD(left, right) : ADD(left, NEG(right))
    }
    return left
  }

  function mulDiv(): SymExpr {
    let left = unary()
    skip()
    while (peek() === '*' || peek() === '/') {
      const op = advance(); skip()
      const right = unary()
      left = op === '*' ? MUL(left, right) : DIV(left, right)
    }
    // Implicit multiplication: 2x, x*y (juxtaposition)
    return left
  }

  function unary(): SymExpr {
    skip()
    if (peek() === '-') { advance(); skip(); return NEG(power()) }
    if (peek() === '+') { advance(); skip() }
    return power()
  }

  function power(): SymExpr {
    let base = atom()
    skip()
    if (peek() === '^') { advance(); skip(); return POW(base, unary()) }
    return base
  }

  function atom(): SymExpr {
    skip()
    if (peek() === '(') { advance(); const e = expr(); skip(); if (peek() === ')') advance(); return e }
    if (/\d/.test(peek()) || (peek() === '.' && /\d/.test(input[pos + 1] || ''))) {
      let num = ''
      while (/[\d.]/.test(peek())) num += advance()
      return N(parseFloat(num))
    }
    if (/[a-zA-Z]/.test(peek())) {
      let name = ''
      while (/[a-zA-Z0-9_]/.test(peek())) name += advance()
      skip()
      // Constants
      if (name === 'pi') return N(Math.PI)
      if (name === 'e' && peek() !== '(') return N(Math.E)
      // Function call
      if (peek() === '(') {
        advance(); const arg = expr(); skip(); if (peek() === ')') advance()
        return FN(name, arg)
      }
      return V(name)
    }
    throw new RuntimeError(`Symbolic parser: unexpected '${peek()}'`)
  }

  const result = expr()
  return result
}

// ═══════════════════════════════════════════════════════════════
// Simplification
// ═══════════════════════════════════════════════════════════════

export function simplify(e: SymExpr): SymExpr {
  // Apply rules iteratively until stable
  let prev = '', cur = symToString(e), expr = e
  for (let i = 0; i < 20 && prev !== cur; i++) {
    prev = cur
    expr = simplifyOnce(expr)
    cur = symToString(expr)
  }
  return expr
}

function simplifyOnce(e: SymExpr): SymExpr {
  switch (e.kind) {
    case 'num': case 'var': return e
    case 'neg': {
      const a = simplifyOnce(e.arg)
      if (isNum(a)) return N(-(a as any).value)
      if (a.kind === 'neg') return a.arg
      return NEG(a)
    }
    case 'add': {
      const l = simplifyOnce(e.left), r = simplifyOnce(e.right)
      if (isNum(l, 0)) return r
      if (isNum(r, 0)) return l
      if (isNum(l) && isNum(r)) return N((l as any).value + (r as any).value)
      if (r.kind === 'neg') return simplifyOnce(ADD(l, NEG(r)))
      if (eq(l, r)) return simplifyOnce(MUL(N(2), l))
      // Collect like terms: a*x + b*x = (a+b)*x
      const lCoeff = getCoeff(l), rCoeff = getCoeff(r)
      if (lCoeff && rCoeff && eq(lCoeff.term, rCoeff.term))
        return simplifyOnce(MUL(N(lCoeff.coeff + rCoeff.coeff), lCoeff.term))
      return ADD(l, r)
    }
    case 'mul': {
      const l = simplifyOnce(e.left), r = simplifyOnce(e.right)
      if (isNum(l, 0) || isNum(r, 0)) return N(0)
      if (isNum(l, 1)) return r
      if (isNum(r, 1)) return l
      if (isNum(l, -1)) return simplifyOnce(NEG(r))
      if (isNum(l) && isNum(r)) return N((l as any).value * (r as any).value)
      if (eq(l, r)) return simplifyOnce(POW(l, N(2)))
      // x^a * x^b = x^(a+b)
      if (l.kind === 'pow' && r.kind === 'pow' && eq(l.base, r.base))
        return simplifyOnce(POW(l.base, simplifyOnce(ADD(l.exp, r.exp))))
      // Distribute numbers: 2*(3*x) = 6*x
      if (isNum(l) && r.kind === 'mul' && isNum(r.left))
        return simplifyOnce(MUL(N((l as any).value * (r.left as any).value), r.right))
      return MUL(l, r)
    }
    case 'div': {
      const n = simplifyOnce(e.num), d = simplifyOnce(e.den)
      if (isNum(n, 0)) return N(0)
      if (isNum(d, 1)) return n
      if (eq(n, d)) return N(1)
      if (isNum(n) && isNum(d)) return N((n as any).value / (d as any).value)
      // x^a / x^b = x^(a-b)
      if (n.kind === 'pow' && d.kind === 'pow' && eq(n.base, d.base))
        return simplifyOnce(POW(n.base, simplifyOnce(ADD(n.exp, NEG(d.exp)))))
      return DIV(n, d)
    }
    case 'pow': {
      const b = simplifyOnce(e.base), ex = simplifyOnce(e.exp)
      if (isNum(ex, 0)) return N(1)
      if (isNum(ex, 1)) return b
      if (isNum(b, 0)) return N(0)
      if (isNum(b, 1)) return N(1)
      if (isNum(b) && isNum(ex)) return N(Math.pow((b as any).value, (ex as any).value))
      // (x^a)^b = x^(a*b)
      if (b.kind === 'pow') return simplifyOnce(POW(b.base, simplifyOnce(MUL(b.exp, ex))))
      return POW(b, ex)
    }
    case 'fn': {
      const a = simplifyOnce(e.arg)
      // Known values
      if (isNum(a)) {
        const v = (a as any).value
        switch (e.name) {
          case 'sin': if (v === 0) return N(0); break
          case 'cos': if (v === 0) return N(1); break
          case 'ln': case 'log': if (v === 1) return N(0); if (v === Math.E) return N(1); break
          case 'exp': if (v === 0) return N(1); break
          case 'sqrt': return POW(a, DIV(N(1), N(2)))
        }
      }
      if (e.name === 'sqrt') return simplifyOnce(POW(a, DIV(N(1), N(2))))
      return FN(e.name, a)
    }
  }
}

function getCoeff(e: SymExpr): { coeff: number; term: SymExpr } | null {
  if (e.kind === 'mul' && e.left.kind === 'num') return { coeff: e.left.value, term: e.right }
  if (e.kind === 'neg') { const inner = getCoeff(e.arg); return inner ? { coeff: -inner.coeff, term: inner.term } : { coeff: -1, term: e.arg } }
  if (e.kind === 'var' || e.kind === 'pow' || e.kind === 'fn') return { coeff: 1, term: e }
  return null
}

// ═══════════════════════════════════════════════════════════════
// Differentiation (d/dx)
// ═══════════════════════════════════════════════════════════════

export function differentiate(e: SymExpr, x: string): SymExpr {
  return simplify(diffRaw(e, x))
}

function diffRaw(e: SymExpr, x: string): SymExpr {
  switch (e.kind) {
    case 'num': return N(0)
    case 'var': return e.name === x ? N(1) : N(0)
    case 'neg': return NEG(diffRaw(e.arg, x))
    case 'add': return ADD(diffRaw(e.left, x), diffRaw(e.right, x))
    case 'mul': // Product rule: (fg)' = f'g + fg'
      return ADD(MUL(diffRaw(e.left, x), e.right), MUL(e.left, diffRaw(e.right, x)))
    case 'div': // Quotient rule: (f/g)' = (f'g - fg') / g^2
      return DIV(ADD(MUL(diffRaw(e.num, x), e.den), NEG(MUL(e.num, diffRaw(e.den, x)))), POW(e.den, N(2)))
    case 'pow': {
      const hasX_base = containsVar(e.base, x), hasX_exp = containsVar(e.exp, x)
      if (!hasX_base && !hasX_exp) return N(0)
      if (hasX_base && !hasX_exp) {
        // Power rule: (f^n)' = n*f^(n-1)*f'
        return MUL(MUL(e.exp, POW(e.base, ADD(e.exp, N(-1)))), diffRaw(e.base, x))
      }
      if (!hasX_base && hasX_exp) {
        // Exponential: (a^g)' = a^g * ln(a) * g'
        return MUL(MUL(e, FN('ln', e.base)), diffRaw(e.exp, x))
      }
      // General: f^g = e^(g*ln(f))
      return diffRaw(FN('exp', MUL(e.exp, FN('ln', e.base))), x)
    }
    case 'fn': {
      const du = diffRaw(e.arg, x) // Chain rule
      switch (e.name) {
        case 'sin': return MUL(FN('cos', e.arg), du)
        case 'cos': return MUL(NEG(FN('sin', e.arg)), du)
        case 'tan': return MUL(POW(FN('cos', e.arg), N(-2)), du)
        case 'exp': return MUL(e, du)
        case 'ln': case 'log': return MUL(DIV(N(1), e.arg), du)
        case 'sqrt': return MUL(DIV(N(1), MUL(N(2), FN('sqrt', e.arg))), du)
        case 'asin': return MUL(DIV(N(1), FN('sqrt', ADD(N(1), NEG(POW(e.arg, N(2)))))), du)
        case 'acos': return MUL(NEG(DIV(N(1), FN('sqrt', ADD(N(1), NEG(POW(e.arg, N(2))))))), du)
        case 'atan': return MUL(DIV(N(1), ADD(N(1), POW(e.arg, N(2)))), du)
        case 'sinh': return MUL(FN('cosh', e.arg), du)
        case 'cosh': return MUL(FN('sinh', e.arg), du)
        case 'tanh': return MUL(ADD(N(1), NEG(POW(FN('tanh', e.arg), N(2)))), du)
        case 'abs': return MUL(DIV(e.arg, FN('abs', e.arg)), du)
        default: throw new RuntimeError(`Cannot differentiate '${e.name}'`)
      }
    }
  }
}

function containsVar(e: SymExpr, x: string): boolean {
  switch (e.kind) {
    case 'num': return false
    case 'var': return e.name === x
    case 'neg': return containsVar(e.arg, x)
    case 'add': case 'mul': return containsVar(e.left, x) || containsVar(e.right, x)
    case 'div': return containsVar(e.num, x) || containsVar(e.den, x)
    case 'pow': return containsVar(e.base, x) || containsVar(e.exp, x)
    case 'fn': return containsVar(e.arg, x)
  }
}

// ═══════════════════════════════════════════════════════════════
// Integration (symbolic, for common forms)
// ═══════════════════════════════════════════════════════════════

export function integrate(e: SymExpr, x: string): SymExpr {
  return simplify(integrateRaw(simplify(e), x))
}

function integrateRaw(e: SymExpr, x: string): SymExpr {
  // Constant
  if (!containsVar(e, x)) return MUL(e, V(x))

  switch (e.kind) {
    case 'var':
      if (e.name === x) return DIV(POW(V(x), N(2)), N(2)) // x -> x^2/2
      return MUL(e, V(x)) // constant * x

    case 'neg': return NEG(integrateRaw(e.arg, x))

    case 'add': return ADD(integrateRaw(e.left, x), integrateRaw(e.right, x))

    case 'mul': {
      // c * f(x) -> c * int(f)
      if (!containsVar(e.left, x)) return MUL(e.left, integrateRaw(e.right, x))
      if (!containsVar(e.right, x)) return MUL(e.right, integrateRaw(e.left, x))
      // Try integration by parts for simple cases
      break
    }

    case 'pow': {
      // x^n -> x^(n+1)/(n+1) when n != -1
      if (isVar(e.base, x) && !containsVar(e.exp, x)) {
        if (isNum(e.exp, -1)) return FN('ln', FN('abs', V(x)))
        const n1 = simplify(ADD(e.exp, N(1)))
        return DIV(POW(V(x), n1), n1)
      }
      // a^x -> a^x / ln(a)
      if (!containsVar(e.base, x) && isVar(e.exp, x))
        return DIV(e, FN('ln', e.base))
      break
    }

    case 'div': {
      // 1/x -> ln|x|
      if (isNum(e.num, 1) && isVar(e.den, x)) return FN('ln', FN('abs', V(x)))
      // f(x)/c
      if (!containsVar(e.den, x)) return DIV(integrateRaw(e.num, x), e.den)
      break
    }

    case 'fn': {
      // Simple substitution: if arg is x directly
      if (isVar(e.arg, x)) {
        switch (e.name) {
          case 'sin': return NEG(FN('cos', V(x)))
          case 'cos': return FN('sin', V(x))
          case 'tan': return NEG(FN('ln', FN('abs', FN('cos', V(x)))))
          case 'exp': return FN('exp', V(x))
          case 'ln': case 'log': return ADD(MUL(V(x), FN('ln', V(x))), NEG(V(x)))
          case 'sinh': return FN('cosh', V(x))
          case 'cosh': return FN('sinh', V(x))
          case 'sec': return FN('ln', FN('abs', ADD(FN('sec', V(x)), FN('tan', V(x)))))
          case 'asin': return ADD(MUL(V(x), FN('asin', V(x))), FN('sqrt', ADD(N(1), NEG(POW(V(x), N(2))))))
          case 'acos': return ADD(MUL(V(x), FN('acos', V(x))), NEG(FN('sqrt', ADD(N(1), NEG(POW(V(x), N(2)))))))
          case 'atan': return ADD(MUL(V(x), FN('atan', V(x))), NEG(DIV(FN('ln', ADD(N(1), POW(V(x), N(2)))), N(2))))
        }
      }
      // Linear substitution: f(ax+b) -> F(ax+b)/a
      if (e.arg.kind === 'add' || e.arg.kind === 'mul') {
        const a = getLinearCoeff(e.arg, x)
        if (a) {
          const inner = integrateRaw(FN(e.name, V(x)), x)
          return DIV(substitute(inner, x, e.arg), N(a))
        }
      }
      break
    }
  }

  // Fallback: can't integrate symbolically
  throw new RuntimeError(`Cannot symbolically integrate: ${symToString(e)}`)
}

function getLinearCoeff(e: SymExpr, x: string): number | null {
  if (e.kind === 'mul' && e.left.kind === 'num' && isVar(e.right, x)) return e.left.value
  if (e.kind === 'add') {
    const l = getLinearCoeff(e.left, x)
    if (l && !containsVar(e.right, x)) return l
  }
  return null
}

// ═══════════════════════════════════════════════════════════════
// Substitution
// ═══════════════════════════════════════════════════════════════

export function substitute(e: SymExpr, varName: string, replacement: SymExpr): SymExpr {
  switch (e.kind) {
    case 'num': return e
    case 'var': return e.name === varName ? replacement : e
    case 'neg': return NEG(substitute(e.arg, varName, replacement))
    case 'add': return ADD(substitute(e.left, varName, replacement), substitute(e.right, varName, replacement))
    case 'mul': return MUL(substitute(e.left, varName, replacement), substitute(e.right, varName, replacement))
    case 'div': return DIV(substitute(e.num, varName, replacement), substitute(e.den, varName, replacement))
    case 'pow': return POW(substitute(e.base, varName, replacement), substitute(e.exp, varName, replacement))
    case 'fn': return FN(e.name, substitute(e.arg, varName, replacement))
  }
}

// ═══════════════════════════════════════════════════════════════
// Evaluation
// ═══════════════════════════════════════════════════════════════

export function evaluate(e: SymExpr, vars: Record<string, number> = {}): number {
  switch (e.kind) {
    case 'num': return e.value
    case 'var': if (e.name in vars) return vars[e.name]; throw new RuntimeError(`Undefined symbolic variable '${e.name}'`)
    case 'neg': return -evaluate(e.arg, vars)
    case 'add': return evaluate(e.left, vars) + evaluate(e.right, vars)
    case 'mul': return evaluate(e.left, vars) * evaluate(e.right, vars)
    case 'div': return evaluate(e.num, vars) / evaluate(e.den, vars)
    case 'pow': return Math.pow(evaluate(e.base, vars), evaluate(e.exp, vars))
    case 'fn': {
      const a = evaluate(e.arg, vars)
      const fns: Record<string, (x: number) => number> = { sin: Math.sin, cos: Math.cos, tan: Math.tan, exp: Math.exp, ln: Math.log, log: Math.log, sqrt: Math.sqrt, abs: Math.abs, asin: Math.asin, acos: Math.acos, atan: Math.atan, sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh }
      if (e.name in fns) return fns[e.name](a)
      throw new RuntimeError(`Unknown symbolic function '${e.name}'`)
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// Expand / Factor
// ═══════════════════════════════════════════════════════════════

export function expand(e: SymExpr): SymExpr {
  return simplify(expandOnce(simplify(e)))
}

function expandOnce(e: SymExpr): SymExpr {
  switch (e.kind) {
    case 'mul': {
      const l = expandOnce(e.left), r = expandOnce(e.right)
      // a*(b+c) = a*b + a*c
      if (r.kind === 'add') return ADD(expandOnce(MUL(l, r.left)), expandOnce(MUL(l, r.right)))
      if (l.kind === 'add') return ADD(expandOnce(MUL(l.left, r)), expandOnce(MUL(l.right, r)))
      return MUL(l, r)
    }
    case 'pow': {
      const b = expandOnce(e.base), ex = e.exp
      if (ex.kind === 'num' && Number.isInteger(ex.value) && ex.value > 1 && ex.value <= 8 && b.kind === 'add') {
        let result: SymExpr = b
        for (let i = 1; i < ex.value; i++) result = expandOnce(MUL(result, b))
        return result
      }
      return POW(b, ex)
    }
    case 'neg': return NEG(expandOnce(e.arg))
    case 'add': return ADD(expandOnce(e.left), expandOnce(e.right))
    case 'div': return DIV(expandOnce(e.num), expandOnce(e.den))
    default: return e
  }
}

// ═══════════════════════════════════════════════════════════════
// Taylor Series
// ═══════════════════════════════════════════════════════════════

export function taylor(e: SymExpr, x: string, a: number, n: number): SymExpr {
  let result: SymExpr = N(0)
  let deriv = e
  let factorial = 1
  for (let k = 0; k <= n; k++) {
    if (k > 0) factorial *= k
    const coeff = evaluate(deriv, { [x]: a })
    if (Math.abs(coeff) > 1e-14) {
      const term = MUL(DIV(N(coeff), N(factorial)), POW(ADD(V(x), N(-a)), N(k)))
      result = ADD(result, term)
    }
    if (k < n) deriv = differentiate(deriv, x)
  }
  return simplify(result)
}

// ═══════════════════════════════════════════════════════════════
// Equation Solving (symbolic, for simple forms)
// ═══════════════════════════════════════════════════════════════

export function solveSymbolic(e: SymExpr, x: string): SymExpr[] {
  e = simplify(e)
  // Linear: ax + b = 0 -> x = -b/a
  const lin = extractLinear(e, x)
  if (lin) return [simplify(DIV(NEG(N(lin.b)), N(lin.a)))]

  // Quadratic: ax^2 + bx + c = 0
  const quad = extractQuadratic(e, x)
  if (quad) {
    const { a, b, c } = quad
    const disc = b * b - 4 * a * c
    if (disc >= 0) {
      const sq = Math.sqrt(disc)
      return [simplify(N((-b + sq) / (2 * a))), simplify(N((-b - sq) / (2 * a)))]
    }
    return [] // complex roots
  }

  // Polynomial roots via Newton's method
  const f = (v: number) => evaluate(e, { [x]: v })
  const df = (v: number) => evaluate(differentiate(e, x), { [x]: v })
  const roots: SymExpr[] = []
  for (let guess = -10; guess <= 10; guess += 0.5) {
    try {
      let xn = guess
      for (let i = 0; i < 50; i++) {
        const fx = f(xn), dfx = df(xn)
        if (Math.abs(dfx) < 1e-14) break
        xn -= fx / dfx
        if (Math.abs(f(xn)) < 1e-10) {
          const rounded = Math.round(xn * 1e8) / 1e8
          if (!roots.some(r => r.kind === 'num' && Math.abs(r.value - rounded) < 1e-6))
            roots.push(N(rounded))
          break
        }
      }
    } catch { }
  }
  return roots
}

function extractLinear(e: SymExpr, x: string): { a: number; b: number } | null {
  try {
    const b = evaluate(e, { [x]: 0 })
    const a = evaluate(e, { [x]: 1 }) - b
    const check = evaluate(e, { [x]: 2 }) - (2 * a + b)
    if (Math.abs(check) < 1e-10 && Math.abs(a) > 1e-14) return { a, b }
  } catch { }
  return null
}

function extractQuadratic(e: SymExpr, x: string): { a: number; b: number; c: number } | null {
  try {
    const c = evaluate(e, { [x]: 0 })
    const f1 = evaluate(e, { [x]: 1 })
    const f2 = evaluate(e, { [x]: -1 })
    const a = (f1 + f2) / 2 - c
    const b = (f1 - f2) / 2
    if (Math.abs(a) < 1e-14) return null
    const check = evaluate(e, { [x]: 2 }) - (4 * a + 2 * b + c)
    if (Math.abs(check) < 1e-8) return { a, b, c }
  } catch { }
  return null
}

// ═══════════════════════════════════════════════════════════════
// Built-in function registrations
// ═══════════════════════════════════════════════════════════════

type BFn = (args: Value[], interp: Interpreter) => Value
const builtins: Map<string, BFn> = new Map()
function reg(name: string, fn: BFn) { builtins.set(name, fn) }

// sym('expression') - create symbolic expression
reg('sym', (a) => Value.fromString(`__sym:${a[0].isString() ? a[0].string() : symToString(parseSym(String(a[0].toScalar())))}`))

// symdiff(expr, var) - symbolic differentiation
reg('symdiff', (a, interp) => {
  const exprStr = getSymStr(a[0])
  const v = a.length > 1 ? a[1].string() : 'x'
  const n = a.length > 2 ? a[2].toScalar() : 1
  let expr = parseSym(exprStr)
  for (let i = 0; i < n; i++) expr = differentiate(expr, v)
  const result = symToString(expr)
  interp.print(`  ${result}\n`)
  return Value.fromString(`__sym:${result}`)
})

// symint(expr, var) - symbolic integration
reg('symint', (a, interp) => {
  const exprStr = getSymStr(a[0])
  const v = a.length > 1 ? a[1].string() : 'x'
  const expr = integrate(parseSym(exprStr), v)
  const result = symToString(expr)
  interp.print(`  ${result}\n`)
  return Value.fromString(`__sym:${result}`)
})

// symsolve(expr, var) - solve equation = 0
reg('symsolve', (a, interp) => {
  const exprStr = getSymStr(a[0])
  const v = a.length > 1 ? a[1].string() : 'x'
  const roots = solveSymbolic(parseSym(exprStr), v)
  if (roots.length === 0) { interp.print('  No solutions found\n'); return Value.empty() }
  interp.print(`  Solutions for ${v}:\n`)
  for (const r of roots) interp.print(`    ${v} = ${symToString(r)}\n`)
  interp.print('\n')
  if (roots.length === 1 && roots[0].kind === 'num') return Value.fromScalar(roots[0].value)
  return Value.fromMatrix(new Matrix(1, roots.length, roots.map(r => r.kind === 'num' ? r.value : NaN)))
})

// symsimplify(expr) - simplify expression
reg('symsimplify', (a, interp) => {
  const exprStr = getSymStr(a[0])
  const result = symToString(simplify(parseSym(exprStr)))
  interp.print(`  ${result}\n`)
  return Value.fromString(`__sym:${result}`)
})

// symexpand(expr) - expand expression
reg('symexpand', (a, interp) => {
  const exprStr = getSymStr(a[0])
  const result = symToString(expand(parseSym(exprStr)))
  interp.print(`  ${result}\n`)
  return Value.fromString(`__sym:${result}`)
})

// symsubs(expr, var, value) - substitute
reg('symsubs', (a, interp) => {
  const exprStr = getSymStr(a[0])
  const v = a[1].string()
  const val = a[2].isString() ? parseSym(a[2].string()) : N(a[2].toScalar())
  const result = simplify(substitute(parseSym(exprStr), v, val))
  const str = symToString(result)
  interp.print(`  ${str}\n`)
  if (result.kind === 'num') return Value.fromScalar(result.value)
  return Value.fromString(`__sym:${str}`)
})

// symtaylor(expr, var, center, order) - Taylor series
reg('symtaylor', (a, interp) => {
  const exprStr = getSymStr(a[0])
  const v = a.length > 1 ? a[1].string() : 'x'
  const center = a.length > 2 ? a[2].toScalar() : 0
  const order = a.length > 3 ? a[3].toScalar() : 5
  const result = taylor(parseSym(exprStr), v, center, order)
  const str = symToString(result)
  interp.print(`  ${str}\n`)
  return Value.fromString(`__sym:${str}`)
})

// symeval(expr, vars...) - evaluate symbolic expression
reg('symeval', (a) => {
  const exprStr = getSymStr(a[0])
  const vars: Record<string, number> = {}
  for (let i = 1; i + 1 < a.length; i += 2) vars[a[i].string()] = a[i + 1].toScalar()
  return Value.fromScalar(evaluate(parseSym(exprStr), vars))
})

// symplot(expr, var, [lo, hi]) - plot symbolic expression
reg('symplot', (a, interp) => {
  const exprStr = getSymStr(a[0])
  const v = a.length > 1 ? a[1].string() : 'x'
  const lo = a.length > 2 ? a[2].toMatrix().data[0] : -5
  const hi = a.length > 2 ? a[2].toMatrix().data[1] : 5
  const n = 200
  const expr = parseSym(exprStr)
  const xs: number[] = [], ys: number[] = []
  for (let i = 0; i < n; i++) {
    const x = lo + i * (hi - lo) / (n - 1)
    xs.push(x)
    try { ys.push(evaluate(expr, { [v]: x })) } catch { ys.push(NaN) }
  }
  // Use the plot system
  const fig = interp.getCurrentFigure()
  if (!fig.hold) fig.series = []
  fig.series.push({ type: 'line', x: xs, y: ys, label: exprStr })
  fig.title = fig.title ?? exprStr
  interp.emitPlot()
  return Value.empty()
})

function getSymStr(v: Value): string {
  if (v.isString()) {
    const s = v.string()
    return s.startsWith('__sym:') ? s.slice(6) : s
  }
  return String(v.toScalar())
}

export function getSymbolicBuiltin(name: string): BFn | undefined { return builtins.get(name) }
export function hasSymbolicBuiltin(name: string): boolean { return builtins.has(name) }
export function allSymbolicNames(): string[] { return [...builtins.keys()] }
