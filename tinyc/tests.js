export const tests = [
  {
    input: `i=125;
j=100;
printf("i = %d, j = %d", i, j);`,
    expected: 'i = 125, j = 100',
  },
  {input: `printf("%d", 1+2-3+4-5+6);`, expected: '5'},
  {input: 'if (0) printf("j"); else printf("i");', expected: 'i'},
  {
    input: `a=b=c=2<3;
printf("a = %d, b = %d, c = %d", a, b, c);`,
    expected: 'a = 1, b = 1, c = 1',
  },
  {
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
    input: `i=1;
do i=i+10; while (i<50);
printf("i = %d", i);`,
    expected: 'i = 51',
  },
  {
    input: `i=7;
if (i < 5) x=1;
if (i < 10) y=2;
printf("i = %d, x = %d, y = %d", i, x, y);`,
    expected: 'i = 7, x = 0, y = 2',
  },
  {
    input: `i=1000;
t=0;
while (i) {
  t = t + i;
  i = i - 1;
}
printf("t = %d", t);`,
    expected: 't = 500500',
  },
  {
    input: `printf(
  "%d%d%d%d%d%d%d%d%d%d%d%d%d%d%d%d%d%d%d%d%d%d", 
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
  2 + 2 != 3,
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
    input: `
printf(
  "%d %d %d %d %d",
  2 * 3,
  21 / 7,
  25 % 7,
  1 + 3 * 4,
  6 - 13 % 2
);`,
    expected: '6 3 4 13 5',
  },
  {
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
