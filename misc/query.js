const groupBy = ([func, ...rest], arr) => {
  if (!func) return arr;
  const groups = {};
  arr.forEach(r => {
    const key = func(r);
    (groups[key] = groups[key] || []).push(r);
  });
  return Object.entries(groups).map(([key, rows]) => [
    isNaN(key) ? key : Number(key),
    groupBy(rest, rows)
  ]);
};

class Query {
  constructor() {
    this.data = [];
    this.filters = [];
    this.groupFuncs = [];
    this.groupFilters = [];
    this.selectFunc = a => a;
  }
  select(func) {
    if (this.selectUsed) throw new Error('Duplicate SELECT');
    this.selectUsed = true;

    if (func) this.selectFunc = func;
    return this;
  }
  from(arr1, arr2) {
    if (this.fromUsed) throw new Error('Duplicate FROM');
    this.fromUsed = true;

    if (arr2) {
      this.data = [];
      for (let i = 0; i < arr1.length; i++) {
        for (let j = 0; j < arr2.length; j++) {
          this.data.push([arr1[i], arr2[j]]);
        }
      }
    } else {
      this.data = arr1;
    }
    return this;
  }
  where(...funcs) {
    this.filters.push(el => funcs.some(f => f(el)));
    return this;
  }
  groupBy(...funcs) {
    if (this.groupByUsed) throw new Error('Duplicate GROUPBY');
    this.groupByUsed = true;

    this.groupFuncs.push(...funcs);
    return this;
  }
  having(...funcs) {
    this.groupFilters.push(el => funcs.some(f => f(el)));
    return this;
  }
  orderBy(func) {
    if (this.orderByUsed) throw new Error('Duplicate ORDERBY');
    this.orderByUsed = true;

    this.orderByFunc = func;
    return this;
  }
  execute() {
    let result = this.data.filter(d => this.filters.every(f => f(d)));
    result = groupBy(this.groupFuncs, result)
      .filter(g => this.groupFilters.every(f => f(g)))
      .map(this.selectFunc);
    if (this.orderByFunc) result.sort(this.orderByFunc);
    return result;
  }
}

var query = () => new Query();

// const join = arrs => {
//   if (arrs.length === 1) return arrs[0];
//   const [first, ...rest] = arrs;
//   const res = [];
//   const rec = join(rest);
//   for (let i = 0; i < first.length; i++) {
//     for (let j = 0; j < rec.length; i++) {
//       res.push(first[i], ...rec[j]);
//     }
//   }
//   return res;
// };
// console.log(
//   join([
//     [1, 2, 3],
//     [4, 5, 6]
//   ])
// );

//////////////////
(() => {
  var numbers = [1, 2, 3];
  var numbers2 = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  var persons = [
    {name: 'Peter', profession: 'teacher', age: 20, maritalStatus: 'married'},
    {name: 'Michael', profession: 'teacher', age: 50, maritalStatus: 'single'},
    {name: 'Peter', profession: 'teacher', age: 20, maritalStatus: 'married'},
    {name: 'Anna', profession: 'scientific', age: 20, maritalStatus: 'married'},
    {name: 'Rose', profession: 'scientific', age: 50, maritalStatus: 'married'},
    {name: 'Anna', profession: 'scientific', age: 20, maritalStatus: 'single'},
    {name: 'Anna', profession: 'politician', age: 50, maritalStatus: 'married'}
  ];
  function profession(person) {
    return person.profession;
  }
  function isTeacher(person) {
    return person.profession === 'teacher';
  }
  function isEven(number) {
    return number % 2 === 0;
  }
  function parity(number) {
    return isEven(number) ? 'even' : 'odd';
  }
  function isPrime(number) {
    if (number < 2) {
      return false;
    }
    var divisor = 2;
    for (; number % divisor !== 0; divisor++);
    return divisor === number;
  }
  function prime(number) {
    return isPrime(number) ? 'prime' : 'divisible';
  }
  function odd(group) {
    return group[0] === 'odd';
  }
  function descendentCompare(number1, number2) {
    return number2 - number1;
  }
  var teachers = [
    {
      teacherId: '1',
      teacherName: 'Peter'
    },
    {
      teacherId: '2',
      teacherName: 'Anna'
    }
  ];

  var students = [
    {
      studentName: 'Michael',
      tutor: '1'
    },
    {
      studentName: 'Rose',
      tutor: '2'
    }
  ];

  function teacherJoin(join) {
    return join[0].teacherId === join[1].tutor;
  }

  function student(join) {
    return {studentName: join[1].studentName, teacherName: join[0].teacherName};
  }

  const tests = [
    [
      numbers,
      () =>
        query()
          .select()
          .from(numbers)
          .execute()
    ],
    [
      numbers,
      () =>
        query()
          .from(numbers)
          .select()
          .execute()
    ],
    [
      persons,
      () =>
        query()
          .select()
          .from(persons)
          .execute()
    ],
    [
      [
        'teacher',
        'teacher',
        'teacher',
        'scientific',
        'scientific',
        'scientific',
        'politician'
      ],
      () =>
        query()
          .select(profession)
          .from(persons)
          .execute()
    ],
    [
      ['teacher', 'teacher', 'teacher'],
      () =>
        query()
          .select(profession)
          .from(persons)
          .where(isTeacher)
          .execute()
    ],
    [
      [
        ['odd', [1, 3, 5, 7, 9]],
        ['even', [2, 4, 6, 8]]
      ],
      () =>
        query()
          .select()
          .from(numbers2)
          .groupBy(parity)
          .execute()
    ],
    [
      [
        [
          'odd',
          [
            ['divisible', [1, 9]],
            ['prime', [3, 5, 7]]
          ]
        ],
        [
          'even',
          [
            ['prime', [2]],
            ['divisible', [4, 6, 8]]
          ]
        ]
      ],
      () =>
        query()
          .select()
          .from(numbers2)
          .groupBy(parity, prime)
          .execute()
    ],
    [
      [['odd', [1, 3, 5, 7, 9]]],
      () =>
        query()
          .select()
          .from(numbers2)
          .groupBy(parity)
          .having(odd)
          .execute()
    ],
    [
      [9, 8, 7, 6, 5, 4, 3, 2, 1],
      () =>
        query()
          .select()
          .from(numbers2)
          .orderBy(descendentCompare)
          .execute()
    ],
    [
      [
        {studentName: 'Michael', teacherName: 'Peter'},
        {studentName: 'Rose', teacherName: 'Anna'}
      ],
      () =>
        query()
          .select(student)
          .from(teachers, students)
          .where(teacherJoin)
          .execute()
    ],
    [
      [
        {value: 2, frequency: 2},
        {value: 6, frequency: 2}
      ],
      () => {
        var numbers = [1, 2, 1, 3, 5, 6, 1, 2, 5, 6];

        function greatThan1(group) {
          return group[1].length > 1;
        }

        function isPair(group) {
          return group[0] % 2 === 0;
        }

        function id(value) {
          return value;
        }

        function frequency(group) {
          return {value: group[0], frequency: group[1].length};
        }
        return query()
          .select(frequency)
          .from(numbers)
          .groupBy(id)
          .having(greatThan1)
          .having(isPair)
          .execute();
      }
    ]
  ];

  const {equals} = require('ramda');
  const {inspect} = require('util');
  const toStr = o => inspect(o, {depth: null, colors: true});
  tests.forEach(([expected, func], i) => {
    const actual = func();
    if (!equals(actual, expected)) {
      console.log(
        `Test ${i} failed: got`,
        toStr(actual),
        'expected',
        toStr(expected)
      );
    } else {
      console.log('PASS');
    }
  });
})();
