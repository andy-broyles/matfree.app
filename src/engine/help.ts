// MatFree Engine - Built-in Documentation System

export interface HelpEntry {
  name: string
  syntax: string
  description: string
  category: string
  examples?: string[]
}

const docs: Map<string, HelpEntry> = new Map()

function doc(name: string, syntax: string, description: string, category: string, examples?: string[]) {
  docs.set(name, { name, syntax, description, category, examples })
}

// Math
doc('sin', 'sin(x)', 'Sine of x (radians)', 'Math', ['sin(pi/2)  % = 1'])
doc('cos', 'cos(x)', 'Cosine of x (radians)', 'Math', ['cos(0)  % = 1'])
doc('tan', 'tan(x)', 'Tangent of x (radians)', 'Math')
doc('asin', 'asin(x)', 'Inverse sine (radians)', 'Math')
doc('acos', 'acos(x)', 'Inverse cosine (radians)', 'Math')
doc('atan', 'atan(x)', 'Inverse tangent (radians)', 'Math')
doc('atan2', 'atan2(y, x)', 'Four-quadrant inverse tangent', 'Math')
doc('sinh', 'sinh(x)', 'Hyperbolic sine', 'Math')
doc('cosh', 'cosh(x)', 'Hyperbolic cosine', 'Math')
doc('tanh', 'tanh(x)', 'Hyperbolic tangent', 'Math')
doc('exp', 'exp(x)', 'Exponential e^x', 'Math', ['exp(1)  % = 2.7183'])
doc('log', 'log(x)', 'Natural logarithm', 'Math')
doc('log2', 'log2(x)', 'Base-2 logarithm', 'Math')
doc('log10', 'log10(x)', 'Base-10 logarithm', 'Math')
doc('sqrt', 'sqrt(x)', 'Square root', 'Math', ['sqrt(16)  % = 4'])
doc('abs', 'abs(x)', 'Absolute value', 'Math')
doc('ceil', 'ceil(x)', 'Round toward positive infinity', 'Math')
doc('floor', 'floor(x)', 'Round toward negative infinity', 'Math')
doc('round', 'round(x)', 'Round to nearest integer', 'Math')
doc('fix', 'fix(x)', 'Round toward zero', 'Math')
doc('mod', 'mod(a, b)', 'Modulus after division', 'Math')
doc('rem', 'rem(a, b)', 'Remainder after division', 'Math')
doc('sign', 'sign(x)', 'Signum function (-1, 0, or 1)', 'Math')
doc('max', 'max(x) or max(a, b)', 'Maximum value', 'Math', ['max([3 1 4])  % = 4'])
doc('min', 'min(x) or min(a, b)', 'Minimum value', 'Math')
doc('sum', 'sum(x)', 'Sum of array elements', 'Math', ['sum([1 2 3])  % = 6'])
doc('prod', 'prod(x)', 'Product of array elements', 'Math')
doc('cumsum', 'cumsum(x)', 'Cumulative sum', 'Math')
doc('cumprod', 'cumprod(x)', 'Cumulative product', 'Math')

// Matrix
doc('zeros', 'zeros(n) or zeros(r,c)', 'Create matrix of zeros', 'Matrix', ['zeros(3)  % 3x3 zeros'])
doc('ones', 'ones(n) or ones(r,c)', 'Create matrix of ones', 'Matrix')
doc('eye', 'eye(n)', 'Identity matrix', 'Matrix', ['eye(3)'])
doc('rand', 'rand(n) or rand(r,c)', 'Uniformly distributed random numbers', 'Matrix')
doc('randn', 'randn(n) or randn(r,c)', 'Normally distributed random numbers', 'Matrix')
doc('linspace', 'linspace(a, b, n)', 'Generate n linearly spaced points from a to b', 'Matrix', ['linspace(0, 1, 5)'])
doc('logspace', 'logspace(a, b, n)', 'Generate n logarithmically spaced points from 10^a to 10^b', 'Matrix')
doc('size', 'size(A)', 'Matrix dimensions [rows cols]', 'Matrix')
doc('length', 'length(A)', 'Length of largest dimension', 'Matrix')
doc('numel', 'numel(A)', 'Number of elements', 'Matrix')
doc('reshape', 'reshape(A, r, c)', 'Reshape matrix to r-by-c', 'Matrix')
doc('diag', 'diag(v) or diag(A)', 'Create diagonal matrix or extract diagonal', 'Matrix')
doc('repmat', 'repmat(A, r, c)', 'Replicate and tile matrix', 'Matrix')
doc('fliplr', 'fliplr(A)', 'Flip matrix left-right', 'Matrix')
doc('flipud', 'flipud(A)', 'Flip matrix up-down', 'Matrix')
doc('rot90', 'rot90(A, k)', 'Rotate matrix 90 degrees k times', 'Matrix')
doc('magic', 'magic(n)', 'Magic square of order n', 'Matrix', ['magic(3)'])
doc('kron', 'kron(A, B)', 'Kronecker tensor product', 'Matrix')
doc('triu', 'triu(A)', 'Upper triangular part', 'Matrix')
doc('tril', 'tril(A)', 'Lower triangular part', 'Matrix')
doc('meshgrid', 'meshgrid(x, y)', 'Generate 2D grid coordinates', 'Matrix')
doc('vander', 'vander(v, n)', 'Vandermonde matrix', 'Matrix')

// Linear Algebra
doc('det', 'det(A)', 'Matrix determinant', 'Linear Algebra', ['det([1 2; 3 4])  % = -2'])
doc('inv', 'inv(A)', 'Matrix inverse', 'Linear Algebra')
doc('trace', 'trace(A)', 'Sum of diagonal elements', 'Linear Algebra')
doc('norm', 'norm(A)', 'Matrix or vector norm', 'Linear Algebra')
doc('rank', 'rank(A)', 'Matrix rank', 'Linear Algebra')
doc('eig', 'eig(A)', 'Eigenvalues of square matrix', 'Linear Algebra', ['eig([2 1; 1 2])'])
doc('svd', 'svd(A)', 'Singular value decomposition', 'Linear Algebra')
doc('cond', 'cond(A)', 'Condition number', 'Linear Algebra')
doc('pinv', 'pinv(A)', 'Moore-Penrose pseudoinverse', 'Linear Algebra')
doc('lu', 'lu(A)', 'LU factorization: {L, U} = lu(A)', 'Linear Algebra')
doc('qr', 'qr(A)', 'QR factorization: {Q, R} = qr(A)', 'Linear Algebra')
doc('chol', 'chol(A)', 'Cholesky factorization', 'Linear Algebra')
doc('linsolve', 'linsolve(A, b)', 'Solve linear system Ax = b', 'Linear Algebra')
doc('dot', 'dot(a, b)', 'Dot product', 'Linear Algebra')
doc('cross', 'cross(a, b)', 'Cross product (3D vectors)', 'Linear Algebra')

// Statistics
doc('mean', 'mean(x)', 'Arithmetic mean', 'Statistics', ['mean([1 2 3 4])  % = 2.5'])
doc('median', 'median(x)', 'Median value', 'Statistics')
doc('std', 'std(x)', 'Standard deviation', 'Statistics')
doc('var', 'var(x)', 'Variance', 'Statistics')
doc('sort', 'sort(x)', 'Sort in ascending order', 'Statistics')
doc('normpdf', 'normpdf(x, mu, sigma)', 'Normal probability density function', 'Statistics')
doc('normcdf', 'normcdf(x, mu, sigma)', 'Normal cumulative distribution function', 'Statistics')
doc('norminv', 'norminv(p, mu, sigma)', 'Inverse normal CDF (quantile function)', 'Statistics')
doc('hist', 'hist(data, nbins)', 'Plot histogram', 'Statistics')

// Plotting
doc('plot', "plot(x, y) or plot(x, y, 'r--')", 'Plot line chart. Line specs: colors (r,g,b,k), styles (--,:,-.), markers (o,s,d,^,x,+)', 'Plotting', ["x = linspace(0, 2*pi, 100);\nplot(x, sin(x), 'b')\ntitle('Sine Wave')"])
doc('scatter', 'scatter(x, y, sz)', 'Create scatter plot', 'Plotting')
doc('bar', 'bar(x, y)', 'Create bar chart', 'Plotting')
doc('stem', 'stem(x, y)', 'Discrete sequence plot', 'Plotting')
doc('stairs', 'stairs(x, y)', 'Stairstep plot', 'Plotting')
doc('area', 'area(x, y)', 'Filled area plot', 'Plotting')
doc('semilogx', 'semilogx(x, y)', 'Semi-log plot (log x-axis)', 'Plotting')
doc('semilogy', 'semilogy(x, y)', 'Semi-log plot (log y-axis)', 'Plotting')
doc('loglog', 'loglog(x, y)', 'Log-log plot', 'Plotting')
doc('polar_plot', 'polar_plot(theta, r)', 'Polar coordinate plot', 'Plotting')
doc('pie_chart', 'pie_chart(data)', 'Pie chart', 'Plotting')
doc('imagesc', 'imagesc(A)', 'Display matrix as heatmap image', 'Plotting', ['A = magic(10);\nimagesc(A)\ntitle(\'Magic Square\')'])
doc('contour', "contour(X, Y, Z)", 'Contour plot of matrix data', 'Plotting')
doc('title', "title('text')", 'Set plot title', 'Plotting')
doc('xlabel', "xlabel('text')", 'Set x-axis label', 'Plotting')
doc('ylabel', "ylabel('text')", 'Set y-axis label', 'Plotting')
doc('legend', "legend('a', 'b')", 'Add legend to plot', 'Plotting')
doc('grid', "grid('on') or grid('off')", 'Toggle grid lines', 'Plotting')
doc('hold', "hold('on') or hold('off')", 'Hold current plot for overlaying', 'Plotting')
doc('figure', 'figure(n)', 'Create or switch to figure n', 'Plotting')
doc('clf', 'clf', 'Clear current figure', 'Plotting')
doc('xlim', 'xlim([lo hi])', 'Set x-axis limits', 'Plotting')
doc('ylim', 'ylim([lo hi])', 'Set y-axis limits', 'Plotting')

// Scientific
doc('fft', 'fft(x)', 'Fast Fourier Transform', 'Signal Processing', ['x = sin(linspace(0, 4*pi, 64));\nplot(abs_fft(x))'])
doc('ifft', 'ifft(X)', 'Inverse Fast Fourier Transform', 'Signal Processing')
doc('fftshift', 'fftshift(X)', 'Shift zero-frequency to center', 'Signal Processing')
doc('conv', 'conv(u, v)', 'Convolution of two vectors', 'Signal Processing')
doc('deconv', 'deconv(u, v)', 'Deconvolution', 'Signal Processing')
doc('filter', 'filter(b, a, x)', 'Apply digital filter', 'Signal Processing')
doc('polyval', 'polyval(p, x)', 'Evaluate polynomial p at points x', 'Polynomials', ['polyval([1 0 -1], 2)  % = 3 (x^2 - 1 at x=2)'])
doc('polyfit', 'polyfit(x, y, n)', 'Polynomial curve fitting (degree n)', 'Polynomials')
doc('roots', 'roots(p)', 'Polynomial roots', 'Polynomials', ['roots([1 0 -1])  % = [1, -1]'])
doc('poly', 'poly(r)', 'Polynomial from roots', 'Polynomials')
doc('polyder', 'polyder(p)', 'Polynomial derivative', 'Polynomials')
doc('polyint', 'polyint(p)', 'Polynomial integration', 'Polynomials')
doc('interp1', "interp1(x, y, xq, 'linear')", 'Linear interpolation', 'Interpolation')
doc('spline', 'spline(x, y, xq)', 'Cubic spline interpolation', 'Interpolation')
doc('diff', 'diff(x)', 'Differences between adjacent elements', 'Calculus')
doc('gradient', 'gradient(y, h)', 'Numerical gradient', 'Calculus')
doc('trapz', 'trapz(x, y)', 'Trapezoidal numerical integration', 'Calculus', ['trapz([0 1], [0 1])  % = 0.5'])
doc('cumtrapz', 'cumtrapz(x, y)', 'Cumulative trapezoidal integration', 'Calculus')
doc('integral', 'integral(@(x) f(x), a, b)', 'Adaptive numerical integration', 'Calculus', ['integral(@(x) x.^2, 0, 1)  % = 0.3333'])
doc('ode45', 'ode45(@(t,y) f, [t0 tf], y0)', 'Solve ODE using Runge-Kutta 4th order', 'Differential Equations', ["% Solve y' = -y\nresult = ode45(@(t,y) -y, [0 5], [1]);\nt = result{1}; y = result{2};\nplot(t, y)"])
doc('fminsearch', 'fminsearch(@(x) f(x), x0)', 'Find minimum using Nelder-Mead simplex', 'Optimization')
doc('fzero', 'fzero(@(x) f(x), x0)', 'Find root of scalar function', 'Optimization')
doc('gamma', 'gamma(x)', 'Gamma function', 'Special Functions')
doc('beta', 'beta(a, b)', 'Beta function', 'Special Functions')
doc('erf', 'erf(x)', 'Error function', 'Special Functions')
doc('erfc', 'erfc(x)', 'Complementary error function', 'Special Functions')
doc('besselj', 'besselj(nu, x)', 'Bessel function of the first kind', 'Special Functions')

// I/O
doc('disp', 'disp(x)', 'Display value', 'I/O')
doc('fprintf', "fprintf(fmt, ...)", 'Formatted output (like C printf)', 'I/O', ["fprintf('x = %d\\n', 42)"])
doc('sprintf', "sprintf(fmt, ...)", 'Formatted string (returns string)', 'I/O')

// Utility
doc('tic', 'tic', 'Start stopwatch timer', 'Utility')
doc('toc', 'toc', 'Read elapsed time from tic', 'Utility')
doc('whos', 'whos', 'List workspace variables', 'Utility')
doc('clear', 'clear', 'Clear workspace', 'Utility')
doc('exist', "exist('name')", 'Check if variable/function exists', 'Utility')

export function getHelp(name: string): HelpEntry | undefined { return docs.get(name) }
export function getAllHelp(): HelpEntry[] { return [...docs.values()] }
export function searchHelp(query: string): HelpEntry[] {
  const q = query.toLowerCase()
  return [...docs.values()].filter(d =>
    d.name.toLowerCase().includes(q) ||
    d.description.toLowerCase().includes(q) ||
    d.category.toLowerCase().includes(q)
  )
}
export function getCategories(): string[] {
  return [...new Set([...docs.values()].map(d => d.category))]
}
