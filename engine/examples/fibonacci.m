% fibonacci.m - Compute Fibonacci sequence
% Demonstrates loops, arrays, and fprintf

n = 20;
fib = zeros(1, n);
fib(1) = 1;
fib(2) = 1;

for i = 3:n
    fib(i) = fib(i-1) + fib(i-2);
end

disp('Fibonacci sequence (first 20 terms):');
disp(fib);

% Sum using built-in
fprintf('Sum of first %d Fibonacci numbers: %d\n', n, sum(fib));

% Golden ratio approximation
ratio = fib(n) / fib(n-1);
fprintf('Golden ratio approximation: %.10f\n', ratio);
fprintf('Actual golden ratio:        %.10f\n', (1 + sqrt(5)) / 2);
