% functions_demo.m - Functions and control flow
% Demonstrates user functions, anonymous functions, control flow

disp('=== Functions and Control Flow Demo ===');
disp('');

% User-defined function
function result = factorial(n)
    if n <= 1
        result = 1;
    else
        result = n * factorial(n - 1);
    end
end

% Test factorial
for i = 1:10
    fprintf('%d! = %d\n', i, factorial(i));
end

disp('');

% Anonymous functions
square = @(x) x^2;
cube = @(x) x^3;

fprintf('square(7) = %d\n', square(7));
fprintf('cube(4) = %d\n', cube(4));

% While loop example: Newton's method for sqrt(2)
x = 2.0;
for iter = 1:20
    x = (x + 2/x) / 2;
end
fprintf('sqrt(2) by Newton method: %.15f\n', x);
fprintf('sqrt(2) by built-in:     %.15f\n', sqrt(2));

% Switch statement
grade = 85;
switch true
    case grade >= 90
        disp('Grade: A');
    case grade >= 80
        disp('Grade: B');
    case grade >= 70
        disp('Grade: C');
    otherwise
        disp('Grade: F');
end

% Try-catch
try
    x = 1 / 0;
    fprintf('1/0 = %f (Inf)\n', x);
catch e
    fprintf('Caught error: %s\n', e.message);
end

disp('');
disp('=== Demo Complete ===');
