// MatFree - Built-in function implementations
// Copyright (c) 2026 MatFree Contributors - MIT License

#include "builtins.h"
#include <cmath>
#include <algorithm>
#include <numeric>
#include <sstream>
#include <iostream>
#include <fstream>
#include <chrono>
#include <random>
#include <functional>

namespace matfree {

// Helper: require exactly N arguments
static void requireArgs(const std::string& name, const ValueList& args, size_t n) {
    if (args.size() != n) {
        throw RuntimeError(name + " requires " + std::to_string(n) + " argument(s), got " +
                          std::to_string(args.size()));
    }
}

// Helper: require at least N arguments
static void requireMinArgs(const std::string& name, const ValueList& args, size_t n) {
    if (args.size() < n) {
        throw RuntimeError(name + " requires at least " + std::to_string(n) + " argument(s)");
    }
}

// ============================================================================
// Math built-ins
// ============================================================================

void registerMathBuiltins(Interpreter& interp) {
    // Element-wise math functions
    auto makeElementwise = [](const std::string& name, double(*fn)(double)) {
        return [name, fn](const ValueList& args) -> ValuePtr {
            requireArgs(name, args, 1);
            if (args[0]->isScalar()) {
                return Value::makeScalar(fn(args[0]->scalarDouble()));
            }
            if (args[0]->isNumeric()) {
                auto& m = args[0]->matrix();
                Matrix result(m.rows(), m.cols());
                for (size_t i = 0; i < m.numel(); i++) {
                    result(i) = fn(m(i));
                }
                return Value::makeMatrix(std::move(result));
            }
            throw RuntimeError(name + " requires numeric input");
        };
    };

    interp.registerBuiltin("sin",   makeElementwise("sin",   std::sin));
    interp.registerBuiltin("cos",   makeElementwise("cos",   std::cos));
    interp.registerBuiltin("tan",   makeElementwise("tan",   std::tan));
    interp.registerBuiltin("asin",  makeElementwise("asin",  std::asin));
    interp.registerBuiltin("acos",  makeElementwise("acos",  std::acos));
    interp.registerBuiltin("atan",  makeElementwise("atan",  std::atan));
    interp.registerBuiltin("sinh",  makeElementwise("sinh",  std::sinh));
    interp.registerBuiltin("cosh",  makeElementwise("cosh",  std::cosh));
    interp.registerBuiltin("tanh",  makeElementwise("tanh",  std::tanh));
    interp.registerBuiltin("exp",   makeElementwise("exp",   std::exp));
    interp.registerBuiltin("log",   makeElementwise("log",   std::log));
    interp.registerBuiltin("log2",  makeElementwise("log2",  std::log2));
    interp.registerBuiltin("log10", makeElementwise("log10", std::log10));
    interp.registerBuiltin("sqrt",  makeElementwise("sqrt",  std::sqrt));
    interp.registerBuiltin("abs",   makeElementwise("abs",   std::abs));
    interp.registerBuiltin("floor", makeElementwise("floor", std::floor));
    interp.registerBuiltin("ceil",  makeElementwise("ceil",  std::ceil));
    interp.registerBuiltin("round", makeElementwise("round", std::round));
    interp.registerBuiltin("fix",   makeElementwise("fix",   std::trunc));
    interp.registerBuiltin("sign",  makeElementwise("sign",  [](double x) -> double {
        return (x > 0) - (x < 0);
    }));
    interp.registerBuiltin("real",  makeElementwise("real",  [](double x) -> double { return x; }));
    interp.registerBuiltin("imag",  makeElementwise("imag",  [](double) -> double { return 0.0; }));
    interp.registerBuiltin("conj",  makeElementwise("conj",  [](double x) -> double { return x; }));

    // atan2
    interp.registerBuiltin("atan2", [](const ValueList& args) -> ValuePtr {
        requireArgs("atan2", args, 2);
        if (args[0]->isScalar() && args[1]->isScalar()) {
            return Value::makeScalar(std::atan2(args[0]->scalarDouble(), args[1]->scalarDouble()));
        }
        auto& y = args[0]->matrix();
        auto& x = args[1]->matrix();
        Matrix result(y.rows(), y.cols());
        for (size_t i = 0; i < y.numel(); i++)
            result(i) = std::atan2(y(i), x(i));
        return Value::makeMatrix(std::move(result));
    });

    // mod, rem
    interp.registerBuiltin("mod", [](const ValueList& args) -> ValuePtr {
        requireArgs("mod", args, 2);
        double a = args[0]->scalarDouble(), b = args[1]->scalarDouble();
        return Value::makeScalar(std::fmod(a, b));
    });

    interp.registerBuiltin("rem", [](const ValueList& args) -> ValuePtr {
        requireArgs("rem", args, 2);
        double a = args[0]->scalarDouble(), b = args[1]->scalarDouble();
        return Value::makeScalar(std::remainder(a, b));
    });

    // max, min
    interp.registerBuiltin("max", [](const ValueList& args) -> ValuePtr {
        if (args.size() == 1) {
            auto& m = args[0]->matrix();
            if (m.isVector() || m.isScalar()) {
                return Value::makeScalar(m.maxVal());
            }
            // Along dimension 1 (columnwise)
            Matrix result(1, m.cols());
            for (size_t j = 0; j < m.cols(); j++) {
                double mx = m(0, j);
                for (size_t i = 1; i < m.rows(); i++) mx = std::max(mx, m(i, j));
                result(0, j) = mx;
            }
            return Value::makeMatrix(std::move(result));
        }
        if (args.size() == 2) {
            // Element-wise max of two arrays
            if (args[0]->isScalar() && args[1]->isScalar()) {
                return Value::makeScalar(std::max(args[0]->scalarDouble(), args[1]->scalarDouble()));
            }
            auto& a = args[0]->matrix();
            auto& b = args[1]->matrix();
            size_t r = std::max(a.rows(), b.rows());
            size_t c = std::max(a.cols(), b.cols());
            Matrix result(r, c);
            for (size_t i = 0; i < r; i++)
                for (size_t j = 0; j < c; j++)
                    result(i, j) = std::max(a.getWithBroadcast(i, j), b.getWithBroadcast(i, j));
            return Value::makeMatrix(std::move(result));
        }
        throw RuntimeError("max: too many arguments");
    });

    interp.registerBuiltin("min", [](const ValueList& args) -> ValuePtr {
        if (args.size() == 1) {
            auto& m = args[0]->matrix();
            if (m.isVector() || m.isScalar()) {
                return Value::makeScalar(m.minVal());
            }
            Matrix result(1, m.cols());
            for (size_t j = 0; j < m.cols(); j++) {
                double mn = m(0, j);
                for (size_t i = 1; i < m.rows(); i++) mn = std::min(mn, m(i, j));
                result(0, j) = mn;
            }
            return Value::makeMatrix(std::move(result));
        }
        if (args.size() == 2) {
            if (args[0]->isScalar() && args[1]->isScalar()) {
                return Value::makeScalar(std::min(args[0]->scalarDouble(), args[1]->scalarDouble()));
            }
            auto& a = args[0]->matrix();
            auto& b = args[1]->matrix();
            size_t r = std::max(a.rows(), b.rows());
            size_t c = std::max(a.cols(), b.cols());
            Matrix result(r, c);
            for (size_t i = 0; i < r; i++)
                for (size_t j = 0; j < c; j++)
                    result(i, j) = std::min(a.getWithBroadcast(i, j), b.getWithBroadcast(i, j));
            return Value::makeMatrix(std::move(result));
        }
        throw RuntimeError("min: too many arguments");
    });

    // sum, prod, cumsum, cumprod
    interp.registerBuiltin("sum", [](const ValueList& args) -> ValuePtr {
        requireMinArgs("sum", args, 1);
        auto& m = args[0]->matrix();
        if (args.size() == 1) {
            if (m.isVector() || m.isScalar()) return Value::makeScalar(m.sum());
            return Value::makeMatrix(m.sumAlongDim(1));
        }
        int dim = static_cast<int>(args[1]->scalarDouble());
        return Value::makeMatrix(m.sumAlongDim(dim));
    });

    interp.registerBuiltin("prod", [](const ValueList& args) -> ValuePtr {
        requireArgs("prod", args, 1);
        auto& m = args[0]->matrix();
        if (m.isVector() || m.isScalar()) return Value::makeScalar(m.prod());
        // Along dim 1
        Matrix result(1, m.cols());
        for (size_t j = 0; j < m.cols(); j++) {
            double p = 1;
            for (size_t i = 0; i < m.rows(); i++) p *= m(i, j);
            result(0, j) = p;
        }
        return Value::makeMatrix(std::move(result));
    });

    interp.registerBuiltin("cumsum", [](const ValueList& args) -> ValuePtr {
        requireArgs("cumsum", args, 1);
        auto& m = args[0]->matrix();
        Matrix result(m.rows(), m.cols());
        if (m.isVector()) {
            double s = 0;
            for (size_t i = 0; i < m.numel(); i++) {
                s += m(i);
                result(i) = s;
            }
        } else {
            // Along dim 1 (column-wise)
            for (size_t j = 0; j < m.cols(); j++) {
                double s = 0;
                for (size_t i = 0; i < m.rows(); i++) {
                    s += m(i, j);
                    result(i, j) = s;
                }
            }
        }
        return Value::makeMatrix(std::move(result));
    });
}

// ============================================================================
// Matrix construction and manipulation built-ins
// ============================================================================

void registerMatrixBuiltins(Interpreter& interp) {
    // zeros
    interp.registerBuiltin("zeros", [](const ValueList& args) -> ValuePtr {
        if (args.empty()) return Value::makeScalar(0.0);
        if (args.size() == 1) {
            size_t n = static_cast<size_t>(args[0]->scalarDouble());
            return Value::makeMatrix(Matrix::zeros(n, n));
        }
        size_t r = static_cast<size_t>(args[0]->scalarDouble());
        size_t c = static_cast<size_t>(args[1]->scalarDouble());
        return Value::makeMatrix(Matrix::zeros(r, c));
    });

    // ones
    interp.registerBuiltin("ones", [](const ValueList& args) -> ValuePtr {
        if (args.empty()) return Value::makeScalar(1.0);
        if (args.size() == 1) {
            size_t n = static_cast<size_t>(args[0]->scalarDouble());
            return Value::makeMatrix(Matrix::ones(n, n));
        }
        size_t r = static_cast<size_t>(args[0]->scalarDouble());
        size_t c = static_cast<size_t>(args[1]->scalarDouble());
        return Value::makeMatrix(Matrix::ones(r, c));
    });

    // eye
    interp.registerBuiltin("eye", [](const ValueList& args) -> ValuePtr {
        if (args.empty()) return Value::makeScalar(1.0);
        if (args.size() == 1) {
            size_t n = static_cast<size_t>(args[0]->scalarDouble());
            return Value::makeMatrix(Matrix::eye(n));
        }
        size_t r = static_cast<size_t>(args[0]->scalarDouble());
        size_t c = static_cast<size_t>(args[1]->scalarDouble());
        return Value::makeMatrix(Matrix::eye(r, c));
    });

    // rand
    interp.registerBuiltin("rand", [](const ValueList& args) -> ValuePtr {
        if (args.empty()) return Value::makeScalar(Matrix::rand(1, 1)(0, 0));
        if (args.size() == 1) {
            size_t n = static_cast<size_t>(args[0]->scalarDouble());
            return Value::makeMatrix(Matrix::rand(n, n));
        }
        size_t r = static_cast<size_t>(args[0]->scalarDouble());
        size_t c = static_cast<size_t>(args[1]->scalarDouble());
        return Value::makeMatrix(Matrix::rand(r, c));
    });

    // randn
    interp.registerBuiltin("randn", [](const ValueList& args) -> ValuePtr {
        if (args.empty()) return Value::makeScalar(Matrix::randn(1, 1)(0, 0));
        if (args.size() == 1) {
            size_t n = static_cast<size_t>(args[0]->scalarDouble());
            return Value::makeMatrix(Matrix::randn(n, n));
        }
        size_t r = static_cast<size_t>(args[0]->scalarDouble());
        size_t c = static_cast<size_t>(args[1]->scalarDouble());
        return Value::makeMatrix(Matrix::randn(r, c));
    });

    // linspace
    interp.registerBuiltin("linspace", [](const ValueList& args) -> ValuePtr {
        requireMinArgs("linspace", args, 2);
        double start = args[0]->scalarDouble();
        double stop = args[1]->scalarDouble();
        size_t n = (args.size() >= 3) ? static_cast<size_t>(args[2]->scalarDouble()) : 100;
        return Value::makeMatrix(Matrix::linspace(start, stop, n));
    });

    // logspace
    interp.registerBuiltin("logspace", [](const ValueList& args) -> ValuePtr {
        requireMinArgs("logspace", args, 2);
        double a = args[0]->scalarDouble();
        double b = args[1]->scalarDouble();
        size_t n = (args.size() >= 3) ? static_cast<size_t>(args[2]->scalarDouble()) : 50;
        auto lin = Matrix::linspace(a, b, n);
        Matrix result(1, n);
        for (size_t i = 0; i < n; i++) result(0, i) = std::pow(10.0, lin(0, i));
        return Value::makeMatrix(std::move(result));
    });

    // size
    interp.registerBuiltin("size", [](const ValueList& args) -> ValuePtr {
        requireMinArgs("size", args, 1);
        if (args[0]->isNumeric()) {
            auto& m = args[0]->matrix();
            if (args.size() == 1) {
                Matrix result(1, 2);
                result(0, 0) = static_cast<double>(m.rows());
                result(0, 1) = static_cast<double>(m.cols());
                return Value::makeMatrix(std::move(result));
            }
            int dim = static_cast<int>(args[1]->scalarDouble());
            if (dim == 1) return Value::makeScalar(static_cast<double>(m.rows()));
            if (dim == 2) return Value::makeScalar(static_cast<double>(m.cols()));
            return Value::makeScalar(1.0);
        }
        if (args[0]->isString()) {
            return Value::makeMatrix(Matrix(1, 2, {1.0, static_cast<double>(args[0]->string().size())}));
        }
        if (args[0]->isCellArray()) {
            auto& c = args[0]->cellArray();
            return Value::makeMatrix(Matrix(1, 2, {static_cast<double>(c.rows), static_cast<double>(c.cols)}));
        }
        return Value::makeMatrix(Matrix(1, 2, {1.0, 1.0}));
    });

    // length
    interp.registerBuiltin("length", [](const ValueList& args) -> ValuePtr {
        requireArgs("length", args, 1);
        if (args[0]->isNumeric()) {
            auto& m = args[0]->matrix();
            return Value::makeScalar(static_cast<double>(std::max(m.rows(), m.cols())));
        }
        if (args[0]->isString()) {
            return Value::makeScalar(static_cast<double>(args[0]->string().size()));
        }
        return Value::makeScalar(1.0);
    });

    // numel
    interp.registerBuiltin("numel", [](const ValueList& args) -> ValuePtr {
        requireArgs("numel", args, 1);
        if (args[0]->isNumeric()) return Value::makeScalar(static_cast<double>(args[0]->matrix().numel()));
        if (args[0]->isString()) return Value::makeScalar(static_cast<double>(args[0]->string().size()));
        return Value::makeScalar(1.0);
    });

    // reshape
    interp.registerBuiltin("reshape", [](const ValueList& args) -> ValuePtr {
        requireMinArgs("reshape", args, 2);
        auto& m = args[0]->matrix();
        if (args.size() == 2) {
            // reshape(A, [m n])
            auto& dims = args[1]->matrix();
            return Value::makeMatrix(m.reshape(
                static_cast<size_t>(dims(0)), static_cast<size_t>(dims(1))));
        }
        size_t r = static_cast<size_t>(args[1]->scalarDouble());
        size_t c = static_cast<size_t>(args[2]->scalarDouble());
        return Value::makeMatrix(m.reshape(r, c));
    });

    // transpose (also available as ' operator)
    interp.registerBuiltin("transpose", [](const ValueList& args) -> ValuePtr {
        requireArgs("transpose", args, 1);
        return Value::makeMatrix(args[0]->matrix().transpose());
    });

    // diag
    interp.registerBuiltin("diag", [](const ValueList& args) -> ValuePtr {
        requireMinArgs("diag", args, 1);
        auto& m = args[0]->matrix();
        int k = (args.size() >= 2) ? static_cast<int>(args[1]->scalarDouble()) : 0;

        if (m.isVector()) {
            // Create diagonal matrix from vector
            size_t n = m.numel() + std::abs(k);
            Matrix result = Matrix::zeros(n, n);
            for (size_t i = 0; i < m.numel(); i++) {
                if (k >= 0) result(i, i + k) = m(i);
                else result(i - k, i) = m(i);
            }
            return Value::makeMatrix(std::move(result));
        } else {
            // Extract diagonal from matrix
            size_t n = std::min(m.rows(), m.cols());
            if (k > 0) n = std::min(n, m.cols() - k);
            else if (k < 0) n = std::min(n, m.rows() + k);
            Matrix result(static_cast<size_t>(n), 1);
            for (size_t i = 0; i < n; i++) {
                if (k >= 0) result(i, 0) = m(i, i + k);
                else result(i, 0) = m(i - k, i);
            }
            return Value::makeMatrix(std::move(result));
        }
    });

    // repmat
    interp.registerBuiltin("repmat", [](const ValueList& args) -> ValuePtr {
        requireMinArgs("repmat", args, 2);
        auto& m = args[0]->matrix();
        size_t rr, rc;
        if (args.size() == 2) {
            if (args[1]->isScalar()) {
                rr = rc = static_cast<size_t>(args[1]->scalarDouble());
            } else {
                auto& dims = args[1]->matrix();
                rr = static_cast<size_t>(dims(0));
                rc = static_cast<size_t>(dims(1));
            }
        } else {
            rr = static_cast<size_t>(args[1]->scalarDouble());
            rc = static_cast<size_t>(args[2]->scalarDouble());
        }

        Matrix result(m.rows() * rr, m.cols() * rc);
        for (size_t bi = 0; bi < rr; bi++)
            for (size_t bj = 0; bj < rc; bj++)
                for (size_t i = 0; i < m.rows(); i++)
                    for (size_t j = 0; j < m.cols(); j++)
                        result(bi * m.rows() + i, bj * m.cols() + j) = m(i, j);
        return Value::makeMatrix(std::move(result));
    });

    // cat, horzcat, vertcat
    interp.registerBuiltin("horzcat", [](const ValueList& args) -> ValuePtr {
        std::vector<Matrix> mats;
        for (auto& a : args) mats.push_back(a->matrix());
        return Value::makeMatrix(Matrix::horzcat(mats));
    });

    interp.registerBuiltin("vertcat", [](const ValueList& args) -> ValuePtr {
        std::vector<Matrix> mats;
        for (auto& a : args) mats.push_back(a->matrix());
        return Value::makeMatrix(Matrix::vertcat(mats));
    });

    // sort
    interp.registerBuiltin("sort", [](const ValueList& args) -> ValuePtr {
        requireMinArgs("sort", args, 1);
        auto m = args[0]->matrix(); // copy
        auto& d = m.data();
        std::sort(d.begin(), d.end());
        return Value::makeMatrix(std::move(m));
    });

    // find
    interp.registerBuiltin("find", [](const ValueList& args) -> ValuePtr {
        requireMinArgs("find", args, 1);
        auto& m = args[0]->matrix();
        std::vector<double> indices;
        for (size_t i = 0; i < m.numel(); i++) {
            if (m(i) != 0.0) indices.push_back(static_cast<double>(i + 1));
        }
        size_t n = indices.size();
        return Value::makeMatrix(Matrix(1, n, std::move(indices)));
    });

    // any, all
    interp.registerBuiltin("any", [](const ValueList& args) -> ValuePtr {
        requireArgs("any", args, 1);
        auto& m = args[0]->matrix();
        for (size_t i = 0; i < m.numel(); i++)
            if (m(i) != 0.0) return Value::makeBool(true);
        return Value::makeBool(false);
    });

    interp.registerBuiltin("all", [](const ValueList& args) -> ValuePtr {
        requireArgs("all", args, 1);
        auto& m = args[0]->matrix();
        for (size_t i = 0; i < m.numel(); i++)
            if (m(i) == 0.0) return Value::makeBool(false);
        return Value::makeBool(true);
    });

    // isempty
    interp.registerBuiltin("isempty", [](const ValueList& args) -> ValuePtr {
        requireArgs("isempty", args, 1);
        if (args[0]->isEmpty()) return Value::makeBool(true);
        if (args[0]->isNumeric()) return Value::makeBool(args[0]->matrix().isEmpty());
        if (args[0]->isString()) return Value::makeBool(args[0]->string().empty());
        return Value::makeBool(false);
    });

    // colon (for explicit colon calls)
    interp.registerBuiltin("colon", [](const ValueList& args) -> ValuePtr {
        if (args.size() == 2) {
            double start = args[0]->scalarDouble();
            double stop = args[1]->scalarDouble();
            std::vector<double> vals;
            for (double v = start; v <= stop; v += 1.0) vals.push_back(v);
            size_t n = vals.size();
            return Value::makeMatrix(Matrix(1, n, std::move(vals)));
        }
        if (args.size() == 3) {
            double start = args[0]->scalarDouble();
            double step = args[1]->scalarDouble();
            double stop = args[2]->scalarDouble();
            std::vector<double> vals;
            if (step > 0) {
                for (double v = start; v <= stop + step * 1e-10; v += step) vals.push_back(v);
            } else if (step < 0) {
                for (double v = start; v >= stop + step * 1e-10; v += step) vals.push_back(v);
            }
            size_t n = vals.size();
            return Value::makeMatrix(Matrix(1, n, std::move(vals)));
        }
        throw RuntimeError("colon: requires 2 or 3 arguments");
    });

    // norm
    interp.registerBuiltin("norm", [](const ValueList& args) -> ValuePtr {
        requireMinArgs("norm", args, 1);
        auto& m = args[0]->matrix();
        double p = (args.size() >= 2) ? args[1]->scalarDouble() : 2.0;
        return Value::makeScalar(m.norm(p));
    });

    // dot
    interp.registerBuiltin("dot", [](const ValueList& args) -> ValuePtr {
        requireArgs("dot", args, 2);
        auto& a = args[0]->matrix();
        auto& b = args[1]->matrix();
        if (a.numel() != b.numel()) throw RuntimeError("dot: vectors must be same length");
        double s = 0;
        for (size_t i = 0; i < a.numel(); i++) s += a(i) * b(i);
        return Value::makeScalar(s);
    });

    // cross
    interp.registerBuiltin("cross", [](const ValueList& args) -> ValuePtr {
        requireArgs("cross", args, 2);
        auto& a = args[0]->matrix();
        auto& b = args[1]->matrix();
        if (a.numel() != 3 || b.numel() != 3) throw RuntimeError("cross: vectors must have 3 elements");
        Matrix result(1, 3);
        result(0) = a(1) * b(2) - a(2) * b(1);
        result(1) = a(2) * b(0) - a(0) * b(2);
        result(2) = a(0) * b(1) - a(1) * b(0);
        return Value::makeMatrix(std::move(result));
    });
}

// ============================================================================
// Linear algebra built-ins
// ============================================================================

void registerLinAlgBuiltins(Interpreter& interp) {
    // det (2x2 and 3x3 for now, general via LU in future)
    interp.registerBuiltin("det", [](const ValueList& args) -> ValuePtr {
        requireArgs("det", args, 1);
        auto& m = args[0]->matrix();
        if (!m.isSquare()) throw RuntimeError("det: matrix must be square");
        size_t n = m.rows();
        if (n == 1) return Value::makeScalar(m(0, 0));
        if (n == 2) return Value::makeScalar(m(0, 0) * m(1, 1) - m(0, 1) * m(1, 0));
        if (n == 3) {
            return Value::makeScalar(
                m(0,0)*(m(1,1)*m(2,2) - m(1,2)*m(2,1)) -
                m(0,1)*(m(1,0)*m(2,2) - m(1,2)*m(2,0)) +
                m(0,2)*(m(1,0)*m(2,1) - m(1,1)*m(2,0)));
        }
        // General LU-based determinant
        // Simple Gaussian elimination
        auto a = m; // copy
        double det = 1.0;
        for (size_t i = 0; i < n; i++) {
            // Partial pivoting
            size_t maxRow = i;
            for (size_t k = i + 1; k < n; k++) {
                if (std::abs(a(k, i)) > std::abs(a(maxRow, i))) maxRow = k;
            }
            if (maxRow != i) {
                for (size_t j = 0; j < n; j++) std::swap(a(i, j), a(maxRow, j));
                det *= -1;
            }
            if (std::abs(a(i, i)) < 1e-15) return Value::makeScalar(0.0);
            det *= a(i, i);
            for (size_t k = i + 1; k < n; k++) {
                double factor = a(k, i) / a(i, i);
                for (size_t j = i; j < n; j++) {
                    a(k, j) -= factor * a(i, j);
                }
            }
        }
        return Value::makeScalar(det);
    });

    // inv (2x2, 3x3, general via Gauss-Jordan)
    interp.registerBuiltin("inv", [](const ValueList& args) -> ValuePtr {
        requireArgs("inv", args, 1);
        auto& m = args[0]->matrix();
        if (!m.isSquare()) throw RuntimeError("inv: matrix must be square");
        size_t n = m.rows();

        if (n == 1) return Value::makeScalar(1.0 / m(0, 0));
        if (n == 2) {
            double d = m(0,0)*m(1,1) - m(0,1)*m(1,0);
            if (std::abs(d) < 1e-15) throw RuntimeError("Matrix is singular");
            Matrix result(2, 2);
            result(0,0) = m(1,1)/d;  result(0,1) = -m(0,1)/d;
            result(1,0) = -m(1,0)/d; result(1,1) = m(0,0)/d;
            return Value::makeMatrix(std::move(result));
        }

        // Gauss-Jordan elimination
        Matrix aug(n, 2*n);
        for (size_t i = 0; i < n; i++) {
            for (size_t j = 0; j < n; j++) aug(i, j) = m(i, j);
            aug(i, n + i) = 1.0;
        }

        for (size_t i = 0; i < n; i++) {
            size_t maxRow = i;
            for (size_t k = i + 1; k < n; k++)
                if (std::abs(aug(k, i)) > std::abs(aug(maxRow, i))) maxRow = k;
            if (maxRow != i)
                for (size_t j = 0; j < 2*n; j++) std::swap(aug(i, j), aug(maxRow, j));

            double pivot = aug(i, i);
            if (std::abs(pivot) < 1e-15) throw RuntimeError("Matrix is singular");

            for (size_t j = 0; j < 2*n; j++) aug(i, j) /= pivot;

            for (size_t k = 0; k < n; k++) {
                if (k == i) continue;
                double factor = aug(k, i);
                for (size_t j = 0; j < 2*n; j++) aug(k, j) -= factor * aug(i, j);
            }
        }

        Matrix result(n, n);
        for (size_t i = 0; i < n; i++)
            for (size_t j = 0; j < n; j++)
                result(i, j) = aug(i, n + j);
        return Value::makeMatrix(std::move(result));
    });

    // trace
    interp.registerBuiltin("trace", [](const ValueList& args) -> ValuePtr {
        requireArgs("trace", args, 1);
        auto& m = args[0]->matrix();
        double t = 0;
        size_t n = std::min(m.rows(), m.cols());
        for (size_t i = 0; i < n; i++) t += m(i, i);
        return Value::makeScalar(t);
    });

    // rank (via SVD-like approach — simplified)
    interp.registerBuiltin("rank", [](const ValueList& args) -> ValuePtr {
        requireArgs("rank", args, 1);
        auto& m = args[0]->matrix();
        // Simplified: use Gaussian elimination to count pivots
        auto a = m;
        size_t rows = a.rows(), cols = a.cols();
        size_t rank = 0;
        double tol = std::max(rows, cols) * std::numeric_limits<double>::epsilon() *
                     a.norm(std::numeric_limits<double>::infinity());

        for (size_t col = 0; col < cols && rank < rows; col++) {
            size_t maxRow = rank;
            for (size_t r = rank + 1; r < rows; r++)
                if (std::abs(a(r, col)) > std::abs(a(maxRow, col))) maxRow = r;

            if (std::abs(a(maxRow, col)) < tol) continue;

            for (size_t j = 0; j < cols; j++) std::swap(a(rank, j), a(maxRow, j));

            for (size_t r = rank + 1; r < rows; r++) {
                double factor = a(r, col) / a(rank, col);
                for (size_t j = col; j < cols; j++) a(r, j) -= factor * a(rank, j);
            }
            rank++;
        }
        return Value::makeScalar(static_cast<double>(rank));
    });
}

// ============================================================================
// String built-ins
// ============================================================================

void registerStringBuiltins(Interpreter& interp) {
    // num2str
    interp.registerBuiltin("num2str", [](const ValueList& args) -> ValuePtr {
        requireMinArgs("num2str", args, 1);
        if (args[0]->isScalar()) {
            std::ostringstream oss;
            double v = args[0]->scalarDouble();
            if (v == std::floor(v) && std::abs(v) < 1e15) {
                oss << static_cast<long long>(v);
            } else {
                oss << v;
            }
            return Value::makeString(oss.str());
        }
        if (args[0]->isNumeric()) {
            auto& m = args[0]->matrix();
            std::ostringstream oss;
            for (size_t i = 0; i < m.rows(); i++) {
                for (size_t j = 0; j < m.cols(); j++) {
                    if (j > 0) oss << "  ";
                    oss << m(i, j);
                }
                if (i < m.rows() - 1) oss << "\n";
            }
            return Value::makeString(oss.str());
        }
        return args[0];
    });

    // str2num
    interp.registerBuiltin("str2num", [](const ValueList& args) -> ValuePtr {
        requireArgs("str2num", args, 1);
        try {
            double val = std::stod(args[0]->string());
            return Value::makeScalar(val);
        } catch (...) {
            return Value::makeMatrix(Matrix());
        }
    });

    // strcmp
    interp.registerBuiltin("strcmp", [](const ValueList& args) -> ValuePtr {
        requireArgs("strcmp", args, 2);
        return Value::makeBool(args[0]->string() == args[1]->string());
    });

    // strcat
    interp.registerBuiltin("strcat", [](const ValueList& args) -> ValuePtr {
        std::string result;
        for (auto& a : args) {
            if (a->isString()) result += a->string();
            else throw RuntimeError("strcat: all arguments must be strings");
        }
        return Value::makeString(result);
    });

    // strsplit
    interp.registerBuiltin("strsplit", [](const ValueList& args) -> ValuePtr {
        requireMinArgs("strsplit", args, 1);
        std::string str = args[0]->string();
        std::string delim = (args.size() >= 2) ? args[1]->string() : " ";

        CellArray cell;
        cell.rows = 1;
        std::vector<ValuePtr> parts;
        size_t pos = 0;
        while (pos < str.size()) {
            size_t found = str.find(delim, pos);
            if (found == std::string::npos) {
                parts.push_back(Value::makeString(str.substr(pos)));
                break;
            }
            if (found > pos) parts.push_back(Value::makeString(str.substr(pos, found - pos)));
            pos = found + delim.size();
        }
        cell.cols = parts.size();
        cell.data = std::move(parts);
        return Value::makeCellArray(std::move(cell));
    });

    // upper, lower
    interp.registerBuiltin("upper", [](const ValueList& args) -> ValuePtr {
        requireArgs("upper", args, 1);
        std::string s = args[0]->string();
        std::transform(s.begin(), s.end(), s.begin(), ::toupper);
        return Value::makeString(s);
    });

    interp.registerBuiltin("lower", [](const ValueList& args) -> ValuePtr {
        requireArgs("lower", args, 1);
        std::string s = args[0]->string();
        std::transform(s.begin(), s.end(), s.begin(), ::tolower);
        return Value::makeString(s);
    });

    // strtrim
    interp.registerBuiltin("strtrim", [](const ValueList& args) -> ValuePtr {
        requireArgs("strtrim", args, 1);
        std::string s = args[0]->string();
        size_t start = s.find_first_not_of(" \t\n\r");
        size_t end = s.find_last_not_of(" \t\n\r");
        if (start == std::string::npos) return Value::makeString("");
        return Value::makeString(s.substr(start, end - start + 1));
    });

    // sprintf
    interp.registerBuiltin("sprintf", [](const ValueList& args) -> ValuePtr {
        requireMinArgs("sprintf", args, 1);
        std::string fmt = args[0]->string();
        std::string result;
        size_t argIdx = 1;

        for (size_t i = 0; i < fmt.size(); i++) {
            if (fmt[i] == '%' && i + 1 < fmt.size()) {
                i++;
                std::string spec = "%";
                // Parse format specifier
                while (i < fmt.size() && !std::isalpha(fmt[i])) {
                    spec += fmt[i++];
                }
                if (i < fmt.size()) {
                    char type = fmt[i];
                    spec += type;

                    if (argIdx < args.size()) {
                        char buf[256];
                        if (type == 'd' || type == 'i') {
                            snprintf(buf, sizeof(buf), spec.c_str(),
                                    static_cast<int>(args[argIdx]->scalarDouble()));
                        } else if (type == 'f' || type == 'e' || type == 'g') {
                            snprintf(buf, sizeof(buf), spec.c_str(), args[argIdx]->scalarDouble());
                        } else if (type == 's') {
                            result += args[argIdx]->string();
                            argIdx++;
                            continue;
                        } else {
                            snprintf(buf, sizeof(buf), spec.c_str(), args[argIdx]->scalarDouble());
                        }
                        result += buf;
                        argIdx++;
                    }
                }
            } else if (fmt[i] == '\\' && i + 1 < fmt.size()) {
                i++;
                if (fmt[i] == 'n') result += '\n';
                else if (fmt[i] == 't') result += '\t';
                else result += fmt[i];
            } else {
                result += fmt[i];
            }
        }
        return Value::makeString(result);
    });

    // char, double
    interp.registerBuiltin("char", [](const ValueList& args) -> ValuePtr {
        requireArgs("char", args, 1);
        if (args[0]->isString()) return args[0];
        if (args[0]->isNumeric()) {
            auto& m = args[0]->matrix();
            std::string s;
            for (size_t i = 0; i < m.numel(); i++)
                s += static_cast<char>(m(i));
            return Value::makeString(s);
        }
        throw RuntimeError("char: invalid input");
    });

    interp.registerBuiltin("double", [](const ValueList& args) -> ValuePtr {
        requireArgs("double", args, 1);
        if (args[0]->isNumeric()) return args[0];
        if (args[0]->isString()) {
            return Value::makeMatrix(args[0]->toMatrix());
        }
        throw RuntimeError("double: cannot convert");
    });
}

// ============================================================================
// I/O built-ins
// ============================================================================

void registerIOBuiltins(Interpreter& interp) {
    // disp
    interp.registerBuiltin("disp", [&interp](const ValueList& args) -> ValuePtr {
        requireArgs("disp", args, 1);
        if (args[0]->isString()) {
            interp.output() << args[0]->string() << std::endl;
        } else if (args[0]->isNumeric()) {
            args[0]->matrix().display(interp.output());
        } else {
            interp.output() << args[0]->toString() << std::endl;
        }
        return Value::makeEmpty();
    });

    // fprintf
    interp.registerBuiltin("fprintf", [&interp](const ValueList& args) -> ValuePtr {
        requireMinArgs("fprintf", args, 1);
        // Simple fprintf to stdout (ignoring file id for now)
        std::string fmt;
        size_t startArg = 0;

        if (args[0]->isScalar() && args.size() > 1) {
            // First arg might be file ID (1=stdout, 2=stderr)
            startArg = 1;
            fmt = args[1]->string();
            startArg = 2;
        } else if (args[0]->isString()) {
            fmt = args[0]->string();
            startArg = 1;
        }

        // Build the formatted string using sprintf logic
        ValueList sprintfArgs;
        sprintfArgs.push_back(Value::makeString(fmt));
        for (size_t i = startArg; i < args.size(); i++) {
            sprintfArgs.push_back(args[i]);
        }

        // Quick inline format
        std::string result;
        size_t argIdx = 1;
        for (size_t i = 0; i < fmt.size(); i++) {
            if (fmt[i] == '%' && i + 1 < fmt.size()) {
                i++;
                std::string spec = "%";
                while (i < fmt.size() && !std::isalpha(fmt[i])) {
                    spec += fmt[i++];
                }
                if (i < fmt.size()) {
                    char type = fmt[i];
                    spec += type;
                    if (startArg + argIdx - 1 < args.size()) {
                        auto& arg = args[startArg + argIdx - 1];
                        char buf[256];
                        if (type == 's') {
                            result += arg->string();
                        } else if (type == 'd' || type == 'i') {
                            snprintf(buf, sizeof(buf), spec.c_str(),
                                    static_cast<int>(arg->scalarDouble()));
                            result += buf;
                        } else {
                            snprintf(buf, sizeof(buf), spec.c_str(), arg->scalarDouble());
                            result += buf;
                        }
                        argIdx++;
                    }
                }
            } else if (fmt[i] == '\\' && i + 1 < fmt.size()) {
                i++;
                if (fmt[i] == 'n') result += '\n';
                else if (fmt[i] == 't') result += '\t';
                else result += fmt[i];
            } else {
                result += fmt[i];
            }
        }
        interp.output() << result;
        return Value::makeEmpty();
    });

    // input
    interp.registerBuiltin("input", [&interp](const ValueList& args) -> ValuePtr {
        if (!args.empty() && args[0]->isString()) {
            interp.output() << args[0]->string();
        }
        std::string line;
        std::getline(std::cin, line);

        // If second arg is 's', return as string
        if (args.size() >= 2 && args[1]->isString() && args[1]->string() == "s") {
            return Value::makeString(line);
        }

        // Try to parse as number
        try {
            double val = std::stod(line);
            return Value::makeScalar(val);
        } catch (...) {
            return Value::makeString(line);
        }
    });

    // error
    interp.registerBuiltin("error", [](const ValueList& args) -> ValuePtr {
        if (args.empty()) throw RuntimeError("Error");
        if (args[0]->isString()) throw RuntimeError(args[0]->string());
        throw RuntimeError("Error");
    });

    // warning
    interp.registerBuiltin("warning", [&interp](const ValueList& args) -> ValuePtr {
        if (!args.empty() && args[0]->isString()) {
            interp.output() << "Warning: " << args[0]->string() << std::endl;
        }
        return Value::makeEmpty();
    });

    // tic, toc
    static std::chrono::time_point<std::chrono::high_resolution_clock> ticTime;

    interp.registerBuiltin("tic", [](const ValueList&) -> ValuePtr {
        ticTime = std::chrono::high_resolution_clock::now();
        return Value::makeEmpty();
    });

    interp.registerBuiltin("toc", [&interp](const ValueList&) -> ValuePtr {
        auto now = std::chrono::high_resolution_clock::now();
        double elapsed = std::chrono::duration<double>(now - ticTime).count();
        interp.output() << "Elapsed time is " << elapsed << " seconds." << std::endl;
        return Value::makeScalar(elapsed);
    });

    // exist (simplified)
    interp.registerBuiltin("exist", [&interp](const ValueList& args) -> ValuePtr {
        requireArgs("exist", args, 1);
        std::string name = args[0]->string();
        if (interp.currentEnv()->has(name)) return Value::makeScalar(1.0);
        // Check file
        std::ifstream f(name);
        if (f.good()) return Value::makeScalar(2.0);
        // Check .m file
        std::ifstream fm(name + ".m");
        if (fm.good()) return Value::makeScalar(2.0);
        return Value::makeScalar(0.0);
    });
}

// ============================================================================
// Type checking built-ins
// ============================================================================

void registerTypeBuiltins(Interpreter& interp) {
    interp.registerBuiltin("class", [](const ValueList& args) -> ValuePtr {
        requireArgs("class", args, 1);
        switch (args[0]->type()) {
            case ValueType::MATRIX: return Value::makeString("double");
            case ValueType::LOGICAL: return Value::makeString("logical");
            case ValueType::STRING: return Value::makeString("char");
            case ValueType::CELL_ARRAY: return Value::makeString("cell");
            case ValueType::STRUCT: return Value::makeString("struct");
            case ValueType::FUNC_HANDLE: return Value::makeString("function_handle");
            default: return Value::makeString("unknown");
        }
    });

    interp.registerBuiltin("isa", [](const ValueList& args) -> ValuePtr {
        requireArgs("isa", args, 2);
        std::string type = args[1]->string();
        if (type == "double") return Value::makeBool(args[0]->isMatrix());
        if (type == "logical") return Value::makeBool(args[0]->isLogical());
        if (type == "char") return Value::makeBool(args[0]->isString());
        if (type == "cell") return Value::makeBool(args[0]->isCellArray());
        if (type == "struct") return Value::makeBool(args[0]->isStruct());
        if (type == "numeric") return Value::makeBool(args[0]->isNumeric());
        return Value::makeBool(false);
    });

    interp.registerBuiltin("isnumeric", [](const ValueList& args) -> ValuePtr {
        requireArgs("isnumeric", args, 1);
        return Value::makeBool(args[0]->isNumeric());
    });

    interp.registerBuiltin("ischar", [](const ValueList& args) -> ValuePtr {
        requireArgs("ischar", args, 1);
        return Value::makeBool(args[0]->isString());
    });

    interp.registerBuiltin("islogical", [](const ValueList& args) -> ValuePtr {
        requireArgs("islogical", args, 1);
        return Value::makeBool(args[0]->isLogical());
    });

    interp.registerBuiltin("isstruct", [](const ValueList& args) -> ValuePtr {
        requireArgs("isstruct", args, 1);
        return Value::makeBool(args[0]->isStruct());
    });

    interp.registerBuiltin("iscell", [](const ValueList& args) -> ValuePtr {
        requireArgs("iscell", args, 1);
        return Value::makeBool(args[0]->isCellArray());
    });

    interp.registerBuiltin("isnan", [](const ValueList& args) -> ValuePtr {
        requireArgs("isnan", args, 1);
        if (args[0]->isScalar()) return Value::makeBool(std::isnan(args[0]->scalarDouble()));
        auto& m = args[0]->matrix();
        Matrix result(m.rows(), m.cols());
        for (size_t i = 0; i < m.numel(); i++) result(i) = std::isnan(m(i)) ? 1.0 : 0.0;
        return Value::makeMatrix(std::move(result));
    });

    interp.registerBuiltin("isinf", [](const ValueList& args) -> ValuePtr {
        requireArgs("isinf", args, 1);
        if (args[0]->isScalar()) return Value::makeBool(std::isinf(args[0]->scalarDouble()));
        auto& m = args[0]->matrix();
        Matrix result(m.rows(), m.cols());
        for (size_t i = 0; i < m.numel(); i++) result(i) = std::isinf(m(i)) ? 1.0 : 0.0;
        return Value::makeMatrix(std::move(result));
    });

    interp.registerBuiltin("isfinite", [](const ValueList& args) -> ValuePtr {
        requireArgs("isfinite", args, 1);
        if (args[0]->isScalar()) return Value::makeBool(std::isfinite(args[0]->scalarDouble()));
        auto& m = args[0]->matrix();
        Matrix result(m.rows(), m.cols());
        for (size_t i = 0; i < m.numel(); i++) result(i) = std::isfinite(m(i)) ? 1.0 : 0.0;
        return Value::makeMatrix(std::move(result));
    });

    // logical
    interp.registerBuiltin("logical", [](const ValueList& args) -> ValuePtr {
        requireArgs("logical", args, 1);
        return Value::makeBool(args[0]->toBool());
    });

    // struct
    interp.registerBuiltin("struct", [](const ValueList& args) -> ValuePtr {
        if (args.empty()) return Value::makeStruct(MFStruct{});
        MFStruct s;
        for (size_t i = 0; i + 1 < args.size(); i += 2) {
            s.fields[args[i]->string()] = args[i + 1];
        }
        return Value::makeStruct(std::move(s));
    });

    // fieldnames
    interp.registerBuiltin("fieldnames", [](const ValueList& args) -> ValuePtr {
        requireArgs("fieldnames", args, 1);
        if (!args[0]->isStruct()) throw RuntimeError("fieldnames requires a struct");
        auto& s = args[0]->structVal();
        CellArray cell;
        cell.rows = static_cast<size_t>(s.fields.size());
        cell.cols = 1;
        for (auto& [k, v] : s.fields) {
            cell.data.push_back(Value::makeString(k));
        }
        return Value::makeCellArray(std::move(cell));
    });

    // cell
    interp.registerBuiltin("cell", [](const ValueList& args) -> ValuePtr {
        if (args.empty()) return Value::makeCellArray(CellArray());
        size_t r = static_cast<size_t>(args[0]->scalarDouble());
        size_t c = (args.size() >= 2) ? static_cast<size_t>(args[1]->scalarDouble()) : r;
        CellArray cell(r, c);
        for (auto& v : cell.data) v = Value::makeEmpty();
        return Value::makeCellArray(std::move(cell));
    });
}

// ============================================================================
// Statistics built-ins
// ============================================================================

void registerStatsBuiltins(Interpreter& interp) {
    // mean
    interp.registerBuiltin("mean", [](const ValueList& args) -> ValuePtr {
        requireMinArgs("mean", args, 1);
        auto& m = args[0]->matrix();
        if (m.isVector() || m.isScalar()) return Value::makeScalar(m.mean());
        if (args.size() >= 2) {
            int dim = static_cast<int>(args[1]->scalarDouble());
            return Value::makeMatrix(m.meanAlongDim(dim));
        }
        return Value::makeMatrix(m.meanAlongDim(1));
    });

    // std
    interp.registerBuiltin("std", [](const ValueList& args) -> ValuePtr {
        requireMinArgs("std", args, 1);
        auto& m = args[0]->matrix();
        double mu = m.mean();
        double s = 0;
        for (size_t i = 0; i < m.numel(); i++) {
            double d = m(i) - mu;
            s += d * d;
        }
        // Default: normalize by N-1 (sample std)
        double n = static_cast<double>(m.numel());
        return Value::makeScalar(std::sqrt(s / (n > 1 ? n - 1 : 1)));
    });

    // var
    interp.registerBuiltin("var", [](const ValueList& args) -> ValuePtr {
        requireMinArgs("var", args, 1);
        auto& m = args[0]->matrix();
        double mu = m.mean();
        double s = 0;
        for (size_t i = 0; i < m.numel(); i++) {
            double d = m(i) - mu;
            s += d * d;
        }
        double n = static_cast<double>(m.numel());
        return Value::makeScalar(s / (n > 1 ? n - 1 : 1));
    });

    // median
    interp.registerBuiltin("median", [](const ValueList& args) -> ValuePtr {
        requireArgs("median", args, 1);
        auto m = args[0]->matrix(); // copy
        auto& d = m.data();
        std::sort(d.begin(), d.end());
        size_t n = d.size();
        if (n % 2 == 0) return Value::makeScalar((d[n/2 - 1] + d[n/2]) / 2.0);
        return Value::makeScalar(d[n/2]);
    });

    // cov (simplified: sample covariance matrix)
    interp.registerBuiltin("cov", [](const ValueList& args) -> ValuePtr {
        requireArgs("cov", args, 1);
        auto& m = args[0]->matrix();
        size_t n = m.rows(), p = m.cols();

        // Compute means
        Matrix means = m.meanAlongDim(1);

        // Compute covariance
        Matrix result(p, p, 0.0);
        for (size_t i = 0; i < p; i++) {
            for (size_t j = i; j < p; j++) {
                double s = 0;
                for (size_t k = 0; k < n; k++) {
                    s += (m(k, i) - means(0, i)) * (m(k, j) - means(0, j));
                }
                result(i, j) = result(j, i) = s / (n > 1 ? n - 1 : 1);
            }
        }
        return Value::makeMatrix(std::move(result));
    });

    // corrcoef
    interp.registerBuiltin("corrcoef", [](const ValueList& args) -> ValuePtr {
        requireArgs("corrcoef", args, 1);
        auto& m = args[0]->matrix();
        size_t n = m.rows(), p = m.cols();

        Matrix means = m.meanAlongDim(1);

        // Compute covariance and standard deviations
        Matrix cov(p, p, 0.0);
        std::vector<double> stds(p);

        for (size_t i = 0; i < p; i++) {
            double s = 0;
            for (size_t k = 0; k < n; k++) {
                double d = m(k, i) - means(0, i);
                s += d * d;
            }
            stds[i] = std::sqrt(s / (n > 1 ? n - 1 : 1));
        }

        for (size_t i = 0; i < p; i++) {
            for (size_t j = i; j < p; j++) {
                double s = 0;
                for (size_t k = 0; k < n; k++) {
                    s += (m(k, i) - means(0, i)) * (m(k, j) - means(0, j));
                }
                double c = s / (n > 1 ? n - 1 : 1);
                double r = (stds[i] * stds[j] > 0) ? c / (stds[i] * stds[j]) : 0;
                cov(i, j) = cov(j, i) = r;
            }
        }
        return Value::makeMatrix(std::move(cov));
    });

    // hist (placeholder - returns bin counts)
    interp.registerBuiltin("hist", [](const ValueList& args) -> ValuePtr {
        requireMinArgs("hist", args, 1);
        auto& m = args[0]->matrix();
        size_t nbins = (args.size() >= 2) ? static_cast<size_t>(args[1]->scalarDouble()) : 10;
        double mn = m.minVal(), mx = m.maxVal();
        double binWidth = (mx - mn) / nbins;

        Matrix counts(1, nbins, 0.0);
        for (size_t i = 0; i < m.numel(); i++) {
            size_t bin = static_cast<size_t>((m(i) - mn) / binWidth);
            if (bin >= nbins) bin = nbins - 1;
            counts(0, bin) += 1.0;
        }
        return Value::makeMatrix(std::move(counts));
    });
}

// ============================================================================
// Register all built-ins
// ============================================================================

void registerAllBuiltins(Interpreter& interp) {
    registerMathBuiltins(interp);
    registerMatrixBuiltins(interp);
    registerLinAlgBuiltins(interp);
    registerStringBuiltins(interp);
    registerIOBuiltins(interp);
    registerTypeBuiltins(interp);
    registerStatsBuiltins(interp);

    // A few more utility functions

    // whos
    interp.registerBuiltin("whos", [&interp](const ValueList&) -> ValuePtr {
        interp.currentEnv()->displayVariables(interp.output());
        return Value::makeEmpty();
    });

    // who
    interp.registerBuiltin("who", [&interp](const ValueList&) -> ValuePtr {
        auto names = interp.currentEnv()->variableNames();
        interp.output() << "Your variables are:" << std::endl << std::endl;
        for (auto& n : names) interp.output() << n << "  ";
        interp.output() << std::endl << std::endl;
        return Value::makeEmpty();
    });

    // clear
    interp.registerBuiltin("clear", [&interp](const ValueList& args) -> ValuePtr {
        if (args.empty()) {
            interp.currentEnv()->clear();
        } else {
            for (auto& a : args) {
                if (a->isString()) interp.currentEnv()->clear(a->string());
            }
        }
        return Value::makeEmpty();
    });

    // type casting
    interp.registerBuiltin("int32", [](const ValueList& args) -> ValuePtr {
        requireArgs("int32", args, 1);
        return Value::makeScalar(static_cast<double>(static_cast<int32_t>(args[0]->scalarDouble())));
    });

    interp.registerBuiltin("uint32", [](const ValueList& args) -> ValuePtr {
        requireArgs("uint32", args, 1);
        return Value::makeScalar(static_cast<double>(static_cast<uint32_t>(args[0]->scalarDouble())));
    });

    interp.registerBuiltin("int64", [](const ValueList& args) -> ValuePtr {
        requireArgs("int64", args, 1);
        return Value::makeScalar(static_cast<double>(static_cast<int64_t>(args[0]->scalarDouble())));
    });

    // typecast helpers
    interp.registerBuiltin("single", [](const ValueList& args) -> ValuePtr {
        requireArgs("single", args, 1);
        return Value::makeScalar(static_cast<float>(args[0]->scalarDouble()));
    });

    // deal (for assigning cell contents)
    interp.registerBuiltin("deal", [](const ValueList& args) -> ValuePtr {
        if (args.empty()) return Value::makeEmpty();
        return args[0]; // Simplified
    });

    // nargout, nargin (these are also set as variables in function calls)
    interp.registerBuiltin("nargout", [](const ValueList&) -> ValuePtr {
        return Value::makeScalar(1.0);
    });

    interp.registerBuiltin("nargin", [](const ValueList&) -> ValuePtr {
        return Value::makeScalar(0.0);
    });

    // clock
    interp.registerBuiltin("clock", [](const ValueList&) -> ValuePtr {
        auto now = std::chrono::system_clock::now();
        auto time = std::chrono::system_clock::to_time_t(now);
        struct tm* ltm = localtime(&time);
        Matrix result(1, 6);
        result(0, 0) = 1900 + ltm->tm_year;
        result(0, 1) = 1 + ltm->tm_mon;
        result(0, 2) = ltm->tm_mday;
        result(0, 3) = ltm->tm_hour;
        result(0, 4) = ltm->tm_min;
        result(0, 5) = ltm->tm_sec;
        return Value::makeMatrix(std::move(result));
    });

    // feval (call function by name)
    interp.registerBuiltin("feval", [&interp](const ValueList& args) -> ValuePtr {
        requireMinArgs("feval", args, 1);
        std::string name = args[0]->string();
        ValueList fargs(args.begin() + 1, args.end());
        return interp.currentEnv()->get(name) ?
            interp.evalExpr(std::make_shared<Expr>(Identifier{name}, 0, 0)) :
            Value::makeEmpty();
    });

    // cellfun (simplified)
    interp.registerBuiltin("cellfun", [&interp](const ValueList& args) -> ValuePtr {
        requireArgs("cellfun", args, 2);
        if (!args[0]->isFuncHandle()) throw RuntimeError("cellfun: first arg must be function handle");
        if (!args[1]->isCellArray()) throw RuntimeError("cellfun: second arg must be cell array");

        auto& fh = args[0]->funcHandle();
        auto& cell = args[1]->cellArray();
        Matrix result(cell.rows, cell.cols);

        for (size_t i = 0; i < cell.data.size(); i++) {
            ValueList fargs = {cell.data[i]};
            auto res = std::visit([&](auto& impl) -> ValuePtr {
                if constexpr (std::is_same_v<std::decay_t<decltype(impl)>, BuiltinFunc>) {
                    return impl(fargs);
                } else {
                    return interp.callFuncHandle(fh, fargs);
                }
            }, fh.impl);
            result(i) = res->scalarDouble();
        }
        return Value::makeMatrix(std::move(result));
    });

    // arrayfun (simplified)
    interp.registerBuiltin("arrayfun", [&interp](const ValueList& args) -> ValuePtr {
        requireMinArgs("arrayfun", args, 2);
        if (!args[0]->isFuncHandle()) throw RuntimeError("arrayfun: first arg must be function handle");

        auto& fh = args[0]->funcHandle();
        auto& m = args[1]->matrix();
        Matrix result(m.rows(), m.cols());

        for (size_t i = 0; i < m.numel(); i++) {
            ValueList fargs = {Value::makeScalar(m(i))};
            auto res = interp.callFuncHandle(fh, fargs);
            result(i) = res->scalarDouble();
        }
        return Value::makeMatrix(std::move(result));
    });
}

} // namespace matfree
