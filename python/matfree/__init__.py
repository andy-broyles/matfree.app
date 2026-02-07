"""
MatFree - Open-Source MATLAB-Compatible Computing Environment

Python interface for MatFree. Provides access to the MatFree engine
for executing MATLAB-compatible code from Python.

Usage:
    import matfree

    # Execute MATLAB code
    matfree.eval("x = [1 2 3; 4 5 6]")

    # Get variable values
    x = matfree.get("x")

    # Interactive session
    matfree.repl()
"""

__version__ = "0.1.0"
__author__ = "MatFree Contributors"
__license__ = "MIT"

# Try to import the C++ bindings
try:
    from .pymatfree import Engine, eval as _eval, get as _get
    _HAS_NATIVE = True
except ImportError:
    _HAS_NATIVE = False

# Pure-Python fallback engine (for when C++ bindings are not available)
import subprocess
import os
import tempfile

_MATFREE_BIN = os.environ.get("MATFREE_BIN", "matfree")


def eval(code: str) -> str:
    """Execute MATLAB-compatible code and return output."""
    if _HAS_NATIVE:
        return _eval(code)

    # Fallback: use command-line matfree
    try:
        result = subprocess.run(
            [_MATFREE_BIN, "-e", code],
            capture_output=True, text=True, timeout=30
        )
        if result.returncode != 0:
            raise RuntimeError(result.stderr.strip())
        return result.stdout
    except FileNotFoundError:
        raise RuntimeError(
            "MatFree binary not found. Either:\n"
            "  1. Build the C++ engine and set MATFREE_BIN environment variable\n"
            "  2. Build Python bindings with: cmake -DMATFREE_BUILD_PYTHON=ON .."
        )


def run_file(filename: str) -> str:
    """Execute a .m file."""
    try:
        result = subprocess.run(
            [_MATFREE_BIN, filename],
            capture_output=True, text=True, timeout=60
        )
        if result.returncode != 0:
            raise RuntimeError(result.stderr.strip())
        return result.stdout
    except FileNotFoundError:
        raise RuntimeError("MatFree binary not found.")


def repl():
    """Start an interactive MatFree session."""
    try:
        subprocess.run([_MATFREE_BIN])
    except FileNotFoundError:
        raise RuntimeError("MatFree binary not found.")
