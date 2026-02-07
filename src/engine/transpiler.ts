// MatFree Engine - Code Transpiler
// Converts MatFree AST to Python (NumPy/SciPy) and Julia

import type { Expr, Stmt, Program } from './ast'
import { TokenType } from './token'
import { Lexer } from './lexer'
import { Parser } from './parser'

// ═══════════════════════════════════════════════════════════════
// Python (NumPy/SciPy) Transpiler
// ═══════════════════════════════════════════════════════════════

export function toPython(code: string): string {
  const tokens = new Lexer(code).tokenize()
  const program = new Parser(tokens).parse()
  const lines: string[] = [
    'import numpy as np',
    'from numpy.linalg import det, inv, eig, svd, norm, solve',
    'import matplotlib.pyplot as plt',
    '',
  ]
  for (const fn of program.functions) lines.push(funcToPy(fn))
  for (const stmt of program.statements) lines.push(stmtPy(stmt, 0))
  return lines.join('\n')
}

function ind(n: number): string { return '    '.repeat(n) }

function stmtPy(s: Stmt, lvl: number): string {
  const I = ind(lvl)
  switch (s.kind) {
    case 'expr': return `${I}${exPy(s.expression)}`
    case 'assign': return `${I}${exPy(s.target)} = ${exPy(s.value)}`
    case 'multiAssign': return `${I}${s.targets.join(', ')} = ${exPy(s.value)}`
    case 'if': {
      let out = ''
      for (let i = 0; i < s.branches.length; i++) {
        const b = s.branches[i]
        if (i === 0) out += `${I}if ${b.condition ? exPy(b.condition) : 'True'}:\n`
        else if (b.condition) out += `${I}elif ${exPy(b.condition)}:\n`
        else out += `${I}else:\n`
        for (const st of b.body) out += stmtPy(st, lvl + 1) + '\n'
      }
      return out.trimEnd()
    }
    case 'for': return `${I}for ${s.variable} in ${rangePy(s.range)}:\n` + s.body.map(b => stmtPy(b, lvl + 1)).join('\n')
    case 'while': return `${I}while ${exPy(s.condition)}:\n` + s.body.map(b => stmtPy(b, lvl + 1)).join('\n')
    case 'return': return `${I}return`
    case 'break': return `${I}break`
    case 'continue': return `${I}continue`
    case 'functionDef': return ''
    case 'tryCatch': {
      let out = `${I}try:\n`
      for (const b of s.tryBody) out += stmtPy(b, lvl + 1) + '\n'
      out += `${I}except Exception as ${s.catchVar || 'e'}:\n`
      for (const b of s.catchBody) out += stmtPy(b, lvl + 1) + '\n'
      return out.trimEnd()
    }
    case 'switch': {
      let out = ''
      for (let i = 0; i < s.cases.length; i++) {
        const c = s.cases[i]
        const kw = i === 0 ? 'if' : 'elif'
        if (c.value) out += `${I}${kw} ${exPy(s.expression)} == ${exPy(c.value)}:\n`
        else out += `${I}else:\n`
        for (const b of c.body) out += stmtPy(b, lvl + 1) + '\n'
      }
      return out.trimEnd()
    }
    case 'global': return `${I}global ${s.variables.join(', ')}`
    default: return `${I}# unsupported: ${(s as any).kind}`
  }
}

function funcToPy(f: Extract<Stmt, { kind: 'functionDef' }>): string {
  let out = `def ${f.name}(${f.params.join(', ')}):\n`
  for (const s of f.body) out += stmtPy(s, 1) + '\n'
  return out
}

function rangePy(e: Expr): string {
  if (e.kind === 'colon' && e.start && e.stop) {
    if (e.step) return `range(int(${exPy(e.start)}), int(${exPy(e.stop)})+1, int(${exPy(e.step)}))`
    return `range(int(${exPy(e.start)}), int(${exPy(e.stop)})+1)`
  }
  return exPy(e)
}

function exPy(e: Expr): string {
  switch (e.kind) {
    case 'number': return e.value.toString()
    case 'string': return `'${e.value}'`
    case 'bool': return e.value ? 'True' : 'False'
    case 'identifier': return pyName(e.name)
    case 'binary': return `(${exPy(e.left)} ${pyOp(e.op)} ${exPy(e.right)})`
    case 'unary': return e.postfix ? `${exPy(e.operand)}.T` : `(-${exPy(e.operand)})`
    case 'call': {
      const name = e.callee.kind === 'identifier' ? e.callee.name : exPy(e.callee)
      const args = e.args.map(a => exPy(a)).join(', ')
      const mapped = PY_FUNCS[name]
      return mapped ? `${mapped}(${args})` : `${name}(${args})`
    }
    case 'cellIndex': return `${exPy(e.object)}[${e.indices.map(i => exPy(i)).join(', ')}]`
    case 'dot': return `${exPy(e.object)}.${e.field}`
    case 'matrix': {
      const rows = e.rows.map(r => `[${r.map(c => exPy(c)).join(', ')}]`)
      return rows.length === 1 ? `np.array(${rows[0]})` : `np.array([${rows.join(', ')}])`
    }
    case 'cellArray': return `[${e.rows.flat().map(c => exPy(c)).join(', ')}]`
    case 'colon': {
      if (e.start && e.stop) {
        if (e.step) return `np.arange(${exPy(e.start)}, ${exPy(e.stop)}+1, ${exPy(e.step)})`
        return `np.arange(${exPy(e.start)}, ${exPy(e.stop)}+1)`
      }
      return ':'
    }
    case 'end': return '-1'
    case 'anonFunc': return `lambda ${e.params.join(', ')}: ${exPy(e.body)}`
    case 'funcHandle': return e.name
    default: return `# ${(e as any).kind}`
  }
}

function pyName(n: string): string { return n === 'pi' ? 'np.pi' : n === 'inf' ? 'np.inf' : n === 'nan' ? 'np.nan' : n }
function pyOp(op: TokenType): string {
  switch (op) {
    case TokenType.PLUS: return '+'
    case TokenType.MINUS: return '-'
    case TokenType.STAR: return '@'
    case TokenType.SLASH: return '/'
    case TokenType.CARET: return '**'
    case TokenType.DOT_STAR: return '*'
    case TokenType.DOT_SLASH: return '/'
    case TokenType.DOT_CARET: return '**'
    case TokenType.EQ: return '=='
    case TokenType.NE: return '!='
    case TokenType.LT: return '<'
    case TokenType.GT: return '>'
    case TokenType.LE: return '<='
    case TokenType.GE: return '>='
    case TokenType.AND: case TokenType.SHORT_AND: return 'and'
    case TokenType.OR: case TokenType.SHORT_OR: return 'or'
    default: return '?'
  }
}

const PY_FUNCS: Record<string, string> = {
  'zeros': 'np.zeros', 'ones': 'np.ones', 'eye': 'np.eye', 'rand': 'np.random.rand',
  'randn': 'np.random.randn', 'linspace': 'np.linspace', 'logspace': 'np.logspace',
  'sin': 'np.sin', 'cos': 'np.cos', 'tan': 'np.tan', 'exp': 'np.exp', 'log': 'np.log',
  'sqrt': 'np.sqrt', 'abs': 'np.abs', 'floor': 'np.floor', 'ceil': 'np.ceil', 'round': 'np.round',
  'sum': 'np.sum', 'prod': 'np.prod', 'min': 'np.min', 'max': 'np.max',
  'mean': 'np.mean', 'std': 'np.std', 'var': 'np.var', 'median': 'np.median',
  'det': 'np.linalg.det', 'inv': 'np.linalg.inv', 'eig': 'np.linalg.eig',
  'svd': 'np.linalg.svd', 'norm': 'np.linalg.norm', 'pinv': 'np.linalg.pinv',
  'size': 'np.shape', 'length': 'len', 'numel': 'np.size', 'reshape': 'np.reshape',
  'sort': 'np.sort', 'unique': 'np.unique', 'diag': 'np.diag', 'trace': 'np.trace',
  'fft': 'np.fft.fft', 'ifft': 'np.fft.ifft',
  'plot': 'plt.plot', 'scatter': 'plt.scatter', 'bar': 'plt.bar', 'hist': 'plt.hist',
  'title': 'plt.title', 'xlabel': 'plt.xlabel', 'ylabel': 'plt.ylabel',
  'legend': 'plt.legend', 'grid': 'plt.grid', 'figure': 'plt.figure', 'subplot': 'plt.subplot',
  'disp': 'print', 'fprintf': 'print',
}

// ═══════════════════════════════════════════════════════════════
// Julia Transpiler
// ═══════════════════════════════════════════════════════════════

export function toJulia(code: string): string {
  const tokens = new Lexer(code).tokenize()
  const program = new Parser(tokens).parse()
  const lines: string[] = ['using LinearAlgebra', 'using Plots', 'using Statistics', '']
  for (const fn of program.functions) lines.push(funcToJl(fn))
  for (const stmt of program.statements) lines.push(stmtJl(stmt, 0))
  return lines.join('\n')
}

function stmtJl(s: Stmt, lvl: number): string {
  const I = ind(lvl)
  switch (s.kind) {
    case 'expr': return `${I}${exJl(s.expression)}`
    case 'assign': return `${I}${exJl(s.target)} = ${exJl(s.value)}`
    case 'multiAssign': return `${I}${s.targets.join(', ')} = ${exJl(s.value)}`
    case 'if': {
      let out = ''
      for (let i = 0; i < s.branches.length; i++) {
        const b = s.branches[i]
        if (i === 0) out += `${I}if ${b.condition ? exJl(b.condition) : 'true'}\n`
        else if (b.condition) out += `${I}elseif ${exJl(b.condition)}\n`
        else out += `${I}else\n`
        for (const st of b.body) out += stmtJl(st, lvl + 1) + '\n'
      }
      out += `${I}end`; return out
    }
    case 'for': {
      const range = s.range
      if (range.kind === 'colon' && range.start && range.stop) {
        const r = range.step ? `${exJl(range.start)}:${exJl(range.step)}:${exJl(range.stop)}` : `${exJl(range.start)}:${exJl(range.stop)}`
        return `${I}for ${s.variable} in ${r}\n` + s.body.map(b => stmtJl(b, lvl + 1)).join('\n') + `\n${I}end`
      }
      return `${I}for ${s.variable} in ${exJl(range)}\n` + s.body.map(b => stmtJl(b, lvl + 1)).join('\n') + `\n${I}end`
    }
    case 'while': return `${I}while ${exJl(s.condition)}\n` + s.body.map(b => stmtJl(b, lvl + 1)).join('\n') + `\n${I}end`
    case 'return': return `${I}return`
    case 'break': return `${I}break`
    case 'continue': return `${I}continue`
    case 'functionDef': return ''
    case 'tryCatch': {
      let out = `${I}try\n`; for (const b of s.tryBody) out += stmtJl(b, lvl + 1) + '\n'
      out += `${I}catch ${s.catchVar || 'e'}\n`; for (const b of s.catchBody) out += stmtJl(b, lvl + 1) + '\n'
      out += `${I}end`; return out
    }
    case 'global': return `${I}global ${s.variables.join(', ')}`
    default: return `${I}# ${(s as any).kind}`
  }
}

function funcToJl(f: Extract<Stmt, { kind: 'functionDef' }>): string {
  let out = `function ${f.name}(${f.params.join(', ')})\n`
  for (const s of f.body) out += stmtJl(s, 1) + '\n'
  out += 'end\n'; return out
}

function exJl(e: Expr): string {
  switch (e.kind) {
    case 'number': return e.value.toString()
    case 'string': return `"${e.value}"`
    case 'bool': return e.value ? 'true' : 'false'
    case 'identifier': return e.name === 'pi' ? 'π' : e.name
    case 'binary': return `(${exJl(e.left)} ${jlOp(e.op)} ${exJl(e.right)})`
    case 'unary': return e.postfix ? `${exJl(e.operand)}'` : `(-${exJl(e.operand)})`
    case 'call': {
      const name = e.callee.kind === 'identifier' ? e.callee.name : exJl(e.callee)
      const args = e.args.map(a => exJl(a)).join(', ')
      const mapped = JL_FUNCS[name]
      return mapped ? `${mapped}(${args})` : `${name}(${args})`
    }
    case 'dot': return `${exJl(e.object)}.${e.field}`
    case 'matrix': {
      const rows = e.rows.map(r => r.map(c => exJl(c)).join(' '))
      return `[${rows.join('; ')}]`
    }
    case 'colon': {
      if (e.start && e.stop) {
        if (e.step) return `${exJl(e.start)}:${exJl(e.step)}:${exJl(e.stop)}`
        return `${exJl(e.start)}:${exJl(e.stop)}`
      }
      return ':'
    }
    case 'end': return 'end'
    case 'anonFunc': return `(${e.params.join(', ')}) -> ${exJl(e.body)}`
    case 'funcHandle': return e.name
    default: return `# ${(e as any).kind}`
  }
}

function jlOp(op: TokenType): string {
  switch (op) {
    case TokenType.PLUS: return '+'
    case TokenType.MINUS: return '-'
    case TokenType.STAR: return '*'
    case TokenType.SLASH: return '/'
    case TokenType.CARET: return '^'
    case TokenType.DOT_STAR: return '.*'
    case TokenType.DOT_SLASH: return './'
    case TokenType.DOT_CARET: return '.^'
    case TokenType.EQ: return '=='
    case TokenType.NE: return '!='
    case TokenType.LT: return '<'
    case TokenType.GT: return '>'
    case TokenType.LE: return '<='
    case TokenType.GE: return '>='
    case TokenType.AND: case TokenType.SHORT_AND: return '&&'
    case TokenType.OR: case TokenType.SHORT_OR: return '||'
    default: return '?'
  }
}

const JL_FUNCS: Record<string, string> = {
  'zeros': 'zeros', 'ones': 'ones', 'rand': 'rand', 'randn': 'randn',
  'linspace': 'range', 'disp': 'println', 'fprintf': '@printf',
  'plot': 'plot', 'scatter': 'scatter', 'title': 'title!', 'xlabel': 'xlabel!', 'ylabel': 'ylabel!',
}
