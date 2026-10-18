import { describe, it, expect } from 'vitest'
import { Interpreter } from '../interpreter'

function flat(s: string): string {
  return s.replace(/\s+/g, ' ').trim().replace(/(\.\d*?)0+(?=\D|$)/g, '$1').replace(/\.(?=\D|$)/g, '')
}

function run(code: string): string {
  const interp = new Interpreter()
  let out = ''
  interp.setOutput(t => { out += t })
  interp.execute(code)
  return flat(out)
}

const CASES: [string, string][] = [
  ["v = []; v = [v, 5]; v = [v, 6]; disp(v)", '5 6'],
  ["v = []; v = [v; 5]; v = [v; 6]; disp(size(v))", '2 1'],
  ["disp(['Value: ', num2str(5)])", 'Value: 5'],
  ["name = 'Bob'; s = ['Hi ', name, '!']; disp(s)", 'Hi Bob!'],
  ["A = [2 1; 1 3]; b = [3; 5]; x = A \\ b; fprintf('%.4f %.4f\\n', x(1), x(2))", '0.8000 1.4000'],
  ["A = [1 2; 3 4]; B = A^2; disp(B)", '7 10 15 22'],
  ["A = [4 2; 1 3]; B = [1 0; 0 2]; C = A / B; disp(C)", '4 1 1 1.5000'],
  ["s = 'hello'; disp(s(1))", 'h'],
  ["s = 'hello'; disp(s(end:-1:1))", 'olleh'],
  ["s = 'hello'; disp(s([1 5]))", 'ho'],
  ["s = 'hello'; s(1) = 'H'; disp(s)", 'Hello'],
  ["s = 'hello'; disp(sum(s == 'l'))", '2'],
  ["v = 1:10; disp(v(min(end, 3)))", '3'],
  ["v = 1:10; disp(v(floor(end/2)))", '5'],
  ["A = ones(2); A(:, end+1) = [7; 8]; disp(A)", '1 1 7 1 1 8'],
  ["c = {1, 2}; c{end+1} = 3; disp(numel(c))", '3'],
  ["c = {1, 'a', [1 2 3]}; x = c(2); disp(class(x))", 'cell'],
  ["c = {1, 'a'}; c(1) = []; disp(numel(c))", '1'],
  ["s = struct('a', 1); s.b = 2; disp(isfield(s, 'b'))", '1'],
  ["x = 3; if x > 2, disp('big'), end", 'big'],
  ["for i = 1:3, if i == 2, continue, end, disp(i), end", '1 3'],
  ["x = 0; while x < 3, x = x + 1; end, disp(x)", '3'],
  ["k = 0; do = 2; disp(do)", '2'],
  ["x = 5; switch x, case 5, disp('five'), otherwise, disp('other'), end", 'five'],
  ["switch 'abc', case {'x', 'abc'}, disp('in'), otherwise, disp('out'), end", 'in'],
  ["try, error('boom'), catch err, disp(err.message), end", 'boom'],
  ["try\n  error('my:id', 'Value %d', 3)\ncatch err\n  disp(err.message)\nend", 'Value 3'],
  ["fprintf('%5.2f|\\n', pi)", '3.14|'],
  ["fprintf('%s\\n', 'abc')", 'abc'],
  ["fprintf('%c', 'hi'); fprintf('\\n')", 'hi'],
  ["fprintf('%d %s\\n', 5, 'x')", '5 x'],
  ["fprintf('%g\\n', 0.1)", '0.1'],
  ["fprintf('%e\\n', 12345)", '1.234500e+04'],
  ["fprintf('%x\\n', 255)", 'ff'],
  ["fprintf('%%\\n')", '%'],
  ["fprintf('no newline'); fprintf('\\n')", 'no newline'],
  ["x = sprintf('%.2f', [1.234 5.678]); disp(x)", '1.235.68'],
  ["disp(num2str(pi, 8))", '3.1415927'],
  ["disp(num2str(3.14159))", '3.1416'],
  ["disp(num2str(42))", '42'],
  ["disp(int2str(2.7))", '3'],
  ["x = str2double('3.5'); disp(x * 2)", '7'],
  ["x = str2num('[1 2 3]'); disp(sum(x))", '6'],
  ["parts = strsplit('a,b,c', ','); disp(numel(parts))", '3'],
  ["disp(strjoin({'a', 'b'}, '-'))", 'a-b'],
  ["disp(upper('abc'))", 'ABC'],
  ["disp(strrep('hello', 'l', 'L'))", 'heLLo'],
  ["disp(length('hello'))", '5'],
  ["disp(strcmp('a', 'a'))", '1'],
  ["x = 'abc'; disp(x')", 'a b c'],
  ["A = zeros(2, 3); disp(size(A, 2))", '3'],
  ["A = rand(3); disp(all(A(:) >= 0 & A(:) < 1))", '1'],
  ["m = true(1, 3); m(2) = false; v = [4 5 6]; disp(v(m))", '4 6'],
  ["v = [3 NaN 5]; v(isnan(v)) = 0; disp(v)", '3 0 5'],
  ["v = [3 NaN 5]; disp(v(~isnan(v)))", '3 5'],
  ["disp(class(1 > 0))", 'logical'],
  ["disp(islogical([1 0]))", '0'],
  ["x = 1:5; y = x(x > 2 & x < 5); disp(y)", '3 4'],
  ["A = magic(4); disp(A(A(:, 1) > 5, 2)')", '2 7'],
  ["A = magic(3); A(A > 5) = 0; disp(A)", '0 1 0 3 5 0 4 0 2'],
  ["x = 10; x(2) = 20; disp(x)", '10 20'],
  ["clear; z = 1; disp(exist('z'))", '1'],
  ["x = 2; clear('x'); disp(exist('x'))", '0'],
  ["a.b(3) = 7; disp(a.b)", '0 0 7'],
  ["s = struct(); s.list{2} = 'b'; disp(numel(s.list))", '2'],
  ["c = cell(1, 2); c{2}(3) = 4; disp(c{2})", '0 0 4'],
  ["q = {}; q(end+1) = {'x'}; disp(numel(q))", '1'],
  ["x = 1:3; x(:) = 7; disp(x)", '7 7 7'],
  ["A = reshape(1:6, [2 3]); disp(A(2, :))", '2 4 6'],
  ["A = reshape(1:6, [], 2); disp(size(A))", '3 2'],
  ["v = (1:3)'; v(end+1) = 4; disp(size(v))", '4 1'],
  ["A = eye(2); A(3, 3) = 1; disp(size(A))", '3 3'],
  ["A = magic(3); disp(A([1 2], end))", '6 7'],
  ["A = 1:5; disp(A(logical([1 0 1 0 1])))", '1 3 5'],
]

describe('MATLAB linear algebra and language idioms', () => {
  for (const [code, expected] of CASES) {
    it(code.replace(/\s+/g, ' '), () => {
      expect(run(code)).toBe(flat(expected))
    })
  }

  it('rejects multi-row character arrays', () => {
    expect(() => run("x = ['ab'; 'cd']")).toThrow(/more than one row/)
  })
})
