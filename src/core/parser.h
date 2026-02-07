#pragma once
// MatFree - Recursive Descent Parser for MATLAB-compatible syntax
// Copyright (c) 2026 MatFree Contributors - MIT License

#include "ast.h"
#include "lexer.h"
#include <string>
#include <vector>
#include <stdexcept>

namespace matfree {

class ParseError : public std::runtime_error {
public:
    int line, col;
    ParseError(const std::string& msg, int line, int col)
        : std::runtime_error(msg), line(line), col(col) {}
};

class Parser {
public:
    explicit Parser(const std::vector<Token>& tokens);

    /// Parse the token stream into a Program AST.
    Program parse();

private:
    std::vector<Token> tokens_;
    size_t pos_ = 0;

    // Token navigation
    const Token& current() const;
    const Token& peek(int offset = 1) const;
    const Token& advance();
    bool check(TokenType type) const;
    bool match(TokenType type);
    bool matchAny(std::initializer_list<TokenType> types);
    const Token& expect(TokenType type, const std::string& message);
    bool isAtEnd() const;
    void skipNewlines();
    void expectStatementEnd();

    // Top-level parsing
    StmtPtr parseStatement();
    StmtPtr parseFunctionDef();
    StmtList parseBlock(std::initializer_list<TokenType> terminators);

    // Statement parsing
    StmtPtr parseIfStmt();
    StmtPtr parseForStmt();
    StmtPtr parseWhileStmt();
    StmtPtr parseSwitchStmt();
    StmtPtr parseTryCatchStmt();
    StmtPtr parseGlobalStmt();
    StmtPtr parsePersistentStmt();
    StmtPtr parseExpressionStmt();

    // Expression parsing (precedence climbing)
    ExprPtr parseExpression();
    ExprPtr parseOr();
    ExprPtr parseAnd();
    ExprPtr parseBitwiseOr();
    ExprPtr parseBitwiseAnd();
    ExprPtr parseComparison();
    ExprPtr parseColon();
    ExprPtr parseAddSub();
    ExprPtr parseMulDiv();
    ExprPtr parseUnary();
    ExprPtr parsePower();
    ExprPtr parsePostfix();
    ExprPtr parsePrimary();

    // Special expression parsing
    ExprPtr parseMatrixLiteral();
    ExprPtr parseCellArrayLiteral();
    ExprPtr parseAnonFunc();

    // Helpers
    [[noreturn]] void error(const std::string& msg);
    [[noreturn]] void error(const std::string& msg, const Token& tok);
};

} // namespace matfree
