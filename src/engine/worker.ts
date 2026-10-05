// MatFree Web Worker entry (module worker): one persistent session per worker.
// Code runs here so long scripts never block the page, and the page can stop
// a runaway script by terminating the worker.

import { SessionHost, type SessionRequest, type SessionResponse } from './session'

const scope = self as unknown as {
  postMessage(msg: SessionResponse, transfer?: Transferable[]): void
  onmessage: ((ev: MessageEvent<SessionRequest>) => void) | null
}

const host = new SessionHost((msg, transfer) => scope.postMessage(msg, transfer ?? []), { timeLimitMs: 0 })

scope.onmessage = ev => host.handle(ev.data)
scope.postMessage({ type: 'ready' })
