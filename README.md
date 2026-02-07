# MatFree

**Open-Source MATLAB-Compatible Computing Environment**

MatFree is a free, open-source drop-in replacement for MATLAB, built from scratch using modern C++17. It aims to provide full compatibility with MATLAB syntax, semantics, and performance for scientific computing, engineering, and education.

## Features (v0.1.0 - Foundation Release)

### Core Language
- Full MATLAB expression parser (recursive descent)
- Variables, scalars, matrices, strings, cell arrays, structs
- Operators: arithmetic (`+ - * / ^ .* ./ .^`), comparison (`== ~= < > <= >=`), logical (`& | && || ~`)
- Matrix transpose (`'` and `.'`)
- Colon expressions (`1:10`, `0:0.1:2*pi`)
- Control flow: `if/elseif/else/end`, `for/end`, `while/end`, `switch/case/otherwise/end`
- Error handling: `try/catch/end`
- User-defined functions with multiple return values
- Anonymous functions: `@(x) x^2`
- Function handles: `@sin`
- `.m` file execution and function auto-discovery

### Matrix Engine
- 2D dense matrices with broadcasting
- Matrix multiplication, element-wise operations
- Concatenation (horizontal and vertical)
- Indexing (linear, 2D, colon)
- Reshape, transpose, diagonal extraction/creation
- Random matrix generation (`rand`, `randn`)

### Built-in Functions (100+)
- **Math**: `sin cos tan asin acos atan exp log sqrt abs floor ceil round sign`
- **Matrix**: `zeros ones eye rand randn linspace logspace size length numel reshape diag repmat sort find`
- **Linear Algebra**: `det inv trace rank norm dot cross`
- **Statistics**: `mean std var median sum prod cumsum cov corrcoef`
- **Strings**: `num2str str2num strcmp strcat strsplit upper lower strtrim sprintf`
- **I/O**: `disp fprintf input error warning`
- **Types**: `class isa isnumeric ischar islogical isstruct iscell isnan isinf isfinite`
- **Utility**: `tic toc whos who clear exist clock`

### Interactive REPL
- Command-line interface with prompt (`>>`)
- Line continuation with `...`
- Automatic result display (suppressed with `;`)
- Command history
- Error messages with line/column information

## Quick Start

### Prerequisites

- **C++ Compiler**: GCC 9+, Clang 10+, or MSVC 2019+ (C++17 support required)
- **CMake**: Version 3.16 or later
- **Python** (optional): 3.8+ for Python bindings

### Build from Source

```bash
# Clone the repository
git clone https://github.com/matfree/matfree.git
cd matfree

# Create build directory
mkdir build && cd build

# Configure (basic build)
cmake ..

# Build
cmake --build . --config Release

# Run tests
ctest --output-on-failure

# Install (optional)
cmake --install . --prefix /usr/local
```

### Windows (Visual Studio)

```powershell
mkdir build
cd build
cmake .. -G "Visual Studio 17 2022"
cmake --build . --config Release
```

### Build Options

| Option | Default | Description |
|--------|---------|-------------|
| `MATFREE_BUILD_TESTS` | ON | Build unit tests |
| `MATFREE_BUILD_PYTHON` | OFF | Build Python bindings (requires pybind11) |
| `MATFREE_USE_EIGEN` | OFF | Use Eigen library for optimized linear algebra |

### Python Package

```bash
cd python
pip install -e .
```

## Usage

### Interactive REPL

```bash
./matfree
```

```matlab
>> x = [1 2 3; 4 5 6]
x =
       1     2     3
       4     5     6

>> det([1 2; 3 4])
ans =
   -2

>> y = sin(pi/4)
y =
   0.7071

>> for i = 1:5, fprintf('%d^2 = %d\n', i, i^2), end
1^2 = 1
2^2 = 4
3^2 = 9
4^2 = 16
5^2 = 25
```

### Execute a Script

```bash
./matfree examples/matrix_demo.m
```

### Execute Inline Code

```bash
./matfree -e "disp('Hello from MatFree!'); x = inv([1 2; 3 4]); disp(x)"
```

### From Python

```python
import matfree

# Execute MATLAB code
output = matfree.eval("x = [1 2 3; 4 5 6]; disp(x)")
print(output)

# Run a .m file
matfree.run_file("examples/fibonacci.m")
```

## Architecture

MatFree is built as a layered system:

```
Source Code (.m) → Lexer → Tokens → Parser → AST → Interpreter → Output
                                                         ↓
                                              Built-in Functions
                                              Matrix Engine
                                              Environment/Scopes
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full architecture documentation.

## Project Status & Roadmap

### Phase 1: Core Engine ✅ (Current)
- Lexer, Parser, AST, Interpreter
- Matrix operations, built-in functions
- REPL, .m file execution

### Phase 2: Language Completeness (Next)
- Full OOP (classdef, handle classes, inheritance)
- Variable arguments (varargin, varargout)
- Regular expressions
- String arrays

### Phase 3: Toolboxes
- Signal Processing (FFT, filters)
- Image Processing (via OpenCV)
- Statistics & Machine Learning
- Optimization
- Symbolic Math (via SymPy)

### Phase 4: Plotting & GUI
- Matplotlib-based 2D/3D plotting
- Interactive figure windows
- App Designer equivalent

### Phase 5: Performance
- JIT compilation (LLVM)
- GPU computing (CUDA/OpenCL)
- Parallel computing (parfor)

## Contributing

MatFree is open source and welcomes contributions! Areas where help is most needed:

1. **Toolbox implementations** - Each MATLAB toolbox needs an equivalent
2. **Parser improvements** - More complete MATLAB syntax support
3. **Performance** - BLAS/LAPACK integration, JIT compilation
4. **Testing** - More test cases, MATLAB equivalence testing
5. **Documentation** - Help text for built-in functions

## License

MIT License - see [LICENSE](LICENSE) for details.

## Acknowledgments

MatFree builds on the shoulders of giants:
- **Eigen** - High-performance linear algebra
- **pybind11** - Seamless C++/Python interop
- **Matplotlib** - Scientific plotting
- **SymPy** - Symbolic mathematics
- **OpenCV** - Computer vision
- **FFTW** - Fast Fourier Transforms

---

*MatFree is not affiliated with MathWorks. MATLAB is a registered trademark of The MathWorks, Inc.*
