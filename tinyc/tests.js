export const tests = [
  {
    description:
      'Use variables to store data and printf to print things. Currently printf is the only supported function.',
    input: `i = 125;
i = i - 13;
i = i * 2;
printf("the value is %d", i);`,
    expected: 'the value is 224',
  },
  // {
  //   description: 'if',
  //   input: `if (1) printf("a");`,
  //   expected: 'a',
  // },
  // {
  //   description: 'ifElse',
  //   input: `if (1 == 2) printf("a"); else printf("b");`,
  //   expected: 'b',
  // },
  // {
  //   description: 'while',
  //   input: `i = 0; while (i < 5) { printf("a"); i = i + 1;}`,
  //   expected: 'aaaaa',
  // },
  {
    description:
      'While-loops, if-statements, and else-statements are supported along with blocks inside them.',
    input: `i=125;
j=100;
while (i-j) {
  if (i<j) {
    j=j-i;
  } else {
    i=i-j;
  }
}
printf("i = %d, j = %d", i, j);`,
    expected: 'i = 25, j = 25',
  },
  {
    description: 'Do-loops are supported.',
    input: `i=1;
do i=i+10; while (i<50);
printf("i = %d", i);`,
    expected: 'i = 51',
  },
  {
    description: 'Comparisons and logical operators are supported.',
    input: `printf(
  "%d%d%d%d%d%d%d%d%d%d%d%d", 
  1 + 2 < 3, 
  1 + 1 < 3, 
  1 + 2 <= 3, 
  2 + 2 <= 3, 
  1 + 2 > 3, 
  2 + 2 > 3,
  1 + 2 >= 3, 
  1 + 1 >= 3, 
  1 + 2 == 3, 
  2 + 2 == 3, 
  1 + 2 != 3,
  2 + 2 != 3
);

printf(
  "%d%d%d%d%d%d%d%d%d%d",
  0 && 0, 
  0 && 1, 
  1 && 0,
  1 && 1,
  0 || 0,
  0 || 1,
  1 || 0,
  1 || 1,
  !1,
  !0
);`,
    expected: '0110011010010001011101',
  },
  {
    description: 'Arithmetic operations are supported.',
    input: `printf(
  "%d %d %d %d %d %d",
  2 * 3,
  21 / 7,
  25 % 7,
  1 + 3 * 4,
  13 % 2 - 6,
  (4 + 3) * 4
);`,
    expected: '6 3 4 13 -5 28',
  },
  {
    description: "For-loops are supported. Anyways, here's FizzBuzz.",
    input: `
for (i = 1; i <= 100; i = i + 1) {
  if (i % 15 == 0) printf("FizzBuzz ");
  else if (i % 5 == 0) printf("Buzz ");
  else if (i % 3 == 0) printf("Fizz ");
  else printf("%d ", i);
}`,
    expected:
      '1 2 Fizz 4 Buzz Fizz 7 8 Fizz Buzz 11 Fizz 13 14 FizzBuzz 16 17 Fizz 19 Buzz Fizz 22 23 Fizz Buzz 26 Fizz 28 29 FizzBuzz 31 32 Fizz 34 Buzz Fizz 37 38 Fizz Buzz 41 Fizz 43 44 FizzBuzz 46 47 Fizz 49 Buzz Fizz 52 53 Fizz Buzz 56 Fizz 58 59 FizzBuzz 61 62 Fizz 64 Buzz Fizz 67 68 Fizz Buzz 71 Fizz 73 74 FizzBuzz 76 77 Fizz 79 Buzz Fizz 82 83 Fizz Buzz 86 Fizz 88 89 FizzBuzz 91 92 Fizz 94 Buzz Fizz 97 98 Fizz Buzz ',
  },
  {
    description: 'This example prints out the prime numbers less than 100.',
    input: `for (i = 2; i < 100; i = i + 1) {
  p = 1;
  j = 2;
  while (p && j * j <= i) {
    if (i % j == 0) p = 0;
    j = j + 1;
  }
  if (p) printf("%d ", i);
}`,
    expected:
      '2 3 5 7 11 13 17 19 23 29 31 37 41 43 47 53 59 61 67 71 73 79 83 89 97 ',
  },
];
