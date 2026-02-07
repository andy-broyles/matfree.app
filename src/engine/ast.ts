// MatFree Engine - AST Node Definitions

import { TokenType } from './token'

// Expression nodes
export type Expr =
  | { kind: 'number'; value: number; imagValue: number; isComplex: boolean }
  | { kind: 'string'; value: string }
  | { kind: 'bool'; value: boolean }
  | { kind: 'identifier'; name: string }
  | { kind: 'unary'; op: TokenType; operand: Expr; postfix: boolean }
  | { kind: 'binary'; op: TokenType; left: Expr; right: Expr }
  | { kind: 'matrix'; rows: Expr[][] }
  | { kind: 'cellArray'; rows: Expr[][] }
  | { kind: 'call'; callee: Expr; args: Expr[] }
  | { kind: 'cellIndex'; object: Expr; indices: Expr[] }
  | { kind: 'dot'; object: Expr; field: string }
  | { kind: 'colon'; start: Expr | null; step: Expr | null; stop: Expr | null }
  | { kind: 'end' }
  | { kind: 'anonFunc'; params: string[]; body: Expr }
  | { kind: 'funcHandle'; name: string }

// Statement nodes
export type Stmt =
  | { kind: 'expr'; expression: Expr; printResult: boolean }
  | { kind: 'assign'; target: Expr; value: Expr; printResult: boolean }
  | { kind: 'multiAssign'; targets: string[]; value: Expr; printResult: boolean }
  | { kind: 'if'; branches: { condition: Expr | null; body: Stmt[] }[] }
  | { kind: 'for'; variable: string; range: Expr; body: Stmt[] }
  | { kind: 'while'; condition: Expr; body: Stmt[] }
  | { kind: 'switch'; expression: Expr; cases: { value: Expr | null; body: Stmt[] }[] }
  | { kind: 'tryCatch'; tryBody: Stmt[]; catchVar: string; catchBody: Stmt[] }
  | { kind: 'return' }
  | { kind: 'break' }
  | { kind: 'continue' }
  | { kind: 'global'; variables: string[] }
  | { kind: 'functionDef'; name: string; params: string[]; returns: string[]; body: Stmt[] }

export interface Program {
  statements: Stmt[]
  functions: Extract<Stmt, { kind: 'functionDef' }>[]
}
