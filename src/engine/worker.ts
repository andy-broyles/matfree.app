// MatFree Web Worker entry (module worker)
// Runs Interpreter off the main thread to keep the UI responsive.
// Posts messages for outputs, plots (serialized), and errors.
// The public Interpreter API remains unchanged for tests and sync use.

import { Interpreter } from './interpreter'
import { RuntimeError } from './value'
import { LexerError } from './lexer'
import { ParseError } from './parser'
import type { PlotFigure } from './plot'

export type WorkerRequest =
  | { id: number; type: 'run'; code: string; timeLimitMs?: number }
  | { id: number; type: 'cancel' }

export type WorkerResponse =
  | { id: number; type: 'start' }
  | { id: number; type: 'output'; text: string }
  | { id: number; type: 'plot'; figure: PlotFigure }
  | { id: number; type: 'plot3d'; data: any }
  | { id: number; type: 'audio'; src: string }
  | { id: number; type: 'done'; text?: string }
  | { id: number; type: 'error'; message: string; line?: number }
  | { id: number; type: 'cancelled' }

declare const self: any

if (typeof self !== 'undefined' && typeof self.postMessage === 'function') {
  let currentInterp: Interpreter | null = null
  let cancelled = false

  self.onmessage = (ev: MessageEvent<WorkerRequest>) => {
    const msg = ev.data
    if (!msg || typeof msg !== 'object') return

    if (msg.type === 'cancel') {
      cancelled = true
      try { currentInterp?.setExecutionLimitMs(0) } catch {}
      self.postMessage({ id: msg.id, type: 'cancelled' } as WorkerResponse)
      // Terminate is usually done from the main thread via worker.terminate()
      return
    }

    if (msg.type === 'run') {
      cancelled = false
      const id = msg.id
      self.postMessage({ id, type: 'start' } as WorkerResponse)

      const interp = new Interpreter()
      currentInterp = interp

      if (msg.timeLimitMs && msg.timeLimitMs > 0) {
        interp.setExecutionLimitMs(msg.timeLimitMs)
      }

      const outputs: string[] = []
      const plots: PlotFigure[] = []
      const plot3ds: any[] = []
      const audios: string[] = []

      interp.setOutput((text: string) => {
        if (text.startsWith('__audio:')) {
          const src = text.slice(8).trim()
          audios.push(src)
          self.postMessage({ id, type: 'audio', src } as WorkerResponse)
          return
        }
        if (text.startsWith('__plot3d:')) {
          try {
            const d = JSON.parse(text.slice(9).trim())
            plot3ds.push(d)
            self.postMessage({ id, type: 'plot3d', data: d } as WorkerResponse)
          } catch {
            outputs.push(text)
            self.postMessage({ id, type: 'output', text } as WorkerResponse)
          }
          return
        }
        outputs.push(text)
        self.postMessage({ id, type: 'output', text } as WorkerResponse)
      })

      interp.setPlotCallback((fig: PlotFigure) => {
        // Serialize a shallow copy; series are plain arrays/objects
        const ser: PlotFigure = {
          id: fig.id,
          series: [...(fig.series || [])],
          title: fig.title,
          xlabel: fig.xlabel,
          ylabel: fig.ylabel,
          grid: fig.grid ?? false,
          hold: fig.hold ?? false,
          legend: fig.legend ?? false,
          xRange: fig.xRange ? [...fig.xRange] as [number, number] : undefined,
          yRange: fig.yRange ? [...fig.yRange] as [number, number] : undefined,
          width: (fig as any).width ?? 800,
          height: (fig as any).height ?? 500,
          theme: (fig as any).theme ?? 'dark',
        }
        plots.push(ser)
        self.postMessage({ id, type: 'plot', figure: ser } as WorkerResponse)
      })

      try {
        const res = interp.execute(msg.code)
        if (!cancelled) {
          const text = res && !res.isEmpty() ? res.display('ans') : undefined
          self.postMessage({ id, type: 'done', text } as WorkerResponse)
        }
      } catch (e: any) {
        if (cancelled) {
          self.postMessage({ id, type: 'cancelled' } as WorkerResponse)
          return
        }
        let line: number | undefined
        let message = 'Error'
        if (e instanceof LexerError) { line = e.line; message = `Lexer Error (line ${e.line}): ${e.message}` }
        else if (e instanceof ParseError) { line = e.line; message = `Parse Error (line ${e.line}): ${e.message}` }
        else if (e instanceof RuntimeError) { message = `Error: ${e.message}` }
        else { message = `Error: ${e?.message ?? e}` }
        self.postMessage({ id, type: 'error', message, line } as WorkerResponse)
      } finally {
        currentInterp = null
      }
    }
  }
}

// For direct import in tests / non-worker contexts, export a helper to run in worker-like shape if needed.
export function createWorkerRunner() {
  // Placeholder for future server-side or test worker pooling.
  return null
}
