// MatFree Engine - Public API
export { Interpreter } from './interpreter'
export { Lexer, LexerError } from './lexer'
export { Parser, ParseError } from './parser'
export { Value, Matrix, RuntimeError } from './value'
export { Environment } from './environment'
export type { OutputCallback } from './interpreter'
export type { PlotFigure, PlotSeries, PlotCallback } from './plot'
export { createFigure, PALETTE } from './plot'
