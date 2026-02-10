# MatFree

**Free, open-source scientific computing — in your browser.**

[matfree.app](https://matfree.app)

MatFree is a free, open-source computing environment for numerical analysis, matrix operations, and scientific computing. It runs entirely in the browser with no installation, no license fees, and no restrictions.

## Features

- **Matrix Engine** — Dense matrices, linear algebra (det, inv, eigenvalues), broadcasting
- **Rich Language** — Functions, anonymous functions, closures, structs, cell arrays, control flow
- **Interactive REPL** — Command window with history, instant feedback
- **200+ Built-in Functions** — Math, statistics, signal processing, symbolic math, ODEs, and more
- **Script Editor** — Write and run multi-line scripts in the browser
- **Notebook** — Code and markdown cells with save/load to IndexedDB
- **Data I/O** — `readcsv`, `writematrix`, `writecsv`, `jsondecode`, `jsonencode`; Load URL for CSV
- **Open Source** — MIT licensed, community-driven

## Try It

Visit [matfree.app](https://matfree.app) and start computing. No sign-up required.

## Quick Examples

```
% Matrix operations
A = [1 2; 3 4];
B = inv(A);
disp(A * B)

% Functions
function y = fib(n)
  if n <= 1
    y = n;
  else
    y = fib(n-1) + fib(n-2);
  end
end
fib(20)

% Statistics
data = [4 8 15 16 23 42];
fprintf('Mean: %f\n', mean(data))
fprintf('Std: %f\n', std(data))

% Data I/O: parse CSV, export, JSON
data = readcsv('1,2,3\n4,5,6');
writematrix(data, 'output.csv')
s = jsondecode('{"x":1,"y":2}');
```

## Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build
```

## Native Engine

The `engine/` directory contains a C++ implementation of the MatFree engine for native performance. See `engine/CMakeLists.txt` for build instructions.

## Architecture

- `src/engine/` — TypeScript engine (lexer, parser, interpreter) that runs in the browser
- `src/app/` — Next.js web application (landing page, playground, notebook)
- `engine/` — C++ native engine (for CLI and native bindings)

## License

MIT License. See [LICENSE](LICENSE) for details.
