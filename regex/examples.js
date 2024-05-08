export const examples = [
  {
    pattern: 'a',
    ast: {type: 'literal', value: 'a'},
    nfa: [{match: 'a', from: 0, to: 'end'}],
    matches: ['a'],
    nonMatches: ['aa', '', 'b'],
  },
  {
    pattern: 'abc',
    ast: {
      type: 'sequence',
      value: [
        {type: 'literal', value: 'a'},
        {type: 'literal', value: 'b'},
        {type: 'literal', value: 'c'},
      ],
    },
    nfa: [
      {match: 'a', from: 0, to: 1},
      {match: 'b', from: 1, to: 2},
      {match: 'c', from: 2, to: 'end'},
    ],
    matches: ['abc'],
    nonMatches: ['', 'a', 'b', 'ba', 'aa', 'bb', 'ab', 'bc', 'ac'],
  },
  {
    pattern: 'a|b',
    ast: {
      type: '|',
      value: [
        {type: 'literal', value: 'a'},
        {type: 'literal', value: 'b'},
      ],
    },
    nfa: [
      {match: 'a', from: 0, to: 'end'},
      {match: 'b', from: 0, to: 'end'},
    ],
    matches: ['a', 'b'],
    nonMatches: ['', 'ab', 'c', 'aa', 'bb'],
  },

  {
    pattern: 'ab|c',
    ast: {
      type: '|',
      value: [
        {
          type: 'sequence',
          value: [
            {type: 'literal', value: 'a'},
            {type: 'literal', value: 'b'},
          ],
        },
        {type: 'literal', value: 'c'},
      ],
    },
    nfa: [
      {match: 'a', from: 0, to: 1},
      {match: 'b', from: 1, to: 'end'},
      {match: 'c', from: 0, to: 'end'},
    ],
    matches: ['ab', 'c'],
    nonMatches: ['', 'a', 'b', 'aa', 'x', 'cc', 'bb'],
  },

  {
    pattern: 'a(b|c)',
    ast: {
      type: 'sequence',
      value: [
        {type: 'literal', value: 'a'},
        {
          type: '|',
          value: [
            {type: 'literal', value: 'b'},
            {type: 'literal', value: 'c'},
          ],
        },
      ],
    },
    nfa: [
      {match: 'a', from: 0, to: 1},
      {match: 'b', from: 1, to: 'end'},
      {match: 'c', from: 1, to: 'end'},
    ],
    matches: ['ab', 'ac'],
    nonMatches: ['', 'a', 'b', 'c', 'aa', 'abc'],
  },

  {
    pattern: 'a+',
    ast: {type: '+', value: {type: 'literal', value: 'a'}},
    nfa: [
      {from: 0, match: 'a', to: 1},
      {from: 1, match: 'a', to: 1},
      {from: 1, match: '', to: 'end'},
    ],
    matches: ['a', 'aa', 'aaa'],
    nonMatches: ['', 'b', 'ab', 'baa'],
  },

  {
    pattern: '(ab)+',
    ast: {
      type: '+',
      value: {
        type: 'sequence',
        value: [
          {type: 'literal', value: 'a'},
          {type: 'literal', value: 'b'},
        ],
      },
    },
    nfa: [
      {from: 0, match: 'a', to: 2},
      {from: 2, match: 'b', to: 1},
      {from: 1, match: 'a', to: 3},
      {from: 3, match: 'b', to: 1},
      {from: 1, match: '', to: 'end'},
    ],
    matches: ['ab', 'abab', 'ababababababababababab'],
    nonMatches: ['', 'aba', 'abb', 'a', 'b', 'bab', 'abababababababa'],
  },

  {
    pattern: '(ab|c)+',
    ast: {
      type: '+',
      value: {
        type: '|',
        value: [
          {
            type: 'sequence',
            value: [
              {type: 'literal', value: 'a'},
              {type: 'literal', value: 'b'},
            ],
          },
          {type: 'literal', value: 'c'},
        ],
      },
    },
    nfa: [
      {from: 0, match: 'a', to: 2},
      {from: 2, match: 'b', to: 1},
      {from: 0, match: 'c', to: 1},
      {from: 1, match: 'a', to: 3},
      {from: 3, match: 'b', to: 1},
      {from: 1, match: 'c', to: 1},
      {from: 1, match: '', to: 'end'},
    ],
    matches: ['ab', 'c', 'abc', 'cab', 'abccc', 'abababcabcababcab', 'ccc'],
    nonMatches: ['', 'aba', 'abca', 'ca', 'ac'],
  },

  {
    pattern: 'a+b+',
    ast: {
      type: 'sequence',
      value: [
        {type: '+', value: {type: 'literal', value: 'a'}},
        {type: '+', value: {type: 'literal', value: 'b'}},
      ],
    },
    nfa: [
      {from: 0, match: 'a', to: 2},
      {from: 2, match: 'a', to: 2},
      {from: 2, match: '', to: 1},
      {from: 1, match: 'b', to: 3},
      {from: 3, match: 'b', to: 3},
      {from: 3, match: '', to: 'end'},
    ],
    matches: ['ab', 'aaaab', 'abbbb', 'aaabbbbb'],
    nonMatches: ['', 'a', 'b', 'aaa', 'bbbb', 'c'],
  },

  {
    pattern: 'a*',
    ast: {type: '*', value: {type: 'literal', value: 'a'}},
    nfa: [
      {from: 0, match: '', to: 1},
      {from: 1, match: 'a', to: 1},
      {from: 1, match: '', to: 'end'},
    ],
    matches: ['', 'a', 'aaaaa'],
    nonMatches: ['x', 'xa', 'aaax'],
  },

  {
    pattern: '(ab)*',
    ast: {
      type: '*',
      value: {
        type: 'sequence',
        value: [
          {type: 'literal', value: 'a'},
          {type: 'literal', value: 'b'},
        ],
      },
    },
    nfa: [
      {from: 0, match: '', to: 1},
      {from: 1, match: 'a', to: 2},
      {from: 2, match: 'b', to: 1},
      {from: 1, match: '', to: 'end'},
    ],
    matches: ['', 'ab', 'ababab'],
    nonMatches: ['aba', 'abababa', 'abababc'],
  },

  {
    pattern: '(a+b)*',
    ast: {
      type: '*',
      value: {
        type: 'sequence',
        value: [
          {type: '+', value: {type: 'literal', value: 'a'}},
          {type: 'literal', value: 'b'},
        ],
      },
    },
    nfa: [
      {from: 0, match: '', to: 1},
      {from: 1, match: 'a', to: 3},
      {from: 3, match: 'a', to: 3},
      {from: 3, match: '', to: 2},
      {from: 2, match: 'b', to: 1},
      {from: 1, match: '', to: 'end'},
    ],
    matches: ['', 'ab', 'aaab', 'ababaaaab'],
    nonMatches: ['a', 'b', 'bbb', 'aaa', 'x', 'ababababax'],
  },

  {
    pattern: '(ab|c)*',
    ast: {
      type: '*',
      value: {
        type: '|',
        value: [
          {
            type: 'sequence',
            value: [
              {type: 'literal', value: 'a'},
              {type: 'literal', value: 'b'},
            ],
          },
          {type: 'literal', value: 'c'},
        ],
      },
    },
    nfa: [
      {from: 0, match: '', to: 1},
      {from: 1, match: 'a', to: 2},
      {from: 2, match: 'b', to: 1},
      {from: 1, match: 'c', to: 1},
      {from: 1, match: '', to: 'end'},
    ],
    matches: ['', 'ab', 'c', 'abab', 'cab', 'cccabcababc'],
    nonMatches: ['a', 'b', 'aba', 'cccccca', 'cccccb'],
  },

  {
    pattern: 'a?',
    ast: {type: '?', value: {type: 'literal', value: 'a'}},
    nfa: [
      {match: 'a', from: 0, to: 'end'},
      {match: '', from: 0, to: 'end'},
    ],
    matches: ['', 'a'],
    nonMatches: ['aa', 'x'],
  },

  {
    pattern: 'ab*c',
    ast: {
      type: 'sequence',
      value: [
        {type: 'literal', value: 'a'},
        {type: '*', value: {type: 'literal', value: 'b'}},
        {type: 'literal', value: 'c'},
      ],
    },
    nfa: [
      {from: 0, match: 'a', to: 1},
      {from: 1, match: '', to: 3},
      {from: 3, match: 'b', to: 3},
      {from: 3, match: '', to: 2},
      {from: 2, match: 'c', to: 'end'},
    ],
    matches: ['ac', 'abc', 'abbc'],
    nonMatches: ['', 'a', 'b', 'c', 'bc', 'ab'],
  },

  {
    pattern: '(a|b)+',
    ast: {
      type: '+',
      value: {
        type: '|',
        value: [
          {type: 'literal', value: 'a'},
          {type: 'literal', value: 'b'},
        ],
      },
    },
    nfa: [
      {from: 0, match: 'a', to: 1},
      {from: 0, match: 'b', to: 1},
      {from: 1, match: 'a', to: 1},
      {from: 1, match: 'b', to: 1},
      {from: 1, match: '', to: 'end'},
    ],
    matches: ['a', 'b', 'aa', 'bb', 'ab', 'aabababbbaaababb'],
    nonMatches: ['', 'abc'],
  },

  {
    pattern: 'ab?c',
    ast: {
      type: 'sequence',
      value: [
        {type: 'literal', value: 'a'},
        {type: '?', value: {type: 'literal', value: 'b'}},
        {type: 'literal', value: 'c'},
      ],
    },
    nfa: [
      {match: 'a', from: 0, to: 1},
      {match: 'b', from: 1, to: 2},
      {match: '', from: 1, to: 2},
      {match: 'c', from: 2, to: 'end'},
    ],
    matches: ['ac', 'abc'],
    nonMatches: ['', 'abbc'],
  },

  {
    pattern: 'ab|bc',
    ast: {
      type: '|',
      value: [
        {
          type: 'sequence',
          value: [
            {type: 'literal', value: 'a'},
            {type: 'literal', value: 'b'},
          ],
        },
        {
          type: 'sequence',
          value: [
            {type: 'literal', value: 'b'},
            {type: 'literal', value: 'c'},
          ],
        },
      ],
    },
    nfa: [
      {match: 'a', from: 0, to: 1},
      {match: 'b', from: 1, to: 'end'},
      {match: 'b', from: 0, to: 2},
      {match: 'c', from: 2, to: 'end'},
    ],
    matches: ['ab', 'bc'],
    nonMatches: ['', 'abc', 'abbc', 'ac'],
  },

  {
    pattern: 'a(bc*)+d?',
    ast: {
      type: 'sequence',
      value: [
        {type: 'literal', value: 'a'},
        {
          type: '+',
          value: {
            type: 'sequence',
            value: [
              {type: 'literal', value: 'b'},
              {type: '*', value: {type: 'literal', value: 'c'}},
            ],
          },
        },
        {type: '?', value: {type: 'literal', value: 'd'}},
      ],
    },
    nfa: [
      {from: 0, match: 'a', to: 1},
      {from: 1, match: 'b', to: 4},
      {from: 4, match: '', to: 5},
      {from: 5, match: 'c', to: 5},
      {from: 5, match: '', to: 3},
      {from: 3, match: 'b', to: 6},
      {from: 6, match: '', to: 7},
      {from: 7, match: 'c', to: 7},
      {from: 7, match: '', to: 3},
      {from: 3, match: '', to: 2},
      {from: 2, match: 'd', to: 'end'},
      {from: 2, match: '', to: 'end'},
    ],
    matches: [
      'ab',
      'abd',
      'abbbb',
      'abbbbd',
      'abcd',
      'abcccc',
      'abcccccd',
      'abcbcbbbbd',
      'abccccbcbbbbd',
    ],
    nonMatches: ['ad', 'acd', 'a', '', 'xabcd', 'abcdx'],
  },
  {
    pattern: 'a*|b',
    ast: {
      type: '|',
      value: [
        {type: '*', value: {type: 'literal', value: 'a'}},
        {type: 'literal', value: 'b'},
      ],
    },
    nfa: [
      {from: 0, match: '', to: 1},
      {from: 1, match: 'a', to: 1},
      {from: 1, match: '', to: 'end'},
      {from: 0, match: 'b', to: 'end'},
    ],
    matches: ['', 'a', 'aaa', 'b'],
    nonMatches: ['ab', 'bb'],
  },
  {
    pattern: 'a|(bc)+',
    ast: {
      type: '|',
      value: [
        {type: 'literal', value: 'a'},
        {
          type: '+',
          value: {
            type: 'sequence',
            value: [
              {type: 'literal', value: 'b'},
              {type: 'literal', value: 'c'},
            ],
          },
        },
      ],
    },
    nfa: [
      {match: 'a', from: 0, to: 'end'},
      {match: 'b', from: 0, to: 2},
      {match: 'c', from: 2, to: 1},
      {match: 'b', from: 1, to: 3},
      {match: 'c', from: 3, to: 1},
      {match: '', from: 1, to: 'end'},
    ],
    matches: ['a', 'bc', 'bcbcbc'],
    nonMatches: ['', 'aa', 'c', 'bcb', 'abc', 'bca'],
  },
  {
    pattern: '(((a)))+',
    ast: {type: '+', value: {type: 'literal', value: 'a'}},
    nfa: [
      {from: 0, match: 'a', to: 1},
      {from: 1, match: 'a', to: 1},
      {from: 1, match: '', to: 'end'},
    ],
    matches: ['a', 'aaa'],
    nonMatches: ['', 'b'],
  },
  {
    pattern: 'a|(b|(c|d)e)f',
    ast: {
      type: '|',
      value: [
        {type: 'literal', value: 'a'},
        {
          type: 'sequence',
          value: [
            {
              type: '|',
              value: [
                {type: 'literal', value: 'b'},
                {
                  type: 'sequence',
                  value: [
                    {
                      type: '|',
                      value: [
                        {type: 'literal', value: 'c'},
                        {type: 'literal', value: 'd'},
                      ],
                    },
                    {type: 'literal', value: 'e'},
                  ],
                },
              ],
            },
            {type: 'literal', value: 'f'},
          ],
        },
      ],
    },
    nfa: [
      {from: 0, match: 'a', to: 'end'},
      {from: 0, match: 'b', to: 1},
      {from: 0, match: 'c', to: 2},
      {from: 0, match: 'd', to: 2},
      {from: 2, match: 'e', to: 1},
      {from: 1, match: 'f', to: 'end'},
    ],
    matches: ['a', 'bf', 'cef', 'def'],
    nonMatches: ['', 'af', 'bef', 'de', 'cf'],
  },
];
