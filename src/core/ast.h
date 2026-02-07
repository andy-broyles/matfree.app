#pragma once
// MatFree - Abstract Syntax Tree node definitions
// Copyright (c) 2026 MatFree Contributors - MIT License

#include "token.h"
#include <memory>
#include <string>
#include <vector>
#include <variant>
#include <optional>

namespace matfree {

// Forward declarations
struct Expr;
struct Stmt;

using ExprPtr = std::shared_ptr<Expr>;
using StmtPtr = std::shared_ptr<Stmt>;
using ExprList = std::vector<ExprPtr>;
using StmtList = std::vector<StmtPtr>;

// ============================================================================
// Expression nodes
// ============================================================================

/// Numeric literal: 42, 3.14, 2.5i
struct NumberLiteral {
    double value;
    double imagValue;
    bool isComplex;
};

/// String literal: 'hello' or "hello"
struct StringLiteral {
    std::string value;
};

/// Boolean literal: true, false
struct BoolLiteral {
    bool value;
};

/// Variable reference: x, myVar
struct Identifier {
    std::string name;
};

/// Unary operation: -x, ~x, x'
struct UnaryExpr {
    TokenType op;
    ExprPtr operand;
    bool postfix; // true for transpose (x')
};

/// Binary operation: x + y, x .* y, etc.
struct BinaryExpr {
    TokenType op;
    ExprPtr left;
    ExprPtr right;
};

/// Matrix literal: [1 2 3; 4 5 6]
struct MatrixLiteral {
    std::vector<ExprList> rows; // Each row is a list of expressions
};

/// Cell array literal: {1, 'hello', [1 2 3]}
struct CellArrayLiteral {
    std::vector<ExprList> rows;
};

/// Function call or array indexing: foo(x, y) or A(i, j)
struct CallExpr {
    ExprPtr callee;         // The function/array being called/indexed
    ExprList arguments;     // Arguments
};

/// Cell indexing: C{i, j}
struct CellIndexExpr {
    ExprPtr object;
    ExprList indices;
};

/// Dot (field) access: s.field
struct DotExpr {
    ExprPtr object;
    std::string field;
};

/// Colon expression: start:stop or start:step:stop
struct ColonExpr {
    ExprPtr start;
    ExprPtr step;  // nullptr if not provided (defaults to 1)
    ExprPtr stop;
};

/// The bare 'end' keyword when used in indexing context
struct EndExpr {};

/// Anonymous function: @(x, y) x + y
struct AnonFuncExpr {
    std::vector<std::string> params;
    ExprPtr body;
};

/// Function handle: @functionName
struct FuncHandleExpr {
    std::string name;
};

/// Assignment target for multiple returns: [a, b, c]
struct MultiAssignTarget {
    std::vector<std::string> names;
};

/// Lambda/short-circuit expressions for special MATLAB syntax
struct CommandExpr {
    std::string command;
    std::vector<std::string> args;
};

// The expression variant
using ExprVariant = std::variant<
    NumberLiteral,
    StringLiteral,
    BoolLiteral,
    Identifier,
    UnaryExpr,
    BinaryExpr,
    MatrixLiteral,
    CellArrayLiteral,
    CallExpr,
    CellIndexExpr,
    DotExpr,
    ColonExpr,
    EndExpr,
    AnonFuncExpr,
    FuncHandleExpr,
    CommandExpr
>;

struct Expr {
    ExprVariant node;
    int line = 0;
    int col = 0;

    template <typename T>
    Expr(T&& n, int ln = 0, int cl = 0)
        : node(std::forward<T>(n)), line(ln), col(cl) {}

    template <typename T>
    bool is() const { return std::holds_alternative<T>(node); }

    template <typename T>
    const T& as() const { return std::get<T>(node); }

    template <typename T>
    T& as() { return std::get<T>(node); }
};

template <typename T, typename... Args>
ExprPtr makeExpr(int line, int col, Args&&... args) {
    return std::make_shared<Expr>(T{std::forward<Args>(args)...}, line, col);
}

// ============================================================================
// Statement nodes
// ============================================================================

/// Expression statement: foo(x); or a = b + c
struct ExprStmt {
    ExprPtr expression;
    bool printResult; // true if no semicolon (MATLAB prints result)
};

/// Assignment: x = expr or [a, b] = expr
struct AssignStmt {
    ExprPtr target;                         // Identifier, DotExpr, CallExpr (for indexed assignment)
    ExprPtr value;
    bool printResult;
};

/// Multiple output assignment: [a, b, c] = func(x)
struct MultiAssignStmt {
    std::vector<std::string> targets;
    ExprPtr value;
    bool printResult;
};

/// If statement: if cond ... elseif cond ... else ... end
struct IfStmt {
    struct Branch {
        ExprPtr condition; // nullptr for 'else' branch
        StmtList body;
    };
    std::vector<Branch> branches;
};

/// For loop: for i = expr ... end
struct ForStmt {
    std::string variable;
    ExprPtr range;
    StmtList body;
};

/// While loop: while cond ... end
struct WhileStmt {
    ExprPtr condition;
    StmtList body;
};

/// Switch statement: switch expr, case val1 ..., case val2 ..., otherwise ..., end
struct SwitchStmt {
    ExprPtr expression;
    struct Case {
        ExprPtr value;  // nullptr for 'otherwise'
        StmtList body;
    };
    std::vector<Case> cases;
};

/// Try-catch: try ... catch e ... end
struct TryCatchStmt {
    StmtList tryBody;
    std::string catchVar; // empty if no variable
    StmtList catchBody;
};

/// Return statement
struct ReturnStmt {};

/// Break statement
struct BreakStmt {};

/// Continue statement
struct ContinueStmt {};

/// Global declaration: global x y z
struct GlobalStmt {
    std::vector<std::string> variables;
};

/// Persistent declaration: persistent x y z
struct PersistentStmt {
    std::vector<std::string> variables;
};

/// Function definition
struct FunctionDef {
    std::string name;
    std::vector<std::string> params;
    std::vector<std::string> returns; // output variables
    StmtList body;
};

/// Class definition (basic)
struct ClassDef {
    std::string name;
    std::vector<std::string> superclasses;
    // Simplified: properties as name-value pairs, methods as functions
    std::vector<std::pair<std::string, ExprPtr>> properties;
    std::vector<std::shared_ptr<FunctionDef>> methods;
};

// The statement variant
using StmtVariant = std::variant<
    ExprStmt,
    AssignStmt,
    MultiAssignStmt,
    IfStmt,
    ForStmt,
    WhileStmt,
    SwitchStmt,
    TryCatchStmt,
    ReturnStmt,
    BreakStmt,
    ContinueStmt,
    GlobalStmt,
    PersistentStmt,
    FunctionDef,
    ClassDef
>;

struct Stmt {
    StmtVariant node;
    int line = 0;
    int col = 0;

    template <typename T>
    Stmt(T&& n, int ln = 0, int cl = 0)
        : node(std::forward<T>(n)), line(ln), col(cl) {}

    template <typename T>
    bool is() const { return std::holds_alternative<T>(node); }

    template <typename T>
    const T& as() const { return std::get<T>(node); }

    template <typename T>
    T& as() { return std::get<T>(node); }
};

template <typename T, typename... Args>
StmtPtr makeStmt(int line, int col, Args&&... args) {
    return std::make_shared<Stmt>(T{std::forward<Args>(args)...}, line, col);
}

// ============================================================================
// Program (top-level): a sequence of statements and/or function definitions
// ============================================================================

struct Program {
    StmtList statements;
    std::vector<std::shared_ptr<FunctionDef>> functions; // Top-level functions
};

} // namespace matfree
