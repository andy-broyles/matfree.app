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

// Expected text is MATLAB output with whitespace collapsed. Trailing decimal zeros are ignored.
const CASES: [string, string][] = [
  ["v = [5 6 7]; disp(v(v > 5))", '6 7'],
  ["v = [5 6 7]; v(v > 5) = 0; disp(v)", '5 0 0'],
  ["A = [1 2; 3 4]; disp(A(2))", '3'],
  ["A = [1 2; 3 4]; A(2) = 9; disp(A)", '1 2 9 4'],
  ["A = [1 2; 3 4]; disp(A(:)')", '1 3 2 4'],
  ["B = reshape(1:6, 2, 3); disp(B)", '1 3 5 2 4 6'],
  ["A = [1 2; 3 4]; disp(find(A > 1)')", '2 3 4'],
  ["v = []; for k = 1:3, v(k) = k^2; end; disp(v)", '1 4 9'],
  ["v = [1 2]; v(end+1) = 7; disp(v)", '1 2 7'],
  ["v = zeros(1, 2); v(5) = 1; disp(v)", '0 0 0 0 1'],
  ["A = zeros(2); A(:, 1) = [1; 2]; disp(A)", '1 0 2 0'],
  ["A = magic(3); A(2, :) = []; disp(size(A))", '2 3'],
  ["v = 1:5; v([1 3]) = []; disp(v)", '2 4 5'],
  ["A = magic(3); disp(A(2:3, [1 3]))", '3 7 4 2'],
  ["A = [1 2; 3 4]; disp(A(A > 1)')", '3 2 4'],
  ["v = (1:4)'; w = v([1 2]); disp(size(w))", '2 1'],
  ["s.vals = [10 20 30]; disp(s.vals(2))", '20'],
  ["s.vals = [10 20 30]; s.vals(2) = 5; disp(s.vals)", '10 5 30'],
  ["s.a.b = 3; disp(s.a.b)", '3'],
  ["c = {}; c{3} = 'x'; disp(size(c))", '1 3'],
  ["v = [1 2 3]; try, v(5), catch e, disp('err'), end", 'err'],
  ["fprintf('%d ', [1 2 3]); fprintf('\\n')", '1 2 3'],
  ["fprintf('%d-%d\\n', [1 2; 3 4])", '1-3 2-4'],
  ["x = sprintf('%d,', 1:4); disp(x)", '1,2,3,4,'],
  ["fprintf('%s is %d\\n', 'age', 30)", 'age is 30'],
  ["A = [1 2; 3 4]; disp(sum(A(:)))", '10'],
  ["A = [3 1; 2 4]; [m, i] = max(A(:)); disp([m i])", '4 4'],
  ["A = [3 1; 2 5]; [m, i] = min(A(:)); disp([m i])", '1 3'],
  ["A = [1 2; 3 4]; disp(numel(A))", '4'],
  ["A = [1 2; 3 4]; [r, c] = find(A == 3); disp([r c])", '2 1'],
  ["A = [1 2; 3 4]; disp(A(end, end))", '4'],
  ["A = [1 2; 3 4]; disp(A(end))", '4'],
  ["A = [1 2 3; 4 5 6]; disp(A(:, end)')", '3 6'],
  ["x = 1:10; disp(x(end-2:end))", '8 9 10'],
  ["A = eye(3); A(2, 2) = 5; disp(trace(A))", '7'],
  ["v = 1:5; v(v == 3) = []; disp(v)", '1 2 4 5'],
  ["names = {'a', 'bb'}; disp(numel(names{2}))", '2'],
  ["A = [1 2; 3 4]; B = A'; disp(B(1, 2))", '3'],
  ["A = [1 2; 3 4]; disp(any(A(:) > 3))", '1'],
  ["A = [1 2; 3 4]; disp(cumsum(A(:))')", '1 4 6 10'],
  ["A = [1 2; 3 4]; disp(sort(A(:), 'descend')')", '4 3 2 1'],
  ["x = linspace(0, 1, 3); disp(x(2))", '0.5000'],
  ["A = 1:6; B = reshape(A, 3, 2); disp(B(:, 2)')", '4 5 6'],
  ["A = [1 2; 3 4]; disp(A(logical([1 0; 0 1]))')", '1 4'],
  ["A = magic(4); disp(A(2, 3))", '10'],
  ["[r, c] = size(zeros(2, 5)); disp([r c])", '2 5'],
  ["A = [1 2; 3 4]; idx = sub2ind(size(A), 2, 1); disp(idx)", '2'],
  ["[r, c] = ind2sub([2 2], 3); disp([r c])", '1 2'],
  ["A = [1 2; 3 4]; disp(mat2str(A))", '[1 2;3 4]'],
  ["x = num2str([1 2 3]); disp(x)", '1 2 3'],
]

describe('MATLAB indexing idioms', () => {
  for (const [code, expected] of CASES) {
    it(code.replace(/\s+/g, ' '), () => {
      expect(run(code)).toBe(flat(expected))
    })
  }
})
