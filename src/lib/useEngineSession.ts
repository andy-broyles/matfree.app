'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { EngineSession, type RunHandlers, type RunResult, type SessionState } from './engineSession'

const IDLE: SessionState = { busy: false, busySince: null, vars: [], canStop: true }
const NOT_READY: RunResult = { status: 'stopped', reason: 'closed', workspaceCleared: false }

/** One engine session per mounted page; the worker is created on mount and terminated on unmount. */
export function useEngineSession() {
  const ref = useRef<EngineSession | null>(null)
  const [state, setState] = useState<SessionState>(IDLE)

  useEffect(() => {
    const session = new EngineSession()
    ref.current = session
    setState(session.getState())
    const unsubscribe = session.subscribe(() => setState(session.getState()))
    return () => {
      unsubscribe()
      session.dispose()
      if (ref.current === session) ref.current = null
    }
  }, [])

  const run = useCallback(
    (code: string, handlers?: RunHandlers, strings?: Record<string, string>): Promise<RunResult> =>
      ref.current ? ref.current.run(code, handlers, strings) : Promise.resolve(NOT_READY),
    [],
  )
  const stop = useCallback((): boolean => ref.current?.stop() ?? false, [])
  const reset = useCallback((): Promise<RunResult> => (ref.current ? ref.current.reset() : Promise.resolve(NOT_READY)), [])

  return { ...state, run, stop, reset }
}

/** Seconds since `since`, refreshed a few times per second while `since` is set. */
export function useElapsedSeconds(since: number | null): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (since === null) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 200)
    return () => clearInterval(timer)
  }, [since])
  return since === null ? 0 : Math.max(0, (now - since) / 1000)
}

/** True when the user has text selected, so Ctrl+C should copy rather than stop a run. */
export function hasTextSelection(): boolean {
  const el = document.activeElement
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    return el.selectionStart !== null && el.selectionStart !== el.selectionEnd
  }
  return (window.getSelection()?.toString() ?? '').length > 0
}
