#pragma once
// MatFree - Runtime value type for the MATLAB-compatible engine
// Copyright (c) 2026 MatFree Contributors - MIT License

#include <string>
#include <vector>
#include <complex>
#include <memory>
#include <map>
#include <variant>
#include <functional>
#include <sstream>
#include <cmath>
#include <stdexcept>
#include <iostream>
#include <iomanip>
#include <algorithm>
#include <numeric>

namespace matfree {

class RuntimeError : public std::runtime_error {
public:
    using std::runtime_error::runtime_error;
};

// Forward declaration
class Value;
using ValuePtr = std::shared_ptr<Value>;
using ValueList = std::vector<ValuePtr>;

// ============================================================================
// Matrix class (2D array of doubles, backed by contiguous storage)
// ============================================================================

class Matrix {
public:
    Matrix() : rows_(0), cols_(0) {}
    Matrix(size_t rows, size_t cols) : rows_(rows), cols_(cols), data_(rows * cols, 0.0) {}
    Matrix(size_t rows, size_t cols, double fillValue)
        : rows_(rows), cols_(cols), data_(rows * cols, fillValue) {}
    Matrix(size_t rows, size_t cols, std::vector<double> data)
        : rows_(rows), cols_(cols), data_(std::move(data)) {}

    // Factory methods
    static Matrix scalar(double val) {
        Matrix m(1, 1);
        m(0, 0) = val;
        return m;
    }

    static Matrix zeros(size_t rows, size_t cols) { return Matrix(rows, cols, 0.0); }
    static Matrix ones(size_t rows, size_t cols) { return Matrix(rows, cols, 1.0); }

    static Matrix eye(size_t n) {
        Matrix m(n, n);
        for (size_t i = 0; i < n; i++) m(i, i) = 1.0;
        return m;
    }

    static Matrix eye(size_t rows, size_t cols) {
        Matrix m(rows, cols);
        size_t n = std::min(rows, cols);
        for (size_t i = 0; i < n; i++) m(i, i) = 1.0;
        return m;
    }

    static Matrix linspace(double start, double stop, size_t n) {
        Matrix m(1, n);
        if (n == 1) {
            m(0, 0) = stop;
        } else {
            for (size_t i = 0; i < n; i++) {
                m(0, i) = start + (stop - start) * static_cast<double>(i) / (n - 1);
            }
        }
        return m;
    }

    static Matrix rand(size_t rows, size_t cols);
    static Matrix randn(size_t rows, size_t cols);

    // Element access (0-indexed internally, MATLAB is 1-indexed)
    double& operator()(size_t row, size_t col) { return data_[row * cols_ + col]; }
    double operator()(size_t row, size_t col) const { return data_[row * cols_ + col]; }

    // Linear indexing
    double& operator()(size_t idx) { return data_[idx]; }
    double operator()(size_t idx) const { return data_[idx]; }

    size_t rows() const { return rows_; }
    size_t cols() const { return cols_; }
    size_t numel() const { return data_.size(); }
    bool isEmpty() const { return data_.empty(); }
    bool isScalar() const { return rows_ == 1 && cols_ == 1; }
    bool isVector() const { return rows_ == 1 || cols_ == 1; }
    bool isRowVector() const { return rows_ == 1 && cols_ > 1; }
    bool isColVector() const { return cols_ == 1 && rows_ > 1; }
    bool isSquare() const { return rows_ == cols_; }

    double scalarValue() const {
        if (!isScalar()) throw RuntimeError("Not a scalar");
        return data_[0];
    }

    const std::vector<double>& data() const { return data_; }
    std::vector<double>& data() { return data_; }

    // Matrix operations
    Matrix transpose() const;
    Matrix operator+(const Matrix& other) const;
    Matrix operator-(const Matrix& other) const;
    Matrix operator*(const Matrix& other) const;       // Matrix multiply
    Matrix elementMul(const Matrix& other) const;      // .*
    Matrix elementDiv(const Matrix& other) const;      // ./
    Matrix elementPow(const Matrix& other) const;      // .^
    Matrix operator-() const;                           // Unary minus

    // Scalar operations
    Matrix operator+(double s) const;
    Matrix operator-(double s) const;
    Matrix operator*(double s) const;
    Matrix operator/(double s) const;
    Matrix power(double s) const;

    // Comparison (element-wise, returns logical matrix as doubles)
    Matrix eq(const Matrix& other) const;
    Matrix ne(const Matrix& other) const;
    Matrix lt(const Matrix& other) const;
    Matrix gt(const Matrix& other) const;
    Matrix le(const Matrix& other) const;
    Matrix ge(const Matrix& other) const;

    // Reduction operations
    double sum() const;
    double prod() const;
    double mean() const;
    double minVal() const;
    double maxVal() const;
    double norm(double p = 2.0) const;

    // Along-dimension operations
    Matrix sumAlongDim(int dim) const;
    Matrix meanAlongDim(int dim) const;

    // Submatrix operations
    Matrix getRow(size_t row) const;
    Matrix getCol(size_t col) const;
    Matrix submatrix(size_t r1, size_t c1, size_t r2, size_t c2) const;
    void setRow(size_t row, const Matrix& vals);
    void setCol(size_t col, const Matrix& vals);

    // Reshape
    Matrix reshape(size_t newRows, size_t newCols) const;

    // Concatenation
    static Matrix horzcat(const std::vector<Matrix>& matrices);
    static Matrix vertcat(const std::vector<Matrix>& matrices);

    // Display
    std::string toString() const;
    void display(std::ostream& os, const std::string& name = "") const;

private:
    size_t rows_, cols_;
    std::vector<double> data_;

    // Helper for broadcasting
    static void broadcastCheck(const Matrix& a, const Matrix& b,
                               size_t& rows, size_t& cols);
public:
    double getWithBroadcast(size_t r, size_t c) const;
private:
};

// ============================================================================
// Struct type (like MATLAB struct)
// ============================================================================

struct MatlabStruct {
    std::map<std::string, ValuePtr> fields;
};

// ============================================================================
// Cell Array type
// ============================================================================

struct CellArray {
    size_t rows, cols;
    std::vector<ValuePtr> data;

    CellArray() : rows(0), cols(0) {}
    CellArray(size_t r, size_t c) : rows(r), cols(c), data(r * c) {}

    ValuePtr& at(size_t r, size_t c) { return data[r * cols + c]; }
    const ValuePtr& at(size_t r, size_t c) const { return data[r * cols + c]; }
};

// ============================================================================
// Function handle type
// ============================================================================

// Forward declare for interpreter
struct FunctionDef;
class Interpreter;

using BuiltinFunc = std::function<ValuePtr(const ValueList&)>;

struct FunctionHandle {
    std::string name;
    std::variant<
        BuiltinFunc,                             // Built-in function
        std::shared_ptr<FunctionDef>             // User-defined function
    > impl;
};

// ============================================================================
// Value: the core runtime value in MatFree
// ============================================================================

enum class ValueType {
    MATRIX,         // Double matrix (includes scalars, vectors, ND arrays)
    COMPLEX_MATRIX, // Complex matrix (future: use separate storage)
    STRING,         // Character array / string
    LOGICAL,        // Logical matrix
    CELL_ARRAY,     // Cell array
    STRUCT,         // Structure
    FUNC_HANDLE,    // Function handle
    EMPTY           // Empty value (no output)
};

class Value {
public:
    // Constructors
    Value() : type_(ValueType::EMPTY) {}

    // Scalar double
    explicit Value(double d) : type_(ValueType::MATRIX), matrix_(Matrix::scalar(d)) {}

    // Matrix
    explicit Value(Matrix m) : type_(ValueType::MATRIX), matrix_(std::move(m)) {}

    // String
    explicit Value(const std::string& s) : type_(ValueType::STRING), string_(s) {}

    // Boolean/Logical
    explicit Value(bool b) : type_(ValueType::LOGICAL), matrix_(Matrix::scalar(b ? 1.0 : 0.0)) {}

    // Cell Array
    explicit Value(CellArray c) : type_(ValueType::CELL_ARRAY), cellArray_(std::move(c)) {}

    // Struct
    explicit Value(MatlabStruct s) : type_(ValueType::STRUCT), struct_(std::move(s)) {}

    // Function handle
    explicit Value(FunctionHandle fh)
        : type_(ValueType::FUNC_HANDLE), funcHandle_(std::move(fh)) {}

    // Type checking
    ValueType type() const { return type_; }
    bool isMatrix() const { return type_ == ValueType::MATRIX; }
    bool isString() const { return type_ == ValueType::STRING; }
    bool isLogical() const { return type_ == ValueType::LOGICAL; }
    bool isCellArray() const { return type_ == ValueType::CELL_ARRAY; }
    bool isStruct() const { return type_ == ValueType::STRUCT; }
    bool isFuncHandle() const { return type_ == ValueType::FUNC_HANDLE; }
    bool isEmpty() const { return type_ == ValueType::EMPTY; }

    bool isScalar() const {
        return (isMatrix() || isLogical()) && matrix_.isScalar();
    }

    bool isNumeric() const {
        return isMatrix() || isLogical();
    }

    // Accessors
    Matrix& matrix() {
        if (!isMatrix() && !isLogical())
            throw RuntimeError("Value is not a matrix");
        return matrix_;
    }
    const Matrix& matrix() const {
        if (!isMatrix() && !isLogical())
            throw RuntimeError("Value is not a matrix");
        return matrix_;
    }

    double scalarDouble() const {
        if (isString()) {
            // MATLAB converts single char to its ASCII value
            if (string_.size() == 1) return static_cast<double>(string_[0]);
            throw RuntimeError("Cannot convert string to scalar");
        }
        return matrix_.scalarValue();
    }

    const std::string& string() const {
        if (!isString()) throw RuntimeError("Value is not a string");
        return string_;
    }

    CellArray& cellArray() {
        if (!isCellArray()) throw RuntimeError("Value is not a cell array");
        return cellArray_;
    }
    const CellArray& cellArray() const {
        if (!isCellArray()) throw RuntimeError("Value is not a cell array");
        return cellArray_;
    }

    MatlabStruct& structVal() {
        if (!isStruct()) throw RuntimeError("Value is not a struct");
        return struct_;
    }
    const MatlabStruct& structVal() const {
        if (!isStruct()) throw RuntimeError("Value is not a struct");
        return struct_;
    }

    FunctionHandle& funcHandle() {
        if (!isFuncHandle()) throw RuntimeError("Value is not a function handle");
        return funcHandle_;
    }
    const FunctionHandle& funcHandle() const {
        if (!isFuncHandle()) throw RuntimeError("Value is not a function handle");
        return funcHandle_;
    }

    // Convert to boolean (for if conditions, while conditions)
    bool toBool() const;

    // Convert to matrix (numeric coercion)
    Matrix toMatrix() const;

    // Display
    std::string toString() const;
    void display(std::ostream& os, const std::string& name = "") const;

    // Factory helpers
    static ValuePtr makeScalar(double d) { return std::make_shared<Value>(d); }
    static ValuePtr makeMatrix(Matrix m) { return std::make_shared<Value>(std::move(m)); }
    static ValuePtr makeString(const std::string& s) { return std::make_shared<Value>(s); }
    static ValuePtr makeBool(bool b) { return std::make_shared<Value>(b); }
    static ValuePtr makeEmpty() { return std::make_shared<Value>(); }
    static ValuePtr makeCellArray(CellArray c) { return std::make_shared<Value>(std::move(c)); }
    static ValuePtr makeStruct(MatlabStruct s) { return std::make_shared<Value>(std::move(s)); }
    static ValuePtr makeFuncHandle(FunctionHandle fh) { return std::make_shared<Value>(std::move(fh)); }

private:
    ValueType type_;
    Matrix matrix_;
    std::string string_;
    CellArray cellArray_;
    MatlabStruct struct_;
    FunctionHandle funcHandle_;
};

} // namespace matfree
