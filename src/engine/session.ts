// MatFree Engine - persistent session host
//
// Owns one long-lived interpreter behind a small message protocol, so the same
// code runs inside a Web Worker (normal case) or on the main thread (fallback).

import { Interpreter } from './interpreter'
import { LexerError } from './lexer'
import { ParseError } from './parser'
import type { PlotFigure } from './plot'
import { RuntimeError, Value } from './value'
import {
  MAX_SNAPSHOT_ELEMENTS, restoreWorkspace, snapshotWorkspace, summarizeWorkspace,
  type VarSummary, type WorkspaceSnapshot,
} from './workspace'

export type SessionRequest =
  | { type: 'run'; id: number; code: string; strings?: Record<string, string> }
  | { type: 'reset'; id: number }
  | { type: 'restore'; id: number; snapshot: WorkspaceSnapshot }

export type SessionResponse =
  | { type: 'ready' }
  | { type: 'output'; id: number; texts: string[] }
  | { type: 'plot'; id: number; figure: PlotFigure }
  | { type: 'download'; id: number; name: string; mime: string; content: string }
  | {
      type: 'done'
      id: number
      error?: string
      vars: VarSummary[]
      /** undefined: unchanged since the last snapshot; null: too large to snapshot. */
      snapshot?: WorkspaceSnapshot | null
    }

export interface SessionHostOptions {
  /** Wall-clock budget per run in ms; 0 means unlimited (fine when the host can be terminated from outside). */
  timeLimitMs?: number
  snapshots?: boolean
  maxSnapshotElements?: number
}

export type SessionPost = (msg: SessionResponse, transfer?: Transferable[]) => void

const FLUSH_MS = 50
const FLUSH_COUNT = 500

export function formatEngineError(e: unknown): string {
  if (e instanceof LexerError) return `Lexer Error (line ${e.line}): ${e.message}`
  if (e instanceof ParseError) return `Parse Error (line ${e.line}): ${e.message}`
  if (e instanceof RuntimeError) return `Error: ${e.message}`
  if (e instanceof RangeError && /call stack/i.test(e.message)) return 'Error: Maximum call stack size exceeded (recursion too deep)'
  return `Error: ${(e as Error)?.message ?? String(e)}`
}

export class SessionHost {
  private interp!: Interpreter
  private runId = 0
  private pending: string[] = []
  private lastFlush = 0
  private snapshotVersion = ''

  constructor(private readonly post: SessionPost, private readonly opts: SessionHostOptions = {}) {
    this.createInterpreter()
  }

  get interpreter(): Interpreter { return this.interp }

  handle(msg: SessionRequest): void {
    if (!msg || typeof msg !== 'object') return
    if (msg.type === 'run') this.run(msg.id, msg.code, msg.strings)
    else if (msg.type === 'reset') { this.createInterpreter(); this.finish(msg.id) }
    else if (msg.type === 'restore') this.restore(msg.id, msg.snapshot)
  }

  private createInterpreter() {
    const interp = new Interpreter()
    interp.setExecutionLimitMs(this.opts.timeLimitMs ?? 0)
    interp.setOutput(text => this.onOutput(text))
    interp.setTickCallback(() => {
      if (this.pending.length > 0 && Date.now() - this.lastFlush >= FLUSH_MS) this.flush()
    })
    interp.setPlotCallback(figure => { this.flush(); this.post({ type: 'plot', id: this.runId, figure }) })
    interp.setDownloadCallback(file => { this.flush(); this.post({ type: 'download', id: this.runId, ...file }) })
    this.interp = interp
    this.snapshotVersion = interp.stateVersion()
  }

  private run(id: number, code: string, strings?: Record<string, string>) {
    this.runId = id
    this.lastFlush = 0
    const base = this.interp.getGlobalEnv()
    const injected = Object.keys(strings ?? {})
    for (const name of injected) base.setLocal(name, Value.fromString(strings![name]))
    let error: string | undefined
    try {
      this.interp.execute(code)
    } catch (e) {
      error = formatEngineError(e)
    } finally {
      for (const name of injected) base.deleteLocal(name)
    }
    this.finish(id, error)
  }

  private restore(id: number, snapshot: WorkspaceSnapshot) {
    let error: string | undefined
    try {
      restoreWorkspace(this.interp, snapshot)
    } catch (e) {
      this.createInterpreter()
      error = `Error: could not restore the workspace (${(e as Error)?.message ?? e})`
    }
    this.snapshotVersion = this.interp.stateVersion()
    this.finish(id, error)
  }

  private onOutput(text: string) {
    this.pending.push(text)
    if (this.pending.length >= FLUSH_COUNT || Date.now() - this.lastFlush >= FLUSH_MS) this.flush()
  }

  private flush() {
    this.lastFlush = Date.now()
    if (this.pending.length === 0) return
    const texts = this.pending
    this.pending = []
    this.post({ type: 'output', id: this.runId, texts })
  }

  private finish(id: number, error?: string) {
    this.flush()
    let vars: VarSummary[] = []
    let snapshot: WorkspaceSnapshot | null | undefined
    let transfer: Transferable[] = []
    try {
      vars = summarizeWorkspace(this.interp.getGlobalEnv())
      const version = this.interp.stateVersion()
      if (this.opts.snapshots !== false && version !== this.snapshotVersion) {
        this.snapshotVersion = version
        const res = snapshotWorkspace(this.interp, this.opts.maxSnapshotElements ?? MAX_SNAPSHOT_ELEMENTS)
        snapshot = res ? res.snapshot : null
        transfer = res ? res.transfer : []
      }
    } catch {
      snapshot = null
    }
    this.post({ type: 'done', id, error, vars, snapshot }, transfer)
  }
}
