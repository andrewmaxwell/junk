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
  {
    description:
      'While loops, if, and else statements are supported along with blocks inside them.',
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
    description: 'Do loops are supported.',
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
    description: 'This example prints out the prime numbers less than 100.',
    input: `i = 2;
while (i < 100) {
  isPrime = 1;
  j = 2;
  while (isPrime && j * j <= i) {
    if (i % j == 0) isPrime = 0;
    j = j + 1;
  }
  if (isPrime) printf("%d ", i);
  i = i + 1;
}`,
    expected:
      '2 3 5 7 11 13 17 19 23 29 31 37 41 43 47 53 59 61 67 71 73 79 83 89 97 ',
  },
];
