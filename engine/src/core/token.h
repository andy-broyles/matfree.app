#pragma once
// MatFree - Token definitions for the MatFree lexer
// Copyright (c) 2026 MatFree Contributors - MIT License

#include <string>
#include <variant>
#include <iostream>

namespace matfree {

enum class TokenType {
    // Literals
    NUMBER,         // 42, 3.14, 1e-5, 2.5i (complex)
    STRING,         // 'hello' or "hello"

    // Identifiers and keywords
    IDENTIFIER,     // variable/function names

    // Keywords
    IF, ELSEIF, ELSE,
    END,
    FOR, WHILE,
    SWITCH, CASE, OTHERWISE,
    TRY, CATCH,
    FUNCTION, RETURN,
    BREAK, CONTINUE,
    GLOBAL, PERSISTENT,
    CLASSDEF, PROPERTIES, METHODS, EVENTS, ENUMERATION,
    TRUE_KW, FALSE_KW,

    // Arithmetic operators
    PLUS,           // +
    MINUS,          // -
    STAR,           // *
    SLASH,          // /
    BACKSLASH,      // '\'
    CARET,          // ^

    // Element-wise operators
    DOT_STAR,       // .*
    DOT_SLASH,      // ./
    DOT_BACKSLASH,  // .\'
    DOT_CARET,      // .^

    // Transpose
    TRANSPOSE,      // '  (context-dependent)
    DOT_TRANSPOSE,  // .'

    // Comparison operators
    EQ,             // ==
    NE,             // ~=
    LT,             // <
    GT,             // >
    LE,             // <=
    GE,             // >=

    // Logical operators
    AND,            // &
    OR,             // |
    SHORT_AND,      // &&
    SHORT_OR,       // ||
    NOT,            // ~

    // Assignment
    ASSIGN,         // =

    // Punctuation
    LPAREN,         // (
    RPAREN,         // )
    LBRACKET,       // [
    RBRACKET,       // ]
    LBRACE,         // {
    RBRACE,         // }
    COMMA,          // ,
    SEMICOLON,      // ;
    COLON,          // :
    DOT,            // .
    AT,             // @

    // Special
    NEWLINE,        // end of statement (newline)
    ELLIPSIS,       // ... (line continuation)

    // End of file
    EOF_TOKEN
};

inline const char* tokenTypeName(TokenType type) {
    switch (type) {
        case TokenType::NUMBER:       return "NUMBER";
        case TokenType::STRING:       return "STRING";
        case TokenType::IDENTIFIER:   return "IDENTIFIER";
        case TokenType::IF:           return "IF";
        case TokenType::ELSEIF:       return "ELSEIF";
        case TokenType::ELSE:         return "ELSE";
        case TokenType::END:          return "END";
        case TokenType::FOR:          return "FOR";
        case TokenType::WHILE:        return "WHILE";
        case TokenType::SWITCH:       return "SWITCH";
        case TokenType::CASE:         return "CASE";
        case TokenType::OTHERWISE:    return "OTHERWISE";
        case TokenType::TRY:          return "TRY";
        case TokenType::CATCH:        return "CATCH";
        case TokenType::FUNCTION:     return "FUNCTION";
        case TokenType::RETURN:       return "RETURN";
        case TokenType::BREAK:        return "BREAK";
        case TokenType::CONTINUE:     return "CONTINUE";
        case TokenType::GLOBAL:       return "GLOBAL";
        case TokenType::PERSISTENT:   return "PERSISTENT";
        case TokenType::CLASSDEF:     return "CLASSDEF";
        case TokenType::PROPERTIES:   return "PROPERTIES";
        case TokenType::METHODS:      return "METHODS";
        case TokenType::EVENTS:       return "EVENTS";
        case TokenType::ENUMERATION:  return "ENUMERATION";
        case TokenType::TRUE_KW:      return "TRUE";
        case TokenType::FALSE_KW:     return "FALSE";
        case TokenType::PLUS:         return "PLUS";
        case TokenType::MINUS:        return "MINUS";
        case TokenType::STAR:         return "STAR";
        case TokenType::SLASH:        return "SLASH";
        case TokenType::BACKSLASH:    return "BACKSLASH";
        case TokenType::CARET:        return "CARET";
        case TokenType::DOT_STAR:     return "DOT_STAR";
        case TokenType::DOT_SLASH:    return "DOT_SLASH";
        case TokenType::DOT_BACKSLASH:return "DOT_BACKSLASH";
        case TokenType::DOT_CARET:    return "DOT_CARET";
        case TokenType::TRANSPOSE:    return "TRANSPOSE";
        case TokenType::DOT_TRANSPOSE:return "DOT_TRANSPOSE";
        case TokenType::EQ:           return "EQ";
        case TokenType::NE:           return "NE";
        case TokenType::LT:           return "LT";
        case TokenType::GT:           return "GT";
        case TokenType::LE:           return "LE";
        case TokenType::GE:           return "GE";
        case TokenType::AND:          return "AND";
        case TokenType::OR:           return "OR";
        case TokenType::SHORT_AND:    return "SHORT_AND";
        case TokenType::SHORT_OR:     return "SHORT_OR";
        case TokenType::NOT:          return "NOT";
        case TokenType::ASSIGN:       return "ASSIGN";
        case TokenType::LPAREN:       return "LPAREN";
        case TokenType::RPAREN:       return "RPAREN";
        case TokenType::LBRACKET:     return "LBRACKET";
        case TokenType::RBRACKET:     return "RBRACKET";
        case TokenType::LBRACE:       return "LBRACE";
        case TokenType::RBRACE:       return "RBRACE";
        case TokenType::COMMA:        return "COMMA";
        case TokenType::SEMICOLON:    return "SEMICOLON";
        case TokenType::COLON:        return "COLON";
        case TokenType::DOT:          return "DOT";
        case TokenType::AT:           return "AT";
        case TokenType::NEWLINE:      return "NEWLINE";
        case TokenType::ELLIPSIS:     return "ELLIPSIS";
        case TokenType::EOF_TOKEN:    return "EOF";
        default:                      return "UNKNOWN";
    }
}

struct Token {
    TokenType type;
    std::string lexeme;     // The raw text of the token
    double numValue = 0.0;  // Numeric value (for NUMBER tokens)
    double imagValue = 0.0; // Imaginary component (for complex NUMBER tokens)
    bool isComplex = false;  // Whether this number is complex (e.g., 3i)
    int line = 1;
    int col = 1;

    Token() : type(TokenType::EOF_TOKEN) {}
    Token(TokenType t, const std::string& lex, int ln, int cl)
        : type(t), lexeme(lex), line(ln), col(cl) {}

    bool is(TokenType t) const { return type == t; }
    bool isOneOf(std::initializer_list<TokenType> types) const {
        for (auto t : types) if (type == t) return true;
        return false;
    }

    friend std::ostream& operator<<(std::ostream& os, const Token& tok) {
        os << "Token(" << tokenTypeName(tok.type) << ", \"" << tok.lexeme
           << "\", line=" << tok.line << ", col=" << tok.col << ")";
        return os;
    }
};

} // namespace matfree
