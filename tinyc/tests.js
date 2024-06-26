export const tests = [
  {
    description: 'Use variables to store data and printf to print things.',
    input: `i = 125;
i = i - 13;
i = i * 2;
printf("the value is %d", i);`,
    expected: 'the value is 224',
    ast: [
      'block',
      ['expression', ['assignment', ['var', 'i'], ['number', 125]]],
      [
        'expression',
        ['assignment', ['var', 'i'], ['-', ['var', 'i'], ['number', 13]]],
      ],
      [
        'expression',
        ['assignment', ['var', 'i'], ['*', ['var', 'i'], ['number', 2]]],
      ],
      [
        'expression',
        [
          'functionCall',
          ['var', 'printf'],
          [
            'parenthetical',
            ['string', 'the value is %d'],
            ['argument', ['var', 'i']],
          ],
        ],
      ],
    ],
    asm: [
      'PUSH 125',
      'STORE 0',
      'POP',
      'FETCH 0',
      'PUSH 13',
      'SUB',
      'STORE 0',
      'POP',
      'FETCH 0',
      'PUSH 2',
      'MULT',
      'STORE 0',
      'POP',
      'FETCH 0',
      'PRINTC 116',
      'PRINTC 104',
      'PRINTC 101',
      'PRINTC 32',
      'PRINTC 118',
      'PRINTC 97',
      'PRINTC 108',
      'PRINTC 117',
      'PRINTC 101',
      'PRINTC 32',
      'PRINTC 105',
      'PRINTC 115',
      'PRINTC 32',
      'PRINTN',
      'POP',
    ],
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
    ast: [
      'block',
      ['expression', ['assignment', ['var', 'i'], ['number', 125]]],
      ['expression', ['assignment', ['var', 'j'], ['number', 100]]],
      [
        'whileLoop',
        ['parenthetical', ['-', ['var', 'i'], ['var', 'j']]],
        [
          'block',
          [
            'ifElse',
            ['parenthetical', ['<', ['var', 'i'], ['var', 'j']]],
            [
              'block',
              [
                'expression',
                ['assignment', ['var', 'j'], ['-', ['var', 'j'], ['var', 'i']]],
              ],
            ],
            [
              'block',
              [
                'expression',
                ['assignment', ['var', 'i'], ['-', ['var', 'i'], ['var', 'j']]],
              ],
            ],
          ],
        ],
      ],
      [
        'expression',
        [
          'functionCall',
          ['var', 'printf'],
          [
            'parenthetical',
            ['string', 'i = %d, j = %d'],
            ['argument', ['var', 'i']],
            ['argument', ['var', 'j']],
          ],
        ],
      ],
    ],
    asm: [
      'PUSH 125',
      'STORE 0',
      'POP',
      'PUSH 100',
      'STORE 1',
      'POP',
      'FETCH 0',
      'FETCH 1',
      'SUB',
      'JZ 16',
      'FETCH 0',
      'FETCH 1',
      'LT',
      'JZ 6',
      'FETCH 1',
      'FETCH 0',
      'SUB',
      'STORE 1',
      'POP',
      'JMP 5',
      'FETCH 0',
      'FETCH 1',
      'SUB',
      'STORE 0',
      'POP',
      'JMP -20',
      'FETCH 1',
      'FETCH 0',
      'PRINTC 105',
      'PRINTC 32',
      'PRINTC 61',
      'PRINTC 32',
      'PRINTN',
      'PRINTC 44',
      'PRINTC 32',
      'PRINTC 106',
      'PRINTC 32',
      'PRINTC 61',
      'PRINTC 32',
      'PRINTN',
      'POP',
    ],
  },
  {
    description: 'Do-loops are supported.',
    input: `i=1;
do i=i+10; while (i<50);
printf("i = %d", i);`,
    expected: 'i = 51',
    ast: [
      'block',
      ['expression', ['assignment', ['var', 'i'], ['number', 1]]],
      [
        'doWhile',
        [
          'expression',
          ['assignment', ['var', 'i'], ['+', ['var', 'i'], ['number', 10]]],
        ],
        ['parenthetical', ['<', ['var', 'i'], ['number', 50]]],
      ],
      ['semicolon'],
      [
        'expression',
        [
          'functionCall',
          ['var', 'printf'],
          ['parenthetical', ['string', 'i = %d'], ['argument', ['var', 'i']]],
        ],
      ],
    ],
    asm: [
      'PUSH 1',
      'STORE 0',
      'POP',
      'FETCH 0',
      'PUSH 10',
      'ADD',
      'STORE 0',
      'POP',
      'FETCH 0',
      'PUSH 50',
      'LT',
      'JNZ -9',
      'FETCH 0',
      'PRINTC 105',
      'PRINTC 32',
      'PRINTC 61',
      'PRINTC 32',
      'PRINTN',
      'POP',
    ],
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
    ast: [
      'block',
      [
        'expression',
        [
          'functionCall',
          ['var', 'printf'],
          [
            'parenthetical',
            ['string', '%d%d%d%d%d%d%d%d%d%d%d%d'],
            [
              'argument',
              ['<', ['+', ['number', 1], ['number', 2]], ['number', 3]],
            ],
            [
              'argument',
              ['<', ['+', ['number', 1], ['number', 1]], ['number', 3]],
            ],
            [
              'argument',
              ['<=', ['+', ['number', 1], ['number', 2]], ['number', 3]],
            ],
            [
              'argument',
              ['<=', ['+', ['number', 2], ['number', 2]], ['number', 3]],
            ],
            [
              'argument',
              ['>', ['+', ['number', 1], ['number', 2]], ['number', 3]],
            ],
            [
              'argument',
              ['>', ['+', ['number', 2], ['number', 2]], ['number', 3]],
            ],
            [
              'argument',
              ['>=', ['+', ['number', 1], ['number', 2]], ['number', 3]],
            ],
            [
              'argument',
              ['>=', ['+', ['number', 1], ['number', 1]], ['number', 3]],
            ],
            [
              'argument',
              ['==', ['+', ['number', 1], ['number', 2]], ['number', 3]],
            ],
            [
              'argument',
              ['==', ['+', ['number', 2], ['number', 2]], ['number', 3]],
            ],
            [
              'argument',
              ['!=', ['+', ['number', 1], ['number', 2]], ['number', 3]],
            ],
            [
              'argument',
              ['!=', ['+', ['number', 2], ['number', 2]], ['number', 3]],
            ],
          ],
        ],
      ],
      [
        'expression',
        [
          'functionCall',
          ['var', 'printf'],
          [
            'parenthetical',
            ['string', '%d%d%d%d%d%d%d%d%d%d'],
            ['argument', ['&&', ['number', 0], ['number', 0]]],
            ['argument', ['&&', ['number', 0], ['number', 1]]],
            ['argument', ['&&', ['number', 1], ['number', 0]]],
            ['argument', ['&&', ['number', 1], ['number', 1]]],
            ['argument', ['||', ['number', 0], ['number', 0]]],
            ['argument', ['||', ['number', 0], ['number', 1]]],
            ['argument', ['||', ['number', 1], ['number', 0]]],
            ['argument', ['||', ['number', 1], ['number', 1]]],
            ['argument', ['not', ['number', 1]]],
            ['argument', ['not', ['number', 0]]],
          ],
        ],
      ],
    ],
    asm: [
      'PUSH 2',
      'PUSH 2',
      'ADD',
      'PUSH 3',
      'NEQ',
      'PUSH 1',
      'PUSH 2',
      'ADD',
      'PUSH 3',
      'NEQ',
      'PUSH 2',
      'PUSH 2',
      'ADD',
      'PUSH 3',
      'EQ',
      'PUSH 1',
      'PUSH 2',
      'ADD',
      'PUSH 3',
      'EQ',
      'PUSH 1',
      'PUSH 1',
      'ADD',
      'PUSH 3',
      'GTE',
      'PUSH 1',
      'PUSH 2',
      'ADD',
      'PUSH 3',
      'GTE',
      'PUSH 2',
      'PUSH 2',
      'ADD',
      'PUSH 3',
      'GT',
      'PUSH 1',
      'PUSH 2',
      'ADD',
      'PUSH 3',
      'GT',
      'PUSH 2',
      'PUSH 2',
      'ADD',
      'PUSH 3',
      'LTE',
      'PUSH 1',
      'PUSH 2',
      'ADD',
      'PUSH 3',
      'LTE',
      'PUSH 1',
      'PUSH 1',
      'ADD',
      'PUSH 3',
      'LT',
      'PUSH 1',
      'PUSH 2',
      'ADD',
      'PUSH 3',
      'LT',
      'PRINTN',
      'PRINTN',
      'PRINTN',
      'PRINTN',
      'PRINTN',
      'PRINTN',
      'PRINTN',
      'PRINTN',
      'PRINTN',
      'PRINTN',
      'PRINTN',
      'PRINTN',
      'POP',
      'PUSH 0',
      'NOT',
      'PUSH 1',
      'NOT',
      'PUSH 1',
      'PUSH 1',
      'OR',
      'PUSH 1',
      'PUSH 0',
      'OR',
      'PUSH 0',
      'PUSH 1',
      'OR',
      'PUSH 0',
      'PUSH 0',
      'OR',
      'PUSH 1',
      'PUSH 1',
      'AND',
      'PUSH 1',
      'PUSH 0',
      'AND',
      'PUSH 0',
      'PUSH 1',
      'AND',
      'PUSH 0',
      'PUSH 0',
      'AND',
      'PRINTN',
      'PRINTN',
      'PRINTN',
      'PRINTN',
      'PRINTN',
      'PRINTN',
      'PRINTN',
      'PRINTN',
      'PRINTN',
      'PRINTN',
      'POP',
    ],
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
    ast: [
      'block',
      [
        'expression',
        [
          'functionCall',
          ['var', 'printf'],
          [
            'parenthetical',
            ['string', '%d %d %d %d %d %d'],
            ['argument', ['*', ['number', 2], ['number', 3]]],
            ['argument', ['/', ['number', 21], ['number', 7]]],
            ['argument', ['%', ['number', 25], ['number', 7]]],
            [
              'argument',
              ['+', ['number', 1], ['*', ['number', 3], ['number', 4]]],
            ],
            [
              'argument',
              ['-', ['%', ['number', 13], ['number', 2]], ['number', 6]],
            ],
            [
              'argument',
              [
                '*',
                ['parenthetical', ['+', ['number', 4], ['number', 3]]],
                ['number', 4],
              ],
            ],
          ],
        ],
      ],
    ],
    asm: [
      'PUSH 4',
      'PUSH 3',
      'ADD',
      'PUSH 4',
      'MULT',
      'PUSH 13',
      'PUSH 2',
      'MOD',
      'PUSH 6',
      'SUB',
      'PUSH 1',
      'PUSH 3',
      'PUSH 4',
      'MULT',
      'ADD',
      'PUSH 25',
      'PUSH 7',
      'MOD',
      'PUSH 21',
      'PUSH 7',
      'DIV',
      'PUSH 2',
      'PUSH 3',
      'MULT',
      'PRINTN',
      'PRINTC 32',
      'PRINTN',
      'PRINTC 32',
      'PRINTN',
      'PRINTC 32',
      'PRINTN',
      'PRINTC 32',
      'PRINTN',
      'PRINTC 32',
      'PRINTN',
      'POP',
    ],
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
    ast: [
      'block',
      [
        'forLoop',
        ['assignment', ['var', 'i'], ['number', 1]],
        ['<=', ['var', 'i'], ['number', 100]],
        ['assignment', ['var', 'i'], ['+', ['var', 'i'], ['number', 1]]],
        [
          'block',
          [
            'ifElse',
            [
              'parenthetical',
              ['==', ['%', ['var', 'i'], ['number', 15]], ['number', 0]],
            ],
            [
              'expression',
              [
                'functionCall',
                ['var', 'printf'],
                ['parenthetical', ['string', 'FizzBuzz ']],
              ],
            ],
            [
              'ifElse',
              [
                'parenthetical',
                ['==', ['%', ['var', 'i'], ['number', 5]], ['number', 0]],
              ],
              [
                'expression',
                [
                  'functionCall',
                  ['var', 'printf'],
                  ['parenthetical', ['string', 'Buzz ']],
                ],
              ],
              [
                'ifElse',
                [
                  'parenthetical',
                  ['==', ['%', ['var', 'i'], ['number', 3]], ['number', 0]],
                ],
                [
                  'expression',
                  [
                    'functionCall',
                    ['var', 'printf'],
                    ['parenthetical', ['string', 'Fizz ']],
                  ],
                ],
                [
                  'expression',
                  [
                    'functionCall',
                    ['var', 'printf'],
                    [
                      'parenthetical',
                      ['string', '%d '],
                      ['argument', ['var', 'i']],
                    ],
                  ],
                ],
              ],
            ],
          ],
        ],
      ],
    ],
    asm: [
      'PUSH 1',
      'STORE 0',
      'FETCH 0',
      'PUSH 100',
      'LTE',
      'JZ 54',
      'FETCH 0',
      'PUSH 15',
      'MOD',
      'PUSH 0',
      'EQ',
      'JZ 11',
      'PRINTC 70',
      'PRINTC 105',
      'PRINTC 122',
      'PRINTC 122',
      'PRINTC 66',
      'PRINTC 117',
      'PRINTC 122',
      'PRINTC 122',
      'PRINTC 32',
      'POP',
      'JMP 30',
      'FETCH 0',
      'PUSH 5',
      'MOD',
      'PUSH 0',
      'EQ',
      'JZ 7',
      'PRINTC 66',
      'PRINTC 117',
      'PRINTC 122',
      'PRINTC 122',
      'PRINTC 32',
      'POP',
      'JMP 17',
      'FETCH 0',
      'PUSH 3',
      'MOD',
      'PUSH 0',
      'EQ',
      'JZ 7',
      'PRINTC 70',
      'PRINTC 105',
      'PRINTC 122',
      'PRINTC 122',
      'PRINTC 32',
      'POP',
      'JMP 4',
      'FETCH 0',
      'PRINTN',
      'PRINTC 32',
      'POP',
      'FETCH 0',
      'PUSH 1',
      'ADD',
      'STORE 0',
      'JMP -57',
    ],
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
    ast: [
      'block',
      [
        'forLoop',
        ['assignment', ['var', 'i'], ['number', 2]],
        ['<', ['var', 'i'], ['number', 100]],
        ['assignment', ['var', 'i'], ['+', ['var', 'i'], ['number', 1]]],
        [
          'block',
          ['expression', ['assignment', ['var', 'p'], ['number', 1]]],
          ['expression', ['assignment', ['var', 'j'], ['number', 2]]],
          [
            'whileLoop',
            [
              'parenthetical',
              [
                '&&',
                ['var', 'p'],
                ['<=', ['*', ['var', 'j'], ['var', 'j']], ['var', 'i']],
              ],
            ],
            [
              'block',
              [
                'ifStmt',
                [
                  'parenthetical',
                  ['==', ['%', ['var', 'i'], ['var', 'j']], ['number', 0]],
                ],
                ['expression', ['assignment', ['var', 'p'], ['number', 0]]],
              ],
              [
                'expression',
                [
                  'assignment',
                  ['var', 'j'],
                  ['+', ['var', 'j'], ['number', 1]],
                ],
              ],
            ],
          ],
          [
            'ifStmt',
            ['parenthetical', ['var', 'p']],
            [
              'expression',
              [
                'functionCall',
                ['var', 'printf'],
                [
                  'parenthetical',
                  ['string', '%d '],
                  ['argument', ['var', 'i']],
                ],
              ],
            ],
          ],
        ],
      ],
    ],
    asm: [
      'PUSH 2',
      'STORE 0',
      'FETCH 0',
      'PUSH 100',
      'LT',
      'JZ 42',
      'PUSH 1',
      'STORE 1',
      'POP',
      'PUSH 2',
      'STORE 2',
      'POP',
      'FETCH 1',
      'FETCH 2',
      'FETCH 2',
      'MULT',
      'FETCH 0',
      'LTE',
      'AND',
      'JZ 15',
      'FETCH 0',
      'FETCH 2',
      'MOD',
      'PUSH 0',
      'EQ',
      'JZ 3',
      'PUSH 0',
      'STORE 1',
      'POP',
      'FETCH 2',
      'PUSH 1',
      'ADD',
      'STORE 2',
      'POP',
      'JMP -23',
      'FETCH 1',
      'JZ 4',
      'FETCH 0',
      'PRINTN',
      'PRINTC 32',
      'POP',
      'FETCH 0',
      'PUSH 1',
      'ADD',
      'STORE 0',
      'JMP -45',
    ],
  },
  {
    description: 'Functions with multiple arguments are supported.',
    input: `function add3(a, b, c) {
  return a + b + c;
}
printf("%d", add3(7, 11, 19));`,
    expected: '37',
    asm: [
      'JMP 12',
      'STORE 0',
      'POP',
      'STORE 1',
      'POP',
      'STORE 2',
      'POP',
      'FETCH 2',
      'FETCH 0',
      'ADD',
      'FETCH 1',
      'ADD',
      'RETURN',
      'PUSH 19',
      'PUSH 11',
      'PUSH 7',
      'CALL -16',
      'PRINTN',
      'POP',
    ],
    ast: [
      'block',
      [
        'functionDeclaration',
        'add3',
        [
          'parenthetical',
          ['var', 'a'],
          ['argument', ['var', 'b']],
          ['argument', ['var', 'c']],
        ],
        [
          'block',
          [
            'return',
            [
              'expression',
              ['+', ['+', ['var', 'a'], ['var', 'c']], ['var', 'b']],
            ],
          ],
        ],
      ],
      [
        'expression',
        [
          'functionCall',
          ['var', 'printf'],
          [
            'parenthetical',
            ['string', '%d'],
            [
              'argument',
              [
                'functionCall',
                ['var', 'add3'],
                [
                  'parenthetical',
                  ['number', 7],
                  ['argument', ['number', 11]],
                  ['argument', ['number', 19]],
                ],
              ],
            ],
          ],
        ],
      ],
    ],
  },
  {
    description: 'Recursive functions are supported.',
    input: `function sum(i) {
  if (i) return i + sum(i - 1);
  return 0;
}
printf("%d", sum(100));`,
    asm: [
      'JMP 13',
      'STORE 0',
      'POP',
      'FETCH 0',
      'JZ 7',
      'FETCH 0',
      'FETCH 0',
      'PUSH 1',
      'SUB',
      'CALL -9',
      'ADD',
      'RETURN',
      'PUSH 0',
      'RETURN',
      'PUSH 100',
      'CALL -15',
      'PRINTN',
      'POP',
    ],
    expected: '5050',
    ast: [
      'block',
      [
        'functionDeclaration',
        'sum',
        ['parenthetical', ['var', 'i']],
        [
          'block',
          [
            'ifStmt',
            ['parenthetical', ['var', 'i']],
            [
              'return',
              [
                'expression',
                [
                  '+',
                  ['var', 'i'],
                  [
                    'functionCall',
                    ['var', 'sum'],
                    ['parenthetical', ['-', ['var', 'i'], ['number', 1]]],
                  ],
                ],
              ],
            ],
          ],
          ['return', ['expression', ['number', 0]]],
        ],
      ],
      [
        'expression',
        [
          'functionCall',
          ['var', 'printf'],
          [
            'parenthetical',
            ['string', '%d'],
            [
              'argument',
              [
                'functionCall',
                ['var', 'sum'],
                ['parenthetical', ['number', 100]],
              ],
            ],
          ],
        ],
      ],
    ],
  },
];
