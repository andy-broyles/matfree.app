# MatFree Architecture

## Overview

MatFree is a free, open-source scientific computing environment. It provides a numerical computing language with matrix operations, functions, control flow, and a growing standard library.

The web version runs entirely in the browser using a TypeScript engine. A native C++ engine is also available for CLI usage.

## Architecture Diagram

```
                    ┌─────────────────────────────────┐
                    │         Web Interface            │
                    │  (Next.js / React / Vercel)      │
                    └──────────────┬──────────────────┘
                                   │
                    ┌──────────────▼──────────────────┐
                    │      TypeScript Engine            │
                    │  Lexer → Parser → Interpreter    │
                    └──────────────┬──────────────────┘
                                   │
          ┌────────────────────────┼────────────────────────┐
          │                        │                        │
  ┌───────▼───────┐    ┌──────────▼──────────┐   ┌────────▼────────┐
  │  Value System  │    │  Built-in Functions  │   │   Environment   │
  │ Matrix, String │    │  100+ functions      │   │  Scope/Vars     │
  │ Cell, Struct   │    │  Math, LA, Stats     │   │  Global/Local   │
  └───────────────┘    └─────────────────────┘   └─────────────────┘
```

## Components

### Lexer (`src/engine/lexer.ts`)
Tokenizes source code into tokens: numbers, strings, identifiers, keywords, operators, punctuation.

### Parser (`src/engine/parser.ts`)
Recursive descent parser that builds an AST from tokens. Handles operator precedence, matrix literals, function definitions, and all control flow constructs.

### AST (`src/engine/ast.ts`)
Defines expression and statement node types using TypeScript discriminated unions.

### Interpreter (`src/engine/interpreter.ts`)
Tree-walking interpreter that executes the AST. Handles variable assignment, function calls, control flow, error handling, and output.

### Value System (`src/engine/value.ts`)
Runtime value types: Matrix (dense 2D), String, CellArray, Struct, FunctionHandle. Includes full matrix arithmetic with broadcasting.

### Built-in Functions (`src/engine/builtins.ts`)
100+ built-in functions covering math, linear algebra, statistics, string operations, I/O, and more.

### Environment (`src/engine/environment.ts`)
Lexical scoping with global/local variable management.

## Technology Stack

- **Web**: Next.js 15, React 19, TypeScript
- **Native**: C++17, CMake
- **Deployment**: Vercel (static export)
- **License**: MIT
