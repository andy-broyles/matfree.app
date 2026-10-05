import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { EngineSession } from '../engineSession'
import { SessionHost, type SessionRequest, type SessionResponse } from '@/engine/session'

const HANG = '% never finishes'

/** In-process stand-in for the module worker: async messages, terminate(), and a way to simulate hung code. */
class FakeWorker {
  static instances: FakeWorker[] = []
  onmessage: ((ev: { data: SessionResponse }) => void) | null = null
  onerror: ((ev: { message: string; preventDefault(): void }) => void) | null = null
  terminated = false
  private host = new SessionHost(msg => this.emit(msg), { timeLimitMs: 0 })

  constructor() {
    FakeWorker.instances.push(this)
    this.emit({ type: 'ready' })
  }

  private emit(msg: SessionResponse) {
    const data = structuredClone(msg)
    setTimeout(() => { if (!this.terminated) this.onmessage?.({ data }) }, 0)
  }

  postMessage(req: SessionRequest) {
    const data = structuredClone(req)
    setTimeout(() => {
      if (this.terminated || (data.type === 'run' && data.code === HANG)) return
      this.host.handle(data)
    }, 0)
  }

  terminate() { this.terminated = true }

  crash(message: string) { this.onerror?.({ message, preventDefault() {} }) }
}

const tick = () => new Promise(r => setTimeout(r, 5))
const varPreview = (s: EngineSession, name: string) => s.getState().vars.find(v => v.name === name)?.preview

describe('EngineSession (worker transport)', () => {
  beforeEach(() => {
    FakeWorker.instances = []
    vi.stubGlobal('Worker', FakeWorker)
  })
  afterEach(() => { vi.unstubAllGlobals() })

  it('keeps the workspace across runs and streams output', async () => {
    const s = new EngineSession()
    const out: string[] = []
    expect(await s.run('x = 21;')).toEqual({ status: 'ok' })
    expect(await s.run("fprintf('%d\\n', x * 2)", { onOutput: t => out.push(...t) })).toEqual({ status: 'ok' })
    expect(out.join('')).toBe('42\n')
    expect(varPreview(s, 'x')).toBe('21')
    expect(s.getState().busy).toBe(false)
    s.dispose()
  })

  it('reports errors without breaking the session', async () => {
    const s = new EngineSession()
    const r = await s.run('y = undefined_thing + 1;')
    expect(r.status).toBe('error')
    expect(await s.run('y = 2;')).toEqual({ status: 'ok' })
    s.dispose()
  })

  it('Stop terminates the worker and restores the workspace from before the command', async () => {
    const s = new EngineSession()
    await s.run('x = 1;')
    let started = false
    const hung = s.run(HANG, { onStart: () => { started = true } })
    await tick()
    expect(started).toBe(true)
    expect(s.getState().busy).toBe(true)

    expect(s.stop()).toBe(true)
    expect(await hung).toEqual({ status: 'stopped', reason: 'stop', workspaceCleared: false })
    expect(s.getState().busy).toBe(false)
    expect(FakeWorker.instances).toHaveLength(2)
    expect(FakeWorker.instances[0].terminated).toBe(true)

    expect(await s.run('y = x + 1;')).toEqual({ status: 'ok' })
    expect(varPreview(s, 'y')).toBe('2')
    s.dispose()
  })

  it('Stop also cancels queued runs, which never start', async () => {
    const s = new EngineSession()
    const hung = s.run(HANG)
    let queuedStarted = false
    const queued = s.run('q = 1;', { onStart: () => { queuedStarted = true } })
    await tick()
    s.stop()
    expect((await hung).status).toBe('stopped')
    expect(await queued).toEqual({ status: 'stopped', reason: 'stop', workspaceCleared: false })
    expect(queuedStarted).toBe(false)
    s.dispose()
  })

  it('reports a cleared workspace when it was too large to snapshot', async () => {
    const s = new EngineSession()
    await s.run('x = 1;')
    // Simulate the host saying the workspace was too big to snapshot.
    ;(s as unknown as { saved: unknown }).saved = 'too-large'
    const hung = s.run(HANG)
    await tick()
    s.stop()
    expect(await hung).toEqual({ status: 'stopped', reason: 'stop', workspaceCleared: true })
    expect(s.getState().vars).toEqual([])
    await s.run("e = exist('x');")
    expect(varPreview(s, 'e')).toBe('0')
    s.dispose()
  })

  it('reset clears the workspace, even while code is running', async () => {
    const s = new EngineSession()
    await s.run('x = 1;')
    const hung = s.run(HANG)
    await tick()
    await s.reset()
    expect(await hung).toEqual({ status: 'stopped', reason: 'reset', workspaceCleared: true })
    await s.run("e = exist('x');")
    expect(varPreview(s, 'e')).toBe('0')
    s.dispose()
  })

  it('recovers from a worker crash and restores the workspace', async () => {
    const s = new EngineSession()
    await s.run('x = 5;')
    const hung = s.run(HANG)
    await tick()
    FakeWorker.instances[0].crash('out of memory')
    const r = await hung
    expect(r.status).toBe('error')
    expect(r.status === 'error' && r.error).toMatch(/crashed \(out of memory\).*restored/)
    await s.run('y = x * 2;')
    expect(varPreview(s, 'y')).toBe('10')
    s.dispose()
  })

  it('falls back to the main thread if the worker script fails to load', async () => {
    const s = new EngineSession()
    // Fail before the worker ever reports ready.
    FakeWorker.instances[0].terminated = true
    FakeWorker.instances[0].crash('')
    const r = await s.run('x = 3;')
    expect(r).toEqual({ status: 'ok' })
    expect(varPreview(s, 'x')).toBe('3')
    expect(s.getState().canStop).toBe(false)
    s.dispose()
  })
})

describe('EngineSession (no Worker support)', () => {
  beforeEach(() => { vi.stubGlobal('Worker', undefined) })
  afterEach(() => { vi.unstubAllGlobals() })

  it('runs code on the main thread with Stop unavailable', async () => {
    const s = new EngineSession()
    expect(s.getState().canStop).toBe(false)
    expect(await s.run('x = 2; y = x^10;')).toEqual({ status: 'ok' })
    expect(varPreview(s, 'y')).toBe('1024')
    expect(s.stop()).toBe(false)
    s.dispose()
  })
})
