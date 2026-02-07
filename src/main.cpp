// MatFree - Main entry point
// Copyright (c) 2026 MatFree Contributors - MIT License
//
// Usage:
//   matfree              - Start interactive REPL
//   matfree script.m     - Execute a .m file
//   matfree -e "code"    - Execute a string of code
//   matfree --version    - Print version
//   matfree --help       - Print help

#include "core/interpreter.h"
#include "core/builtins.h"
#include "core/lexer.h"
#include "core/parser.h"
#include "repl/repl.h"
#include <iostream>
#include <string>
#include <cstring>

using namespace matfree;

static void printVersion() {
    std::cout << "MatFree v0.1.0" << std::endl;
    std::cout << "Open-Source MATLAB-Compatible Computing Environment" << std::endl;
    std::cout << "Copyright (c) 2026 MatFree Contributors" << std::endl;
    std::cout << "Licensed under MIT License" << std::endl;
}

static void printHelp() {
    printVersion();
    std::cout << std::endl;
    std::cout << "Usage:" << std::endl;
    std::cout << "  matfree              Start interactive REPL" << std::endl;
    std::cout << "  matfree <file.m>     Execute a MATLAB script file" << std::endl;
    std::cout << "  matfree -e \"code\"    Execute code string" << std::endl;
    std::cout << "  matfree --version    Print version information" << std::endl;
    std::cout << "  matfree --help       Print this help message" << std::endl;
}

int main(int argc, char* argv[]) {
    try {
        // Create interpreter and register built-in functions
        Interpreter interp;
        registerAllBuiltins(interp);

        if (argc == 1) {
            // No arguments: start interactive REPL
            Repl repl(interp);
            repl.run();
            return 0;
        }

        // Parse command-line arguments
        for (int i = 1; i < argc; i++) {
            std::string arg = argv[i];

            if (arg == "--version" || arg == "-v") {
                printVersion();
                return 0;
            }

            if (arg == "--help" || arg == "-h") {
                printHelp();
                return 0;
            }

            if (arg == "-e" && i + 1 < argc) {
                // Execute code string
                interp.executeString(argv[++i], "<command-line>");
                return 0;
            }

            if (arg == "-p" || arg == "--path") {
                // Add to search path
                if (i + 1 < argc) {
                    interp.addPath(argv[++i]);
                }
                continue;
            }

            // Assume it's a .m file
            interp.executeFile(arg);
            return 0;
        }

    } catch (LexerError& e) {
        std::cerr << "Syntax error: " << e.what()
                  << " (line " << e.line << ", col " << e.col << ")" << std::endl;
        return 1;
    } catch (ParseError& e) {
        std::cerr << "Parse error: " << e.what()
                  << " (line " << e.line << ", col " << e.col << ")" << std::endl;
        return 1;
    } catch (RuntimeError& e) {
        std::cerr << "Runtime error: " << e.what() << std::endl;
        return 1;
    } catch (std::exception& e) {
        std::cerr << "Internal error: " << e.what() << std::endl;
        return 1;
    }

    return 0;
}
