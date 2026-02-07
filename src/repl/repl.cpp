// MatFree - REPL implementation
// Copyright (c) 2026 MatFree Contributors - MIT License

#include "repl.h"
#include "../core/lexer.h"
#include "../core/parser.h"
#include <iostream>
#include <algorithm>

namespace matfree {

Repl::Repl(Interpreter& interp) : interp_(interp) {}

void Repl::printBanner() {
    std::cout << R"(
  __  __       _   _____
 |  \/  | __ _| |_|  ___| __ ___  ___
 | |\/| |/ _` | __| |_ | '__/ _ \/ _ \
 | |  | | (_| | |_|  _|| | |  __/  __/
 |_|  |_|\__,_|\__|_|  |_|  \___|\___|

)" << std::endl;
    std::cout << "  MatFree v0.1.0 - Open-Source MATLAB-Compatible Computing Environment" << std::endl;
    std::cout << "  Type 'help' for help, 'quit' or 'exit' to exit." << std::endl;
    std::cout << "  Licensed under MIT License." << std::endl;
    std::cout << std::endl;
}

void Repl::run() {
    printBanner();

    while (true) {
        std::string input = readLine();

        // Trim whitespace
        size_t start = input.find_first_not_of(" \t\r\n");
        if (start == std::string::npos) continue;
        input = input.substr(start);
        size_t end = input.find_last_not_of(" \t\r\n");
        if (end != std::string::npos) input = input.substr(0, end + 1);

        if (input.empty()) continue;

        // Save to history
        history_.push_back(input);
        historyIdx_ = history_.size();

        // Special commands
        if (input == "quit" || input == "exit") {
            std::cout << std::endl;
            break;
        }

        if (input == "help") {
            std::cout << "MatFree Help:" << std::endl;
            std::cout << "  Type MATLAB-compatible expressions and statements." << std::endl;
            std::cout << "  Examples:" << std::endl;
            std::cout << "    x = [1 2 3; 4 5 6]      % Create a matrix" << std::endl;
            std::cout << "    y = sin(pi/4)            % Math functions" << std::endl;
            std::cout << "    A = rand(3,3); inv(A)    % Random matrix and inverse" << std::endl;
            std::cout << "    for i = 1:10, disp(i), end  % Loops" << std::endl;
            std::cout << "  Commands: who, whos, clear, quit, exit, help" << std::endl;
            std::cout << std::endl;
            continue;
        }

        if (input == "clc") {
            // Clear screen
            #ifdef _WIN32
            system("cls");
            #else
            system("clear");
            #endif
            continue;
        }

        // Parse and execute
        try {
            interp_.executeString(input, "<repl>");
        } catch (LexerError& e) {
            std::cerr << "Error: " << e.what() << " (line " << e.line << ", col " << e.col << ")" << std::endl;
        } catch (ParseError& e) {
            std::cerr << "Error: " << e.what() << " (line " << e.line << ", col " << e.col << ")" << std::endl;
        } catch (RuntimeError& e) {
            std::cerr << "Error: " << e.what() << std::endl;
        } catch (std::exception& e) {
            std::cerr << "Internal error: " << e.what() << std::endl;
        }
    }
}

std::string Repl::readLine() {
    std::string result;
    bool firstLine = true;

    while (true) {
        if (firstLine) {
            std::cout << prompt_;
        } else {
            std::cout << "   ";  // Continuation prompt
        }
        std::cout.flush();

        std::string line;
        if (!std::getline(std::cin, line)) {
            // EOF (Ctrl+D / Ctrl+Z)
            if (result.empty()) return "quit";
            return result;
        }

        result += line;

        // Check for line continuation (...)
        size_t ellipsis = result.rfind("...");
        if (ellipsis != std::string::npos) {
            // Remove the ellipsis and continue reading
            result = result.substr(0, ellipsis) + " ";
            firstLine = false;
            continue;
        }

        // Check if we need continuation (unmatched brackets)
        if (needsContinuation(result)) {
            result += "\n";
            firstLine = false;
            continue;
        }

        break;
    }

    return result;
}

bool Repl::needsContinuation(const std::string& input) const {
    int parens = 0, brackets = 0, braces = 0;
    bool inString = false;
    char stringChar = 0;

    for (size_t i = 0; i < input.size(); i++) {
        char c = input[i];

        if (inString) {
            if (c == stringChar) {
                if (i + 1 < input.size() && input[i + 1] == stringChar) {
                    i++; // escaped quote
                } else {
                    inString = false;
                }
            }
            continue;
        }

        if (c == '%') break; // rest is comment

        if (c == '\'' || c == '"') {
            inString = true;
            stringChar = c;
            continue;
        }

        switch (c) {
            case '(': parens++; break;
            case ')': parens--; break;
            case '[': brackets++; break;
            case ']': brackets--; break;
            case '{': braces++; break;
            case '}': braces--; break;
        }
    }

    return parens > 0 || brackets > 0 || braces > 0;
}

} // namespace matfree
