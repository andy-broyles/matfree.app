#pragma once
// MatFree - Tree-walking interpreter
// Copyright (c) 2026 MatFree Contributors - MIT License

#include "ast.h"
#include "value.h"
#include "environment.h"
#include <string>
#include <vector>
#include <unordered_map>
#include <functional>
#include <iostream>
#include <filesystem>

namespace matfree {

// Control flow exceptions (used for break, continue, return)
struct BreakSignal {};
struct ContinueSignal {};
struct ReturnSignal {
    ValueList values;
};

class Interpreter {
public:
    Interpreter();

    /// Execute a program (parsed AST).
    void execute(const Program& program);

    /// Execute a single statement.
    void executeStmt(const StmtPtr& stmt);

    /// Evaluate an expression, returning a value.
    ValuePtr evalExpr(const ExprPtr& expr);

    /// Execute a .m file.
    void executeFile(const std::string& filename);

    /// Execute a string of MATLAB code.
    void executeString(const std::string& code, const std::string& source = "<input>");

    /// Get the global environment.
    Environment::Ptr globalEnv() const { return globalEnv_; }

    /// Get/set output stream (for display/disp/fprintf).
    std::ostream& output() { return *output_; }
    void setOutput(std::ostream& os) { output_ = &os; }

    /// Register a built-in function.
    void registerBuiltin(const std::string& name, BuiltinFunc func);

    /// Add a directory to the search path.
    void addPath(const std::string& path);

    /// Get the current environment
    Environment::Ptr currentEnv() const { return currentEnv_; }

    // Function calling (public so builtins like cellfun/arrayfun can access)
    ValuePtr callFunction(const std::string& name, const ValueList& args);
    ValuePtr callUserFunction(const FunctionDef& func, const ValueList& args, int nargout = 1);
    ValuePtr callFuncHandle(const FunctionHandle& fh, const ValueList& args);

private:
    Environment::Ptr globalEnv_;
    Environment::Ptr currentEnv_;
    std::ostream* output_;
    std::vector<std::string> searchPath_;

    // Function registry: user-defined and built-in
    std::unordered_map<std::string, std::shared_ptr<FunctionDef>> userFunctions_;
    std::unordered_map<std::string, BuiltinFunc> builtinFunctions_;

    // Statement execution
    void execExprStmt(const ExprStmt& stmt);
    void execAssign(const AssignStmt& stmt);
    void execMultiAssign(const MultiAssignStmt& stmt);
    void execIf(const IfStmt& stmt);
    void execFor(const ForStmt& stmt);
    void execWhile(const WhileStmt& stmt);
    void execSwitch(const SwitchStmt& stmt);
    void execTryCatch(const TryCatchStmt& stmt);
    void execFunctionDef(const FunctionDef& stmt);
    void execGlobal(const GlobalStmt& stmt);
    void execPersistent(const PersistentStmt& stmt);

    // Expression evaluation
    ValuePtr evalNumber(const NumberLiteral& expr);
    ValuePtr evalString(const StringLiteral& expr);
    ValuePtr evalBool(const BoolLiteral& expr);
    ValuePtr evalIdentifier(const Identifier& expr);
    ValuePtr evalUnary(const UnaryExpr& expr);
    ValuePtr evalBinary(const BinaryExpr& expr);
    ValuePtr evalMatrix(const MatrixLiteral& expr);
    ValuePtr evalCellArray(const CellArrayLiteral& expr);
    ValuePtr evalCall(const CallExpr& expr);
    ValuePtr evalCellIndex(const CellIndexExpr& expr);
    ValuePtr evalDot(const DotExpr& expr);
    ValuePtr evalColon(const ColonExpr& expr);
    ValuePtr evalAnonFunc(const AnonFuncExpr& expr);
    ValuePtr evalFuncHandle(const FuncHandleExpr& expr);

    // Indexed assignment helpers
    void assignIndexed(const CallExpr& target, ValuePtr value);
    void assignDot(const DotExpr& target, ValuePtr value);
    void assignCellIndex(const CellIndexExpr& target, ValuePtr value);

    // Utility
    ValuePtr lookupVariable(const std::string& name);
    bool isBuiltinFunction(const std::string& name) const;
    bool isUserFunction(const std::string& name) const;
    bool isKnownFunction(const std::string& name) const;
    std::shared_ptr<FunctionDef> findFileFunction(const std::string& name);

    // Colon range generation
    Matrix generateRange(double start, double step, double stop);
};

} // namespace matfree
