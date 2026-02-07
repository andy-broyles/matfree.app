#pragma once
// MatFree - Interactive REPL (Read-Eval-Print Loop)
// Copyright (c) 2026 MatFree Contributors - MIT License

#include "../core/interpreter.h"
#include <string>
#include <vector>

namespace matfree {

class Repl {
public:
    explicit Repl(Interpreter& interp);

    /// Run the interactive REPL loop.
    void run();

    /// Set the prompt string.
    void setPrompt(const std::string& prompt) { prompt_ = prompt; }

private:
    Interpreter& interp_;
    std::string prompt_ = ">> ";
    std::vector<std::string> history_;
    size_t historyIdx_ = 0;

    /// Read a line of input (with basic continuation support).
    std::string readLine();

    /// Check if a line needs continuation (unmatched brackets, etc.).
    bool needsContinuation(const std::string& input) const;

    /// Print the welcome banner.
    void printBanner();
};

} // namespace matfree
