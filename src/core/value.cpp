// MatFree - Runtime value and matrix implementation
// Copyright (c) 2026 MatFree Contributors - MIT License

#include "value.h"
#include <random>
#include <cassert>

namespace matfree {

// ============================================================================
// Matrix implementation
// ============================================================================

static std::mt19937& rng() {
    static std::mt19937 gen(std::random_device{}());
    return gen;
}

Matrix Matrix::rand(size_t rows, size_t cols) {
    Matrix m(rows, cols);
    std::uniform_real_distribution<double> dist(0.0, 1.0);
    for (auto& v : m.data_) v = dist(rng());
    return m;
}

Matrix Matrix::randn(size_t rows, size_t cols) {
    Matrix m(rows, cols);
    std::normal_distribution<double> dist(0.0, 1.0);
    for (auto& v : m.data_) v = dist(rng());
    return m;
}

Matrix Matrix::transpose() const {
    Matrix result(cols_, rows_);
    for (size_t i = 0; i < rows_; i++) {
        for (size_t j = 0; j < cols_; j++) {
            result(j, i) = (*this)(i, j);
        }
    }
    return result;
}

void Matrix::broadcastCheck(const Matrix& a, const Matrix& b,
                             size_t& rows, size_t& cols) {
    if (a.rows_ == b.rows_ && a.cols_ == b.cols_) {
        rows = a.rows_;
        cols = a.cols_;
    } else if (a.isScalar()) {
        rows = b.rows_;
        cols = b.cols_;
    } else if (b.isScalar()) {
        rows = a.rows_;
        cols = a.cols_;
    } else if (a.rows_ == b.rows_ && (a.cols_ == 1 || b.cols_ == 1)) {
        rows = a.rows_;
        cols = std::max(a.cols_, b.cols_);
    } else if (a.cols_ == b.cols_ && (a.rows_ == 1 || b.rows_ == 1)) {
        rows = std::max(a.rows_, b.rows_);
        cols = a.cols_;
    } else {
        throw RuntimeError("Matrix dimensions must agree (" +
            std::to_string(a.rows_) + "x" + std::to_string(a.cols_) + " vs " +
            std::to_string(b.rows_) + "x" + std::to_string(b.cols_) + ")");
    }
}

double Matrix::getWithBroadcast(size_t r, size_t c) const {
    size_t actualR = (rows_ == 1) ? 0 : r;
    size_t actualC = (cols_ == 1) ? 0 : c;
    return (*this)(actualR, actualC);
}

Matrix Matrix::operator+(const Matrix& other) const {
    size_t r, c;
    broadcastCheck(*this, other, r, c);
    Matrix result(r, c);
    for (size_t i = 0; i < r; i++)
        for (size_t j = 0; j < c; j++)
            result(i, j) = getWithBroadcast(i, j) + other.getWithBroadcast(i, j);
    return result;
}

Matrix Matrix::operator-(const Matrix& other) const {
    size_t r, c;
    broadcastCheck(*this, other, r, c);
    Matrix result(r, c);
    for (size_t i = 0; i < r; i++)
        for (size_t j = 0; j < c; j++)
            result(i, j) = getWithBroadcast(i, j) - other.getWithBroadcast(i, j);
    return result;
}

Matrix Matrix::operator*(const Matrix& other) const {
    // Matrix multiplication
    if (isScalar()) return other * scalarValue();
    if (other.isScalar()) return *this * other.scalarValue();

    if (cols_ != other.rows_) {
        throw RuntimeError("Inner matrix dimensions must agree for multiplication (" +
            std::to_string(rows_) + "x" + std::to_string(cols_) + " * " +
            std::to_string(other.rows_) + "x" + std::to_string(other.cols_) + ")");
    }

    Matrix result(rows_, other.cols_);
    for (size_t i = 0; i < rows_; i++) {
        for (size_t j = 0; j < other.cols_; j++) {
            double sum = 0.0;
            for (size_t k = 0; k < cols_; k++) {
                sum += (*this)(i, k) * other(k, j);
            }
            result(i, j) = sum;
        }
    }
    return result;
}

Matrix Matrix::elementMul(const Matrix& other) const {
    size_t r, c;
    broadcastCheck(*this, other, r, c);
    Matrix result(r, c);
    for (size_t i = 0; i < r; i++)
        for (size_t j = 0; j < c; j++)
            result(i, j) = getWithBroadcast(i, j) * other.getWithBroadcast(i, j);
    return result;
}

Matrix Matrix::elementDiv(const Matrix& other) const {
    size_t r, c;
    broadcastCheck(*this, other, r, c);
    Matrix result(r, c);
    for (size_t i = 0; i < r; i++)
        for (size_t j = 0; j < c; j++)
            result(i, j) = getWithBroadcast(i, j) / other.getWithBroadcast(i, j);
    return result;
}

Matrix Matrix::elementPow(const Matrix& other) const {
    size_t r, c;
    broadcastCheck(*this, other, r, c);
    Matrix result(r, c);
    for (size_t i = 0; i < r; i++)
        for (size_t j = 0; j < c; j++)
            result(i, j) = std::pow(getWithBroadcast(i, j), other.getWithBroadcast(i, j));
    return result;
}

Matrix Matrix::operator-() const {
    Matrix result(rows_, cols_);
    for (size_t i = 0; i < data_.size(); i++)
        result.data_[i] = -data_[i];
    return result;
}

Matrix Matrix::operator+(double s) const {
    Matrix result(rows_, cols_);
    for (size_t i = 0; i < data_.size(); i++)
        result.data_[i] = data_[i] + s;
    return result;
}

Matrix Matrix::operator-(double s) const {
    Matrix result(rows_, cols_);
    for (size_t i = 0; i < data_.size(); i++)
        result.data_[i] = data_[i] - s;
    return result;
}

Matrix Matrix::operator*(double s) const {
    Matrix result(rows_, cols_);
    for (size_t i = 0; i < data_.size(); i++)
        result.data_[i] = data_[i] * s;
    return result;
}

Matrix Matrix::operator/(double s) const {
    Matrix result(rows_, cols_);
    for (size_t i = 0; i < data_.size(); i++)
        result.data_[i] = data_[i] / s;
    return result;
}

Matrix Matrix::power(double s) const {
    Matrix result(rows_, cols_);
    for (size_t i = 0; i < data_.size(); i++)
        result.data_[i] = std::pow(data_[i], s);
    return result;
}

// Comparison operations
Matrix Matrix::eq(const Matrix& other) const {
    size_t r, c; broadcastCheck(*this, other, r, c);
    Matrix result(r, c);
    for (size_t i = 0; i < r; i++)
        for (size_t j = 0; j < c; j++)
            result(i, j) = (getWithBroadcast(i, j) == other.getWithBroadcast(i, j)) ? 1.0 : 0.0;
    return result;
}

Matrix Matrix::ne(const Matrix& other) const {
    size_t r, c; broadcastCheck(*this, other, r, c);
    Matrix result(r, c);
    for (size_t i = 0; i < r; i++)
        for (size_t j = 0; j < c; j++)
            result(i, j) = (getWithBroadcast(i, j) != other.getWithBroadcast(i, j)) ? 1.0 : 0.0;
    return result;
}

Matrix Matrix::lt(const Matrix& other) const {
    size_t r, c; broadcastCheck(*this, other, r, c);
    Matrix result(r, c);
    for (size_t i = 0; i < r; i++)
        for (size_t j = 0; j < c; j++)
            result(i, j) = (getWithBroadcast(i, j) < other.getWithBroadcast(i, j)) ? 1.0 : 0.0;
    return result;
}

Matrix Matrix::gt(const Matrix& other) const {
    size_t r, c; broadcastCheck(*this, other, r, c);
    Matrix result(r, c);
    for (size_t i = 0; i < r; i++)
        for (size_t j = 0; j < c; j++)
            result(i, j) = (getWithBroadcast(i, j) > other.getWithBroadcast(i, j)) ? 1.0 : 0.0;
    return result;
}

Matrix Matrix::le(const Matrix& other) const {
    size_t r, c; broadcastCheck(*this, other, r, c);
    Matrix result(r, c);
    for (size_t i = 0; i < r; i++)
        for (size_t j = 0; j < c; j++)
            result(i, j) = (getWithBroadcast(i, j) <= other.getWithBroadcast(i, j)) ? 1.0 : 0.0;
    return result;
}

Matrix Matrix::ge(const Matrix& other) const {
    size_t r, c; broadcastCheck(*this, other, r, c);
    Matrix result(r, c);
    for (size_t i = 0; i < r; i++)
        for (size_t j = 0; j < c; j++)
            result(i, j) = (getWithBroadcast(i, j) >= other.getWithBroadcast(i, j)) ? 1.0 : 0.0;
    return result;
}

// Reductions
double Matrix::sum() const {
    double s = 0;
    for (auto v : data_) s += v;
    return s;
}

double Matrix::prod() const {
    double p = 1;
    for (auto v : data_) p *= v;
    return p;
}

double Matrix::mean() const {
    return sum() / static_cast<double>(numel());
}

double Matrix::minVal() const {
    if (data_.empty()) throw RuntimeError("Cannot find min of empty matrix");
    return *std::min_element(data_.begin(), data_.end());
}

double Matrix::maxVal() const {
    if (data_.empty()) throw RuntimeError("Cannot find max of empty matrix");
    return *std::max_element(data_.begin(), data_.end());
}

double Matrix::norm(double p) const {
    if (p == 2.0 && isVector()) {
        double s = 0;
        for (auto v : data_) s += v * v;
        return std::sqrt(s);
    }
    if (p == 1.0) {
        double s = 0;
        for (auto v : data_) s += std::abs(v);
        return s;
    }
    if (std::isinf(p)) {
        double mx = 0;
        for (auto v : data_) mx = std::max(mx, std::abs(v));
        return mx;
    }
    // General p-norm for vectors
    double s = 0;
    for (auto v : data_) s += std::pow(std::abs(v), p);
    return std::pow(s, 1.0 / p);
}

Matrix Matrix::sumAlongDim(int dim) const {
    if (dim == 1) {
        // Sum along rows (result is 1 x cols)
        Matrix result(1, cols_);
        for (size_t j = 0; j < cols_; j++) {
            double s = 0;
            for (size_t i = 0; i < rows_; i++) s += (*this)(i, j);
            result(0, j) = s;
        }
        return result;
    } else {
        // Sum along columns (result is rows x 1)
        Matrix result(rows_, 1);
        for (size_t i = 0; i < rows_; i++) {
            double s = 0;
            for (size_t j = 0; j < cols_; j++) s += (*this)(i, j);
            result(i, 0) = s;
        }
        return result;
    }
}

Matrix Matrix::meanAlongDim(int dim) const {
    Matrix s = sumAlongDim(dim);
    double divisor = (dim == 1) ? static_cast<double>(rows_) : static_cast<double>(cols_);
    for (auto& v : s.data()) v /= divisor;
    return s;
}

Matrix Matrix::getRow(size_t row) const {
    Matrix result(1, cols_);
    for (size_t j = 0; j < cols_; j++) result(0, j) = (*this)(row, j);
    return result;
}

Matrix Matrix::getCol(size_t col) const {
    Matrix result(rows_, 1);
    for (size_t i = 0; i < rows_; i++) result(i, 0) = (*this)(i, col);
    return result;
}

Matrix Matrix::submatrix(size_t r1, size_t c1, size_t r2, size_t c2) const {
    size_t nr = r2 - r1 + 1, nc = c2 - c1 + 1;
    Matrix result(nr, nc);
    for (size_t i = 0; i < nr; i++)
        for (size_t j = 0; j < nc; j++)
            result(i, j) = (*this)(r1 + i, c1 + j);
    return result;
}

void Matrix::setRow(size_t row, const Matrix& vals) {
    for (size_t j = 0; j < cols_ && j < vals.numel(); j++)
        (*this)(row, j) = vals(j);
}

void Matrix::setCol(size_t col, const Matrix& vals) {
    for (size_t i = 0; i < rows_ && i < vals.numel(); i++)
        (*this)(i, col) = vals(i);
}

Matrix Matrix::reshape(size_t newRows, size_t newCols) const {
    if (newRows * newCols != numel()) {
        throw RuntimeError("Cannot reshape " + std::to_string(rows_) + "x" +
            std::to_string(cols_) + " to " + std::to_string(newRows) + "x" +
            std::to_string(newCols));
    }
    return Matrix(newRows, newCols, data_);
}

Matrix Matrix::horzcat(const std::vector<Matrix>& matrices) {
    if (matrices.empty()) return Matrix();
    size_t rows = matrices[0].rows();
    size_t totalCols = 0;
    for (auto& m : matrices) {
        if (m.rows() != rows && !m.isEmpty())
            throw RuntimeError("Dimensions of arrays being concatenated are not consistent");
        totalCols += m.cols();
    }

    Matrix result(rows, totalCols);
    size_t colOffset = 0;
    for (auto& m : matrices) {
        for (size_t i = 0; i < m.rows(); i++)
            for (size_t j = 0; j < m.cols(); j++)
                result(i, colOffset + j) = m(i, j);
        colOffset += m.cols();
    }
    return result;
}

Matrix Matrix::vertcat(const std::vector<Matrix>& matrices) {
    if (matrices.empty()) return Matrix();
    size_t cols = matrices[0].cols();
    size_t totalRows = 0;
    for (auto& m : matrices) {
        if (m.cols() != cols && !m.isEmpty())
            throw RuntimeError("Dimensions of arrays being concatenated are not consistent");
        totalRows += m.rows();
    }

    Matrix result(totalRows, cols);
    size_t rowOffset = 0;
    for (auto& m : matrices) {
        for (size_t i = 0; i < m.rows(); i++)
            for (size_t j = 0; j < m.cols(); j++)
                result(rowOffset + i, j) = m(i, j);
        rowOffset += m.rows();
    }
    return result;
}

std::string Matrix::toString() const {
    std::ostringstream oss;
    display(oss);
    return oss.str();
}

void Matrix::display(std::ostream& os, const std::string& name) const {
    if (!name.empty()) {
        os << name << " =" << std::endl << std::endl;
    }

    if (isEmpty()) {
        os << "     []" << std::endl;
        return;
    }

    if (isScalar()) {
        os << "   " << std::setprecision(4) << data_[0] << std::endl;
        return;
    }

    // Determine formatting
    bool allIntegers = true;
    double maxAbs = 0;
    for (auto v : data_) {
        if (v != std::floor(v)) allIntegers = false;
        maxAbs = std::max(maxAbs, std::abs(v));
    }

    int width = 10;
    int precision = 4;
    if (allIntegers && maxAbs < 1e6) {
        width = static_cast<int>(std::to_string(static_cast<long long>(maxAbs)).size()) + 5;
        precision = 0;
    }

    for (size_t i = 0; i < rows_; i++) {
        os << "   ";
        for (size_t j = 0; j < cols_; j++) {
            if (allIntegers && maxAbs < 1e6) {
                os << std::setw(width) << static_cast<long long>((*this)(i, j));
            } else {
                os << std::setw(width) << std::setprecision(precision)
                   << std::fixed << (*this)(i, j);
            }
        }
        os << std::endl;
    }
}

// ============================================================================
// Value implementation
// ============================================================================

bool Value::toBool() const {
    switch (type_) {
        case ValueType::MATRIX:
        case ValueType::LOGICAL: {
            // MATLAB: all elements must be nonzero
            for (size_t i = 0; i < matrix_.numel(); i++) {
                if (matrix_(i) == 0.0) return false;
            }
            return matrix_.numel() > 0;
        }
        case ValueType::STRING:
            return !string_.empty();
        default:
            throw RuntimeError("Cannot convert value to logical");
    }
}

Matrix Value::toMatrix() const {
    switch (type_) {
        case ValueType::MATRIX:
        case ValueType::LOGICAL:
            return matrix_;
        case ValueType::STRING: {
            // Convert string to array of character codes
            Matrix m(1, string_.size());
            for (size_t i = 0; i < string_.size(); i++)
                m(0, i) = static_cast<double>(string_[i]);
            return m;
        }
        default:
            throw RuntimeError("Cannot convert to numeric matrix");
    }
}

std::string Value::toString() const {
    std::ostringstream oss;
    switch (type_) {
        case ValueType::MATRIX:
        case ValueType::LOGICAL:
            oss << matrix_.toString();
            break;
        case ValueType::STRING:
            oss << "'" << string_ << "'";
            break;
        case ValueType::CELL_ARRAY:
            oss << "{" << cellArray_.rows << "x" << cellArray_.cols << " cell}";
            break;
        case ValueType::STRUCT:
            oss << "struct with " << struct_.fields.size() << " fields";
            break;
        case ValueType::FUNC_HANDLE:
            oss << "@" << funcHandle_.name;
            break;
        case ValueType::EMPTY:
            oss << "[]";
            break;
        default:
            oss << "<unknown>";
            break;
    }
    return oss.str();
}

void Value::display(std::ostream& os, const std::string& name) const {
    switch (type_) {
        case ValueType::MATRIX:
        case ValueType::LOGICAL:
            if (!name.empty()) os << name << " =" << std::endl << std::endl;
            matrix_.display(os);
            os << std::endl;
            break;
        case ValueType::STRING:
            if (!name.empty()) os << name << " =" << std::endl << std::endl;
            os << "    '" << string_ << "'" << std::endl << std::endl;
            break;
        case ValueType::CELL_ARRAY:
            if (!name.empty()) os << name << " =" << std::endl << std::endl;
            os << "  {" << cellArray_.rows << "x" << cellArray_.cols << " cell}" << std::endl << std::endl;
            break;
        case ValueType::STRUCT:
            if (!name.empty()) os << name << " =" << std::endl << std::endl;
            os << "  struct with fields:" << std::endl;
            for (auto& [k, v] : struct_.fields) {
                os << "    " << k << ": ";
                if (v) os << v->toString();
                else os << "[]";
                os << std::endl;
            }
            os << std::endl;
            break;
        case ValueType::FUNC_HANDLE:
            if (!name.empty()) os << name << " =" << std::endl << std::endl;
            os << "    @" << funcHandle_.name << std::endl << std::endl;
            break;
        case ValueType::EMPTY:
            if (!name.empty()) os << name << " =" << std::endl << std::endl;
            os << "     []" << std::endl << std::endl;
            break;
        default:
            break;
    }
}

} // namespace matfree
