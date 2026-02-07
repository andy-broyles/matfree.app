#pragma once
// MatFree - Built-in function registry
// Copyright (c) 2026 MatFree Contributors - MIT License

#include "interpreter.h"

namespace matfree {

/// Register all built-in functions with the interpreter.
void registerAllBuiltins(Interpreter& interp);

// Category registration functions
void registerMathBuiltins(Interpreter& interp);
void registerMatrixBuiltins(Interpreter& interp);
void registerLinAlgBuiltins(Interpreter& interp);
void registerStringBuiltins(Interpreter& interp);
void registerIOBuiltins(Interpreter& interp);
void registerTypeBuiltins(Interpreter& interp);
void registerStatsBuiltins(Interpreter& interp);

} // namespace matfree
