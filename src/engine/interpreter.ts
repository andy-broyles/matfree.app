// MatFree Engine - Tree-walking Interpreter

import { Lexer } from './lexer'
import { Parser } from './parser'
import { Expr, Stmt, Program } from './ast'
import { TokenType } from './token'
import { Value, Matrix, RuntimeError, FuncHandle, CellArray, assertAllocSize } from './value'
import type { Debugger } from './debugger'
import { Environment } from './environment'
import { getBuiltin, hasBuiltin } from './builtins'
import type { PlotFigure, PlotCallback } from './plot'
import { createFigure, PALETTE } from './plot'

class BreakSignal { _brand = 'break' as const }
class ContinueSignal { _brand = 'continue' as const }
class ReturnSignal { value?: Value; constructor(v?: Value) { this.value = v } }

export type OutputCallback = (text: string) => void

export class Interpreter {
  private globalEnv = Environment.createGlobal()
  private env: Environment
  private userFunctions: Map<string, Extract<Stmt, { kind: 'functionDef' }>> = new Map()
  private output: OutputCallback = () => {}
  // Plotting state
  private plotCallback: PlotCallback = () => {}
  private figures: Map<number, PlotFigure> = new Map()
  private currentFigureId = 1
  // Execution guards: wall-clock budget per execute() call and recursion depth cap.
  // The engine runs on the UI thread, so a runaway `while true` would otherwise
  // freeze the tab — and playground code can arrive from shared ?code= URLs.
  private maxExecutionMs = 10_000
  private deadline = 0
  private callDepth = 0
  private static readonly MAX_CALL_DEPTH = 200
  // Multi-output support: [a, b] = f(...) sets nargoutHint before evaluating the
  // RHS call; the call consumes it and exposes it to builtins via getNargout().
  private nargoutHint = 1
  private activeNargout = 1
  // Optional debugger attachment (non-breaking; null when not debugging)
  private debugger: Debugger | null = null
  private debugStep = 0

  constructor() {
    this.env = this.globalEnv
    // Constants
    this.globalEnv.set('pi', Value.fromScalar(Math.PI))
    this.globalEnv.set('inf', Value.fromScalar(Infinity))
    this.globalEnv.set('Inf', Value.fromScalar(Infinity))
    this.globalEnv.set('nan', Value.fromScalar(NaN))
    this.globalEnv.set('NaN', Value.fromScalar(NaN))
    this.globalEnv.set('true', Value.fromLogical(true))
    this.globalEnv.set('false', Value.fromLogical(false))
    this.globalEnv.set('eps', Value.fromScalar(2.220446049250313e-16))
    // Complex units: 0 + 1i
    const oneImag = new Matrix(1, 1, [0], [1])
    this.globalEnv.set('i', Value.fromMatrix(oneImag))
    this.globalEnv.set('j', Value.fromMatrix(new Matrix(1, 1, [0], [1])))
  }

  setOutput(cb: OutputCallback) { this.output = cb }
  /** Set the wall-clock budget for a single execute() call. 0 disables the limit. */
  setExecutionLimitMs(ms: number) { this.maxExecutionMs = ms }
  /** Number of outputs requested from the builtin currently executing (1 unless destructured). */
  getNargout(): number { return this.activeNargout }
  setPlotCallback(cb: PlotCallback) { this.plotCallback = cb }
  /** Attach (or clear) a Debugger for step/breakpoint support. Non-breaking when null. */
  setDebugger(d: Debugger | null) { this.debugger = d }
  print(text: string) { this.output(text) }
  currentEnv(): Environment { return this.env }
  getGlobalEnv(): Environment { return this.globalEnv }
  injectVariable(name: string, value: Value): void { this.globalEnv.set(name, value) }

  // Plotting API
  getCurrentFigure(): PlotFigure {
    if (!this.figures.has(this.currentFigureId)) {
      this.figures.set(this.currentFigureId, createFigure(this.currentFigureId))
    }
    return this.figures.get(this.currentFigureId)!
  }

  setCurrentFigure(id: number): void {
    this.currentFigureId = id
    if (!this.figures.has(id)) this.figures.set(id, createFigure(id))
  }

  emitPlot(): void {
    const fig = this.getCurrentFigure()
    this.plotCallback({ ...fig, series: [...fig.series] })
  }

  private checkDeadline(): void {
    if (this.deadline > 0 && Date.now() > this.deadline) {
      throw new RuntimeError(
        `Execution time limit exceeded (${this.maxExecutionMs / 1000}s). ` +
        'Check for infinite loops, or reduce the problem size.'
      )
    }
  }

  execute(code: string): Value {
    this.deadline = this.maxExecutionMs > 0 ? Date.now() + this.maxExecutionMs : 0
    this.callDepth = 0
    this.debugStep = 0
    const lexer = new Lexer(code)
    const tokens = lexer.tokenize()
    const parser = new Parser(tokens)
    const program = parser.parse()
    // Register top-level functions
    for (const fn of program.functions) this.userFunctions.set(fn.name, fn)
    let result = Value.empty()
    for (const stmt of program.statements) {
      if (stmt.kind === 'functionDef') continue // already registered
      if (this.debugger && this.debugger.shouldPause(this.debugStep + 1)) {
        try { this.debugger.createSnapshot(this.env) } catch {}
      }
      this.debugStep++
      result = this.execStmt(stmt)
    }
    if (this.debugger) {
      try { this.debugger.createSnapshot(this.env) } catch {}
    }
    return result
  }

  callBuiltin(name: string, args: Value[], nargout = 1): Value {
    const fn = getBuiltin(name)
    if (!fn) throw new RuntimeError(`Unknown function '${name}'`)
    const saved = this.activeNargout
    this.activeNargout = nargout
    try { return fn(args, this) }
    finally { this.activeNargout = saved }
  }

  callFuncHandle(fh: FuncHandle, args: Value[], nargout = 1): Value {
    if (fh.type === 'builtin') {
      // @name handles to user functions are also stored with type 'builtin';
      // user functions shadow builtins, matching call-by-name resolution.
      const userFn = this.userFunctions.get(fh.name)
      if (userFn) return this.callUserFunc(userFn, args, nargout)
      return this.callBuiltin(fh.name, args, nargout)
    }
    this.checkDeadline()
    // Anonymous function
    const child = (fh.closure as Environment).createChild()
    for (let i = 0; i < fh.params.length; i++) child.set(fh.params[i], args[i] ?? Value.empty())
    const saved = this.env; this.env = child
    try { return this.evalExpr(fh.body as Expr) }
    finally { this.env = saved }
  }

  private execStmt(stmt: Stmt): Value {
    switch (stmt.kind) {
      case 'expr': return this.execExprStmt(stmt)
      case 'assign': return this.execAssign(stmt)
      case 'multiAssign': return this.execMultiAssign(stmt)
      case 'if': return this.execIf(stmt)
      case 'for': return this.execFor(stmt)
      case 'while': return this.execWhile(stmt)
      case 'switch': return this.execSwitch(stmt)
      case 'tryCatch': return this.execTryCatch(stmt)
      case 'return': throw new ReturnSignal()
      case 'break': throw new BreakSignal()
      case 'continue': throw new ContinueSignal()
      case 'global': stmt.variables.forEach(v => this.env.declareGlobal(v)); return Value.empty()
      case 'functionDef': this.userFunctions.set(stmt.name, stmt); return Value.empty()
    }
  }

  private execExprStmt(stmt: Extract<Stmt, { kind: 'expr' }>): Value {
    const val = this.evalExpr(stmt.expression)
    if (stmt.printResult && !val.isEmpty()) {
      this.print(val.display('ans'))
      this.env.set('ans', val)
    }
    return val
  }

  private execAssign(stmt: Extract<Stmt, { kind: 'assign' }>): Value {
    const val = this.evalExpr(stmt.value)
    this.assignTarget(stmt.target, val)
    if (stmt.printResult && !val.isEmpty()) {
      const name = stmt.target.kind === 'identifier' ? stmt.target.name : 'ans'
      this.print(val.display(name))
    }
    return val
  }

  private assignTarget(target: Expr, val: Value): void {
    if (target.kind === 'identifier') { this.env.set(target.name, val); return }
    if (target.kind === 'dot') {
      const objName = target.object.kind === 'identifier' ? target.object.name : null
      if (!objName) throw new RuntimeError('Invalid assignment target')
      let obj = this.env.get(objName)
      if (!obj || !obj.isStruct()) obj = Value.fromStruct({})
      const s = { ...obj.struct() }
      s[target.field] = val
      this.env.set(objName, Value.fromStruct(s))
      return
    }
    if (target.kind === 'call') {
      // Indexed assignment: A(i) = val or A(i,j) = val
      const objName = target.callee.kind === 'identifier' ? target.callee.name : null
      if (!objName) throw new RuntimeError('Invalid indexed assignment')
      let m = this.env.get(objName)
      if (!m) { m = Value.fromMatrix(new Matrix(0, 0)); this.env.set(objName, m) }
      if (!m.isMatrix()) throw new RuntimeError('Indexed assignment only works on matrices')
      const mat = m.matrix().clone()
      if (target.args.length === 1) {
        const idx = this.evalExpr(target.args[0]).toScalar() - 1
        if (idx >= 0 && idx < mat.numel()) mat.data[idx] = val.toScalar()
        this.env.set(objName, Value.fromMatrix(mat))
      } else if (target.args.length === 2) {
        const ri = this.evalExpr(target.args[0]).toScalar() - 1
        const ci = this.evalExpr(target.args[1]).toScalar() - 1
        // Grow matrix if needed
        const nr = Math.max(mat.rows, ri + 1), nc = Math.max(mat.cols, ci + 1)
        const grown = new Matrix(nr, nc)
        for (let r = 0; r < mat.rows; r++) for (let c = 0; c < mat.cols; c++) grown.set(r, c, mat.get(r, c))
        grown.set(ri, ci, val.toScalar())
        this.env.set(objName, Value.fromMatrix(grown))
      }
      return
    }
    if (target.kind === 'cellIndex') {
      const objName = target.object.kind === 'identifier' ? target.object.name : null
      if (!objName) throw new RuntimeError('Invalid cell assignment')
      let obj = this.env.get(objName)
      if (!obj || !obj.isCell()) throw new RuntimeError('Cell indexing on non-cell')
      const c = { ...obj.cell(), data: [...obj.cell().data] }
      const idx = this.evalExpr(target.indices[0]).toScalar() - 1
      c.data[idx] = val
      this.env.set(objName, Value.fromCell(c))
      return
    }
    throw new RuntimeError('Invalid assignment target')
  }

  private execMultiAssign(stmt: Extract<Stmt, { kind: 'multiAssign' }>): Value {
    const n = stmt.targets.length
    // Request n outputs only when the RHS is a direct call — `[a,b] = 2 + f(x)`
    // should not propagate the hint into the subexpression.
    if (stmt.value.kind === 'call') this.nargoutHint = n
    let val: Value
    try { val = this.evalExpr(stmt.value) }
    finally { this.nargoutHint = 1 }
    if (n === 1) {
      if (stmt.targets[0] !== '~') this.env.set(stmt.targets[0], val)
      return val
    }
    // Multi-output functions return a cell of outputs; distribute across targets.
    if (val.isCell()) {
      const c = val.cell()
      if (c.data.length < n) {
        throw new RuntimeError(`Too many output arguments: requested ${n}, function returned ${c.data.length}`)
      }
      for (let i = 0; i < n; i++) {
        if (stmt.targets[i] !== '~') this.env.set(stmt.targets[i], c.data[i])
      }
      return c.data[0]
    }
    throw new RuntimeError(`Too many output arguments: requested ${n}, function returned 1`)
  }

  private execIf(stmt: Extract<Stmt, { kind: 'if' }>): Value {
    for (const branch of stmt.branches) {
      if (!branch.condition || this.evalExpr(branch.condition).toBool()) {
        return this.execBlock(branch.body)
      }
    }
    return Value.empty()
  }

  private execFor(stmt: Extract<Stmt, { kind: 'for' }>): Value {
    const range = this.evalExpr(stmt.range)
    const m = range.toMatrix()
    // Iterate over columns
    for (let c = 0; c < m.cols; c++) {
      if (m.rows === 1) this.env.set(stmt.variable, Value.fromScalar(m.get(0, c)))
      else {
        const col = new Matrix(m.rows, 1)
        for (let r = 0; r < m.rows; r++) col.set(r, 0, m.get(r, c))
        this.env.set(stmt.variable, Value.fromMatrix(col))
      }
      try { this.checkDeadline(); this.execBlock(stmt.body) }
      catch (e) {
        if (e instanceof BreakSignal) break
        if (e instanceof ContinueSignal) continue
        throw e
      }
    }
    return Value.empty()
  }

  private execWhile(stmt: Extract<Stmt, { kind: 'while' }>): Value {
    while (this.evalExpr(stmt.condition).toBool()) {
      try { this.checkDeadline(); this.execBlock(stmt.body) }
      catch (e) {
        if (e instanceof BreakSignal) break
        if (e instanceof ContinueSignal) continue
        throw e
      }
    }
    return Value.empty()
  }

  private execSwitch(stmt: Extract<Stmt, { kind: 'switch' }>): Value {
    const expr = this.evalExpr(stmt.expression)
    for (const c of stmt.cases) {
      if (!c.value) { return this.execBlock(c.body) }
      const cv = this.evalExpr(c.value)
      if (expr.isString() && cv.isString() ? expr.string() === cv.string() : expr.toScalar() === cv.toScalar()) {
        return this.execBlock(c.body)
      }
    }
    return Value.empty()
  }

  private execTryCatch(stmt: Extract<Stmt, { kind: 'tryCatch' }>): Value {
    try { return this.execBlock(stmt.tryBody) }
    catch (e: any) {
      if (e instanceof BreakSignal || e instanceof ContinueSignal || e instanceof ReturnSignal) throw e
      if (stmt.catchVar) {
        const msg = e instanceof Error ? e.message : String(e)
        this.env.set(stmt.catchVar, Value.fromStruct({ message: Value.fromString(msg), identifier: Value.fromString('MatFree:error') }))
      }
      return this.execBlock(stmt.catchBody)
    }
  }

  private execBlock(stmts: Stmt[]): Value {
    let result = Value.empty()
    for (const stmt of stmts) result = this.execStmt(stmt)
    return result
  }

  evalExpr(expr: Expr): Value {
    switch (expr.kind) {
      case 'number':
        if (expr.isComplex) {
          const im = (expr as any).imagValue ?? 0
          return Value.fromMatrix(new Matrix(1, 1, [0], [im]))
        }
        return Value.fromScalar(expr.value)
      case 'string': return Value.fromString(expr.value)
      case 'bool': return Value.fromLogical(expr.value)
      case 'identifier': return this.evalIdentifier(expr.name)
      case 'unary': return this.evalUnary(expr)
      case 'binary': return this.evalBinary(expr)
      case 'matrix': return this.evalMatrixLiteral(expr)
      case 'cellArray': return this.evalCellLiteral(expr)
      case 'call': return this.evalCall(expr)
      case 'cellIndex': return this.evalCellIndex(expr)
      case 'dot': return this.evalDot(expr)
      case 'colon': return this.evalColon(expr)
      case 'end': return Value.fromScalar(NaN) // resolved in context
      case 'anonFunc': return Value.fromFuncHandle({ type: 'anonymous', params: expr.params, body: expr.body, closure: this.env })
      case 'funcHandle': return this.evalFuncHandle(expr.name)
    }
  }

  private evalIdentifier(name: string): Value {
    const v = this.env.get(name)
    if (v !== undefined) return v
    if (hasBuiltin(name)) return this.callBuiltin(name, [])
    throw new RuntimeError(`Undefined variable or function '${name}'`)
  }

  private evalFuncHandle(name: string): Value {
    if (hasBuiltin(name)) return Value.fromFuncHandle({ type: 'builtin', name })
    const fn = this.userFunctions.get(name)
    if (fn) return Value.fromFuncHandle({ type: 'builtin', name })
    throw new RuntimeError(`Undefined function '${name}'`)
  }

  private evalUnary(expr: Extract<Expr, { kind: 'unary' }>): Value {
    const val = this.evalExpr(expr.operand)
    switch (expr.op) {
      case TokenType.MINUS: return val.isMatrix() ? Value.fromMatrix(val.matrix().neg()) : Value.fromScalar(-val.toScalar())
      case TokenType.PLUS: return val
      case TokenType.NOT: return val.isMatrix() ? Value.fromMatrix(new Matrix(val.matrix().rows, val.matrix().cols, val.matrix().data.map(v => v === 0 ? 1 : 0))) : Value.fromLogical(!val.toBool())
      case TokenType.TRANSPOSE: case TokenType.DOT_TRANSPOSE: return Value.fromMatrix(val.toMatrix().transpose())
      default: throw new RuntimeError(`Unknown unary op`)
    }
  }

  private evalBinary(expr: Extract<Expr, { kind: 'binary' }>): Value {
    // Short circuit
    if (expr.op === TokenType.SHORT_AND) { return Value.fromLogical(this.evalExpr(expr.left).toBool() && this.evalExpr(expr.right).toBool()) }
    if (expr.op === TokenType.SHORT_OR) { return Value.fromLogical(this.evalExpr(expr.left).toBool() || this.evalExpr(expr.right).toBool()) }

    const left = this.evalExpr(expr.left), right = this.evalExpr(expr.right)

    // String concat
    if (expr.op === TokenType.PLUS && (left.isString() || right.isString())) {
      const ls = left.isString() ? left.string() : String(left.toScalar())
      const rs = right.isString() ? right.string() : String(right.toScalar())
      return Value.fromString(ls + rs)
    }

    const lm = left.toMatrix(), rm = right.toMatrix()
    switch (expr.op) {
      case TokenType.PLUS: return Value.fromMatrix(lm.add(rm))
      case TokenType.MINUS: return Value.fromMatrix(lm.sub(rm))
      case TokenType.STAR:
        // Complex-aware scalar multiply: if either side is 1x1 (scalar) and any imag present, use elementwise complex mul
        if (lm.isScalar() || rm.isScalar()) {
          const hasCplx = !!(lm.imag || rm.imag)
          if (hasCplx) return Value.fromMatrix(lm.elementMul(rm))
          if (lm.isScalar()) return Value.fromMatrix(rm.scalarOp(lm.scalarValue(), '*'))
          if (rm.isScalar()) return Value.fromMatrix(lm.scalarOp(rm.scalarValue(), '*'))
        }
        return Value.fromMatrix(lm.mul(rm))
      case TokenType.SLASH:
        if (rm.isScalar()) {
          if (lm.imag || rm.imag) return Value.fromMatrix(lm.elementDiv(rm))
          return Value.fromMatrix(lm.scalarOp(rm.scalarValue(), '/'))
        }
        throw new RuntimeError('Matrix right division not yet implemented')
      case TokenType.CARET:
        if (rm.isScalar()) {
          const n = rm.scalarValue()
          if (n === -1) return Value.fromMatrix(lm.inv())
          if (lm.isScalar()) {
            const re = lm.scalarValue(), im = lm.imag ? lm.imag[0] : 0
            if (!im) return Value.fromScalar(Math.pow(re, n))
            // complex ^ real via polar
            const mag = Math.hypot(re, im)
            const ang = Math.atan2(im, re)
            const magp = Math.pow(mag, n)
            const angp = ang * n
            const r2 = magp * Math.cos(angp)
            const i2 = magp * Math.sin(angp)
            return Value.fromMatrix(new Matrix(1, 1, [r2], [i2]))
          }
          throw new RuntimeError('Matrix power only supports ^-1 and scalar base')
        }
        throw new RuntimeError('Matrix power requires scalar exponent')
      case TokenType.DOT_STAR: return Value.fromMatrix(lm.elementMul(rm))
      case TokenType.DOT_SLASH: return Value.fromMatrix(lm.elementDiv(rm))
      case TokenType.DOT_CARET: return Value.fromMatrix(lm.elementPow(rm))
      case TokenType.EQ: return cmpOp(lm, rm, (a, b) => a === b ? 1 : 0)
      case TokenType.NE: return cmpOp(lm, rm, (a, b) => a !== b ? 1 : 0)
      case TokenType.LT: return cmpOp(lm, rm, (a, b) => a < b ? 1 : 0)
      case TokenType.GT: return cmpOp(lm, rm, (a, b) => a > b ? 1 : 0)
      case TokenType.LE: return cmpOp(lm, rm, (a, b) => a <= b ? 1 : 0)
      case TokenType.GE: return cmpOp(lm, rm, (a, b) => a >= b ? 1 : 0)
      case TokenType.AND: return cmpOp(lm, rm, (a, b) => (a !== 0 && b !== 0) ? 1 : 0)
      case TokenType.OR: return cmpOp(lm, rm, (a, b) => (a !== 0 || b !== 0) ? 1 : 0)
      default: throw new RuntimeError(`Unknown binary op`)
    }
  }

  private evalMatrixLiteral(expr: Extract<Expr, { kind: 'matrix' }>): Value {
    if (expr.rows.length === 0) return Value.fromMatrix(new Matrix(0, 0))
    const rows: Matrix[] = []
    for (const row of expr.rows) {
      let combined: Matrix | null = null
      for (const e of row) {
        const v = this.evalExpr(e); const m = v.toMatrix()
        combined = combined ? combined.horzcat(m) : m
      }
      if (combined) rows.push(combined)
    }
    if (rows.length === 0) return Value.fromMatrix(new Matrix(0, 0))
    let result = rows[0]
    for (let i = 1; i < rows.length; i++) result = result.vertcat(rows[i])
    return Value.fromMatrix(result)
  }

  private evalCellLiteral(expr: Extract<Expr, { kind: 'cellArray' }>): Value {
    const data: Value[] = []
    let cols = 0, rowCount = 0
    for (const row of expr.rows) { cols = Math.max(cols, row.length); rowCount++ }
    for (const row of expr.rows) for (const e of row) data.push(this.evalExpr(e))
    return Value.fromCell({ rows: rowCount, cols, data })
  }

  private evalCall(expr: Extract<Expr, { kind: 'call' }>): Value {
    // Consume the multi-output hint; nested calls (in args) must not inherit it.
    const nargout = this.nargoutHint
    this.nargoutHint = 1
    // Check if callee is an identifier
    if (expr.callee.kind === 'identifier') {
      const name = expr.callee.name
      // Check if it's a variable (could be func handle or matrix)
      const variable = this.env.get(name)
      if (variable) {
        if (variable.isFuncHandle()) return this.callFuncHandle(variable.funcHandle(), expr.args.map(a => this.evalExpr(a)), nargout)
        if (variable.isMatrix()) return this.indexMatrix(variable.matrix(), expr.args)
        if (variable.isCell()) return this.indexCell(variable.cell(), expr.args)
        if (variable.isStruct()) return variable // struct() call
      }
      // Check user functions
      const fn = this.userFunctions.get(name)
      if (fn) return this.callUserFunc(fn, expr.args.map(a => this.evalExpr(a)), nargout)
      // Check builtins
      if (hasBuiltin(name)) return this.callBuiltin(name, expr.args.map(a => this.evalExpr(a)), nargout)
      throw new RuntimeError(`Undefined function '${name}'`)
    }
    // Dynamic call (e.g., result of expression)
    const callee = this.evalExpr(expr.callee)
    if (callee.isFuncHandle()) return this.callFuncHandle(callee.funcHandle(), expr.args.map(a => this.evalExpr(a)), nargout)
    throw new RuntimeError('Cannot call non-function value')
  }

  private indexMatrix(m: Matrix, args: Expr[]): Value {
    if (args.length === 1) {
      const arg = args[0]
      if (arg.kind === 'colon' && !arg.start && !arg.stop) {
        // A(:) - flatten
        return Value.fromMatrix(new Matrix(m.numel(), 1, [...m.data]))
      }
      // resolveEnd (not evalExpr) so `v(end)` / `v(end-1)` work with one index
      const idx = this.resolveEnd(arg, m.numel())
      if (idx.isMatrix()) {
        const idxM = idx.matrix()
        if (idxM.isScalar()) {
          const i = idxM.scalarValue() - 1
          return Value.fromScalar(m.data[i])
        }
        const result = new Array(idxM.numel())
        for (let i = 0; i < idxM.numel(); i++) result[i] = m.data[idxM.data[i] - 1]
        return Value.fromMatrix(new Matrix(idxM.rows, idxM.cols, result))
      }
      return Value.fromScalar(m.data[idx.toScalar() - 1])
    }
    if (args.length === 2) {
      const rowIdx = this.resolveIndex(args[0], m.rows)
      const colIdx = this.resolveIndex(args[1], m.cols)
      if (rowIdx.length === 1 && colIdx.length === 1) return Value.fromScalar(m.get(rowIdx[0], colIdx[0]))
      const result = new Matrix(rowIdx.length, colIdx.length)
      for (let ri = 0; ri < rowIdx.length; ri++)
        for (let ci = 0; ci < colIdx.length; ci++)
          result.set(ri, ci, m.get(rowIdx[ri], colIdx[ci]))
      return Value.fromMatrix(result)
    }
    throw new RuntimeError('Too many indices')
  }

  private resolveIndex(arg: Expr, size: number): number[] {
    if (arg.kind === 'colon' && !arg.start && !arg.stop) return Array.from({ length: size }, (_, i) => i)
    const v = this.resolveEnd(arg, size)
    const m = v.toMatrix()
    return m.data.map(i => i - 1) // convert to 0-indexed
  }

  private resolveEnd(expr: Expr, size: number): Value {
    if (expr.kind === 'end') return Value.fromScalar(size)
    if (expr.kind === 'binary') {
      const origExpr = expr
      // Need to resolve 'end' within binary expressions
      const left = this.resolveEnd(origExpr.left, size)
      const right = this.resolveEnd(origExpr.right, size)
      // Apply the binary op
      const lm = left.toMatrix(), rm = right.toMatrix()
      switch (origExpr.op) {
        case TokenType.PLUS: return Value.fromMatrix(lm.add(rm))
        case TokenType.MINUS: return Value.fromMatrix(lm.sub(rm))
        case TokenType.STAR:
          if (lm.isScalar()) return Value.fromMatrix(rm.scalarOp(lm.scalarValue(), '*'))
          if (rm.isScalar()) return Value.fromMatrix(lm.scalarOp(rm.scalarValue(), '*'))
          return Value.fromMatrix(lm.mul(rm))
        case TokenType.SLASH: return Value.fromMatrix(lm.scalarOp(rm.scalarValue(), '/'))
        default: break
      }
    }
    if (expr.kind === 'colon') {
      const start = expr.start ? this.resolveEnd(expr.start, size).toScalar() : 1
      const stop = expr.stop ? this.resolveEnd(expr.stop, size).toScalar() : size
      const step = expr.step ? this.resolveEnd(expr.step, size).toScalar() : 1
      const count = step !== 0 ? Math.floor((stop - start) / step) + 1 : 0
      if (count > 0) assertAllocSize(count, 'Range') // empty/NaN ranges fall through harmlessly
      const vals: number[] = []
      if (step > 0) for (let v = start; v <= stop + 1e-10; v += step) vals.push(v)
      else if (step < 0) for (let v = start; v >= stop - 1e-10; v += step) vals.push(v)
      return Value.fromMatrix(new Matrix(1, vals.length, vals))
    }
    return this.evalExpr(expr)
  }

  private indexCell(c: CellArray, args: Expr[]): Value {
    if (args.length === 1) {
      const idx = this.evalExpr(args[0]).toScalar() - 1
      return c.data[idx] ?? Value.empty()
    }
    throw new RuntimeError('Cell indexing with multiple indices not yet supported')
  }

  private evalCellIndex(expr: Extract<Expr, { kind: 'cellIndex' }>): Value {
    const obj = this.evalExpr(expr.object)
    if (!obj.isCell()) throw new RuntimeError('Cell indexing on non-cell')
    const idx = this.evalExpr(expr.indices[0]).toScalar() - 1
    return obj.cell().data[idx] ?? Value.empty()
  }

  private evalDot(expr: Extract<Expr, { kind: 'dot' }>): Value {
    const obj = this.evalExpr(expr.object)
    if (obj.isStruct()) { return obj.struct()[expr.field] ?? Value.empty() }
    throw new RuntimeError(`Cannot access field '${expr.field}' on non-struct`)
  }

  private evalColon(expr: Extract<Expr, { kind: 'colon' }>): Value {
    if (!expr.start && !expr.stop) return Value.empty() // bare :
    const start = expr.start ? this.evalExpr(expr.start).toScalar() : 0
    const stop = expr.stop ? this.evalExpr(expr.stop).toScalar() : 0
    const step = expr.step ? this.evalExpr(expr.step).toScalar() : 1
    if (step === 0) throw new RuntimeError('Range step cannot be zero')
    const count = Math.floor((stop - start) / step) + 1
    if (count > 0) assertAllocSize(count, 'Range') // empty/NaN ranges fall through harmlessly
    const vals: number[] = []
    if (step > 0) { for (let v = start; v <= stop + 1e-10; v += step) vals.push(v) }
    else if (step < 0) { for (let v = start; v >= stop - 1e-10; v += step) vals.push(v) }
    return Value.fromMatrix(new Matrix(1, vals.length, vals))
  }

  private callUserFunc(fn: Extract<Stmt, { kind: 'functionDef' }>, args: Value[], nargout = 1): Value {
    if (++this.callDepth > Interpreter.MAX_CALL_DEPTH) {
      this.callDepth--
      throw new RuntimeError(`Maximum recursion depth exceeded (${Interpreter.MAX_CALL_DEPTH}) in function '${fn.name}'`)
    }
    this.checkDeadline()
    const child = this.globalEnv.createChild()
    for (let i = 0; i < fn.params.length; i++) child.set(fn.params[i], args[i] ?? Value.empty())
    child.set('nargin', Value.fromScalar(args.length))
    child.set('nargout', Value.fromScalar(Math.max(1, Math.min(nargout, fn.returns.length))))
    const saved = this.env; this.env = child
    try { this.execBlock(fn.body) }
    catch (e) { if (!(e instanceof ReturnSignal)) throw e }
    finally { this.env = saved; this.callDepth-- }
    if (nargout > 1 && fn.returns.length > 1) {
      const k = Math.min(nargout, fn.returns.length)
      const outs = fn.returns.slice(0, k).map(r => child.get(r) ?? Value.empty())
      return Value.fromCell({ rows: 1, cols: k, data: outs })
    }
    if (fn.returns.length > 0) return child.get(fn.returns[0]) ?? Value.empty()
    return Value.empty()
  }
}

function cmpOp(a: Matrix, b: Matrix, fn: (x: number, y: number) => number): Value {
  const rr = Math.max(a.rows, b.rows), cc = Math.max(a.cols, b.cols)
  const m = new Matrix(rr, cc)
  for (let r = 0; r < rr; r++)
    for (let c = 0; c < cc; c++)
      m.set(r, c, fn(a.getWithBroadcast(r, c), b.getWithBroadcast(r, c)))
  return Value.fromMatrix(m)
}
