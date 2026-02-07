// MatFree Engine - Recursive Descent Parser

import { Token, TokenType } from './token'
import { Expr, Stmt, Program } from './ast'

export class ParseError extends Error {
  constructor(msg: string, public line: number, public col: number) {
    super(msg); this.name = 'ParseError'
  }
}

export class Parser {
  private pos = 0
  constructor(private tokens: Token[]) {}

  parse(): Program {
    const program: Program = { statements: [], functions: [] }
    this.skipNL()
    while (!this.isEnd()) {
      if (this.check(TokenType.FUNCTION)) {
        const fn = this.parseFunctionDef()
        program.functions.push(fn as Extract<Stmt, { kind: 'functionDef' }>)
        program.statements.push(fn)
      } else {
        program.statements.push(this.parseStatement())
      }
      this.skipNL()
    }
    return program
  }

  private cur(): Token { return this.pos < this.tokens.length ? this.tokens[this.pos] : this.tokens[this.tokens.length - 1] }
  private peekTok(offset = 1): Token { const i = this.pos + offset; return i < this.tokens.length ? this.tokens[i] : this.tokens[this.tokens.length - 1] }
  private advance(): Token { const t = this.cur(); if (this.pos < this.tokens.length) this.pos++; return t }
  private check(t: TokenType): boolean { return this.cur().type === t }
  private match(t: TokenType): boolean { if (this.check(t)) { this.advance(); return true } return false }
  private expect(t: TokenType, msg: string): Token { if (this.check(t)) return this.advance(); this.error(msg) }
  private isEnd(): boolean { return this.cur().type === TokenType.EOF_TOKEN }
  private skipNL(): void { while (this.match(TokenType.NEWLINE)) {} }
  private error(msg: string): never { throw new ParseError(msg, this.cur().line, this.cur().col) }

  private stmtEnd(): void {
    if (this.check(TokenType.SEMICOLON) || this.check(TokenType.NEWLINE) ||
        this.check(TokenType.COMMA) || this.check(TokenType.EOF_TOKEN)) {
      if (!this.check(TokenType.EOF_TOKEN)) this.advance(); return
    }
    if ([TokenType.END, TokenType.ELSE, TokenType.ELSEIF, TokenType.CASE,
         TokenType.OTHERWISE, TokenType.CATCH].includes(this.cur().type)) return
  }

  private parseBlock(terminators: TokenType[]): Stmt[] {
    const stmts: Stmt[] = []; this.skipNL()
    while (!this.isEnd() && !terminators.includes(this.cur().type)) {
      stmts.push(this.parseStatement()); this.skipNL()
    }
    return stmts
  }

  private parseStatement(): Stmt {
    this.skipNL()
    switch (this.cur().type) {
      case TokenType.IF: return this.parseIf()
      case TokenType.FOR: return this.parseFor()
      case TokenType.WHILE: return this.parseWhile()
      case TokenType.SWITCH: return this.parseSwitch()
      case TokenType.TRY: return this.parseTryCatch()
      case TokenType.FUNCTION: return this.parseFunctionDef()
      case TokenType.GLOBAL: { this.advance(); const v: string[] = []; while (this.check(TokenType.IDENTIFIER)) v.push(this.advance().lexeme); this.stmtEnd(); return { kind: 'global', variables: v } }
      case TokenType.RETURN: { this.advance(); this.stmtEnd(); return { kind: 'return' } }
      case TokenType.BREAK: { this.advance(); this.stmtEnd(); return { kind: 'break' } }
      case TokenType.CONTINUE: { this.advance(); this.stmtEnd(); return { kind: 'continue' } }
      default: return this.parseExprStmt()
    }
  }

  private parseFunctionDef(): Stmt {
    this.expect(TokenType.FUNCTION, "Expected 'function'")
    let returns: string[] = [], name = '', params: string[] = []
    if (this.check(TokenType.LBRACKET)) {
      this.advance()
      while (!this.check(TokenType.RBRACKET) && !this.isEnd()) {
        returns.push(this.expect(TokenType.IDENTIFIER, 'Expected return var').lexeme)
        if (!this.check(TokenType.RBRACKET)) this.expect(TokenType.COMMA, "Expected ','")
      }
      this.expect(TokenType.RBRACKET, "Expected ']'")
      this.expect(TokenType.ASSIGN, "Expected '='")
      name = this.expect(TokenType.IDENTIFIER, 'Expected function name').lexeme
    } else {
      const first = this.expect(TokenType.IDENTIFIER, 'Expected function name').lexeme
      if (this.match(TokenType.ASSIGN)) { returns.push(first); name = this.expect(TokenType.IDENTIFIER, 'Expected function name').lexeme }
      else name = first
    }
    if (this.match(TokenType.LPAREN)) {
      while (!this.check(TokenType.RPAREN) && !this.isEnd()) {
        params.push(this.expect(TokenType.IDENTIFIER, 'Expected param').lexeme)
        if (!this.check(TokenType.RPAREN) && !this.match(TokenType.COMMA)) break
      }
      this.expect(TokenType.RPAREN, "Expected ')'")
    }
    this.stmtEnd()
    const body = this.parseBlock([TokenType.END])
    if (this.check(TokenType.END)) { this.advance(); if (this.check(TokenType.NEWLINE) || this.check(TokenType.SEMICOLON)) this.advance() }
    return { kind: 'functionDef', name, params, returns, body }
  }

  private parseIf(): Stmt {
    this.expect(TokenType.IF, "Expected 'if'")
    const branches: { condition: Expr | null; body: Stmt[] }[] = []
    let cond = this.parseExpression(); this.stmtEnd()
    branches.push({ condition: cond, body: this.parseBlock([TokenType.ELSEIF, TokenType.ELSE, TokenType.END]) })
    while (this.match(TokenType.ELSEIF)) {
      cond = this.parseExpression(); this.stmtEnd()
      branches.push({ condition: cond, body: this.parseBlock([TokenType.ELSEIF, TokenType.ELSE, TokenType.END]) })
    }
    if (this.match(TokenType.ELSE)) { this.stmtEnd(); branches.push({ condition: null, body: this.parseBlock([TokenType.END]) }) }
    this.expect(TokenType.END, "Expected 'end'"); this.stmtEnd()
    return { kind: 'if', branches }
  }

  private parseFor(): Stmt {
    this.expect(TokenType.FOR, "Expected 'for'")
    const variable = this.expect(TokenType.IDENTIFIER, 'Expected loop var').lexeme
    this.expect(TokenType.ASSIGN, "Expected '='")
    const range = this.parseExpression(); this.stmtEnd()
    const body = this.parseBlock([TokenType.END])
    this.expect(TokenType.END, "Expected 'end'"); this.stmtEnd()
    return { kind: 'for', variable, range, body }
  }

  private parseWhile(): Stmt {
    this.expect(TokenType.WHILE, "Expected 'while'")
    const condition = this.parseExpression(); this.stmtEnd()
    const body = this.parseBlock([TokenType.END])
    this.expect(TokenType.END, "Expected 'end'"); this.stmtEnd()
    return { kind: 'while', condition, body }
  }

  private parseSwitch(): Stmt {
    this.expect(TokenType.SWITCH, "Expected 'switch'")
    const expression = this.parseExpression(); this.stmtEnd(); this.skipNL()
    const cases: { value: Expr | null; body: Stmt[] }[] = []
    while (this.match(TokenType.CASE)) {
      const val = this.parseExpression(); this.stmtEnd()
      cases.push({ value: val, body: this.parseBlock([TokenType.CASE, TokenType.OTHERWISE, TokenType.END]) }); this.skipNL()
    }
    if (this.match(TokenType.OTHERWISE)) { this.stmtEnd(); cases.push({ value: null, body: this.parseBlock([TokenType.END]) }) }
    this.expect(TokenType.END, "Expected 'end'"); this.stmtEnd()
    return { kind: 'switch', expression, cases }
  }

  private parseTryCatch(): Stmt {
    this.expect(TokenType.TRY, "Expected 'try'"); this.stmtEnd()
    const tryBody = this.parseBlock([TokenType.CATCH, TokenType.END])
    let catchVar = '', catchBody: Stmt[] = []
    if (this.match(TokenType.CATCH)) {
      if (this.check(TokenType.IDENTIFIER)) catchVar = this.advance().lexeme
      this.stmtEnd(); catchBody = this.parseBlock([TokenType.END])
    }
    this.expect(TokenType.END, "Expected 'end'"); this.stmtEnd()
    return { kind: 'tryCatch', tryBody, catchVar, catchBody }
  }

  private parseExprStmt(): Stmt {
    // Check multi-assign [a,b] = ...
    if (this.check(TokenType.LBRACKET)) {
      const saved = this.pos; this.advance()
      const names: string[] = []; let ok = true
      while (!this.check(TokenType.RBRACKET) && !this.isEnd()) {
        if (this.check(TokenType.IDENTIFIER)) { names.push(this.advance().lexeme); if (!this.check(TokenType.RBRACKET)) this.match(TokenType.COMMA) }
        else if (this.match(TokenType.NOT)) { names.push('~'); this.match(TokenType.COMMA) }
        else { ok = false; break }
      }
      if (ok && this.check(TokenType.RBRACKET)) {
        this.advance()
        if (this.check(TokenType.ASSIGN)) {
          this.advance(); const value = this.parseExpression()
          const pr = !this.match(TokenType.SEMICOLON); if (this.check(TokenType.NEWLINE)) this.advance()
          return { kind: 'multiAssign', targets: names, value, printResult: pr }
        }
      }
      this.pos = saved
    }
    const expr = this.parseExpression()
    if (this.check(TokenType.ASSIGN)) {
      this.advance(); const value = this.parseExpression()
      const pr = !this.match(TokenType.SEMICOLON); if (this.check(TokenType.NEWLINE)) this.advance()
      return { kind: 'assign', target: expr, value, printResult: pr }
    }
    const pr = !this.match(TokenType.SEMICOLON); if (this.check(TokenType.NEWLINE)) this.advance()
    return { kind: 'expr', expression: expr, printResult: pr }
  }

  // Expression precedence chain
  private parseExpression(): Expr { return this.parseOr() }

  private parseOr(): Expr {
    let left = this.parseAnd()
    while (this.check(TokenType.SHORT_OR)) { this.advance(); left = { kind: 'binary', op: TokenType.SHORT_OR, left, right: this.parseAnd() } }
    return left
  }

  private parseAnd(): Expr {
    let left = this.parseBwOr()
    while (this.check(TokenType.SHORT_AND)) { this.advance(); left = { kind: 'binary', op: TokenType.SHORT_AND, left, right: this.parseBwOr() } }
    return left
  }

  private parseBwOr(): Expr {
    let left = this.parseBwAnd()
    while (this.check(TokenType.OR)) { this.advance(); left = { kind: 'binary', op: TokenType.OR, left, right: this.parseBwAnd() } }
    return left
  }

  private parseBwAnd(): Expr {
    let left = this.parseComp()
    while (this.check(TokenType.AND)) { this.advance(); left = { kind: 'binary', op: TokenType.AND, left, right: this.parseComp() } }
    return left
  }

  private parseComp(): Expr {
    let left = this.parseColon()
    while ([TokenType.EQ, TokenType.NE, TokenType.LT, TokenType.GT, TokenType.LE, TokenType.GE].includes(this.cur().type)) {
      const op = this.advance().type; left = { kind: 'binary', op, left, right: this.parseColon() }
    }
    return left
  }

  private parseColon(): Expr {
    const start = this.parseAddSub()
    if (this.check(TokenType.COLON)) {
      this.advance(); const second = this.parseAddSub()
      if (this.check(TokenType.COLON)) { this.advance(); return { kind: 'colon', start, step: second, stop: this.parseAddSub() } }
      return { kind: 'colon', start, step: null, stop: second }
    }
    return start
  }

  private parseAddSub(): Expr {
    let left = this.parseMulDiv()
    while ([TokenType.PLUS, TokenType.MINUS].includes(this.cur().type)) {
      const op = this.advance().type; left = { kind: 'binary', op, left, right: this.parseMulDiv() }
    }
    return left
  }

  private parseMulDiv(): Expr {
    let left = this.parseUnary()
    while ([TokenType.STAR, TokenType.SLASH, TokenType.BACKSLASH, TokenType.DOT_STAR, TokenType.DOT_SLASH, TokenType.DOT_BACKSLASH].includes(this.cur().type)) {
      const op = this.advance().type; left = { kind: 'binary', op, left, right: this.parseUnary() }
    }
    return left
  }

  private parseUnary(): Expr {
    if ([TokenType.MINUS, TokenType.PLUS, TokenType.NOT].includes(this.cur().type)) {
      const op = this.advance().type; return { kind: 'unary', op, operand: this.parseUnary(), postfix: false }
    }
    return this.parsePower()
  }

  private parsePower(): Expr {
    const base = this.parsePostfix()
    if ([TokenType.CARET, TokenType.DOT_CARET].includes(this.cur().type)) {
      const op = this.advance().type; return { kind: 'binary', op, left: base, right: this.parseUnary() }
    }
    return base
  }

  private parsePostfix(): Expr {
    let expr = this.parsePrimary()
    while (true) {
      if (this.check(TokenType.LPAREN)) {
        this.advance(); const args: Expr[] = []
        while (!this.check(TokenType.RPAREN) && !this.isEnd()) {
          if (this.check(TokenType.COLON)) { this.advance(); args.push({ kind: 'colon', start: null, step: null, stop: null }) }
          else args.push(this.parseExpression())
          if (!this.check(TokenType.RPAREN)) this.expect(TokenType.COMMA, "Expected ','")
        }
        this.expect(TokenType.RPAREN, "Expected ')'")
        expr = { kind: 'call', callee: expr, args }
      } else if (this.check(TokenType.LBRACE)) {
        this.advance(); const indices: Expr[] = []
        while (!this.check(TokenType.RBRACE) && !this.isEnd()) {
          indices.push(this.parseExpression())
          if (!this.check(TokenType.RBRACE)) this.expect(TokenType.COMMA, "Expected ','")
        }
        this.expect(TokenType.RBRACE, "Expected '}'")
        expr = { kind: 'cellIndex', object: expr, indices }
      } else if (this.check(TokenType.DOT) && this.peekTok().type === TokenType.IDENTIFIER) {
        this.advance(); expr = { kind: 'dot', object: expr, field: this.advance().lexeme }
      } else if (this.check(TokenType.TRANSPOSE)) {
        this.advance(); expr = { kind: 'unary', op: TokenType.TRANSPOSE, operand: expr, postfix: true }
      } else if (this.check(TokenType.DOT_TRANSPOSE)) {
        this.advance(); expr = { kind: 'unary', op: TokenType.DOT_TRANSPOSE, operand: expr, postfix: true }
      } else break
    }
    return expr
  }

  private parsePrimary(): Expr {
    if (this.check(TokenType.NUMBER)) {
      const t = this.advance(); return { kind: 'number', value: t.numValue, imagValue: t.imagValue, isComplex: t.isComplex }
    }
    if (this.check(TokenType.STRING)) return { kind: 'string', value: this.advance().lexeme }
    if (this.check(TokenType.TRUE_KW)) { this.advance(); return { kind: 'bool', value: true } }
    if (this.check(TokenType.FALSE_KW)) { this.advance(); return { kind: 'bool', value: false } }
    if (this.check(TokenType.END)) { this.advance(); return { kind: 'end' } }
    if (this.check(TokenType.IDENTIFIER)) return { kind: 'identifier', name: this.advance().lexeme }
    if (this.match(TokenType.LPAREN)) { const e = this.parseExpression(); this.expect(TokenType.RPAREN, "Expected ')'"); return e }
    if (this.check(TokenType.LBRACKET)) return this.parseMatrixLiteral()
    if (this.check(TokenType.LBRACE)) return this.parseCellLiteral()
    if (this.check(TokenType.AT)) {
      this.advance()
      if (this.check(TokenType.LPAREN)) {
        this.advance(); const params: string[] = []
        while (!this.check(TokenType.RPAREN) && !this.isEnd()) {
          params.push(this.expect(TokenType.IDENTIFIER, 'Expected param').lexeme)
          if (!this.check(TokenType.RPAREN)) this.expect(TokenType.COMMA, "','")
        }
        this.expect(TokenType.RPAREN, "')'"); return { kind: 'anonFunc', params, body: this.parseExpression() }
      }
      if (this.check(TokenType.IDENTIFIER)) return { kind: 'funcHandle', name: this.advance().lexeme }
      this.error("Expected function name or '(' after '@'")
    }
    this.error(`Unexpected token '${this.cur().lexeme}'`)
  }

  private parseMatrixLiteral(): Expr {
    this.expect(TokenType.LBRACKET, "'['")
    if (this.check(TokenType.RBRACKET)) { this.advance(); return { kind: 'matrix', rows: [] } }
    const rows: Expr[][] = []; let row: Expr[] = []
    while (!this.check(TokenType.RBRACKET) && !this.isEnd()) {
      if (this.check(TokenType.SEMICOLON) || this.check(TokenType.NEWLINE)) {
        if (row.length) { rows.push(row); row = [] }; this.advance(); this.skipNL(); continue
      }
      row.push(this.parseExpression()); this.match(TokenType.COMMA)
    }
    if (row.length) rows.push(row)
    this.expect(TokenType.RBRACKET, "']'")
    return { kind: 'matrix', rows }
  }

  private parseCellLiteral(): Expr {
    this.expect(TokenType.LBRACE, "'{'")
    if (this.check(TokenType.RBRACE)) { this.advance(); return { kind: 'cellArray', rows: [] } }
    const rows: Expr[][] = []; let row: Expr[] = []
    while (!this.check(TokenType.RBRACE) && !this.isEnd()) {
      if (this.check(TokenType.SEMICOLON) || this.check(TokenType.NEWLINE)) {
        if (row.length) { rows.push(row); row = [] }; this.advance(); this.skipNL(); continue
      }
      row.push(this.parseExpression()); this.match(TokenType.COMMA)
    }
    if (row.length) rows.push(row)
    this.expect(TokenType.RBRACE, "'}'")
    return { kind: 'cellArray', rows }
  }
}
