cmake_minimum_required(VERSION 3.16)
project(MatFree VERSION 0.1.0 LANGUAGES CXX)

# Require C++17
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Build options
option(MATFREE_BUILD_TESTS "Build unit tests" ON)
option(MATFREE_BUILD_PYTHON "Build Python bindings" OFF)
option(MATFREE_USE_EIGEN "Use Eigen for optimized linear algebra" OFF)

# Platform-specific settings
if(MSVC)
    add_compile_options(/W4 /permissive- /utf-8)
    add_definitions(-D_USE_MATH_DEFINES)  # For M_PI on MSVC
else()
    add_compile_options(-Wall -Wextra -Wpedantic)
endif()

# ============================================================================
# Core library
# ============================================================================

set(MATFREE_CORE_SOURCES
    src/core/lexer.cpp
    src/core/parser.cpp
    src/core/value.cpp
    src/core/interpreter.cpp
    src/core/builtins.cpp
    src/repl/repl.cpp
)

set(MATFREE_CORE_HEADERS
    src/core/token.h
    src/core/lexer.h
    src/core/ast.h
    src/core/parser.h
    src/core/value.h
    src/core/environment.h
    src/core/interpreter.h
    src/core/builtins.h
    src/repl/repl.h
)

add_library(matfree_core STATIC ${MATFREE_CORE_SOURCES} ${MATFREE_CORE_HEADERS})
target_include_directories(matfree_core PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/src)

# Eigen integration (optional, for optimized BLAS/LAPACK)
if(MATFREE_USE_EIGEN)
    find_package(Eigen3 REQUIRED)
    target_link_libraries(matfree_core PUBLIC Eigen3::Eigen)
    target_compile_definitions(matfree_core PUBLIC MATFREE_USE_EIGEN)
endif()

# ============================================================================
# Main executable
# ============================================================================

add_executable(matfree src/main.cpp)
target_link_libraries(matfree PRIVATE matfree_core)

# Install
install(TARGETS matfree RUNTIME DESTINATION bin)

# ============================================================================
# Tests
# ============================================================================

if(MATFREE_BUILD_TESTS)
    enable_testing()

    add_executable(matfree_test
        tests/test_main.cpp
    )
    target_link_libraries(matfree_test PRIVATE matfree_core)
    target_include_directories(matfree_test PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/src)

    add_test(NAME MatFreeTests COMMAND matfree_test)
endif()

# ============================================================================
# Python bindings (optional)
# ============================================================================

if(MATFREE_BUILD_PYTHON)
    find_package(pybind11 QUIET)
    if(pybind11_FOUND)
        pybind11_add_module(pymatfree python/matfree/bindings.cpp)
        target_link_libraries(pymatfree PRIVATE matfree_core)
        target_include_directories(pymatfree PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/src)
    else()
        message(WARNING "pybind11 not found, skipping Python bindings")
    endif()
endif()

# ============================================================================
# Summary
# ============================================================================

message(STATUS "")
message(STATUS "MatFree v${PROJECT_VERSION} Configuration:")
message(STATUS "  C++ Standard:    C++${CMAKE_CXX_STANDARD}")
message(STATUS "  Build Tests:     ${MATFREE_BUILD_TESTS}")
message(STATUS "  Python Bindings: ${MATFREE_BUILD_PYTHON}")
message(STATUS "  Eigen Backend:   ${MATFREE_USE_EIGEN}")
message(STATUS "  Install prefix:  ${CMAKE_INSTALL_PREFIX}")
message(STATUS "")
