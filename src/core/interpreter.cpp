// MatFree - Interpreter implementation (tree-walking)
// Copyright (c) 2026 MatFree Contributors - MIT License

#include "interpreter.h"
#include "lexer.h"
#include "parser.h"
#include <fstream>
#include <sstream>
#include <cmath>
#include <algorithm>
#include <cassert>

namespace matfree {

Interpreter::Interpreter() : output_(&std::cout) {
    globalEnv_ = Environment::createGlobal();
    currentEnv_ = globalEnv_;

    // Set built-in constants
    globalEnv_->set("pi", Value::makeScalar(3.14159265358979323846));
    globalEnv_->set("inf", Value::makeScalar(std::numeric_limits<double>::infinity()));
    globalEnv_->set("Inf", Value::makeScalar(std::numeric_limits<double>::infinity()));
    globalEnv_->set("nan", Value::makeScalar(std::numeric_limits<double>::quiet_NaN()));
    globalEnv_->set("NaN", Value::makeScalar(std::numeric_limits<double>::quiet_NaN()));
    globalEnv_->set("eps", Value::makeScalar(std::numeric_limits<double>::epsilon()));
    globalEnv_->set("i", Value::makeScalar(0.0)); // TODO: complex support
    globalEnv_->set("j", Value::makeScalar(0.0)); // TODO: complex support
    globalEnv_->set("true", Value::makeBool(true));
    globalEnv_->set("false", Value::makeBool(false));

    // Add current directory to search path
    searchPath_.push_back(".");
}

void Interpreter::registerBuiltin(const std::string& name, BuiltinFunc func) {
    builtinFunctions_[name] = std::move(func);
}

void Interpreter::addPath(const std::string& path) {
    searchPath_.push_back(path);
}

// ============================================================================
// Top-level execution
// ============================================================================

void Interpreter::execute(const Program& program) {
    // Register any function definitions first
    for (auto& func : program.functions) {
        userFunctions_[func->name] = func;
    }

    // Execute statements
    for (auto& stmt : program.statements) {
        // Skip function definitions (already registered)
        if (stmt->is<FunctionDef>()) continue;
        executeStmt(stmt);
    }
}

void Interpreter::executeFile(const std::string& filename) {
    std::ifstream file(filename);
    if (!file.is_open()) {
        throw RuntimeError("Cannot open file: " + filename);
    }

    std::stringstream buffer;
    buffer << file.rdbuf();
    std::string source = buffer.str();

    executeString(source, filename);
}

void Interpreter::executeString(const std::string& code, const std::string& source) {
    Lexer lexer(code, source);
    auto tokens = lexer.tokenize();
    Parser parser(tokens);
    auto program = parser.parse();
    execute(program);
}

void Interpreter::executeStmt(const StmtPtr& stmt) {
    std::visit([this](auto& node) {
        using T = std::decay_t<decltype(node)>;
        if constexpr (std::is_same_v<T, ExprStmt>)        execExprStmt(node);
        else if constexpr (std::is_same_v<T, AssignStmt>)  execAssign(node);
        else if constexpr (std::is_same_v<T, MultiAssignStmt>) execMultiAssign(node);
        else if constexpr (std::is_same_v<T, IfStmt>)     execIf(node);
        else if constexpr (std::is_same_v<T, ForStmt>)    execFor(node);
        else if constexpr (std::is_same_v<T, WhileStmt>)  execWhile(node);
        else if constexpr (std::is_same_v<T, SwitchStmt>) execSwitch(node);
        else if constexpr (std::is_same_v<T, TryCatchStmt>) execTryCatch(node);
        else if constexpr (std::is_same_v<T, FunctionDef>) execFunctionDef(node);
        else if constexpr (std::is_same_v<T, GlobalStmt>)  execGlobal(node);
        else if constexpr (std::is_same_v<T, PersistentStmt>) execPersistent(node);
        else if constexpr (std::is_same_v<T, ReturnStmt>) throw ReturnSignal{};
        else if constexpr (std::is_same_v<T, BreakStmt>)  throw BreakSignal{};
        else if constexpr (std::is_same_v<T, ContinueStmt>) throw ContinueSignal{};
    }, stmt->node);
}

// ============================================================================
// Statement execution
// ============================================================================

void Interpreter::execExprStmt(const ExprStmt& stmt) {
    auto val = evalExpr(stmt.expression);
    if (stmt.printResult && val && !val->isEmpty()) {
        // MATLAB prints "ans = ..." when there's no semicolon
        currentEnv_->set("ans", val);
        val->display(*output_, "ans");
    }
}

void Interpreter::execAssign(const AssignStmt& stmt) {
    auto value = evalExpr(stmt.value);

    if (stmt.target->is<Identifier>()) {
        auto& name = stmt.target->as<Identifier>().name;
        currentEnv_->set(name, value);
        if (stmt.printResult && value && !value->isEmpty()) {
            value->display(*output_, name);
        }
    } else if (stmt.target->is<CallExpr>()) {
        assignIndexed(stmt.target->as<CallExpr>(), value);
        if (stmt.printResult) {
            // Display the modified variable
            auto& callee = stmt.target->as<CallExpr>().callee;
            if (callee->is<Identifier>()) {
                auto stored = currentEnv_->get(callee->as<Identifier>().name);
                if (stored) stored->display(*output_, callee->as<Identifier>().name);
            }
        }
    } else if (stmt.target->is<DotExpr>()) {
        assignDot(stmt.target->as<DotExpr>(), value);
    } else if (stmt.target->is<CellIndexExpr>()) {
        assignCellIndex(stmt.target->as<CellIndexExpr>(), value);
    } else {
        throw RuntimeError("Invalid assignment target");
    }
}

void Interpreter::execMultiAssign(const MultiAssignStmt& stmt) {
    // Evaluate the RHS - should return multiple values
    auto val = evalExpr(stmt.value);

    // For now, single return value distributed
    // TODO: Support proper multi-return from functions
    for (size_t i = 0; i < stmt.targets.size(); i++) {
        if (stmt.targets[i] == "~") continue; // skip ignored outputs
        if (i == 0) {
            currentEnv_->set(stmt.targets[i], val);
        } else {
            currentEnv_->set(stmt.targets[i], Value::makeEmpty());
        }
    }

    if (stmt.printResult && val && !val->isEmpty()) {
        for (auto& name : stmt.targets) {
            if (name == "~") continue;
            auto v = currentEnv_->get(name);
            if (v) v->display(*output_, name);
        }
    }
}

void Interpreter::execIf(const IfStmt& stmt) {
    for (auto& branch : stmt.branches) {
        if (!branch.condition) {
            // else branch
            for (auto& s : branch.body) executeStmt(s);
            return;
        }

        auto cond = evalExpr(branch.condition);
        if (cond->toBool()) {
            for (auto& s : branch.body) executeStmt(s);
            return;
        }
    }
}

void Interpreter::execFor(const ForStmt& stmt) {
    auto rangeVal = evalExpr(stmt.range);

    if (rangeVal->isMatrix() || rangeVal->isLogical()) {
        auto& mat = rangeVal->matrix();
        // Iterate over columns (MATLAB for-loop iterates over columns)
        for (size_t j = 0; j < mat.cols(); j++) {
            if (mat.rows() == 1) {
                currentEnv_->set(stmt.variable, Value::makeScalar(mat(0, j)));
            } else {
                currentEnv_->set(stmt.variable, Value::makeMatrix(mat.getCol(j)));
            }
            try {
                for (auto& s : stmt.body) executeStmt(s);
            } catch (BreakSignal&) {
                return;
            } catch (ContinueSignal&) {
                continue;
            }
        }
    } else {
        throw RuntimeError("For loop requires numeric range");
    }
}

void Interpreter::execWhile(const WhileStmt& stmt) {
    while (true) {
        auto cond = evalExpr(stmt.condition);
        if (!cond->toBool()) break;

        try {
            for (auto& s : stmt.body) executeStmt(s);
        } catch (BreakSignal&) {
            return;
        } catch (ContinueSignal&) {
            continue;
        }
    }
}

void Interpreter::execSwitch(const SwitchStmt& stmt) {
    auto val = evalExpr(stmt.expression);

    for (auto& c : stmt.cases) {
        if (!c.value) {
            // otherwise
            for (auto& s : c.body) executeStmt(s);
            return;
        }

        auto caseVal = evalExpr(c.value);

        bool match = false;
        if (val->isScalar() && caseVal->isScalar()) {
            match = (val->scalarDouble() == caseVal->scalarDouble());
        } else if (val->isString() && caseVal->isString()) {
            match = (val->string() == caseVal->string());
        }
        // TODO: handle cell array of values for case

        if (match) {
            for (auto& s : c.body) executeStmt(s);
            return;
        }
    }
}

void Interpreter::execTryCatch(const TryCatchStmt& stmt) {
    try {
        for (auto& s : stmt.tryBody) executeStmt(s);
    } catch (RuntimeError& e) {
        if (!stmt.catchVar.empty()) {
            // Create MException-like struct
            MatlabStruct exc;
            exc.fields["message"] = Value::makeString(e.what());
            exc.fields["identifier"] = Value::makeString("MatFree:runtime");
            currentEnv_->set(stmt.catchVar, Value::makeStruct(std::move(exc)));
        }
        for (auto& s : stmt.catchBody) executeStmt(s);
    } catch (std::exception& e) {
        if (!stmt.catchVar.empty()) {
            MatlabStruct exc;
            exc.fields["message"] = Value::makeString(e.what());
            exc.fields["identifier"] = Value::makeString("MatFree:internal");
            currentEnv_->set(stmt.catchVar, Value::makeStruct(std::move(exc)));
        }
        for (auto& s : stmt.catchBody) executeStmt(s);
    }
}

void Interpreter::execFunctionDef(const FunctionDef& stmt) {
    userFunctions_[stmt.name] = std::make_shared<FunctionDef>(stmt);
}

void Interpreter::execGlobal(const GlobalStmt& stmt) {
    for (auto& name : stmt.variables) {
        currentEnv_->declareGlobal(name);
    }
}

void Interpreter::execPersistent(const PersistentStmt& stmt) {
    // Simplified: treat persistent like local variables that persist
    for (auto& name : stmt.variables) {
        if (!currentEnv_->has(name)) {
            currentEnv_->set(name, Value::makeEmpty());
        }
    }
}

// ============================================================================
// Expression evaluation
// ============================================================================

ValuePtr Interpreter::evalExpr(const ExprPtr& expr) {
    return std::visit([this](auto& node) -> ValuePtr {
        using T = std::decay_t<decltype(node)>;
        if constexpr (std::is_same_v<T, NumberLiteral>)     return evalNumber(node);
        else if constexpr (std::is_same_v<T, StringLiteral>) return evalString(node);
        else if constexpr (std::is_same_v<T, BoolLiteral>)  return evalBool(node);
        else if constexpr (std::is_same_v<T, Identifier>)   return evalIdentifier(node);
        else if constexpr (std::is_same_v<T, UnaryExpr>)    return evalUnary(node);
        else if constexpr (std::is_same_v<T, BinaryExpr>)   return evalBinary(node);
        else if constexpr (std::is_same_v<T, MatrixLiteral>) return evalMatrix(node);
        else if constexpr (std::is_same_v<T, CellArrayLiteral>) return evalCellArray(node);
        else if constexpr (std::is_same_v<T, CallExpr>)     return evalCall(node);
        else if constexpr (std::is_same_v<T, CellIndexExpr>) return evalCellIndex(node);
        else if constexpr (std::is_same_v<T, DotExpr>)      return evalDot(node);
        else if constexpr (std::is_same_v<T, ColonExpr>)    return evalColon(node);
        else if constexpr (std::is_same_v<T, EndExpr>)      return Value::makeScalar(0); // TODO
        else if constexpr (std::is_same_v<T, AnonFuncExpr>) return evalAnonFunc(node);
        else if constexpr (std::is_same_v<T, FuncHandleExpr>) return evalFuncHandle(node);
        else if constexpr (std::is_same_v<T, CommandExpr>) {
            throw RuntimeError("Command syntax not yet supported");
        }
        else return Value::makeEmpty();
    }, expr->node);
}

ValuePtr Interpreter::evalNumber(const NumberLiteral& expr) {
    if (expr.isComplex) {
        // TODO: proper complex support
        return Value::makeScalar(expr.imagValue);
    }
    return Value::makeScalar(expr.value);
}

ValuePtr Interpreter::evalString(const StringLiteral& expr) {
    return Value::makeString(expr.value);
}

ValuePtr Interpreter::evalBool(const BoolLiteral& expr) {
    return Value::makeBool(expr.value);
}

ValuePtr Interpreter::evalIdentifier(const Identifier& expr) {
    auto val = lookupVariable(expr.name);
    if (val) return val;

    // Check if it's a function call with no arguments (MATLAB allows this)
    if (isKnownFunction(expr.name)) {
        return callFunction(expr.name, {});
    }

    throw RuntimeError("Undefined variable or function '" + expr.name + "'");
}

ValuePtr Interpreter::evalUnary(const UnaryExpr& expr) {
    auto operand = evalExpr(expr.operand);

    switch (expr.op) {
        case TokenType::MINUS:
            if (operand->isNumeric()) {
                return Value::makeMatrix(-operand->matrix());
            }
            throw RuntimeError("Unary minus requires numeric operand");

        case TokenType::PLUS:
            return operand;

        case TokenType::NOT:
            if (operand->isNumeric()) {
                auto& m = operand->matrix();
                Matrix result(m.rows(), m.cols());
                for (size_t i = 0; i < m.numel(); i++)
                    result(i) = (m(i) == 0.0) ? 1.0 : 0.0;
                return Value::makeMatrix(std::move(result));
            }
            throw RuntimeError("Logical NOT requires numeric operand");

        case TokenType::TRANSPOSE:
            if (operand->isNumeric()) {
                return Value::makeMatrix(operand->matrix().transpose());
            }
            throw RuntimeError("Transpose requires numeric operand");

        case TokenType::DOT_TRANSPOSE:
            if (operand->isNumeric()) {
                return Value::makeMatrix(operand->matrix().transpose());
            }
            throw RuntimeError("Transpose requires numeric operand");

        default:
            throw RuntimeError("Unknown unary operator");
    }
}

ValuePtr Interpreter::evalBinary(const BinaryExpr& expr) {
    auto left = evalExpr(expr.left);
    auto right = evalExpr(expr.right);

    // String concatenation with +
    if (left->isString() && right->isString() && expr.op == TokenType::PLUS) {
        // MATLAB actually does char code addition, not concatenation
        // But we'll handle both char arrays
    }

    // Numeric operations
    if (left->isNumeric() && right->isNumeric()) {
        auto& lm = left->matrix();
        auto& rm = right->matrix();

        switch (expr.op) {
            case TokenType::PLUS:      return Value::makeMatrix(lm + rm);
            case TokenType::MINUS:     return Value::makeMatrix(lm - rm);
            case TokenType::STAR:      return Value::makeMatrix(lm * rm);
            case TokenType::SLASH: {
                // A / B = A * inv(B) for matrices, element-wise for scalars
                if (rm.isScalar()) return Value::makeMatrix(lm / rm.scalarValue());
                // TODO: proper matrix right division
                return Value::makeMatrix(lm.elementDiv(rm));
            }
            case TokenType::BACKSLASH: {
                // A \ B = inv(A) * B
                if (lm.isScalar()) return Value::makeMatrix(rm / lm.scalarValue());
                // TODO: proper matrix left division (solve Ax=B)
                throw RuntimeError("Matrix left division not yet fully implemented");
            }
            case TokenType::CARET: {
                // Matrix power
                if (rm.isScalar()) return Value::makeMatrix(lm.power(rm.scalarValue()));
                throw RuntimeError("Matrix power requires scalar exponent");
            }
            case TokenType::DOT_STAR:  return Value::makeMatrix(lm.elementMul(rm));
            case TokenType::DOT_SLASH: return Value::makeMatrix(lm.elementDiv(rm));
            case TokenType::DOT_CARET: return Value::makeMatrix(lm.elementPow(rm));
            case TokenType::EQ:        return Value::makeMatrix(lm.eq(rm));
            case TokenType::NE:        return Value::makeMatrix(lm.ne(rm));
            case TokenType::LT:        return Value::makeMatrix(lm.lt(rm));
            case TokenType::GT:        return Value::makeMatrix(lm.gt(rm));
            case TokenType::LE:        return Value::makeMatrix(lm.le(rm));
            case TokenType::GE:        return Value::makeMatrix(lm.ge(rm));
            case TokenType::AND:
            case TokenType::SHORT_AND: {
                Matrix result(lm.rows(), lm.cols());
                // Broadcasting for AND
                size_t r = std::max(lm.rows(), rm.rows());
                size_t c = std::max(lm.cols(), rm.cols());
                result = Matrix(r, c);
                for (size_t i = 0; i < r; i++)
                    for (size_t j = 0; j < c; j++)
                        result(i, j) = (lm.getWithBroadcast(i, j) != 0.0 &&
                                        rm.getWithBroadcast(i, j) != 0.0) ? 1.0 : 0.0;
                return Value::makeMatrix(std::move(result));
            }
            case TokenType::OR:
            case TokenType::SHORT_OR: {
                size_t r = std::max(lm.rows(), rm.rows());
                size_t c = std::max(lm.cols(), rm.cols());
                Matrix result(r, c);
                for (size_t i = 0; i < r; i++)
                    for (size_t j = 0; j < c; j++)
                        result(i, j) = (lm.getWithBroadcast(i, j) != 0.0 ||
                                        rm.getWithBroadcast(i, j) != 0.0) ? 1.0 : 0.0;
                return Value::makeMatrix(std::move(result));
            }
            default:
                throw RuntimeError("Unknown binary operator");
        }
    }

    // String comparison
    if (left->isString() && right->isString()) {
        if (expr.op == TokenType::EQ) {
            return Value::makeBool(left->string() == right->string());
        }
        if (expr.op == TokenType::NE) {
            return Value::makeBool(left->string() != right->string());
        }
    }

    throw RuntimeError("Unsupported operand types for binary operation");
}

ValuePtr Interpreter::evalMatrix(const MatrixLiteral& expr) {
    if (expr.rows.empty()) {
        return Value::makeMatrix(Matrix());
    }

    // Evaluate all elements
    std::vector<std::vector<Matrix>> evaluatedRows;
    for (auto& row : expr.rows) {
        std::vector<Matrix> evalRow;
        for (auto& elem : row) {
            auto val = evalExpr(elem);
            if (val->isNumeric()) {
                evalRow.push_back(val->matrix());
            } else if (val->isString()) {
                evalRow.push_back(val->toMatrix());
            } else {
                throw RuntimeError("Invalid element in matrix literal");
            }
        }
        evaluatedRows.push_back(std::move(evalRow));
    }

    // Build the matrix by horizontal and vertical concatenation
    std::vector<Matrix> rowMatrices;
    for (auto& row : evaluatedRows) {
        if (row.size() == 1) {
            rowMatrices.push_back(row[0]);
        } else {
            rowMatrices.push_back(Matrix::horzcat(row));
        }
    }

    if (rowMatrices.size() == 1) {
        return Value::makeMatrix(std::move(rowMatrices[0]));
    }
    return Value::makeMatrix(Matrix::vertcat(rowMatrices));
}

ValuePtr Interpreter::evalCellArray(const CellArrayLiteral& expr) {
    if (expr.rows.empty()) {
        return Value::makeCellArray(CellArray());
    }

    size_t nrows = expr.rows.size();
    size_t ncols = expr.rows[0].size();
    CellArray cell(nrows, ncols);

    for (size_t i = 0; i < nrows; i++) {
        for (size_t j = 0; j < expr.rows[i].size(); j++) {
            cell.at(i, j) = evalExpr(expr.rows[i][j]);
        }
    }

    return Value::makeCellArray(std::move(cell));
}

ValuePtr Interpreter::evalCall(const CallExpr& expr) {
    // Determine if this is a function call or array indexing
    if (expr.callee->is<Identifier>()) {
        auto& name = expr.callee->as<Identifier>().name;

        // Evaluate arguments
        ValueList args;
        for (auto& arg : expr.arguments) {
            args.push_back(evalExpr(arg));
        }

        // Check if it's a variable (array indexing or function handle call)
        auto var = lookupVariable(name);
        if (var && var->isFuncHandle()) {
            // Variable holds a function handle — call it
            return callFuncHandle(var->funcHandle(), args);
        }
        if (var && !isKnownFunction(name)) {
            // Array indexing
            if (var->isNumeric()) {
                auto& mat = var->matrix();

                if (args.size() == 1) {
                    // Linear indexing or colon
                    auto& idx = args[0];
                    if (idx->isEmpty() || (idx->isMatrix() && idx->matrix().isEmpty())) {
                        // A(:) - return as column vector
                        Matrix result(mat.numel(), 1);
                        for (size_t i = 0; i < mat.numel(); i++)
                            result(i, 0) = mat(i);
                        return Value::makeMatrix(std::move(result));
                    }

                    if (idx->isNumeric()) {
                        auto& idxMat = idx->matrix();
                        if (idxMat.isScalar()) {
                            size_t i = static_cast<size_t>(idxMat.scalarValue()) - 1; // 1-indexed to 0-indexed
                            if (i >= mat.numel())
                                throw RuntimeError("Index exceeds array dimensions");
                            return Value::makeScalar(mat(i));
                        }
                        // Vector indexing
                        Matrix result(idxMat.rows(), idxMat.cols());
                        for (size_t k = 0; k < idxMat.numel(); k++) {
                            size_t i = static_cast<size_t>(idxMat(k)) - 1;
                            if (i >= mat.numel())
                                throw RuntimeError("Index exceeds array dimensions");
                            result(k) = mat(i);
                        }
                        return Value::makeMatrix(std::move(result));
                    }
                } else if (args.size() == 2) {
                    // 2D indexing: A(row, col)
                    std::vector<size_t> rowIdx, colIdx;
                    if (args[0]->isEmpty()) {
                        rowIdx.resize(mat.rows());
                        std::iota(rowIdx.begin(), rowIdx.end(), 0);
                    } else if (args[0]->isNumeric()) {
                        auto& rm = args[0]->matrix();
                        for (size_t i = 0; i < rm.numel(); i++)
                            rowIdx.push_back(static_cast<size_t>(rm(i)) - 1);
                    }

                    if (args[1]->isEmpty()) {
                        colIdx.resize(mat.cols());
                        std::iota(colIdx.begin(), colIdx.end(), 0);
                    } else if (args[1]->isNumeric()) {
                        auto& cm = args[1]->matrix();
                        for (size_t i = 0; i < cm.numel(); i++)
                            colIdx.push_back(static_cast<size_t>(cm(i)) - 1);
                    }

                    if (rowIdx.size() == 1 && colIdx.size() == 1) {
                        return Value::makeScalar(mat(rowIdx[0], colIdx[0]));
                    }

                    Matrix result(rowIdx.size(), colIdx.size());
                    for (size_t i = 0; i < rowIdx.size(); i++)
                        for (size_t j = 0; j < colIdx.size(); j++)
                            result(i, j) = mat(rowIdx[i], colIdx[j]);
                    return Value::makeMatrix(std::move(result));
                }
            } else if (var->isCellArray()) {
                // Cell array parenthetical indexing returns a cell
                // (not content - that's {})
                throw RuntimeError("Cell array () indexing not fully supported yet, use {} instead");
            } else if (var->isStruct()) {
                // Struct array indexing
                throw RuntimeError("Struct array indexing not yet supported");
            }
        }

        // It's a function call
        return callFunction(name, args);
    }

    // Call on an expression (e.g., function handle)
    auto callee = evalExpr(expr.callee);
    if (callee->isFuncHandle()) {
        ValueList args;
        for (auto& arg : expr.arguments) {
            args.push_back(evalExpr(arg));
        }
        return callFuncHandle(callee->funcHandle(), args);
    }

    throw RuntimeError("Cannot call non-function value");
}

ValuePtr Interpreter::evalCellIndex(const CellIndexExpr& expr) {
    auto obj = evalExpr(expr.object);
    if (!obj->isCellArray()) {
        throw RuntimeError("Cell indexing requires a cell array");
    }

    auto& cell = obj->cellArray();
    ValueList indices;
    for (auto& idx : expr.indices) {
        indices.push_back(evalExpr(idx));
    }

    if (indices.size() == 1 && indices[0]->isScalar()) {
        size_t i = static_cast<size_t>(indices[0]->scalarDouble()) - 1;
        if (i >= cell.data.size())
            throw RuntimeError("Index exceeds cell array dimensions");
        return cell.data[i] ? cell.data[i] : Value::makeEmpty();
    }

    if (indices.size() == 2 && indices[0]->isScalar() && indices[1]->isScalar()) {
        size_t r = static_cast<size_t>(indices[0]->scalarDouble()) - 1;
        size_t c = static_cast<size_t>(indices[1]->scalarDouble()) - 1;
        return cell.at(r, c) ? cell.at(r, c) : Value::makeEmpty();
    }

    throw RuntimeError("Cell array indexing error");
}

ValuePtr Interpreter::evalDot(const DotExpr& expr) {
    auto obj = evalExpr(expr.object);

    if (obj->isStruct()) {
        auto& s = obj->structVal();
        auto it = s.fields.find(expr.field);
        if (it == s.fields.end()) {
            throw RuntimeError("Reference to non-existent field '" + expr.field + "'");
        }
        return it->second;
    }

    throw RuntimeError("Dot access requires a struct");
}

ValuePtr Interpreter::evalColon(const ColonExpr& expr) {
    // Bare colon (all nulls) → used for indexing, return empty marker
    if (!expr.start && !expr.stop) {
        return Value::makeEmpty(); // Will be interpreted as ":" by indexing code
    }

    if (!expr.start) {
        return Value::makeEmpty();
    }
    if (!expr.stop) {
        return evalExpr(expr.start);
    }

    double start = evalExpr(expr.start)->scalarDouble();
    double stop = evalExpr(expr.stop)->scalarDouble();
    double step = expr.step ? evalExpr(expr.step)->scalarDouble() : 1.0;

    return Value::makeMatrix(generateRange(start, step, stop));
}

ValuePtr Interpreter::evalAnonFunc(const AnonFuncExpr& expr) {
    // Capture the anonymous function body and parameters
    auto funcDef = std::make_shared<FunctionDef>();
    funcDef->name = "<anonymous>";
    funcDef->params = expr.params;
    funcDef->returns = {"ans"};

    // Wrap the body expression in a return-like statement
    // We'll store the expression and evaluate it when called
    auto bodyStmt = std::make_shared<Stmt>(
        AssignStmt{
            std::make_shared<Expr>(Identifier{"ans"}, expr.body->line, expr.body->col),
            expr.body,
            false
        },
        expr.body->line, expr.body->col
    );
    funcDef->body.push_back(bodyStmt);

    FunctionHandle fh;
    fh.name = "<anonymous>";
    fh.impl = funcDef;

    return Value::makeFuncHandle(std::move(fh));
}

ValuePtr Interpreter::evalFuncHandle(const FuncHandleExpr& expr) {
    FunctionHandle fh;
    fh.name = expr.name;

    // Check if it's a built-in
    if (builtinFunctions_.count(expr.name)) {
        fh.impl = builtinFunctions_[expr.name];
    } else if (userFunctions_.count(expr.name)) {
        fh.impl = userFunctions_[expr.name];
    } else {
        throw RuntimeError("Undefined function '" + expr.name + "'");
    }

    return Value::makeFuncHandle(std::move(fh));
}

// ============================================================================
// Function calling
// ============================================================================

ValuePtr Interpreter::callFunction(const std::string& name, const ValueList& args) {
    // Check built-ins first
    if (builtinFunctions_.count(name)) {
        return builtinFunctions_[name](args);
    }

    // Check user-defined functions
    if (userFunctions_.count(name)) {
        return callUserFunction(*userFunctions_[name], args);
    }

    // Try to find a .m file on the path
    auto fileFn = findFileFunction(name);
    if (fileFn) {
        userFunctions_[name] = fileFn;
        return callUserFunction(*fileFn, args);
    }

    throw RuntimeError("Undefined function '" + name + "'");
}

ValuePtr Interpreter::callUserFunction(const FunctionDef& func, const ValueList& args, int nargout) {
    // Create a new scope for the function
    auto funcEnv = globalEnv_->createChild();
    auto savedEnv = currentEnv_;
    currentEnv_ = funcEnv;

    // Bind parameters
    for (size_t i = 0; i < func.params.size() && i < args.size(); i++) {
        funcEnv->set(func.params[i], args[i]);
    }

    // Set nargin/nargout
    funcEnv->set("nargin", Value::makeScalar(static_cast<double>(args.size())));
    funcEnv->set("nargout", Value::makeScalar(static_cast<double>(nargout)));

    // Initialize return variables to empty
    for (auto& ret : func.returns) {
        if (!funcEnv->has(ret)) {
            funcEnv->set(ret, Value::makeEmpty());
        }
    }

    // Execute function body
    try {
        for (auto& stmt : func.body) {
            executeStmt(stmt);
        }
    } catch (ReturnSignal&) {
        // Return was called
    }

    // Collect return values
    ValuePtr result;
    if (func.returns.empty()) {
        result = Value::makeEmpty();
    } else if (func.returns.size() == 1) {
        result = funcEnv->get(func.returns[0]);
        if (!result) result = Value::makeEmpty();
    } else {
        // Multi-return: for now, return first
        result = funcEnv->get(func.returns[0]);
        if (!result) result = Value::makeEmpty();
    }

    currentEnv_ = savedEnv;
    return result;
}

ValuePtr Interpreter::callFuncHandle(const FunctionHandle& fh, const ValueList& args) {
    if (auto* builtin = std::get_if<BuiltinFunc>(&fh.impl)) {
        return (*builtin)(args);
    }
    if (auto* funcDef = std::get_if<std::shared_ptr<FunctionDef>>(&fh.impl)) {
        return callUserFunction(**funcDef, args);
    }
    throw RuntimeError("Invalid function handle");
}

// ============================================================================
// Indexed assignment helpers
// ============================================================================

void Interpreter::assignIndexed(const CallExpr& target, ValuePtr value) {
    if (!target.callee->is<Identifier>()) {
        throw RuntimeError("Invalid indexed assignment target");
    }
    auto& name = target.callee->as<Identifier>().name;

    // Get or create the variable
    auto var = currentEnv_->get(name);

    // Evaluate indices
    ValueList indices;
    for (auto& arg : target.arguments) {
        indices.push_back(evalExpr(arg));
    }

    if (!var || var->isEmpty()) {
        // Create new matrix if doesn't exist
        if (indices.size() == 2 && indices[0]->isScalar() && indices[1]->isScalar()) {
            size_t r = static_cast<size_t>(indices[0]->scalarDouble());
            size_t c = static_cast<size_t>(indices[1]->scalarDouble());
            Matrix m = Matrix::zeros(r, c);
            if (value->isScalar()) {
                m(r - 1, c - 1) = value->scalarDouble();
            }
            currentEnv_->set(name, Value::makeMatrix(std::move(m)));
            return;
        }
    }

    if (var && var->isNumeric()) {
        auto mat = var->matrix(); // copy

        if (indices.size() == 1 && indices[0]->isScalar()) {
            size_t idx = static_cast<size_t>(indices[0]->scalarDouble()) - 1;
            // Grow if needed
            if (idx >= mat.numel()) {
                Matrix newMat(1, idx + 1, 0.0);
                for (size_t i = 0; i < mat.numel(); i++) newMat(i) = mat(i);
                mat = newMat;
            }
            mat(idx) = value->scalarDouble();
        } else if (indices.size() == 2 && indices[0]->isScalar() && indices[1]->isScalar()) {
            size_t r = static_cast<size_t>(indices[0]->scalarDouble()) - 1;
            size_t c = static_cast<size_t>(indices[1]->scalarDouble()) - 1;
            // Grow if needed
            size_t newRows = std::max(mat.rows(), r + 1);
            size_t newCols = std::max(mat.cols(), c + 1);
            if (newRows > mat.rows() || newCols > mat.cols()) {
                Matrix newMat = Matrix::zeros(newRows, newCols);
                for (size_t i = 0; i < mat.rows(); i++)
                    for (size_t j = 0; j < mat.cols(); j++)
                        newMat(i, j) = mat(i, j);
                mat = newMat;
            }
            mat(r, c) = value->scalarDouble();
        }

        currentEnv_->set(name, Value::makeMatrix(std::move(mat)));
    }
}

void Interpreter::assignDot(const DotExpr& target, ValuePtr value) {
    if (target.object->is<Identifier>()) {
        auto& name = target.object->as<Identifier>().name;
        auto obj = lookupVariable(name);  // Don't use evalExpr to avoid "undefined" error
        if (!obj || obj->isEmpty()) {
            // Create new struct
            MatlabStruct s;
            s.fields[target.field] = std::move(value);
            currentEnv_->set(name, Value::makeStruct(std::move(s)));
        } else if (obj->isStruct()) {
            auto s = obj->structVal(); // copy
            s.fields[target.field] = std::move(value);
            currentEnv_->set(name, Value::makeStruct(std::move(s)));
        } else {
            throw RuntimeError("Cannot set field on non-struct value");
        }
    } else {
        throw RuntimeError("Dot assignment requires an identifier base");
    }
}

void Interpreter::assignCellIndex(const CellIndexExpr& target, ValuePtr value) {
    if (!target.object->is<Identifier>()) {
        throw RuntimeError("Cell index assignment requires an identifier");
    }
    auto& name = target.object->as<Identifier>().name;

    auto obj = currentEnv_->get(name);
    if (!obj || obj->isEmpty()) {
        // Create a new cell array
        CellArray cell;
        // Determine size from index
        ValueList indices;
        for (auto& idx : target.indices) indices.push_back(evalExpr(idx));

        if (indices.size() == 1 && indices[0]->isScalar()) {
            size_t i = static_cast<size_t>(indices[0]->scalarDouble());
            cell.rows = 1;
            cell.cols = i;
            cell.data.resize(i);
            cell.data[i - 1] = std::move(value);
        }
        currentEnv_->set(name, Value::makeCellArray(std::move(cell)));
    } else if (obj->isCellArray()) {
        auto cell = obj->cellArray(); // copy
        ValueList indices;
        for (auto& idx : target.indices) indices.push_back(evalExpr(idx));

        if (indices.size() == 1 && indices[0]->isScalar()) {
            size_t i = static_cast<size_t>(indices[0]->scalarDouble()) - 1;
            if (i >= cell.data.size()) {
                cell.data.resize(i + 1);
                cell.cols = i + 1;
            }
            cell.data[i] = std::move(value);
        }
        currentEnv_->set(name, Value::makeCellArray(std::move(cell)));
    }
}

// ============================================================================
// Utility
// ============================================================================

ValuePtr Interpreter::lookupVariable(const std::string& name) {
    return currentEnv_->get(name);
}

bool Interpreter::isBuiltinFunction(const std::string& name) const {
    return builtinFunctions_.count(name) > 0;
}

bool Interpreter::isUserFunction(const std::string& name) const {
    return userFunctions_.count(name) > 0;
}

bool Interpreter::isKnownFunction(const std::string& name) const {
    return isBuiltinFunction(name) || isUserFunction(name);
}

std::shared_ptr<FunctionDef> Interpreter::findFileFunction(const std::string& name) {
    for (auto& dir : searchPath_) {
        std::string path = dir + "/" + name + ".m";
        std::ifstream file(path);
        if (file.is_open()) {
            std::stringstream buffer;
            buffer << file.rdbuf();
            std::string source = buffer.str();

            try {
                Lexer lexer(source, path);
                auto tokens = lexer.tokenize();
                Parser parser(tokens);
                auto program = parser.parse();

                if (!program.functions.empty()) {
                    return program.functions[0];
                }
            } catch (...) {
                // File exists but failed to parse
            }
        }
    }
    return nullptr;
}

Matrix Interpreter::generateRange(double start, double step, double stop) {
    if (step == 0) throw RuntimeError("Step size cannot be zero");

    std::vector<double> values;
    if (step > 0) {
        for (double v = start; v <= stop + step * 1e-10; v += step) {
            values.push_back(v);
        }
    } else {
        for (double v = start; v >= stop + step * 1e-10; v += step) {
            values.push_back(v);
        }
    }

    size_t n = values.size();
    return Matrix(1, n, std::move(values));
}

} // namespace matfree
