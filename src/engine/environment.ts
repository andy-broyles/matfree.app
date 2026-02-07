// MatFree Engine - Variable Scope / Environment

import { Value } from './value'

export class Environment {
  private variables: Map<string, Value> = new Map()
  private globals: Set<string> = new Set()
  private parent: Environment | null
  private globalEnv: Environment

  private constructor(parent: Environment | null, globalEnv?: Environment) {
    this.parent = parent
    this.globalEnv = globalEnv ?? this
  }

  static createGlobal(): Environment { return new Environment(null) }

  createChild(): Environment { return new Environment(this, this.globalEnv) }

  get(name: string): Value | undefined {
    if (this.globals.has(name)) return this.globalEnv.variables.get(name)
    const v = this.variables.get(name)
    if (v !== undefined) return v
    if (this.parent) return this.parent.get(name)
    return undefined
  }

  set(name: string, value: Value): void {
    if (this.globals.has(name)) { this.globalEnv.variables.set(name, value); return }
    this.variables.set(name, value)
  }

  has(name: string): boolean {
    if (this.globals.has(name)) return this.globalEnv.variables.has(name)
    if (this.variables.has(name)) return true
    if (this.parent) return this.parent.has(name)
    return false
  }

  declareGlobal(name: string): void { this.globals.add(name) }

  getLocal(name: string): Value | undefined { return this.variables.get(name) }
  setLocal(name: string, value: Value): void { this.variables.set(name, value) }

  clear(): void { this.variables.clear() }

  variableNames(): string[] { return [...this.variables.keys()] }
}
