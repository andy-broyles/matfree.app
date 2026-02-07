// MatFree - Python bindings via pybind11
// Copyright (c) 2026 MatFree Contributors - MIT License

#ifdef MATFREE_BUILD_PYTHON

#include <pybind11/pybind11.h>
#include <pybind11/stl.h>
#include <pybind11/numpy.h>

#include "core/interpreter.h"
#include "core/builtins.h"

namespace py = pybind11;
using namespace matfree;

class PyEngine {
public:
    PyEngine() {
        registerAllBuiltins(interp_);
    }

    std::string eval(const std::string& code) {
        std::ostringstream oss;
        interp_.setOutput(oss);
        interp_.executeString(code);
        return oss.str();
    }

    py::object get(const std::string& name) {
        auto val = interp_.globalEnv()->get(name);
        if (!val || val->isEmpty()) return py::none();

        if (val->isScalar()) {
            return py::float_(val->scalarDouble());
        }

        if (val->isMatrix()) {
            auto& m = val->matrix();
            py::array_t<double> arr({m.rows(), m.cols()});
            auto buf = arr.mutable_unchecked<2>();
            for (size_t i = 0; i < m.rows(); i++)
                for (size_t j = 0; j < m.cols(); j++)
                    buf(i, j) = m(i, j);
            return std::move(arr);
        }

        if (val->isString()) {
            return py::str(val->string());
        }

        return py::str(val->toString());
    }

    void set(const std::string& name, py::object value) {
        if (py::isinstance<py::float_>(value) || py::isinstance<py::int_>(value)) {
            interp_.globalEnv()->set(name, Value::makeScalar(value.cast<double>()));
        } else if (py::isinstance<py::str>(value)) {
            interp_.globalEnv()->set(name, Value::makeString(value.cast<std::string>()));
        } else if (py::isinstance<py::array>(value)) {
            py::array_t<double> arr = value.cast<py::array_t<double>>();
            auto buf = arr.unchecked<2>();
            Matrix m(buf.shape(0), buf.shape(1));
            for (ssize_t i = 0; i < buf.shape(0); i++)
                for (ssize_t j = 0; j < buf.shape(1); j++)
                    m(i, j) = buf(i, j);
            interp_.globalEnv()->set(name, Value::makeMatrix(std::move(m)));
        }
    }

    void runFile(const std::string& filename) {
        interp_.executeFile(filename);
    }

private:
    Interpreter interp_;
};

PYBIND11_MODULE(pymatfree, m) {
    m.doc() = "MatFree - Open-Source Computing Environment";

    py::class_<PyEngine>(m, "Engine")
        .def(py::init<>())
        .def("eval", &PyEngine::eval, "Execute MatFree code")
        .def("get", &PyEngine::get, "Get variable value")
        .def("set", &PyEngine::set, "Set variable value")
        .def("run_file", &PyEngine::runFile, "Execute a .m file");

    // Module-level convenience functions using a global engine
    static PyEngine globalEngine;
    m.def("eval", [](const std::string& code) { return globalEngine.eval(code); });
    m.def("get", [](const std::string& name) { return globalEngine.get(name); });
}

#endif // MATFREE_BUILD_PYTHON
