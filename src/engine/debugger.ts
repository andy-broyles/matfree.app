// MatFree Engine - Step Debugger
// Breakpoints, step-over, step-into, variable inspection

import type { Stmt } from './ast'
import type { Environment } from './environment'

export type DebugAction = 'continue' | 'stepOver' | 'stepInto' | 'stepOut' | 'stop'
export type DebugState = 'running' | 'paused' | 'stopped'

export interface BreakpointInfo {
  line: number
  enabled: boolean
}

export interface DebugSnapshot {
  line: number
  state: DebugState
  variables: { name: string; value: string; type: string }[]
  callStack: string[]
}

type DebugCallback = (snapshot: DebugSnapshot) => void
type WaitFn = () => Promise<DebugAction>

export class Debugger {
  private breakpoints: Map<number, BreakpointInfo> = new Map()
  private state: DebugState = 'stopped'
  private stepMode: 'none' | 'over' | 'into' | 'out' = 'none'
  private callDepth = 0
  private stepDepth = 0
  private currentLine = 0
  private callStack: string[] = ['<main>']
  private onSnapshot: DebugCallback | null = null
  private waitForAction: WaitFn | null = null
  private pendingAction: DebugAction | null = null
  private actionResolver: ((action: DebugAction) => void) | null = null

  setSnapshotCallback(cb: DebugCallback) { this.onSnapshot = cb }
  setWaitFunction(fn: WaitFn) { this.waitForAction = fn }

  addBreakpoint(line: number) { this.breakpoints.set(line, { line, enabled: true }) }
  removeBreakpoint(line: number) { this.breakpoints.delete(line) }
  toggleBreakpoint(line: number) {
    const bp = this.breakpoints.get(line)
    if (bp) bp.enabled = !bp.enabled
    else this.addBreakpoint(line)
  }
  getBreakpoints(): BreakpointInfo[] { return [...this.breakpoints.values()] }
  clearBreakpoints() { this.breakpoints.clear() }

  getState(): DebugState { return this.state }

  start() { this.state = 'running'; this.callDepth = 0; this.callStack = ['<main>'] }
  stop() { this.state = 'stopped'; this.stepMode = 'none'; if (this.actionResolver) { this.actionResolver('stop'); this.actionResolver = null } }

  resume(action: DebugAction) {
    if (this.actionResolver) { this.actionResolver(action); this.actionResolver = null }
  }

  pushCall(name: string) { this.callStack.push(name); this.callDepth++ }
  popCall() { if (this.callStack.length > 1) this.callStack.pop(); this.callDepth = Math.max(0, this.callDepth - 1) }

  async checkBreakpoint(line: number, env: Environment): Promise<boolean> {
    if (this.state === 'stopped') return false
    this.currentLine = line

    let shouldPause = false

    // Check breakpoints
    const bp = this.breakpoints.get(line)
    if (bp && bp.enabled) shouldPause = true

    // Check step mode
    if (this.stepMode === 'over' && this.callDepth <= this.stepDepth) shouldPause = true
    if (this.stepMode === 'into') shouldPause = true
    if (this.stepMode === 'out' && this.callDepth < this.stepDepth) shouldPause = true

    if (shouldPause && (this.state as string) !== 'stopped') {
      this.state = 'paused'
      const snapshot = this.createSnapshot(env)
      if (this.onSnapshot) this.onSnapshot(snapshot)

      // Wait for user action
      if (this.waitForAction) {
        const action = await this.waitForAction()
        return this.handleAction(action)
      }
    }

    return (this.state as string) !== 'stopped'
  }

  // Synchronous version for simpler integration
  shouldPause(line: number): boolean {
    if (this.state === 'stopped') return false
    this.currentLine = line
    const bp = this.breakpoints.get(line)
    if (bp && bp.enabled) return true
    if (this.stepMode === 'over' && this.callDepth <= this.stepDepth) return true
    if (this.stepMode === 'into') return true
    if (this.stepMode === 'out' && this.callDepth < this.stepDepth) return true
    return false
  }

  createSnapshot(env: Environment): DebugSnapshot {
    const variables: { name: string; value: string; type: string }[] = []
    const names = env.variableNames()
    for (const name of names) {
      const v = env.get(name)
      if (v) {
        try {
          variables.push({ name, value: v.display().slice(0, 100), type: v.type })
        } catch {
          variables.push({ name, value: '?', type: 'unknown' })
        }
      }
    }
    return {
      line: this.currentLine,
      state: this.state,
      variables,
      callStack: [...this.callStack],
    }
  }

  private handleAction(action: DebugAction): boolean {
    switch (action) {
      case 'continue': this.state = 'running'; this.stepMode = 'none'; return true
      case 'stepOver': this.state = 'running'; this.stepMode = 'over'; this.stepDepth = this.callDepth; return true
      case 'stepInto': this.state = 'running'; this.stepMode = 'into'; return true
      case 'stepOut': this.state = 'running'; this.stepMode = 'out'; this.stepDepth = this.callDepth; return true
      case 'stop': this.state = 'stopped'; return false
    }
  }
}
