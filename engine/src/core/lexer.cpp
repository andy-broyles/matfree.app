// MatFree - Lexer implementation
// Copyright (c) 2026 MatFree Contributors - MIT License

#include "lexer.h"
#include <cctype>
#include <sstream>
#include <algorithm>

namespace matfree {

std::unordered_map<std::string, TokenType> Lexer::keywords_ = {
    {"if",          TokenType::IF},
    {"elseif",      TokenType::ELSEIF},
    {"else",        TokenType::ELSE},
    {"end",         TokenType::END},
    {"for",         TokenType::FOR},
    {"while",       TokenType::WHILE},
    {"switch",      TokenType::SWITCH},
    {"case",        TokenType::CASE},
    {"otherwise",   TokenType::OTHERWISE},
    {"try",         TokenType::TRY},
    {"catch",       TokenType::CATCH},
    {"function",    TokenType::FUNCTION},
    {"return",      TokenType::RETURN},
    {"break",       TokenType::BREAK},
    {"continue",    TokenType::CONTINUE},
    {"global",      TokenType::GLOBAL},
    {"persistent",  TokenType::PERSISTENT},
    {"classdef",    TokenType::CLASSDEF},
    {"properties",  TokenType::PROPERTIES},
    {"methods",     TokenType::METHODS},
    {"events",      TokenType::EVENTS},
    {"enumeration", TokenType::ENUMERATION},
    {"true",        TokenType::TRUE_KW},
    {"false",       TokenType::FALSE_KW},
};

Lexer::Lexer(const std::string& source, const std::string& filename)
    : source_(source), filename_(filename)
{
    lastToken_.type = TokenType::NEWLINE; // Start as if at beginning of line
}

std::vector<Token> Lexer::tokenize() {
    std::vector<Token> tokens;
    while (true) {
        Token tok = nextToken();
        tokens.push_back(tok);
        if (tok.type == TokenType::EOF_TOKEN) break;
    }
    return tokens;
}

char Lexer::current() const {
    if (pos_ >= source_.size()) return '\0';
    return source_[pos_];
}

char Lexer::peek(int offset) const {
    size_t idx = pos_ + offset;
    if (idx >= source_.size()) return '\0';
    return source_[idx];
}

char Lexer::advance() {
    char c = current();
    pos_++;
    if (c == '\n') {
        line_++;
        col_ = 1;
    } else {
        col_++;
    }
    return c;
}

bool Lexer::isAtEnd() const {
    return pos_ >= source_.size();
}

bool Lexer::matchChar(char expected) {
    if (isAtEnd() || current() != expected) return false;
    advance();
    return true;
}

void Lexer::skipWhitespace() {
    while (!isAtEnd()) {
        char c = current();
        if (c == ' ' || c == '\t' || c == '\r') {
            advance();
        } else if (c == '.' && peek(1) == '.' && peek(2) == '.') {
            // Line continuation: skip to end of line
            advance(); advance(); advance();
            while (!isAtEnd() && current() != '\n') advance();
            if (!isAtEnd()) advance(); // skip the newline
        } else {
            break;
        }
    }
}

void Lexer::skipLineComment() {
    // Skip everything until end of line
    while (!isAtEnd() && current() != '\n') {
        advance();
    }
}

void Lexer::skipBlockComment() {
    // Already consumed %{
    int depth = 1;
    while (!isAtEnd() && depth > 0) {
        if (current() == '%' && peek(1) == '{') {
            depth++;
            advance(); advance();
        } else if (current() == '%' && peek(1) == '}') {
            depth--;
            advance(); advance();
        } else {
            advance();
        }
    }
}

Token Lexer::makeToken(TokenType type, const std::string& lexeme) {
    Token tok(type, lexeme, line_, col_ - (int)lexeme.size());
    lastToken_ = tok;
    return tok;
}

bool Lexer::isTransposeContext() const {
    // Transpose (') follows: identifiers, numbers, ), ], }, .'
    // String delimiter follows everything else
    switch (lastToken_.type) {
        case TokenType::IDENTIFIER:
        case TokenType::NUMBER:
        case TokenType::RPAREN:
        case TokenType::RBRACKET:
        case TokenType::RBRACE:
        case TokenType::TRANSPOSE:
        case TokenType::DOT_TRANSPOSE:
        case TokenType::END:
        case TokenType::TRUE_KW:
        case TokenType::FALSE_KW:
            return true;
        default:
            return false;
    }
}

Token Lexer::peekToken() {
    if (!hasPeeked_) {
        peekedToken_ = nextToken();
        hasPeeked_ = true;
    }
    return peekedToken_;
}

Token Lexer::nextToken() {
    if (hasPeeked_) {
        hasPeeked_ = false;
        lastToken_ = peekedToken_;
        return peekedToken_;
    }

    skipWhitespace();

    if (isAtEnd()) {
        return makeToken(TokenType::EOF_TOKEN, "");
    }

    int startLine = line_;
    int startCol = col_;
    char c = current();

    // Newlines are significant (statement terminators)
    if (c == '\n') {
        advance();
        // Don't emit multiple consecutive newlines
        if (lastToken_.type != TokenType::NEWLINE &&
            lastToken_.type != TokenType::SEMICOLON &&
            lastToken_.type != TokenType::COMMA) {
            return makeToken(TokenType::NEWLINE, "\\n");
        }
        return nextToken(); // skip redundant newline
    }

    // Comments
    if (c == '%') {
        if (peek(1) == '{') {
            advance(); advance();
            skipBlockComment();
            return nextToken();
        }
        skipLineComment();
        // Treat comment as newline for statement termination
        if (lastToken_.type != TokenType::NEWLINE &&
            lastToken_.type != TokenType::SEMICOLON) {
            return makeToken(TokenType::NEWLINE, "\\n");
        }
        return nextToken();
    }

    // Numbers: 0-9 or .digit
    if (std::isdigit(c) || (c == '.' && std::isdigit(peek(1)))) {
        return scanNumber();
    }

    // Strings
    if (c == '"') {
        return scanString('"');
    }

    // Single quote: transpose or string?
    if (c == '\'') {
        if (isTransposeContext()) {
            advance();
            return makeToken(TokenType::TRANSPOSE, "'");
        } else {
            return scanString('\'');
        }
    }

    // Identifiers and keywords
    if (std::isalpha(c) || c == '_') {
        return scanIdentifierOrKeyword();
    }

    // Operators and punctuation
    advance(); // consume the character

    switch (c) {
        case '+': return makeToken(TokenType::PLUS, "+");
        case '-': return makeToken(TokenType::MINUS, "-");
        case '*': return makeToken(TokenType::STAR, "*");
        case '/': return makeToken(TokenType::SLASH, "/");
        case '\\': return makeToken(TokenType::BACKSLASH, "\\");
        case '^': return makeToken(TokenType::CARET, "^");

        case '.':
            if (current() == '*') { advance(); return makeToken(TokenType::DOT_STAR, ".*"); }
            if (current() == '/') { advance(); return makeToken(TokenType::DOT_SLASH, "./"); }
            if (current() == '\\') { advance(); return makeToken(TokenType::DOT_BACKSLASH, ".\\"); }
            if (current() == '^') { advance(); return makeToken(TokenType::DOT_CARET, ".^"); }
            if (current() == '\'') { advance(); return makeToken(TokenType::DOT_TRANSPOSE, ".'"); }
            return makeToken(TokenType::DOT, ".");

        case '=':
            if (current() == '=') { advance(); return makeToken(TokenType::EQ, "=="); }
            return makeToken(TokenType::ASSIGN, "=");

        case '<':
            if (current() == '=') { advance(); return makeToken(TokenType::LE, "<="); }
            return makeToken(TokenType::LT, "<");

        case '>':
            if (current() == '=') { advance(); return makeToken(TokenType::GE, ">="); }
            return makeToken(TokenType::GT, ">");

        case '~':
            if (current() == '=') { advance(); return makeToken(TokenType::NE, "~="); }
            return makeToken(TokenType::NOT, "~");

        case '&':
            if (current() == '&') { advance(); return makeToken(TokenType::SHORT_AND, "&&"); }
            return makeToken(TokenType::AND, "&");

        case '|':
            if (current() == '|') { advance(); return makeToken(TokenType::SHORT_OR, "||"); }
            return makeToken(TokenType::OR, "|");

        case '(': return makeToken(TokenType::LPAREN, "(");
        case ')': return makeToken(TokenType::RPAREN, ")");
        case '[': return makeToken(TokenType::LBRACKET, "[");
        case ']': return makeToken(TokenType::RBRACKET, "]");
        case '{': return makeToken(TokenType::LBRACE, "{");
        case '}': return makeToken(TokenType::RBRACE, "}");
        case ',': return makeToken(TokenType::COMMA, ",");
        case ';': return makeToken(TokenType::SEMICOLON, ";");
        case ':': return makeToken(TokenType::COLON, ":");
        case '@': return makeToken(TokenType::AT, "@");

        default: {
            std::ostringstream oss;
            oss << "Unexpected character '" << c << "' at line " << startLine
                << ", column " << startCol;
            throw LexerError(oss.str(), startLine, startCol);
        }
    }
}

Token Lexer::scanNumber() {
    std::string num;
    int startCol = col_;

    // Integer part
    while (!isAtEnd() && std::isdigit(current())) {
        num += advance();
    }

    // Decimal part
    if (!isAtEnd() && current() == '.' && peek(1) != '.' && peek(1) != '*' &&
        peek(1) != '/' && peek(1) != '\\' && peek(1) != '^' && peek(1) != '\'') {
        num += advance(); // consume '.'
        while (!isAtEnd() && std::isdigit(current())) {
            num += advance();
        }
    }

    // Exponent part
    if (!isAtEnd() && (current() == 'e' || current() == 'E')) {
        num += advance();
        if (!isAtEnd() && (current() == '+' || current() == '-')) {
            num += advance();
        }
        while (!isAtEnd() && std::isdigit(current())) {
            num += advance();
        }
    }

    // Complex suffix (i or j)
    bool isComplex = false;
    if (!isAtEnd() && (current() == 'i' || current() == 'j') &&
        !std::isalnum(peek(1)) && peek(1) != '_') {
        num += advance();
        isComplex = true;
    }

    Token tok(TokenType::NUMBER, num, line_, startCol);
    if (isComplex) {
        tok.isComplex = true;
        tok.imagValue = std::stod(num.substr(0, num.size() - 1));
        tok.numValue = 0.0;
    } else {
        tok.numValue = std::stod(num);
    }
    lastToken_ = tok;
    return tok;
}

Token Lexer::scanString(char delimiter) {
    advance(); // skip opening delimiter
    std::string str;

    while (!isAtEnd()) {
        char c = current();
        if (c == delimiter) {
            if (peek(1) == delimiter) {
                // Escaped delimiter ('' in single-quoted, "" in double-quoted)
                str += delimiter;
                advance(); advance();
            } else {
                advance(); // skip closing delimiter
                break;
            }
        } else if (c == '\n') {
            throw LexerError("Unterminated string literal", line_, col_);
        } else {
            str += advance();
        }
    }

    Token tok(TokenType::STRING, str, line_, col_ - (int)str.size() - 2);
    lastToken_ = tok;
    return tok;
}

Token Lexer::scanIdentifierOrKeyword() {
    std::string ident;
    int startCol = col_;

    while (!isAtEnd() && (std::isalnum(current()) || current() == '_')) {
        ident += advance();
    }

    // Check if it's a keyword
    auto it = keywords_.find(ident);
    TokenType type = (it != keywords_.end()) ? it->second : TokenType::IDENTIFIER;

    Token tok(type, ident, line_, startCol);
    lastToken_ = tok;
    return tok;
}

} // namespace matfree
