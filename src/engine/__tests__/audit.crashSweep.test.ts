/**
 * Crash Sweep
 *
 * Calls every registered builtin with a menu of plausible argument shapes.
 * A clean RuntimeError (bad args) is acceptable; a raw JS TypeError/RangeError
 * ("Cannot read properties of undefined", "Invalid array length", ...) is a bug.
 */

import { describe, it, expect } from 'vitest'
import { Interpreter } from '../interpreter'
import { allBuiltinNames } from '../builtins'
import { RuntimeError } from '../value'

// Functions whose semantics need non-generic arguments to exercise meaningfully;
// each gets a hand-written invocation instead of the generic menu.
const SPECIAL: Record<string, string> = {
  input: '', // interactive; skip
  pause: '', // sleeps; skip
  timeit: 'timeit(@() 1 + 1)',
  feval: "feval('sin', 1)",
  arrayfun: 'arrayfun(@(x) x + 1, [1 2])',
  cellfun: 'cellfun(@(x) x + 1, {1, 2})',
  fzero: 'fzero(@(x) x - 1, 0)',
  fminsearch: 'fminsearch(@(x) x^2, 1)',
  integral: 'integral(@(x) x, 0, 1)',
  ode45: 'ode45(@(t, y) -y, [0 1], 1)',
  filter: 'filter([1], [1], [1 2 3])',
  interp1: 'interp1([1 2 3], [1 2 3], 1.5)',
  spline: 'spline([1 2 3], [1 4 9], 1.5)',
  polyfit: 'polyfit([1 2 3], [1 2 3], 1)',
  deconv: 'deconv([1 2 1], [1 1])',
  besselj: 'besselj(0, 1)',
  atan2: 'atan2(1, 1)',
  nchoosek: 'nchoosek(5, 2)',
  gcd: 'gcd(4, 6)',
  lcm: 'lcm(4, 6)',
  beta: 'beta(2, 3)',
  kron: 'kron([1 2], [1 2])',
  linsolve: 'linsolve(eye(2), [1; 2])',
  chol: 'chol([4 2; 2 3])',
  meshgrid: 'meshgrid(1:3)',
  struct: "struct('a', 1)",
  isfield: "isfield(struct('a', 1), 'a')",
  rmfield: "rmfield(struct('a', 1, 'b', 2), 'a')",
  fieldnames: "fieldnames(struct('a', 1))",
  jsondecode: `jsondecode('{"a": 1}')`,
  strsplit: "strsplit('a,b', ',')",
  strcmp: "strcmp('a', 'b')",
  strcmpi: "strcmpi('a', 'b')",
  contains: "contains('abc', 'b')",
  startsWith: "startsWith('abc', 'a')",
  endsWith: "endsWith('abc', 'c')",
  replace: "replace('abc', 'b', 'x')",
  regexp: "regexp('abc', 'b')",
  regexpi: "regexpi('ABC', 'b')",
  regexprep: "regexprep('abc', 'b', 'x')",
  sprintf: "sprintf('%d', 1)",
  fprintf: "fprintf('%d\\n', 1)",
  error: '', // intentionally throws; skip
  warning: "warning('w')",
  help: "help('sin')",
  doc: "doc('sin')",
  sym: "sym('x')",
  symdiff: "symdiff('x^2', 'x')",
  symint: "symint('x', 'x')",
  symsolve: "symsolve('x - 1', 'x')",
  symeval: "symeval('x', 'x', 1)",
  symexpand: "symexpand('(x+1)^2')",
  symsimplify: "symsimplify('x + x')",
  symsubs: "symsubs('x', 'x', 'y')",
  symtaylor: "symtaylor('exp(x)', 'x', 0, 3)",
  symplot: "symplot('x^2', 'x', -1, 1)",
  to_python: "to_python('x = 1;')",
  to_julia: "to_julia('x = 1;')",
  readcsv: '', // needs file system; skip
  writecsv: '',
  writematrix: '',
  exist: "exist('sin')",
  isa: "isa(5, 'double')",
  legend: "plot(1:3, 1:3); legend('a')",
  title: "plot(1:3, 1:3); title('t')",
  xlabel: "plot(1:3, 1:3); xlabel('x')",
  ylabel: "plot(1:3, 1:3); ylabel('y')",
  xlim: 'plot(1:3, 1:3); xlim([0 5])',
  ylim: 'plot(1:3, 1:3); ylim([0 5])',
  hold: "hold('on')",
  grid: "grid('on')",
  subplot: 'subplot(2, 1, 1)',
  text: "plot(1:3, 1:3); text(1, 1, 'hi')",
  surf: '[X, Y] = meshgrid(1:3); surf(X, Y, X)',
  mesh: '[X, Y] = meshgrid(1:3); mesh(X, Y, X)',
  contour: '[X, Y] = meshgrid(1:3); contour(X, Y, X)',
  plot3: 'plot3(1:3, 1:3, 1:3)',
  imagesc: 'imagesc(magic(3))',
  sound: 'sound(sin(linspace(0, 1, 100)), 8192)',
  chirp: 'chirp(linspace(0, 1, 100), 0, 1, 10)',
  datestr: 'datestr(now)',
  num2str: 'num2str(1)',
  str2num: "str2num('1')",
  str2double: "str2double('1')",
  char: 'char(65)',
  double: "double('A')",
  logical: 'logical(1)',
  colon: 'colon(1, 5)',
  typecast_placeholder: '',
  clear: 'x = 1; clear',
  whos: 'x = 1; whos',
  figure: 'figure(1)',
  clf: 'clf',
  close: 'close',
  pwelch: 'pwelch(sin(linspace(0, 10, 128)))',
  xcorr: 'xcorr([1 2 3])',
  vander: 'vander([1 2])',
  null_space: 'null_space([1 1; 1 1])',
  pie_chart: 'pie_chart([30 70])',
  polar_plot: 'polar_plot(linspace(0, 2*pi, 50), ones(1, 50))',
}

// Generic argument menus tried in order until one doesn't RuntimeError.
const GENERIC_ARGS = ['([1 2 3])', '([1 2; 3 4])', '(5)', "('abc')", '(eye(2))', '([1 2 3], [1 2 3])', '(5, 3)', '()']

describe('Crash sweep: no raw JS errors from any builtin', () => {
  const names = [...new Set(allBuiltinNames())]
  it(`sweeps all ${names.length} registered functions`, () => {
    const rawCrashes: string[] = []
    for (const name of names) {
      const attempts = name in SPECIAL
        ? (SPECIAL[name] ? [SPECIAL[name]] : [])
        : GENERIC_ARGS.map(args => `${name}${args}`)
      for (const code of attempts) {
        const interp = new Interpreter()
        interp.setOutput(() => {})
        interp.setExecutionLimitMs(5000)
        try {
          interp.execute(code)
          break // ran clean — next function
        } catch (e) {
          if (e instanceof RuntimeError || (e as Error).name === 'ParseError' || (e as Error).name === 'LexerError') {
            continue // clean engine error for wrong arg shape — acceptable, try next menu item
          }
          rawCrashes.push(`${name}: \`${code}\` threw ${(e as Error).name}: ${(e as Error).message}`)
          break
        }
      }
    }
    expect(rawCrashes, `Raw JS crashes:\n${rawCrashes.join('\n')}`).toEqual([])
  })
})
