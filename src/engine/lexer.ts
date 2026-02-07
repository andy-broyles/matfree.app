// MatFree Engine - Lexer (Tokenizer)

import { Token, TokenType, KEYWORDS, makeToken } from './token'

export class LexerError extends Error {
  constructor(msg: string, public line: number, public col: number) {
    super(msg)
    this.name = 'LexerError'
  }
}

export class Lexer {
  private pos = 0
  private line = 1
  private col = 1
  private lastToken: Token

  constructor(private source: string) {
    this.lastToken = makeToken(TokenType.NEWLINE, '', 1, 1)
  }

  tokenize(): Token[] {
    const tokens: Token[] = []
    while (true) {
      const tok = this.nextToken()
      tokens.push(tok)
      if (tok.type === TokenType.EOF_TOKEN) break
    }
    return tokens
  }

  private current(): string { return this.pos < this.source.length ? this.source[this.pos] : '\0' }
  private peek(offset = 1): string { const i = this.pos + offset; return i < this.source.length ? this.source[i] : '\0' }
  private isAtEnd(): boolean { return this.pos >= this.source.length }

  private advance(): string {
    const c = this.current()
    this.pos++
    if (c === '\n') { this.line++; this.col = 1 } else { this.col++ }
    return c
  }

  private skipWhitespace(): void {
    while (!this.isAtEnd()) {
      const c = this.current()
      if (c === ' ' || c === '\t' || c === '\r') { this.advance() }
      else if (c === '.' && this.peek(1) === '.' && this.peek(2) === '.') {
        this.advance(); this.advance(); this.advance()
        while (!this.isAtEnd() && this.current() !== '\n') this.advance()
        if (!this.isAtEnd()) this.advance()
      } else break
    }
  }

  private mk(type: TokenType, lexeme: string): Token {
    const tok = makeToken(type, lexeme, this.line, this.col - lexeme.length)
    this.lastToken = tok
    return tok
  }

  private isTransposeContext(): boolean {
    const t = this.lastToken.type
    return t === TokenType.IDENTIFIER || t === TokenType.NUMBER ||
      t === TokenType.RPAREN || t === TokenType.RBRACKET || t === TokenType.RBRACE ||
      t === TokenType.TRANSPOSE || t === TokenType.DOT_TRANSPOSE ||
      t === TokenType.END || t === TokenType.TRUE_KW || t === TokenType.FALSE_KW
  }

  nextToken(): Token {
    this.skipWhitespace()
    if (this.isAtEnd()) return this.mk(TokenType.EOF_TOKEN, '')

    const c = this.current()

    // Newlines
    if (c === '\n') {
      this.advance()
      if (this.lastToken.type !== TokenType.NEWLINE &&
          this.lastToken.type !== TokenType.SEMICOLON &&
          this.lastToken.type !== TokenType.COMMA) {
        return this.mk(TokenType.NEWLINE, '\\n')
      }
      return this.nextToken()
    }

    // Comments
    if (c === '%') {
      if (this.peek(1) === '{') {
        this.advance(); this.advance()
        let depth = 1
        while (!this.isAtEnd() && depth > 0) {
          if (this.current() === '%' && this.peek(1) === '{') { depth++; this.advance(); this.advance() }
          else if (this.current() === '%' && this.peek(1) === '}') { depth--; this.advance(); this.advance() }
          else this.advance()
        }
        return this.nextToken()
      }
      while (!this.isAtEnd() && this.current() !== '\n') this.advance()
      if (this.lastToken.type !== TokenType.NEWLINE && this.lastToken.type !== TokenType.SEMICOLON) {
        return this.mk(TokenType.NEWLINE, '\\n')
      }
      return this.nextToken()
    }

    // Numbers
    if (/\d/.test(c) || (c === '.' && /\d/.test(this.peek(1)))) return this.scanNumber()

    // Strings
    if (c === '"') return this.scanString('"')
    if (c === "'") {
      if (this.isTransposeContext()) { this.advance(); return this.mk(TokenType.TRANSPOSE, "'") }
      return this.scanString("'")
    }

    // Identifiers/keywords
    if (/[a-zA-Z_]/.test(c)) return this.scanIdentifier()

    // Operators
    this.advance()
    switch (c) {
      case '+': return this.mk(TokenType.PLUS, '+')
      case '-': return this.mk(TokenType.MINUS, '-')
      case '*': return this.mk(TokenType.STAR, '*')
      case '/': return this.mk(TokenType.SLASH, '/')
      case '\\': return this.mk(TokenType.BACKSLASH, '\\')
      case '^': return this.mk(TokenType.CARET, '^')
      case '.':
        if (this.current() === '*') { this.advance(); return this.mk(TokenType.DOT_STAR, '.*') }
        if (this.current() === '/') { this.advance(); return this.mk(TokenType.DOT_SLASH, './') }
        if (this.current() === '\\') { this.advance(); return this.mk(TokenType.DOT_BACKSLASH, '.\\') }
        if (this.current() === '^') { this.advance(); return this.mk(TokenType.DOT_CARET, '.^') }
        if (this.current() === "'") { this.advance(); return this.mk(TokenType.DOT_TRANSPOSE, ".'") }
        return this.mk(TokenType.DOT, '.')
      case '=':
        if (this.current() === '=') { this.advance(); return this.mk(TokenType.EQ, '==') }
        return this.mk(TokenType.ASSIGN, '=')
      case '<':
        if (this.current() === '=') { this.advance(); return this.mk(TokenType.LE, '<=') }
        return this.mk(TokenType.LT, '<')
      case '>':
        if (this.current() === '=') { this.advance(); return this.mk(TokenType.GE, '>=') }
        return this.mk(TokenType.GT, '>')
      case '~':
        if (this.current() === '=') { this.advance(); return this.mk(TokenType.NE, '~=') }
        return this.mk(TokenType.NOT, '~')
      case '&':
        if (this.current() === '&') { this.advance(); return this.mk(TokenType.SHORT_AND, '&&') }
        return this.mk(TokenType.AND, '&')
      case '|':
        if (this.current() === '|') { this.advance(); return this.mk(TokenType.SHORT_OR, '||') }
        return this.mk(TokenType.OR, '|')
      case '(': return this.mk(TokenType.LPAREN, '(')
      case ')': return this.mk(TokenType.RPAREN, ')')
      case '[': return this.mk(TokenType.LBRACKET, '[')
      case ']': return this.mk(TokenType.RBRACKET, ']')
      case '{': return this.mk(TokenType.LBRACE, '{')
      case '}': return this.mk(TokenType.RBRACE, '}')
      case ',': return this.mk(TokenType.COMMA, ',')
      case ';': return this.mk(TokenType.SEMICOLON, ';')
      case ':': return this.mk(TokenType.COLON, ':')
      case '@': return this.mk(TokenType.AT, '@')
      default: throw new LexerError(`Unexpected character '${c}'`, this.line, this.col)
    }
  }

  private scanNumber(): Token {
    let num = ''
    const startCol = this.col
    while (!this.isAtEnd() && /\d/.test(this.current())) num += this.advance()
    if (!this.isAtEnd() && this.current() === '.' && this.peek(1) !== '.' &&
        !'*/\\^\''.includes(this.peek(1))) {
      num += this.advance()
      while (!this.isAtEnd() && /\d/.test(this.current())) num += this.advance()
    }
    if (!this.isAtEnd() && (this.current() === 'e' || this.current() === 'E')) {
      num += this.advance()
      if (!this.isAtEnd() && (this.current() === '+' || this.current() === '-')) num += this.advance()
      while (!this.isAtEnd() && /\d/.test(this.current())) num += this.advance()
    }
    let isComplex = false
    if (!this.isAtEnd() && (this.current() === 'i' || this.current() === 'j') &&
        !/[a-zA-Z0-9_]/.test(this.peek(1))) {
      num += this.advance()
      isComplex = true
    }
    const tok = makeToken(TokenType.NUMBER, num, this.line, startCol)
    if (isComplex) {
      tok.isComplex = true
      tok.imagValue = parseFloat(num.slice(0, -1))
    } else {
      tok.numValue = parseFloat(num)
    }
    this.lastToken = tok
    return tok
  }

  private scanString(delim: string): Token {
    this.advance() // skip opening
    let str = ''
    while (!this.isAtEnd()) {
      if (this.current() === delim) {
        if (this.peek(1) === delim) { str += delim; this.advance(); this.advance() }
        else { this.advance(); break }
      } else if (this.current() === '\n') {
        throw new LexerError('Unterminated string', this.line, this.col)
      } else { str += this.advance() }
    }
    const tok = makeToken(TokenType.STRING, str, this.line, this.col - str.length - 2)
    this.lastToken = tok
    return tok
  }

  private scanIdentifier(): Token {
    let id = ''
    const startCol = this.col
    while (!this.isAtEnd() && /[a-zA-Z0-9_]/.test(this.current())) id += this.advance()
    const type = KEYWORDS[id] ?? TokenType.IDENTIFIER
    const tok = makeToken(type, id, this.line, startCol)
    this.lastToken = tok
    return tok
  }
}
