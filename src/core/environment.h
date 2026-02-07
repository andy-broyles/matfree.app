#pragma once
// MatFree - Environment (scope/variable management)
// Copyright (c) 2026 MatFree Contributors - MIT License

#include "value.h"
#include <string>
#include <unordered_map>
#include <unordered_set>
#include <memory>
#include <vector>
#include <iostream>

namespace matfree {

/// Represents a variable scope (workspace).
class Environment : public std::enable_shared_from_this<Environment> {
public:
    using Ptr = std::shared_ptr<Environment>;

    /// Create a new root (global) environment.
    static Ptr createGlobal() {
        return Ptr(new Environment(nullptr));
    }

    /// Create a child scope (e.g., for function calls).
    Ptr createChild() {
        return Ptr(new Environment(shared_from_this()));
    }

    /// Get a variable's value. Returns nullptr if not found.
    ValuePtr get(const std::string& name) const {
        auto it = variables_.find(name);
        if (it != variables_.end()) return it->second;

        // Check global declarations
        if (globals_.count(name) && parent_) {
            return getGlobalEnv()->get(name);
        }

        // Do NOT look up parent scope by default (MATLAB function scopes are isolated)
        return nullptr;
    }

    /// Set a variable's value.
    void set(const std::string& name, ValuePtr value) {
        // If declared global, set in global scope
        if (globals_.count(name) && parent_) {
            getGlobalEnv()->set(name, std::move(value));
            return;
        }
        variables_[name] = std::move(value);
    }

    /// Check if a variable exists in this scope.
    bool has(const std::string& name) const {
        if (variables_.count(name)) return true;
        if (globals_.count(name) && parent_) {
            return getGlobalEnv()->has(name);
        }
        return false;
    }

    /// Declare a variable as global.
    void declareGlobal(const std::string& name) {
        globals_.insert(name);
    }

    /// Get the parent environment.
    Ptr parent() const { return parent_; }

    /// Get all variable names.
    std::vector<std::string> variableNames() const {
        std::vector<std::string> names;
        for (auto& [k, v] : variables_) names.push_back(k);
        return names;
    }

    /// Display all variables (like MATLAB's 'whos' command).
    void displayVariables(std::ostream& os) const {
        os << "  Name            Size            Class" << std::endl;
        os << "  ────            ────            ─────" << std::endl;
        for (auto& [name, val] : variables_) {
            os << "  " << std::left << std::setw(16) << name;
            if (val->isMatrix() || val->isLogical()) {
                auto& m = val->matrix();
                os << std::setw(16) << (std::to_string(m.rows()) + "x" + std::to_string(m.cols()));
                os << (val->isLogical() ? "logical" : "double");
            } else if (val->isString()) {
                os << std::setw(16) << ("1x" + std::to_string(val->string().size()));
                os << "char";
            } else if (val->isCellArray()) {
                auto& c = val->cellArray();
                os << std::setw(16) << (std::to_string(c.rows) + "x" + std::to_string(c.cols));
                os << "cell";
            } else if (val->isStruct()) {
                os << std::setw(16) << "1x1";
                os << "struct";
            } else if (val->isFuncHandle()) {
                os << std::setw(16) << "1x1";
                os << "function_handle";
            }
            os << std::endl;
        }
    }

    /// Clear all variables.
    void clear() { variables_.clear(); }

    /// Clear a specific variable.
    void clear(const std::string& name) { variables_.erase(name); }

private:
    explicit Environment(Ptr parent) : parent_(std::move(parent)) {}

    Environment::Ptr getGlobalEnv() const {
        const Environment* env = this;
        while (env->parent_) env = env->parent_.get();
        return std::const_pointer_cast<Environment>(
            const_cast<const Environment*>(env)->shared_from_this());
    }

    Ptr parent_;
    std::unordered_map<std::string, ValuePtr> variables_;
    std::unordered_set<std::string> globals_;
};

} // namespace matfree
