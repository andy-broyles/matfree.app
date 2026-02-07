// MatFree Engine - Token definitions

export enum TokenType {
  NUMBER, STRING, IDENTIFIER,
  // Keywords
  IF, ELSEIF, ELSE, END, FOR, WHILE,
  SWITCH, CASE, OTHERWISE, TRY, CATCH,
  FUNCTION, RETURN, BREAK, CONTINUE,
  GLOBAL, PERSISTENT, TRUE_KW, FALSE_KW,
  // Arithmetic
  PLUS, MINUS, STAR, SLASH, BACKSLASH, CARET,
  DOT_STAR, DOT_SLASH, DOT_BACKSLASH, DOT_CARET,
  TRANSPOSE, DOT_TRANSPOSE,
  // Comparison
  EQ, NE, LT, GT, LE, GE,
  // Logical
  AND, OR, SHORT_AND, SHORT_OR, NOT,
  // Assignment
  ASSIGN,
  // Punctuation
  LPAREN, RPAREN, LBRACKET, RBRACKET, LBRACE, RBRACE,
  COMMA, SEMICOLON, COLON, DOT, AT,
  // Special
  NEWLINE, ELLIPSIS, EOF_TOKEN,
}

export interface Token {
  type: TokenType
  lexeme: string
  numValue: number
  imagValue: number
  isComplex: boolean
  line: number
  col: number
}

export function makeToken(type: TokenType, lexeme: string, line: number, col: number): Token {
  return { type, lexeme, numValue: 0, imagValue: 0, isComplex: false, line, col }
}

const KEYWORDS: Record<string, TokenType> = {
  if: TokenType.IF, elseif: TokenType.ELSEIF, else: TokenType.ELSE,
  end: TokenType.END, for: TokenType.FOR, while: TokenType.WHILE,
  switch: TokenType.SWITCH, case: TokenType.CASE, otherwise: TokenType.OTHERWISE,
  try: TokenType.TRY, catch: TokenType.CATCH,
  function: TokenType.FUNCTION, return: TokenType.RETURN,
  break: TokenType.BREAK, continue: TokenType.CONTINUE,
  global: TokenType.GLOBAL, persistent: TokenType.PERSISTENT,
  true: TokenType.TRUE_KW, false: TokenType.FALSE_KW,
}

export { KEYWORDS }
