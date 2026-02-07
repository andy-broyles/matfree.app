#pragma once
// MatFree - Lexer (Tokenizer) for MATLAB-compatible syntax
// Copyright (c) 2026 MatFree Contributors - MIT License

#include "token.h"
#include <string>
#include <vector>
#include <unordered_map>
#include <stdexcept>

namespace matfree {

class LexerError : public std::runtime_error {
public:
    int line, col;
    LexerError(const std::string& msg, int line, int col)
        : std::runtime_error(msg), line(line), col(col) {}
};

class Lexer {
public:
    explicit Lexer(const std::string& source, const std::string& filename = "<input>");

    /// Tokenize the entire source, returning all tokens.
    std::vector<Token> tokenize();

    /// Get the next token (streaming mode).
    Token nextToken();

    /// Peek at the next token without consuming it.
    Token peekToken();

private:
    std::string source_;
    std::string filename_;
    size_t pos_ = 0;
    int line_ = 1;
    int col_ = 1;
    Token lastToken_;  // For transpose disambiguation
    bool hasPeeked_ = false;
    Token peekedToken_;

    static std::unordered_map<std::string, TokenType> keywords_;

    char current() const;
    char peek(int offset = 1) const;
    char advance();
    bool isAtEnd() const;
    void skipWhitespace();       // Skip spaces/tabs (NOT newlines)
    void skipLineComment();      // Skip % comment
    void skipBlockComment();     // Skip %{ ... %}
    bool matchChar(char expected);

    Token makeToken(TokenType type, const std::string& lexeme);
    Token scanNumber();
    Token scanString(char delimiter);
    Token scanIdentifierOrKeyword();

    /// Determine if ' is transpose or string delimiter based on context.
    bool isTransposeContext() const;
};

} // namespace matfree
