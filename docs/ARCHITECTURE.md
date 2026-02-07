# MatFree Architecture

## Overview

MatFree is an open-source MATLAB-compatible computing environment built from scratch.
It aims to provide a drop-in replacement for MATLAB with full syntax and semantic
compatibility.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        MatFree IDE / REPL                       │
│  ┌──────────┐  ┌──────────────┐  ┌────────────┐  ┌──────────┐ │
│  │ Command   │  │ Variable     │  │ File       │  │ Help     │ │
│  │ Window    │  │ Editor       │  │ Browser    │  │ Browser  │ │
│  └──────────┘  └──────────────┘  └────────────┘  └──────────┘ │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│                     Python Bindings (pybind11)                   │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│                      Core Engine (C++)                           │
│                                                                  │
│  ┌────────────┐    ┌────────────┐    ┌────────────────────────┐ │
│  │   Lexer    │───▶│   Parser   │───▶│   AST (Abstract        │ │
│  │ (Tokenizer)│    │ (Recursive │    │   Syntax Tree)         │ │
│  │            │    │  Descent)  │    │                        │ │
│  └────────────┘    └────────────┘    └───────────┬────────────┘ │
│                                                   │              │
│  ┌────────────────────────────────────────────────▼────────────┐ │
│  │                    Interpreter                              │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │ │
│  │  │ Tree Walker  │  │ JIT Compiler │  │ Debugger         │  │ │
│  │  │              │  │ (LLVM, future│  │ (breakpoints,    │  │ │
│  │  │              │  │  phase)      │  │  step-through)   │  │ │
│  │  └──────────────┘  └──────────────┘  └──────────────────┘  │ │
│  └────────────────────────────┬────────────────────────────────┘ │
│                               │                                  │
│  ┌────────────────────────────▼────────────────────────────────┐ │
│  │                   Runtime Environment                       │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐ │ │
│  │  │ Value    │  │ Environ- │  │ Function │  │ Class      │ │ │
│  │  │ System   │  │ ment/    │  │ Registry │  │ System     │ │ │
│  │  │ (Matrix, │  │ Scopes   │  │          │  │ (OOP)      │ │ │
│  │  │  Cell,   │  │          │  │          │  │            │ │ │
│  │  │  Struct) │  │          │  │          │  │            │ │ │
│  │  └──────────┘  └──────────┘  └──────────┘  └────────────┘ │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                   Matrix Engine                             │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │ │
│  │  │ Eigen/BLAS   │  │ Sparse       │  │ GPU Compute      │  │ │
│  │  │ Backend      │  │ Matrices     │  │ (CUDA/OpenCL)    │  │ │
│  │  └──────────────┘  └──────────────┘  └──────────────────┘  │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                   Built-in Functions                        │ │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌──────────┐ │ │
│  │  │ Math   │ │ LinAlg │ │ Stats  │ │ Signal │ │ Image    │ │ │
│  │  │        │ │        │ │        │ │ Proc   │ │ Proc     │ │ │
│  │  └────────┘ └────────┘ └────────┘ └────────┘ └──────────┘ │ │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌──────────┐ │ │
│  │  │ I/O    │ │ String │ │ Control│ │ Optim  │ │ Symbolic │ │ │
│  │  │        │ │        │ │ System │ │        │ │ (SymPy)  │ │ │
│  │  └────────┘ └────────┘ └────────┘ └────────┘ └──────────┘ │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                   Plotting Engine                           │ │
│  │  ┌──────────────────┐  ┌──────────────────────────────────┐ │ │
│  │  │ Matplotlib       │  │ Interactive Viewer (Qt/ImGui)    │ │ │
│  │  │ Backend (Python) │  │ (zoom, pan, data cursor)         │ │ │
│  │  └──────────────────┘  └──────────────────────────────────┘ │ │
│  └─────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

## Component Descriptions

### 1. Lexer (Tokenizer)
- Converts MATLAB source text into a stream of tokens
- Handles: numbers (int, float, complex), strings ('...' and "..."),
  identifiers, keywords, operators (+, -, *, .*, etc.), punctuation,
  comments (%, %{ %}), line continuations (...)
- MATLAB-specific: transpose operator (') vs string delimiter,
  command syntax detection

### 2. Parser (Recursive Descent)
- Consumes token stream, produces Abstract Syntax Tree (AST)
- Handles full MATLAB grammar: expressions, statements, functions,
  classes, control flow, matrix literals, cell arrays, indexing
- Operator precedence: unary > power > mul/div > add/sub > comparison > logical
- Disambiguates function calls vs array indexing contextually

### 3. AST (Abstract Syntax Tree)
- Node types for every MATLAB construct
- Uses std::variant for type-safe node storage
- Supports visitor pattern for traversal

### 4. Interpreter
- Tree-walking interpreter for initial implementation
- Future: JIT compilation via LLVM for performance
- Handles: variable assignment, function dispatch, control flow,
  error handling (try-catch), OOP method dispatch

### 5. Value System
- Core types: double, complex, logical, char, string
- Container types: Matrix (dense), Sparse Matrix, Cell Array, Struct, Table
- All numeric operations default to double precision (MATLAB behavior)
- Copy-on-write semantics for efficiency
- MATLAB-compatible type promotion rules

### 6. Matrix Engine
- Dense matrices via Eigen (BLAS/LAPACK optimized)
- Sparse matrices via Eigen::SparseMatrix
- N-dimensional arrays via custom NDArray class
- GPU acceleration via CUDA/OpenCL (future phase)
- All standard decompositions: LU, QR, SVD, Cholesky, Eigendecomposition

### 7. Environment / Scope Management
- Global workspace (base workspace)
- Function workspaces (local scope per function call)
- Nested function scopes
- Persistent and global variable support
- Path management (addpath, rmpath, etc.)

### 8. Built-in Function Registry
- Hash map from function name to implementation
- Supports overloading by argument count/type
- Categories: math, linalg, statistics, strings, I/O, plotting, etc.
- Extensible: toolboxes register their functions at startup

### 9. Plotting Engine
- Python/Matplotlib backend for 2D/3D plots
- Supports: plot, scatter, bar, histogram, surf, mesh, contour, image
- Figure/axes management, legends, colorbars, annotations
- Export to PNG, SVG, PDF, EPS
- Future: native Qt/ImGui viewer for interactive use

## Directory Structure

```
MatFree/
├── CMakeLists.txt              # Root build configuration
├── LICENSE                     # MIT license
├── README.md                   # Build and usage instructions
├── docs/
│   └── ARCHITECTURE.md         # This file
├── src/
│   ├── CMakeLists.txt          # Source build config
│   ├── main.cpp                # Entry point (REPL or file execution)
│   ├── core/
│   │   ├── token.h             # Token types and Token struct
│   │   ├── lexer.h             # Lexer interface
│   │   ├── lexer.cpp           # Lexer implementation
│   │   ├── ast.h               # AST node definitions
│   │   ├── parser.h            # Parser interface
│   │   ├── parser.cpp          # Parser implementation
│   │   ├── value.h             # Runtime value type
│   │   ├── value.cpp           # Value operations
│   │   ├── environment.h       # Scope/environment management
│   │   ├── interpreter.h       # Interpreter interface
│   │   ├── interpreter.cpp     # Interpreter implementation
│   │   ├── builtins.h          # Built-in function registry
│   │   └── builtins.cpp        # Built-in function implementations
│   └── repl/
│       ├── repl.h              # REPL interface
│       └── repl.cpp            # REPL implementation
├── python/
│   ├── setup.py                # Python package setup
│   ├── matfree/
│   │   ├── __init__.py         # Python package init
│   │   └── bindings.cpp        # pybind11 bindings
│   └── CMakeLists.txt          # Python bindings build
├── tests/
│   ├── test_lexer.cpp          # Lexer unit tests
│   ├── test_parser.cpp         # Parser unit tests
│   ├── test_interpreter.cpp    # Interpreter integration tests
│   └── matlab/                 # .m test scripts
│       ├── test_basic.m
│       ├── test_matrix.m
│       ├── test_control_flow.m
│       └── test_functions.m
└── examples/
    ├── hello.m                 # Hello world
    ├── fibonacci.m             # Fibonacci sequence
    ├── plot_sine.m             # Plot sine wave
    └── solve_ode.m             # Solve ODE with ode45
```

## Technology Stack

| Component         | Technology              | Rationale                           |
|-------------------|-------------------------|-------------------------------------|
| Core Engine       | C++17                   | Performance, memory control         |
| Matrix Backend    | Eigen 3.4+              | Mature, header-only, BLAS/LAPACK    |
| Build System      | CMake 3.20+             | Cross-platform, industry standard   |
| Python Bindings   | pybind11                | Seamless C++/Python interop         |
| Plotting          | Matplotlib (via Python) | Feature-rich, MATLAB-like API       |
| Symbolic Math     | SymPy (via Python)      | Mature CAS, MIT-licensed            |
| Image Processing  | OpenCV                  | Industry standard, comprehensive    |
| Signal Processing | libsndfile, FFTW        | Fast FFT, audio I/O                 |
| GUI               | Qt6 or Dear ImGui       | Cross-platform, rich widgets        |
| JIT (future)      | LLVM                    | Industry standard JIT framework     |
| Testing           | Google Test             | C++ testing framework               |
| Sparse Matrices   | Eigen::Sparse + SuiteSparse | Optimized sparse operations    |

## Milestone Roadmap

### Phase 1: Core Engine (Current)
- [x] Lexer / Tokenizer
- [x] Parser / AST
- [x] Tree-walking interpreter
- [x] Value system (double, matrix, string, cell, struct)
- [x] Basic built-in functions (math, linalg, I/O)
- [x] REPL with command history
- [x] .m file execution

### Phase 2: Language Completeness
- [ ] Full OOP support (classdef, handle classes)
- [ ] Anonymous functions and closures
- [ ] Error handling (try-catch-finally)
- [ ] Nested functions
- [ ] Variable arguments (varargin, varargout, nargin, nargout)
- [ ] String arrays vs char arrays
- [ ] Regular expressions

### Phase 3: Toolboxes
- [ ] Signal Processing (FFT, filters, spectral analysis)
- [ ] Image Processing (via OpenCV)
- [ ] Statistics & Machine Learning
- [ ] Optimization
- [ ] Control Systems
- [ ] Symbolic Math (via SymPy)
- [ ] Curve Fitting

### Phase 4: Plotting & GUI
- [ ] Full 2D/3D plotting via Matplotlib
- [ ] Interactive figure windows
- [ ] App Designer equivalent
- [ ] Export to multiple formats

### Phase 5: Performance & Advanced
- [ ] JIT compilation (LLVM)
- [ ] GPU computing (CUDA/OpenCL)
- [ ] Parallel computing (parfor, spmd)
- [ ] MEX interface
- [ ] Simulink-equivalent block diagram editor

### Phase 6: Polish & Ecosystem
- [ ] Full documentation / help system
- [ ] Package manager for toolboxes
- [ ] Live editor (notebook interface)
- [ ] Profiler and code analyzer
- [ ] .mat file I/O (HDF5)
