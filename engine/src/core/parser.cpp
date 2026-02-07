// MatFree - Parser implementation (recursive descent)
// Copyright (c) 2026 MatFree Contributors - MIT License

#include "parser.h"
#include <sstream>
#include <algorithm>

namespace matfree {

Parser::Parser(const std::vector<Token>& tokens) : tokens_(tokens) {}

// ============================================================================
// Token navigation
// ============================================================================

const Token& Parser::current() const {
    if (pos_ >= tokens_.size()) return tokens_.back(); // EOF
    return tokens_[pos_];
}

const Token& Parser::peek(int offset) const {
    size_t idx = pos_ + offset;
    if (idx >= tokens_.size()) return tokens_.back();
    return tokens_[idx];
}

const Token& Parser::advance() {
    const Token& tok = current();
    if (pos_ < tokens_.size()) pos_++;
    return tok;
}

bool Parser::check(TokenType type) const {
    return current().type == type;
}

bool Parser::match(TokenType type) {
    if (check(type)) {
        advance();
        return true;
    }
    return false;
}

bool Parser::matchAny(std::initializer_list<TokenType> types) {
    for (auto t : types) {
        if (check(t)) {
            advance();
            return true;
        }
    }
    return false;
}

const Token& Parser::expect(TokenType type, const std::string& message) {
    if (check(type)) return advance();
    error(message + " (got " + std::string(tokenTypeName(current().type)) + " '" + current().lexeme + "')");
}

bool Parser::isAtEnd() const {
    return current().type == TokenType::EOF_TOKEN;
}

void Parser::skipNewlines() {
    while (match(TokenType::NEWLINE)) {}
}

void Parser::expectStatementEnd() {
    // A statement ends with ; , newline, or EOF
    if (check(TokenType::SEMICOLON) || check(TokenType::NEWLINE) ||
        check(TokenType::COMMA) || check(TokenType::EOF_TOKEN)) {
        if (!check(TokenType::EOF_TOKEN)) advance();
        return;
    }
    // Also allow if the next token is a block-ending keyword
    if (check(TokenType::END) || check(TokenType::ELSE) ||
        check(TokenType::ELSEIF) || check(TokenType::CASE) ||
        check(TokenType::OTHERWISE) || check(TokenType::CATCH)) {
        return;
    }
}

// ============================================================================
// Error handling
// ============================================================================

void Parser::error(const std::string& msg) {
    throw ParseError(msg, current().line, current().col);
}

void Parser::error(const std::string& msg, const Token& tok) {
    throw ParseError(msg, tok.line, tok.col);
}

// ============================================================================
// Top-level parsing
// ============================================================================

Program Parser::parse() {
    Program program;
    skipNewlines();

    while (!isAtEnd()) {
        if (check(TokenType::FUNCTION)) {
            auto funcStmt = parseFunctionDef();
            auto& fd = funcStmt->as<FunctionDef>();
            program.functions.push_back(std::make_shared<FunctionDef>(fd));
            program.statements.push_back(std::move(funcStmt));
        } else {
            program.statements.push_back(parseStatement());
        }
        skipNewlines();
    }

    return program;
}

StmtList Parser::parseBlock(std::initializer_list<TokenType> terminators) {
    StmtList stmts;
    skipNewlines();

    while (!isAtEnd()) {
        for (auto t : terminators) {
            if (check(t)) return stmts;
        }
        stmts.push_back(parseStatement());
        skipNewlines();
    }
    return stmts;
}

// ============================================================================
// Statement parsing
// ============================================================================

StmtPtr Parser::parseStatement() {
    skipNewlines();

    switch (current().type) {
        case TokenType::IF:       return parseIfStmt();
        case TokenType::FOR:      return parseForStmt();
        case TokenType::WHILE:    return parseWhileStmt();
        case TokenType::SWITCH:   return parseSwitchStmt();
        case TokenType::TRY:      return parseTryCatchStmt();
        case TokenType::FUNCTION: return parseFunctionDef();
        case TokenType::GLOBAL:   return parseGlobalStmt();
        case TokenType::PERSISTENT: return parsePersistentStmt();
        case TokenType::RETURN: {
            int ln = current().line, cl = current().col;
            advance();
            expectStatementEnd();
            return makeStmt<ReturnStmt>(ln, cl);
        }
        case TokenType::BREAK: {
            int ln = current().line, cl = current().col;
            advance();
            expectStatementEnd();
            return makeStmt<BreakStmt>(ln, cl);
        }
        case TokenType::CONTINUE: {
            int ln = current().line, cl = current().col;
            advance();
            expectStatementEnd();
            return makeStmt<ContinueStmt>(ln, cl);
        }
        default:
            return parseExpressionStmt();
    }
}

StmtPtr Parser::parseFunctionDef() {
    int ln = current().line, cl = current().col;
    expect(TokenType::FUNCTION, "Expected 'function'");

    std::vector<std::string> returns;
    std::string name;

    // Parse return values and function name
    // Possibilities:
    //   function name(args)
    //   function ret = name(args)
    //   function [ret1, ret2] = name(args)

    if (check(TokenType::LBRACKET)) {
        // [ret1, ret2, ...] = name(...)
        advance(); // skip [
        while (!check(TokenType::RBRACKET) && !isAtEnd()) {
            returns.push_back(expect(TokenType::IDENTIFIER, "Expected return variable name").lexeme);
            if (!check(TokenType::RBRACKET)) {
                expect(TokenType::COMMA, "Expected ',' between return variables");
            }
        }
        expect(TokenType::RBRACKET, "Expected ']'");
        expect(TokenType::ASSIGN, "Expected '='");
        name = expect(TokenType::IDENTIFIER, "Expected function name").lexeme;
    } else {
        // Could be: name(...) or ret = name(...)
        std::string first = expect(TokenType::IDENTIFIER, "Expected function name or return var").lexeme;
        if (match(TokenType::ASSIGN)) {
            returns.push_back(first);
            name = expect(TokenType::IDENTIFIER, "Expected function name").lexeme;
        } else {
            name = first;
        }
    }

    // Parse parameters
    std::vector<std::string> params;
    if (match(TokenType::LPAREN)) {
        while (!check(TokenType::RPAREN) && !isAtEnd()) {
            params.push_back(expect(TokenType::IDENTIFIER, "Expected parameter name").lexeme);
            if (!check(TokenType::RPAREN)) {
                if (!match(TokenType::COMMA)) break;
            }
        }
        expect(TokenType::RPAREN, "Expected ')'");
    }

    expectStatementEnd();

    // Parse body until 'end' or EOF (for script-file functions)
    StmtList body = parseBlock({TokenType::END});

    if (check(TokenType::END)) {
        advance();
        // Consume optional newline/semicolon after end
        if (check(TokenType::NEWLINE) || check(TokenType::SEMICOLON)) advance();
    }

    return makeStmt<FunctionDef>(ln, cl, name, params, returns, std::move(body));
}

StmtPtr Parser::parseIfStmt() {
    int ln = current().line, cl = current().col;
    expect(TokenType::IF, "Expected 'if'");

    IfStmt ifStmt;

    // if condition
    auto cond = parseExpression();
    expectStatementEnd();
    auto body = parseBlock({TokenType::ELSEIF, TokenType::ELSE, TokenType::END});
    ifStmt.branches.push_back({std::move(cond), std::move(body)});

    // elseif branches
    while (match(TokenType::ELSEIF)) {
        auto eicond = parseExpression();
        expectStatementEnd();
        auto eibody = parseBlock({TokenType::ELSEIF, TokenType::ELSE, TokenType::END});
        ifStmt.branches.push_back({std::move(eicond), std::move(eibody)});
    }

    // else branch
    if (match(TokenType::ELSE)) {
        expectStatementEnd();
        auto elsebody = parseBlock({TokenType::END});
        ifStmt.branches.push_back({nullptr, std::move(elsebody)});
    }

    expect(TokenType::END, "Expected 'end' to close 'if'");
    expectStatementEnd();

    return std::make_shared<Stmt>(std::move(ifStmt), ln, cl);
}

StmtPtr Parser::parseForStmt() {
    int ln = current().line, cl = current().col;
    expect(TokenType::FOR, "Expected 'for'");

    std::string var = expect(TokenType::IDENTIFIER, "Expected loop variable").lexeme;
    expect(TokenType::ASSIGN, "Expected '='");
    auto range = parseExpression();
    expectStatementEnd();
    auto body = parseBlock({TokenType::END});
    expect(TokenType::END, "Expected 'end' to close 'for'");
    expectStatementEnd();

    return makeStmt<ForStmt>(ln, cl, var, std::move(range), std::move(body));
}

StmtPtr Parser::parseWhileStmt() {
    int ln = current().line, cl = current().col;
    expect(TokenType::WHILE, "Expected 'while'");

    auto cond = parseExpression();
    expectStatementEnd();
    auto body = parseBlock({TokenType::END});
    expect(TokenType::END, "Expected 'end' to close 'while'");
    expectStatementEnd();

    return makeStmt<WhileStmt>(ln, cl, std::move(cond), std::move(body));
}

StmtPtr Parser::parseSwitchStmt() {
    int ln = current().line, cl = current().col;
    expect(TokenType::SWITCH, "Expected 'switch'");

    auto expr = parseExpression();
    expectStatementEnd();
    skipNewlines();

    SwitchStmt sw;
    sw.expression = std::move(expr);

    while (check(TokenType::CASE)) {
        advance();
        auto val = parseExpression();
        expectStatementEnd();
        auto body = parseBlock({TokenType::CASE, TokenType::OTHERWISE, TokenType::END});
        sw.cases.push_back({std::move(val), std::move(body)});
        skipNewlines();
    }

    if (match(TokenType::OTHERWISE)) {
        expectStatementEnd();
        auto body = parseBlock({TokenType::END});
        sw.cases.push_back({nullptr, std::move(body)});
    }

    expect(TokenType::END, "Expected 'end' to close 'switch'");
    expectStatementEnd();

    return std::make_shared<Stmt>(std::move(sw), ln, cl);
}

StmtPtr Parser::parseTryCatchStmt() {
    int ln = current().line, cl = current().col;
    expect(TokenType::TRY, "Expected 'try'");
    expectStatementEnd();

    auto tryBody = parseBlock({TokenType::CATCH, TokenType::END});

    std::string catchVar;
    StmtList catchBody;

    if (match(TokenType::CATCH)) {
        if (check(TokenType::IDENTIFIER)) {
            catchVar = advance().lexeme;
        }
        expectStatementEnd();
        catchBody = parseBlock({TokenType::END});
    }

    expect(TokenType::END, "Expected 'end' to close 'try'");
    expectStatementEnd();

    return makeStmt<TryCatchStmt>(ln, cl, std::move(tryBody), catchVar, std::move(catchBody));
}

StmtPtr Parser::parseGlobalStmt() {
    int ln = current().line, cl = current().col;
    advance(); // skip 'global'
    std::vector<std::string> vars;
    while (check(TokenType::IDENTIFIER)) {
        vars.push_back(advance().lexeme);
    }
    expectStatementEnd();
    return makeStmt<GlobalStmt>(ln, cl, std::move(vars));
}

StmtPtr Parser::parsePersistentStmt() {
    int ln = current().line, cl = current().col;
    advance(); // skip 'persistent'
    std::vector<std::string> vars;
    while (check(TokenType::IDENTIFIER)) {
        vars.push_back(advance().lexeme);
    }
    expectStatementEnd();
    return makeStmt<PersistentStmt>(ln, cl, std::move(vars));
}

StmtPtr Parser::parseExpressionStmt() {
    int ln = current().line, cl = current().col;

    // Check for multi-assignment: [a, b] = ...
    if (check(TokenType::LBRACKET)) {
        // Peek ahead to see if this is [names] = expr
        size_t saved = pos_;
        advance(); // skip [
        std::vector<std::string> names;
        bool isMultiAssign = true;

        while (!check(TokenType::RBRACKET) && !isAtEnd()) {
            if (check(TokenType::IDENTIFIER)) {
                names.push_back(advance().lexeme);
                if (!check(TokenType::RBRACKET)) {
                    if (!match(TokenType::COMMA)) {
                        // Check for space-separated (MatFree allows [a b] = ...)
                        if (!check(TokenType::IDENTIFIER) && !check(TokenType::NOT)) {
                            isMultiAssign = false;
                            break;
                        }
                    }
                }
            } else if (match(TokenType::NOT)) {
                // ~  means "ignore this output"
                names.push_back("~");
                if (!check(TokenType::RBRACKET)) {
                    match(TokenType::COMMA);
                }
            } else {
                isMultiAssign = false;
                break;
            }
        }

        if (isMultiAssign && check(TokenType::RBRACKET)) {
            advance(); // skip ]
            if (check(TokenType::ASSIGN)) {
                advance(); // skip =
                auto value = parseExpression();
                bool printResult = !match(TokenType::SEMICOLON);
                if (!printResult || check(TokenType::NEWLINE) || check(TokenType::EOF_TOKEN)) {
                    if (check(TokenType::NEWLINE)) advance();
                }
                return makeStmt<MultiAssignStmt>(ln, cl, std::move(names), std::move(value), printResult);
            }
        }

        // Not a multi-assign, backtrack
        pos_ = saved;
    }

    auto expr = parseExpression();

    // Check for assignment: expr = value
    if (check(TokenType::ASSIGN)) {
        advance(); // skip =
        auto value = parseExpression();
        bool printResult = true;
        if (check(TokenType::SEMICOLON)) {
            printResult = false;
            advance();
        }
        if (check(TokenType::NEWLINE)) advance();
        return makeStmt<AssignStmt>(ln, cl, std::move(expr), std::move(value), printResult);
    }

    // Plain expression statement
    bool printResult = true;
    if (check(TokenType::SEMICOLON)) {
        printResult = false;
        advance();
    }
    if (check(TokenType::NEWLINE)) advance();
    return makeStmt<ExprStmt>(ln, cl, std::move(expr), printResult);
}

// ============================================================================
// Expression parsing (precedence climbing)
// ============================================================================

ExprPtr Parser::parseExpression() {
    return parseOr();
}

ExprPtr Parser::parseOr() {
    auto left = parseAnd();
    while (check(TokenType::SHORT_OR)) {
        auto op = advance().type;
        auto right = parseAnd();
        left = std::make_shared<Expr>(BinaryExpr{op, left, right}, left->line, left->col);
    }
    return left;
}

ExprPtr Parser::parseAnd() {
    auto left = parseBitwiseOr();
    while (check(TokenType::SHORT_AND)) {
        auto op = advance().type;
        auto right = parseBitwiseOr();
        left = std::make_shared<Expr>(BinaryExpr{op, left, right}, left->line, left->col);
    }
    return left;
}

ExprPtr Parser::parseBitwiseOr() {
    auto left = parseBitwiseAnd();
    while (check(TokenType::OR)) {
        auto op = advance().type;
        auto right = parseBitwiseAnd();
        left = std::make_shared<Expr>(BinaryExpr{op, left, right}, left->line, left->col);
    }
    return left;
}

ExprPtr Parser::parseBitwiseAnd() {
    auto left = parseComparison();
    while (check(TokenType::AND)) {
        auto op = advance().type;
        auto right = parseComparison();
        left = std::make_shared<Expr>(BinaryExpr{op, left, right}, left->line, left->col);
    }
    return left;
}

ExprPtr Parser::parseComparison() {
    auto left = parseColon();
    while (current().isOneOf({TokenType::EQ, TokenType::NE, TokenType::LT,
                               TokenType::GT, TokenType::LE, TokenType::GE})) {
        auto op = advance().type;
        auto right = parseColon();
        left = std::make_shared<Expr>(BinaryExpr{op, left, right}, left->line, left->col);
    }
    return left;
}

ExprPtr Parser::parseColon() {
    auto start = parseAddSub();

    if (check(TokenType::COLON)) {
        advance();
        auto second = parseAddSub();

        if (check(TokenType::COLON)) {
            advance();
            auto third = parseAddSub();
            // start:step:stop
            return std::make_shared<Expr>(
                ColonExpr{start, second, third}, start->line, start->col);
        }
        // start:stop (no step)
        return std::make_shared<Expr>(
            ColonExpr{start, nullptr, second}, start->line, start->col);
    }

    return start;
}

ExprPtr Parser::parseAddSub() {
    auto left = parseMulDiv();
    while (current().isOneOf({TokenType::PLUS, TokenType::MINUS})) {
        auto op = advance().type;
        auto right = parseMulDiv();
        left = std::make_shared<Expr>(BinaryExpr{op, left, right}, left->line, left->col);
    }
    return left;
}

ExprPtr Parser::parseMulDiv() {
    auto left = parseUnary();
    while (current().isOneOf({TokenType::STAR, TokenType::SLASH, TokenType::BACKSLASH,
                               TokenType::DOT_STAR, TokenType::DOT_SLASH,
                               TokenType::DOT_BACKSLASH})) {
        auto op = advance().type;
        auto right = parseUnary();
        left = std::make_shared<Expr>(BinaryExpr{op, left, right}, left->line, left->col);
    }
    return left;
}

ExprPtr Parser::parseUnary() {
    if (current().isOneOf({TokenType::MINUS, TokenType::PLUS, TokenType::NOT})) {
        int ln = current().line, cl = current().col;
        auto op = advance().type;
        auto operand = parseUnary();
        return std::make_shared<Expr>(UnaryExpr{op, operand, false}, ln, cl);
    }
    return parsePower();
}

ExprPtr Parser::parsePower() {
    auto base = parsePostfix();
    if (current().isOneOf({TokenType::CARET, TokenType::DOT_CARET})) {
        auto op = advance().type;
        auto exp = parseUnary(); // Right-associative
        return std::make_shared<Expr>(BinaryExpr{op, base, exp}, base->line, base->col);
    }
    return base;
}

ExprPtr Parser::parsePostfix() {
    auto expr = parsePrimary();

    while (true) {
        if (check(TokenType::LPAREN)) {
            // Function call or array indexing: expr(args)
            advance();
            ExprList args;
            while (!check(TokenType::RPAREN) && !isAtEnd()) {
                if (check(TokenType::COLON) && !args.empty()) {
                    // Bare colon as argument (e.g., A(:, 1))
                    int ln = current().line, cl = current().col;
                    advance();
                    // Create a colon expression representing ":"
                    args.push_back(std::make_shared<Expr>(
                        ColonExpr{nullptr, nullptr, nullptr}, ln, cl));
                } else if (check(TokenType::COLON)) {
                    int ln = current().line, cl = current().col;
                    advance();
                    args.push_back(std::make_shared<Expr>(
                        ColonExpr{nullptr, nullptr, nullptr}, ln, cl));
                } else {
                    args.push_back(parseExpression());
                }
                if (!check(TokenType::RPAREN)) {
                    expect(TokenType::COMMA, "Expected ',' between arguments");
                }
            }
            expect(TokenType::RPAREN, "Expected ')'");
            expr = std::make_shared<Expr>(CallExpr{expr, std::move(args)}, expr->line, expr->col);
        } else if (check(TokenType::LBRACE)) {
            // Cell indexing: expr{args}
            advance();
            ExprList indices;
            while (!check(TokenType::RBRACE) && !isAtEnd()) {
                indices.push_back(parseExpression());
                if (!check(TokenType::RBRACE)) {
                    expect(TokenType::COMMA, "Expected ',' between indices");
                }
            }
            expect(TokenType::RBRACE, "Expected '}'");
            expr = std::make_shared<Expr>(CellIndexExpr{expr, std::move(indices)}, expr->line, expr->col);
        } else if (check(TokenType::DOT) && peek().type == TokenType::IDENTIFIER) {
            // Dot access: expr.field
            advance(); // skip .
            std::string field = advance().lexeme;
            expr = std::make_shared<Expr>(DotExpr{expr, field}, expr->line, expr->col);
        } else if (check(TokenType::TRANSPOSE)) {
            advance();
            expr = std::make_shared<Expr>(UnaryExpr{TokenType::TRANSPOSE, expr, true},
                                          expr->line, expr->col);
        } else if (check(TokenType::DOT_TRANSPOSE)) {
            advance();
            expr = std::make_shared<Expr>(UnaryExpr{TokenType::DOT_TRANSPOSE, expr, true},
                                          expr->line, expr->col);
        } else {
            break;
        }
    }

    return expr;
}

ExprPtr Parser::parsePrimary() {
    int ln = current().line, cl = current().col;

    // Number literal
    if (check(TokenType::NUMBER)) {
        const Token& tok = advance();
        return std::make_shared<Expr>(
            NumberLiteral{tok.numValue, tok.imagValue, tok.isComplex}, ln, cl);
    }

    // String literal
    if (check(TokenType::STRING)) {
        std::string val = advance().lexeme;
        return std::make_shared<Expr>(StringLiteral{val}, ln, cl);
    }

    // Boolean literals
    if (check(TokenType::TRUE_KW)) {
        advance();
        return std::make_shared<Expr>(BoolLiteral{true}, ln, cl);
    }
    if (check(TokenType::FALSE_KW)) {
        advance();
        return std::make_shared<Expr>(BoolLiteral{false}, ln, cl);
    }

    // 'end' in indexing context
    if (check(TokenType::END)) {
        advance();
        return std::make_shared<Expr>(EndExpr{}, ln, cl);
    }

    // Identifier
    if (check(TokenType::IDENTIFIER)) {
        std::string name = advance().lexeme;
        return std::make_shared<Expr>(Identifier{name}, ln, cl);
    }

    // Parenthesized expression
    if (match(TokenType::LPAREN)) {
        auto expr = parseExpression();
        expect(TokenType::RPAREN, "Expected ')'");
        return expr;
    }

    // Matrix literal [...]
    if (check(TokenType::LBRACKET)) {
        return parseMatrixLiteral();
    }

    // Cell array literal {...}
    if (check(TokenType::LBRACE)) {
        return parseCellArrayLiteral();
    }

    // Anonymous function @(x) x^2  or function handle @name
    if (check(TokenType::AT)) {
        advance();
        if (check(TokenType::LPAREN)) {
            return parseAnonFunc();
        } else if (check(TokenType::IDENTIFIER)) {
            std::string name = advance().lexeme;
            return std::make_shared<Expr>(FuncHandleExpr{name}, ln, cl);
        }
        error("Expected function name or parameter list after '@'");
    }

    error("Unexpected token: " + std::string(tokenTypeName(current().type)) +
          " '" + current().lexeme + "'");
}

ExprPtr Parser::parseMatrixLiteral() {
    int ln = current().line, cl = current().col;
    expect(TokenType::LBRACKET, "Expected '['");

    MatrixLiteral mat;

    if (check(TokenType::RBRACKET)) {
        advance();
        return std::make_shared<Expr>(std::move(mat), ln, cl);
    }

    // Parse rows separated by ; or newlines, elements separated by , or spaces
    ExprList currentRow;

    while (!check(TokenType::RBRACKET) && !isAtEnd()) {
        if (check(TokenType::SEMICOLON) || check(TokenType::NEWLINE)) {
            if (!currentRow.empty()) {
                mat.rows.push_back(std::move(currentRow));
                currentRow = ExprList();
            }
            advance();
            skipNewlines();
            continue;
        }

        currentRow.push_back(parseExpression());

        if (check(TokenType::COMMA)) {
            advance();
        }
    }

    if (!currentRow.empty()) {
        mat.rows.push_back(std::move(currentRow));
    }

    expect(TokenType::RBRACKET, "Expected ']'");
    return std::make_shared<Expr>(std::move(mat), ln, cl);
}

ExprPtr Parser::parseCellArrayLiteral() {
    int ln = current().line, cl = current().col;
    expect(TokenType::LBRACE, "Expected '{'");

    CellArrayLiteral cell;

    if (check(TokenType::RBRACE)) {
        advance();
        return std::make_shared<Expr>(std::move(cell), ln, cl);
    }

    ExprList currentRow;

    while (!check(TokenType::RBRACE) && !isAtEnd()) {
        if (check(TokenType::SEMICOLON) || check(TokenType::NEWLINE)) {
            if (!currentRow.empty()) {
                cell.rows.push_back(std::move(currentRow));
                currentRow = ExprList();
            }
            advance();
            skipNewlines();
            continue;
        }

        currentRow.push_back(parseExpression());

        if (check(TokenType::COMMA)) {
            advance();
        }
    }

    if (!currentRow.empty()) {
        cell.rows.push_back(std::move(currentRow));
    }

    expect(TokenType::RBRACE, "Expected '}'");
    return std::make_shared<Expr>(std::move(cell), ln, cl);
}

ExprPtr Parser::parseAnonFunc() {
    int ln = current().line, cl = current().col;

    // Already consumed @, now parse (params)
    expect(TokenType::LPAREN, "Expected '(' for anonymous function parameters");

    std::vector<std::string> params;
    while (!check(TokenType::RPAREN) && !isAtEnd()) {
        params.push_back(expect(TokenType::IDENTIFIER, "Expected parameter name").lexeme);
        if (!check(TokenType::RPAREN)) {
            expect(TokenType::COMMA, "Expected ','");
        }
    }
    expect(TokenType::RPAREN, "Expected ')'");

    auto body = parseExpression();
    return std::make_shared<Expr>(AnonFuncExpr{std::move(params), std::move(body)}, ln, cl);
}

} // namespace matfree
