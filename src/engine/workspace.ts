// MatFree Engine - Workspace summaries and snapshots
//
// A snapshot captures everything a session needs to continue after its
// interpreter is thrown away (e.g. a Web Worker terminated by Stop):
// variables, closures (with the scopes they captured), and user functions.

import { Environment } from './environment'
import type { Expr } from './ast'
import type { FunctionDef, Interpreter } from './interpreter'
import { Matrix, Value } from './value'

export interface VarSummary {
  name: string
  typeLabel: string
  size: string
  preview: string
}

const DEFAULT_CONSTANTS: Record<string, [number, number]> = {
  pi: [Math.PI, 0], inf: [Infinity, 0], Inf: [Infinity, 0], nan: [NaN, 0], NaN: [NaN, 0],
  true: [1, 0], false: [0, 0], eps: [2.220446049250313e-16, 0], i: [0, 1], j: [0, 1],
}

const sameNumber = (a: number, b: number) => a === b || (Number.isNaN(a) && Number.isNaN(b))

function isDefaultConstant(name: string, v: Value): boolean {
  const def = DEFAULT_CONSTANTS[name]
  if (!def || !v.isMatrix()) return false
  const m = v.matrix()
  return m.isScalar() && sameNumber(m.data[0], def[0]) && sameNumber(m.imag?.[0] ?? 0, def[1])
}

function fmtShort(v: number): string {
  if (Number.isNaN(v)) return 'NaN'
  if (!Number.isFinite(v)) return v > 0 ? 'Inf' : '-Inf'
  if (Number.isInteger(v)) return v.toString()
  return v.toPrecision(4)
}

function fmtComplex(re: number, im: number): string {
  if (im === 0) return fmtShort(re)
  return `${fmtShort(re)} ${im < 0 || Object.is(im, -0) ? '-' : '+'} ${fmtShort(Math.abs(im))}i`
}

export function summarizeValue(name: string, v: Value): VarSummary {
  if (v.isMatrix()) {
    const m = v.matrix()
    const n = m.data.length
    const el = (k: number) => (m.imag ? fmtComplex(m.data[k], m.imag[k]) : fmtShort(m.data[k]))
    let preview: string
    if (m.isScalar()) preview = m.imag ? fmtComplex(m.data[0], m.imag[0]) : String(m.data[0])
    else if (n <= 6) preview = `[${Array.from({ length: n }, (_, k) => el(k)).join(', ')}]`
    else preview = `[${Array.from({ length: 4 }, (_, k) => el(k)).join(', ')}, ...]`
    return { name, typeLabel: 'double', size: `${m.rows}x${m.cols}`, preview }
  }
  if (v.isString()) {
    const s = v.string()
    return { name, typeLabel: 'char', size: `1x${s.length}`, preview: `'${s.length > 20 ? s.slice(0, 20) + '...' : s}'` }
  }
  if (v.isStruct()) {
    const keys = Object.keys(v.struct())
    return { name, typeLabel: 'struct', size: '1x1', preview: `{${keys.slice(0, 3).join(', ')}${keys.length > 3 ? ', ...' : ''}}` }
  }
  if (v.isCell()) {
    const c = v.cell()
    return { name, typeLabel: 'cell', size: `${c.rows}x${c.cols}`, preview: '{...}' }
  }
  if (v.isFuncHandle()) {
    const f = v.funcHandle()
    const preview = f.type === 'builtin' ? `@${f.name}` : `@(${f.params.join(', ')}) ...`
    return { name, typeLabel: 'function_handle', size: '1x1', preview }
  }
  return { name, typeLabel: 'double', size: '0x0', preview: '[]' }
}

/** Variables shown in the Workspace panel: built-in constants are hidden until they are reassigned. */
export function summarizeWorkspace(env: Environment): VarSummary[] {
  const out: VarSummary[] = []
  for (const [name, v] of env.entries()) {
    if (name === 'nargin' || name === 'nargout' || name.startsWith('__') || isDefaultConstant(name, v)) continue
    out.push(summarizeValue(name, v))
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || (a.name < b.name ? -1 : 1))
}

export type SerializedValue =
  | { t: 'matrix'; rows: number; cols: number; re: Float64Array; im?: Float64Array }
  | { t: 'string'; value: string }
  | { t: 'cell'; rows: number; cols: number; items: SerializedValue[] }
  | { t: 'struct'; fields: [string, SerializedValue][] }
  | { t: 'builtinHandle'; name: string }
  | { t: 'anonHandle'; params: string[]; body: Expr; env: number }
  | { t: 'empty' }

export interface SerializedEnv {
  parent: number | null
  vars: [string, SerializedValue][]
  globals: string[]
}

export interface WorkspaceSnapshot {
  /** envs[0] is the base workspace; every other entry is a scope captured by a closure. Parents precede children. */
  envs: SerializedEnv[]
  functions: FunctionDef[]
  elements: number
}

/** Roughly 80 MB of doubles. Above this, Stop clears the workspace instead of restoring it. */
export const MAX_SNAPSHOT_ELEMENTS = 1e7

class SnapshotTooLarge extends Error {}

/**
 * Serializes the base workspace. Returns null if it holds more than `maxElements` numbers.
 * `transfer` lists the buffers that can be moved (not copied) through postMessage.
 */
export function snapshotWorkspace(
  interp: Interpreter,
  maxElements = MAX_SNAPSHOT_ELEMENTS,
): { snapshot: WorkspaceSnapshot; transfer: ArrayBuffer[] } | null {
  const ids = new Map<Environment, number>()
  const envs: SerializedEnv[] = []
  const transfer: ArrayBuffer[] = []
  let elements = 0

  const count = (n: number) => {
    elements += n
    if (elements > maxElements) throw new SnapshotTooLarge()
  }

  const envId = (env: Environment): number => {
    const known = ids.get(env)
    if (known !== undefined) return known
    const parentEnv = env.parentEnv()
    const parent = parentEnv ? envId(parentEnv) : null
    const id = envs.length
    ids.set(env, id)
    const rec: SerializedEnv = { parent, vars: [], globals: env.globalNames() }
    envs.push(rec)
    for (const [name, v] of env.entries()) rec.vars.push([name, ser(v)])
    return id
  }

  const ser = (v: Value): SerializedValue => {
    if (v.isMatrix()) {
      const m = v.matrix()
      count(m.data.length + (m.imag?.length ?? 0))
      const re = Float64Array.from(m.data)
      transfer.push(re.buffer)
      if (!m.imag) return { t: 'matrix', rows: m.rows, cols: m.cols, re }
      const im = Float64Array.from(m.imag)
      transfer.push(im.buffer)
      return { t: 'matrix', rows: m.rows, cols: m.cols, re, im }
    }
    if (v.isString()) {
      count(Math.ceil(v.string().length / 8))
      return { t: 'string', value: v.string() }
    }
    if (v.isCell()) {
      const c = v.cell()
      count(c.data.length)
      return { t: 'cell', rows: c.rows, cols: c.cols, items: c.data.map(ser) }
    }
    if (v.isStruct()) {
      return { t: 'struct', fields: Object.entries(v.struct()).map(([k, x]): [string, SerializedValue] => [k, ser(x)]) }
    }
    if (v.isFuncHandle()) {
      const f = v.funcHandle()
      if (f.type === 'builtin') return { t: 'builtinHandle', name: f.name }
      return { t: 'anonHandle', params: [...f.params], body: f.body, env: envId(f.closure as Environment) }
    }
    return { t: 'empty' }
  }

  try {
    envId(interp.getGlobalEnv())
  } catch (e) {
    if (e instanceof SnapshotTooLarge) return null
    throw e
  }
  return { snapshot: { envs, functions: interp.getUserFunctions(), elements }, transfer }
}

/** Replaces the interpreter's workspace and user functions with the snapshot's. */
export function restoreWorkspace(interp: Interpreter, snap: WorkspaceSnapshot): void {
  const base = interp.getGlobalEnv()
  const envs: Environment[] = []
  snap.envs.forEach((rec, i) => {
    if (i === 0) { envs.push(base); return }
    const parent = rec.parent === null ? undefined : envs[rec.parent]
    if (!parent) throw new Error('Corrupt workspace snapshot')
    envs.push(parent.createChild())
  })

  const de = (s: SerializedValue): Value => {
    switch (s.t) {
      case 'matrix': return Value.fromMatrix(new Matrix(s.rows, s.cols, Array.from(s.re), s.im ? Array.from(s.im) : undefined))
      case 'string': return Value.fromString(s.value)
      case 'cell': return Value.fromCell({ rows: s.rows, cols: s.cols, data: s.items.map(de) })
      case 'struct': {
        const out: Record<string, Value> = {}
        for (const [k, x] of s.fields) out[k] = de(x)
        return Value.fromStruct(out)
      }
      case 'builtinHandle': return Value.fromFuncHandle({ type: 'builtin', name: s.name })
      case 'anonHandle': return Value.fromFuncHandle({ type: 'anonymous', params: s.params, body: s.body, closure: envs[s.env] ?? base })
      default: return Value.empty()
    }
  }

  base.clear()
  snap.envs.forEach((rec, i) => {
    for (const g of rec.globals) envs[i].declareGlobal(g)
    for (const [name, v] of rec.vars) envs[i].setLocal(name, de(v))
  })
  for (const fn of snap.functions) interp.defineFunction(fn)
}
