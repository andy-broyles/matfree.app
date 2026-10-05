// Main-thread side of the engine session: runs code in a Web Worker, queues
// requests, and implements Stop by terminating the worker and restoring the
// workspace from the snapshot taken after the last completed command.

import type { PlotFigure } from '@/engine/plot'
import type { SessionHost, SessionRequest, SessionResponse } from '@/engine/session'
import type { VarSummary, WorkspaceSnapshot } from '@/engine/workspace'

export interface RunHandlers {
  /** Called when the code actually starts; runs wait in a queue behind each other. */
  onStart?: () => void
  onOutput?: (texts: string[]) => void
  onPlot?: (figure: PlotFigure) => void
}

export type RunResult =
  | { status: 'ok' }
  | { status: 'error'; error: string }
  /**
   * reason: 'stop' = Stop/Ctrl+C, 'reset' = superseded by reset(), 'closed' = session disposed.
   * workspaceCleared: the workspace was too large to snapshot, so it could not be restored.
   */
  | { status: 'stopped'; reason: 'stop' | 'reset' | 'closed'; workspaceCleared: boolean }

export interface SessionState {
  busy: boolean
  busySince: number | null
  vars: VarSummary[]
  /** False when code runs on the main thread (no Worker support); such runs cannot be interrupted. */
  canStop: boolean
}

interface Job {
  req: SessionRequest
  handlers: RunHandlers
  resolve: (r: RunResult) => void
  started?: boolean
}

type SavedWorkspace = WorkspaceSnapshot | 'fresh' | 'too-large'

const INLINE_TIME_LIMIT_MS = 10_000

export class EngineSession {
  private worker: Worker | null = null
  private workerReady = false
  private useInline = typeof Worker === 'undefined'
  private host: SessionHost | null = null
  private loadingHost = false
  private disposed = false
  private nextId = 1
  private current: Job | null = null
  private queue: Job[] = []
  private saved: SavedWorkspace = 'fresh'
  private state: SessionState = { busy: false, busySince: null, vars: [], canStop: !this.useInline }
  private listeners = new Set<() => void>()

  constructor() {
    this.ensureTransport()
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => { this.listeners.delete(fn) }
  }

  getState = (): SessionState => this.state

  run(code: string, handlers: RunHandlers = {}, strings?: Record<string, string>): Promise<RunResult> {
    return this.enqueue({ type: 'run', id: this.nextId++, code, strings }, handlers)
  }

  /** Starts over with an empty workspace, stopping anything that is running or queued. */
  reset(): Promise<RunResult> {
    const job = this.current
    const queued = this.queue.splice(0)
    this.saved = 'fresh'
    if (job?.req.type === 'run' && this.worker) {
      this.restartWorker()
      job.resolve({ status: 'stopped', reason: 'reset', workspaceCleared: true })
    }
    for (const q of queued) q.resolve({ status: 'stopped', reason: 'reset', workspaceCleared: true })
    this.setState({ vars: [], busy: false, busySince: null })
    return this.enqueue({ type: 'reset', id: this.nextId++ }, {})
  }

  /** Interrupts the running command and cancels queued ones. The workspace goes back to how it was before the command. */
  stop(): boolean {
    const job = this.current
    if (!job || job.req.type !== 'run' || !this.worker) return false
    const cleared = this.saved === 'too-large'
    const queued = this.queue.splice(0)
    this.restartWorker()
    this.setState({ busy: false, busySince: null })
    job.resolve({ status: 'stopped', reason: 'stop', workspaceCleared: cleared })
    for (const q of queued) q.resolve({ status: 'stopped', reason: 'stop', workspaceCleared: cleared })
    this.pump()
    return true
  }

  dispose(): void {
    this.disposed = true
    this.killWorker()
    this.host = null
    const jobs = [this.current, ...this.queue.splice(0)]
    this.current = null
    for (const j of jobs) j?.resolve({ status: 'stopped', reason: 'closed', workspaceCleared: false })
    this.listeners.clear()
  }

  private setState(patch: Partial<SessionState>) {
    this.state = { ...this.state, ...patch }
    for (const fn of this.listeners) fn()
  }

  private enqueue(req: SessionRequest, handlers: RunHandlers): Promise<RunResult> {
    if (this.disposed) return Promise.resolve({ status: 'stopped', reason: 'closed', workspaceCleared: false })
    return new Promise(resolve => {
      this.queue.push({ req, handlers, resolve })
      this.pump()
    })
  }

  private pump() {
    if (this.current || this.disposed) return
    if (!this.worker && !this.host) { this.ensureTransport(); return }
    const job = this.queue.shift()
    if (!job) {
      if (this.state.busy) this.setState({ busy: false, busySince: null })
      return
    }
    this.current = job
    if (job.req.type === 'run' && !job.started) {
      job.started = true
      this.setState({ busy: true, busySince: Date.now() })
      job.handlers.onStart?.()
    }
    this.send(job.req)
  }

  private send(req: SessionRequest) {
    if (this.worker) { this.worker.postMessage(req); return }
    const host = this.host
    // Give the browser a frame to paint the "running" state before the main thread blocks.
    if (host) setTimeout(() => { if (this.host === host) host.handle(req) }, 20)
  }

  private onMessage(msg: SessionResponse) {
    if (msg.type === 'ready') { this.workerReady = true; return }
    const job = this.current
    if (!job || msg.id !== job.req.id) return
    if (msg.type === 'output') job.handlers.onOutput?.(msg.texts)
    else if (msg.type === 'plot') job.handlers.onPlot?.(msg.figure)
    else if (msg.type === 'download') saveFile(msg.name, msg.mime, msg.content)
    else if (msg.type === 'done') {
      if (msg.snapshot !== undefined) this.saved = msg.snapshot ?? 'too-large'
      if (job.req.type === 'restore' && msg.error) this.saved = 'fresh'
      this.current = null
      this.setState({ vars: msg.vars })
      job.resolve(msg.error ? { status: 'error', error: msg.error } : { status: 'ok' })
      this.pump()
    }
  }

  private ensureTransport() {
    if (this.disposed || this.worker || this.host) return
    if (!this.useInline) {
      try {
        this.spawnWorker()
        this.pump()
        return
      } catch {
        this.useInline = true
      }
    }
    this.loadInlineHost()
  }

  private spawnWorker() {
    const worker = new Worker(new URL('../engine/worker', import.meta.url), { type: 'module' })
    worker.onmessage = (ev: MessageEvent<SessionResponse>) => { if (this.worker === worker) this.onMessage(ev.data) }
    worker.onerror = (ev: ErrorEvent) => {
      ev.preventDefault()
      if (this.worker === worker) this.onWorkerError(ev.message)
    }
    this.worker = worker
    this.workerReady = false
  }

  private killWorker() {
    this.worker?.terminate()
    this.worker = null
    this.workerReady = false
  }

  /** Replaces the worker, replaying the last snapshot (if any) before anything else runs. */
  private restartWorker() {
    this.current = null
    this.killWorker()
    this.spawnWorker()
    if (typeof this.saved === 'object') {
      this.queue.unshift({ req: { type: 'restore', id: this.nextId++, snapshot: this.saved }, handlers: {}, resolve: () => {} })
    } else {
      this.saved = 'fresh'
      this.setState({ vars: [] })
    }
  }

  private onWorkerError(message: string) {
    const job = this.current
    if (!this.workerReady) {
      // The worker script itself failed to load: fall back to running on the main thread.
      this.killWorker()
      this.useInline = true
      this.setState({ canStop: false })
      if (job) { this.current = null; this.queue.unshift(job) }
      this.loadInlineHost()
      return
    }
    const restorable = typeof this.saved === 'object'
    const queued = this.queue.splice(0)
    this.restartWorker()
    this.setState({ busy: false, busySince: null })
    const detail = message ? ` (${message})` : ''
    job?.resolve({
      status: 'error',
      error: `Error: the engine crashed${detail}. ` +
        (restorable ? 'The workspace was restored to how it was before this command.' : 'The workspace was cleared.'),
    })
    for (const q of queued) q.resolve({ status: 'stopped', reason: 'stop', workspaceCleared: !restorable })
    this.pump()
  }

  private loadInlineHost() {
    if (this.host || this.loadingHost || this.disposed) return
    this.loadingHost = true
    this.setState({ canStop: false })
    import('@/engine/session').then(({ SessionHost }) => {
      this.loadingHost = false
      if (this.disposed) return
      this.host = new SessionHost(
        msg => this.onMessage(structuredClone(msg)),
        { timeLimitMs: INLINE_TIME_LIMIT_MS, snapshots: false },
      )
      this.pump()
    }, () => { this.loadingHost = false })
  }
}

function saveFile(name: string, mime: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
