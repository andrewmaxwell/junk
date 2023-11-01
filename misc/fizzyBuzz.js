const f = 'Fizz';
const b = 'Buzz';
const arr = [f + b, 0, 0, f, 0, b, f, 0, 0, f, b, 0, f, 0, 0];
for (let i = 1; i <= 100; i++) console.log(arr[i % 15] || i);
