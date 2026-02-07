// MatFree - Integration tests
// Copyright (c) 2026 MatFree Contributors - MIT License
//
// Simple test framework (no external dependencies required)

#include "core/interpreter.h"
#include "core/builtins.h"
#include "core/lexer.h"
#include "core/parser.h"
#include <iostream>
#include <sstream>
#include <cmath>
#include <cassert>
#include <type_traits>

using namespace matfree;

static int testsRun = 0;
static int testsPassed = 0;
static int testsFailed = 0;

#define TEST(name) \
    static void test_##name(); \
    struct Register_##name { \
        Register_##name() { \
            testsRun++; \
            std::cout << "  Running: " << #name << "... "; \
            try { \
                test_##name(); \
                testsPassed++; \
                std::cout << "PASSED" << std::endl; \
            } catch (std::exception& e) { \
                testsFailed++; \
                std::cout << "FAILED: " << e.what() << std::endl; \
            } \
        } \
    } register_##name; \
    static void test_##name()

// Helper to convert any type to string for assertions
template<typename T>
std::string toStr(const T& val) {
    std::ostringstream oss;
    if constexpr (std::is_enum_v<T>) {
        oss << static_cast<int>(val);
    } else {
        oss << val;
    }
    return oss.str();
}

#define ASSERT_EQ(a, b) \
    if ((a) != (b)) throw std::runtime_error( \
        std::string("Assertion failed: ") + #a + " == " + #b + \
        " (got " + toStr(a) + " vs " + toStr(b) + ")")

#define ASSERT_NEAR(a, b, tol) \
    if (std::abs((a) - (b)) > (tol)) throw std::runtime_error( \
        std::string("Assertion failed: ") + #a + " ~= " + #b + \
        " (got " + std::to_string(a) + " vs " + std::to_string(b) + ")")

#define ASSERT_TRUE(x) \
    if (!(x)) throw std::runtime_error(std::string("Assertion failed: ") + #x)

// Helper: create an interpreter for testing
static Interpreter createTestInterp() {
    Interpreter interp;
    registerAllBuiltins(interp);
    std::ostringstream* oss = new std::ostringstream();
    interp.setOutput(*oss);
    return interp;
}

static std::string captureOutput(Interpreter& interp, const std::string& code) {
    std::ostringstream oss;
    interp.setOutput(oss);
    interp.executeString(code);
    return oss.str();
}

// ============================================================================
// Lexer tests
// ============================================================================

TEST(lexer_numbers) {
    Lexer lex("42 3.14 1e-5 2.5i");
    auto tokens = lex.tokenize();
    ASSERT_EQ(tokens[0].type, TokenType::NUMBER);
    ASSERT_NEAR(tokens[0].numValue, 42.0, 1e-10);
    ASSERT_EQ(tokens[1].type, TokenType::NUMBER);
    ASSERT_NEAR(tokens[1].numValue, 3.14, 1e-10);
    ASSERT_EQ(tokens[2].type, TokenType::NUMBER);
    ASSERT_NEAR(tokens[2].numValue, 1e-5, 1e-15);
    ASSERT_EQ(tokens[3].type, TokenType::NUMBER);
    ASSERT_TRUE(tokens[3].isComplex);
    ASSERT_NEAR(tokens[3].imagValue, 2.5, 1e-10);
}

TEST(lexer_strings) {
    Lexer lex("'hello' \"world\"");
    auto tokens = lex.tokenize();
    ASSERT_EQ(tokens[0].type, TokenType::STRING);
    ASSERT_EQ(tokens[0].lexeme, "hello");
    ASSERT_EQ(tokens[1].type, TokenType::STRING);
    ASSERT_EQ(tokens[1].lexeme, "world");
}

TEST(lexer_operators) {
    Lexer lex("+ - * / .* ./ .^ == ~= <= >= && ||");
    auto tokens = lex.tokenize();
    ASSERT_EQ(tokens[0].type, TokenType::PLUS);
    ASSERT_EQ(tokens[1].type, TokenType::MINUS);
    ASSERT_EQ(tokens[2].type, TokenType::STAR);
    ASSERT_EQ(tokens[3].type, TokenType::SLASH);
    ASSERT_EQ(tokens[4].type, TokenType::DOT_STAR);
    ASSERT_EQ(tokens[5].type, TokenType::DOT_SLASH);
    ASSERT_EQ(tokens[6].type, TokenType::DOT_CARET);
    ASSERT_EQ(tokens[7].type, TokenType::EQ);
    ASSERT_EQ(tokens[8].type, TokenType::NE);
    ASSERT_EQ(tokens[9].type, TokenType::LE);
    ASSERT_EQ(tokens[10].type, TokenType::GE);
    ASSERT_EQ(tokens[11].type, TokenType::SHORT_AND);
    ASSERT_EQ(tokens[12].type, TokenType::SHORT_OR);
}

TEST(lexer_keywords) {
    Lexer lex("if else end for while function return");
    auto tokens = lex.tokenize();
    ASSERT_EQ(tokens[0].type, TokenType::IF);
    ASSERT_EQ(tokens[1].type, TokenType::ELSE);
    ASSERT_EQ(tokens[2].type, TokenType::END);
    ASSERT_EQ(tokens[3].type, TokenType::FOR);
    ASSERT_EQ(tokens[4].type, TokenType::WHILE);
    ASSERT_EQ(tokens[5].type, TokenType::FUNCTION);
    ASSERT_EQ(tokens[6].type, TokenType::RETURN);
}

// ============================================================================
// Parser tests
// ============================================================================

TEST(parser_simple_expr) {
    Lexer lex("x = 42;");
    auto tokens = lex.tokenize();
    Parser parser(tokens);
    auto prog = parser.parse();
    ASSERT_TRUE(prog.statements.size() >= 1);
}

TEST(parser_matrix_literal) {
    Lexer lex("[1 2 3; 4 5 6]");
    auto tokens = lex.tokenize();
    Parser parser(tokens);
    auto prog = parser.parse();
    ASSERT_TRUE(prog.statements.size() >= 1);
}

TEST(parser_function_def) {
    Lexer lex("function y = square(x)\ny = x^2;\nend");
    auto tokens = lex.tokenize();
    Parser parser(tokens);
    auto prog = parser.parse();
    ASSERT_TRUE(prog.functions.size() == 1);
    ASSERT_EQ(prog.functions[0]->name, "square");
}

// ============================================================================
// Interpreter tests
// ============================================================================

TEST(interp_scalar_arithmetic) {
    auto interp = createTestInterp();
    interp.executeString("x = 2 + 3;");
    auto val = interp.globalEnv()->get("x");
    ASSERT_TRUE(val != nullptr);
    ASSERT_NEAR(val->scalarDouble(), 5.0, 1e-10);
}

TEST(interp_matrix_creation) {
    auto interp = createTestInterp();
    interp.executeString("A = [1 2 3; 4 5 6];");
    auto val = interp.globalEnv()->get("A");
    ASSERT_TRUE(val != nullptr);
    ASSERT_TRUE(val->isMatrix());
    ASSERT_EQ(val->matrix().rows(), 2u);
    ASSERT_EQ(val->matrix().cols(), 3u);
    ASSERT_NEAR(val->matrix()(0, 0), 1.0, 1e-10);
    ASSERT_NEAR(val->matrix()(1, 2), 6.0, 1e-10);
}

TEST(interp_matrix_multiply) {
    auto interp = createTestInterp();
    interp.executeString("A = [1 2; 3 4]; B = [5 6; 7 8]; C = A * B;");
    auto val = interp.globalEnv()->get("C");
    ASSERT_TRUE(val != nullptr);
    // [1*5+2*7, 1*6+2*8; 3*5+4*7, 3*6+4*8] = [19 22; 43 50]
    ASSERT_NEAR(val->matrix()(0, 0), 19.0, 1e-10);
    ASSERT_NEAR(val->matrix()(0, 1), 22.0, 1e-10);
    ASSERT_NEAR(val->matrix()(1, 0), 43.0, 1e-10);
    ASSERT_NEAR(val->matrix()(1, 1), 50.0, 1e-10);
}

TEST(interp_element_wise_ops) {
    auto interp = createTestInterp();
    interp.executeString("A = [1 2; 3 4]; B = A .* A;");
    auto val = interp.globalEnv()->get("B");
    ASSERT_NEAR(val->matrix()(0, 0), 1.0, 1e-10);
    ASSERT_NEAR(val->matrix()(0, 1), 4.0, 1e-10);
    ASSERT_NEAR(val->matrix()(1, 0), 9.0, 1e-10);
    ASSERT_NEAR(val->matrix()(1, 1), 16.0, 1e-10);
}

TEST(interp_transpose) {
    auto interp = createTestInterp();
    interp.executeString("A = [1 2 3; 4 5 6]; B = A';");
    auto val = interp.globalEnv()->get("B");
    ASSERT_EQ(val->matrix().rows(), 3u);
    ASSERT_EQ(val->matrix().cols(), 2u);
    ASSERT_NEAR(val->matrix()(0, 0), 1.0, 1e-10);
    ASSERT_NEAR(val->matrix()(2, 1), 6.0, 1e-10);
}

TEST(interp_colon_range) {
    auto interp = createTestInterp();
    interp.executeString("x = 1:5;");
    auto val = interp.globalEnv()->get("x");
    ASSERT_EQ(val->matrix().cols(), 5u);
    ASSERT_NEAR(val->matrix()(0, 0), 1.0, 1e-10);
    ASSERT_NEAR(val->matrix()(0, 4), 5.0, 1e-10);
}

TEST(interp_colon_step) {
    auto interp = createTestInterp();
    interp.executeString("x = 0:0.5:2;");
    auto val = interp.globalEnv()->get("x");
    ASSERT_EQ(val->matrix().cols(), 5u);
    ASSERT_NEAR(val->matrix()(0, 2), 1.0, 1e-10);
}

TEST(interp_math_functions) {
    auto interp = createTestInterp();
    interp.executeString("x = sin(pi/2);");
    auto val = interp.globalEnv()->get("x");
    ASSERT_NEAR(val->scalarDouble(), 1.0, 1e-10);

    interp.executeString("y = sqrt(16);");
    val = interp.globalEnv()->get("y");
    ASSERT_NEAR(val->scalarDouble(), 4.0, 1e-10);

    interp.executeString("z = exp(0);");
    val = interp.globalEnv()->get("z");
    ASSERT_NEAR(val->scalarDouble(), 1.0, 1e-10);
}

TEST(interp_if_else) {
    auto interp = createTestInterp();
    interp.executeString("x = 5; if x > 3\n y = 1;\nelse\n y = 0;\nend");
    auto val = interp.globalEnv()->get("y");
    ASSERT_NEAR(val->scalarDouble(), 1.0, 1e-10);
}

TEST(interp_for_loop) {
    auto interp = createTestInterp();
    interp.executeString("s = 0; for i = 1:10\n s = s + i;\nend");
    auto val = interp.globalEnv()->get("s");
    ASSERT_NEAR(val->scalarDouble(), 55.0, 1e-10);
}

TEST(interp_while_loop) {
    auto interp = createTestInterp();
    interp.executeString("x = 1; while x < 100\n x = x * 2;\nend");
    auto val = interp.globalEnv()->get("x");
    ASSERT_NEAR(val->scalarDouble(), 128.0, 1e-10);
}

TEST(interp_function_call) {
    auto interp = createTestInterp();
    interp.executeString("function y = mySquare(x)\ny = x^2;\nend\nresult = mySquare(7);");
    auto val = interp.globalEnv()->get("result");
    ASSERT_NEAR(val->scalarDouble(), 49.0, 1e-10);
}

TEST(interp_anonymous_func) {
    auto interp = createTestInterp();
    interp.executeString("f = @(x) x^2; y = f(5);");
    auto val = interp.globalEnv()->get("y");
    ASSERT_NEAR(val->scalarDouble(), 25.0, 1e-10);
}

TEST(interp_builtin_zeros_ones_eye) {
    auto interp = createTestInterp();
    interp.executeString("A = zeros(2,3);");
    auto val = interp.globalEnv()->get("A");
    ASSERT_EQ(val->matrix().rows(), 2u);
    ASSERT_EQ(val->matrix().cols(), 3u);
    ASSERT_NEAR(val->matrix()(0, 0), 0.0, 1e-10);

    interp.executeString("B = ones(2,2);");
    val = interp.globalEnv()->get("B");
    ASSERT_NEAR(val->matrix()(1, 1), 1.0, 1e-10);

    interp.executeString("I = eye(3);");
    val = interp.globalEnv()->get("I");
    ASSERT_NEAR(val->matrix()(0, 0), 1.0, 1e-10);
    ASSERT_NEAR(val->matrix()(0, 1), 0.0, 1e-10);
    ASSERT_NEAR(val->matrix()(1, 1), 1.0, 1e-10);
}

TEST(interp_det_inv) {
    auto interp = createTestInterp();
    interp.executeString("A = [1 2; 3 4]; d = det(A);");
    auto val = interp.globalEnv()->get("d");
    ASSERT_NEAR(val->scalarDouble(), -2.0, 1e-10);

    interp.executeString("B = inv(A);");
    val = interp.globalEnv()->get("B");
    ASSERT_NEAR(val->matrix()(0, 0), -2.0, 1e-10);
    ASSERT_NEAR(val->matrix()(0, 1), 1.0, 1e-10);
    ASSERT_NEAR(val->matrix()(1, 0), 1.5, 1e-10);
    ASSERT_NEAR(val->matrix()(1, 1), -0.5, 1e-10);
}

TEST(interp_string_ops) {
    auto interp = createTestInterp();
    interp.executeString("s = 'Hello';");
    auto val = interp.globalEnv()->get("s");
    ASSERT_TRUE(val->isString());
    ASSERT_EQ(val->string(), "Hello");

    interp.executeString("t = strcat('Hello', ' ', 'World');");
    val = interp.globalEnv()->get("t");
    ASSERT_EQ(val->string(), "Hello World");
}

TEST(interp_struct) {
    auto interp = createTestInterp();
    interp.executeString("s.x = 10; s.y = 20;");
    auto val = interp.globalEnv()->get("s");
    ASSERT_TRUE(val->isStruct());
    auto xval = val->structVal().fields.at("x");
    ASSERT_NEAR(xval->scalarDouble(), 10.0, 1e-10);
}

TEST(interp_size_length_numel) {
    auto interp = createTestInterp();
    interp.executeString("A = [1 2 3; 4 5 6]; s = size(A);");
    auto val = interp.globalEnv()->get("s");
    ASSERT_NEAR(val->matrix()(0, 0), 2.0, 1e-10);
    ASSERT_NEAR(val->matrix()(0, 1), 3.0, 1e-10);

    interp.executeString("n = numel(A);");
    val = interp.globalEnv()->get("n");
    ASSERT_NEAR(val->scalarDouble(), 6.0, 1e-10);

    interp.executeString("l = length(A);");
    val = interp.globalEnv()->get("l");
    ASSERT_NEAR(val->scalarDouble(), 3.0, 1e-10);
}

TEST(interp_statistics) {
    auto interp = createTestInterp();
    interp.executeString("x = [1 2 3 4 5]; m = mean(x);");
    auto val = interp.globalEnv()->get("m");
    ASSERT_NEAR(val->scalarDouble(), 3.0, 1e-10);

    interp.executeString("med = median(x);");
    val = interp.globalEnv()->get("med");
    ASSERT_NEAR(val->scalarDouble(), 3.0, 1e-10);
}

TEST(interp_try_catch) {
    auto interp = createTestInterp();
    interp.executeString("try\n  error('test error');\ncatch e\n  msg = e.message;\nend");
    auto val = interp.globalEnv()->get("msg");
    ASSERT_TRUE(val->isString());
    ASSERT_EQ(val->string(), "test error");
}

TEST(interp_nested_expressions) {
    auto interp = createTestInterp();
    interp.executeString("x = (2 + 3) * (4 - 1);");
    auto val = interp.globalEnv()->get("x");
    ASSERT_NEAR(val->scalarDouble(), 15.0, 1e-10);
}

TEST(interp_comparison_ops) {
    auto interp = createTestInterp();
    interp.executeString("a = 5 > 3;");
    auto val = interp.globalEnv()->get("a");
    ASSERT_NEAR(val->scalarDouble(), 1.0, 1e-10);

    interp.executeString("b = 2 == 3;");
    val = interp.globalEnv()->get("b");
    ASSERT_NEAR(val->scalarDouble(), 0.0, 1e-10);
}

TEST(interp_linspace) {
    auto interp = createTestInterp();
    interp.executeString("x = linspace(0, 1, 5);");
    auto val = interp.globalEnv()->get("x");
    ASSERT_EQ(val->matrix().cols(), 5u);
    ASSERT_NEAR(val->matrix()(0, 0), 0.0, 1e-10);
    ASSERT_NEAR(val->matrix()(0, 2), 0.5, 1e-10);
    ASSERT_NEAR(val->matrix()(0, 4), 1.0, 1e-10);
}

// ============================================================================
// Main
// ============================================================================

int main() {
    std::cout << "MatFree Test Suite" << std::endl;
    std::cout << "==================" << std::endl;
    std::cout << std::endl;
    std::cout << "Results: " << testsPassed << " passed, " << testsFailed
              << " failed, " << testsRun << " total" << std::endl;

    return testsFailed > 0 ? 1 : 0;
}
