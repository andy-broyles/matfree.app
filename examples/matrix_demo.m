% matrix_demo.m - Matrix operations demonstration
% Demonstrates matrix creation, arithmetic, and linear algebra

disp('=== MatFree Matrix Operations Demo ===');
disp('');

% Create matrices
A = [1 2 3; 4 5 6; 7 8 10];
disp('Matrix A:');
disp(A);

% Transpose
disp('Transpose of A:');
disp(A');

% Matrix multiplication
B = [1 0 0; 0 2 0; 0 0 3];
C = A * B;
disp('A * diag([1,2,3]):');
disp(C);

% Element-wise operations
D = A .^ 2;
disp('A .^ 2 (element-wise square):');
disp(D);

% Determinant
d = det(A);
fprintf('det(A) = %.4f\n', d);

% Inverse
Ainv = inv(A);
disp('inv(A):');
disp(Ainv);

% Verify A * inv(A) = I
I_check = A * Ainv;
disp('A * inv(A) (should be identity):');
disp(I_check);

% Trace
fprintf('trace(A) = %.4f\n', trace(A));

% Norms
fprintf('norm(A(:), 2) = %.4f\n', norm(A(:)));
fprintf('norm(A(:), 1) = %.4f\n', norm(A(:), 1));

% Identity and zeros
disp('eye(3):');
disp(eye(3));

disp('zeros(2, 4):');
disp(zeros(2, 4));

% Linspace
x = linspace(0, 1, 5);
disp('linspace(0, 1, 5):');
disp(x);

% Statistics
data = [4 8 15 16 23 42];
fprintf('Data: '); disp(data);
fprintf('Mean:   %.2f\n', mean(data));
fprintf('Std:    %.2f\n', std(data));
fprintf('Median: %.2f\n', median(data));
fprintf('Min:    %.2f\n', min(data));
fprintf('Max:    %.2f\n', max(data));
fprintf('Sum:    %.2f\n', sum(data));

disp('');
disp('=== Demo Complete ===');
