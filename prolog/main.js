import {prolog} from './prolog.js';
import {Test} from '../misc/test.js';

const query = prolog(`
male(mark).
male(andrew).
male(joshua).
male(nathan).

female(phyllis).
female(marie).
female(emily).
female(isla).
female(eden).
 
parent_of(mark, andrew).
parent_of(mark, marie).
parent_of(mark, emily).
parent_of(mark, joshua).
parent_of(phyllis, andrew).
parent_of(phyllis, marie).
parent_of(phyllis, emily).
parent_of(phyllis, joshua).
parent_of(marie, isla).
parent_of(marie, eden).
parent_of(nathan, isla).
parent_of(nathan, eden).

xx(X):-female(X).

isParent(X,Y):- parent_of(X, Y).

father_of(X,Y):- 
  male(X),
  parent_of(X,Y).
 
mother_of(X,Y):- 
  female(X),
  parent_of(X,Y).
 
grandfather_of(X,Y):- 
  male(X),
  parent_of(X,Z),
  parent_of(Z,Y).

grandmother_of(X,Y):- 
  female(X),
  parent_of(X,Z),
  parent_of(Z,Y).
 
aunt_of(X,Y):- 
  female(X),
  parent_of(Z,Y), 
  sister_of(X, Z).

sister_of(X,Y):- 
  female(X), 
  parent_of(P,X), 
  parent_of(P,Y), X \\= Y.
 
brother_of(X,Y):-
  male(X),
  parent_of(F,Y), 
  parent_of(F,X), X \\= Y.

uncle_of(X,Y):-
  parent_of(Z,Y), 
  brother_of(X,Z).

grandparent_of(X,Y):-
  parent_of(X, Z),
  parent_of(Z, Y).

ancestor_of(X,Y):- parent_of(X,Y).
ancestor_of(X,Y):- 
  parent_of(X,Z), 
  ancestor_of(Z,Y).

`);

const tests = [
  // ['male(andrew).', true],
  // ['male(marie).', false],
  // ['mother_of(phyllis,andrew).', true],
  // ['mother_of(andrew,phyllis).', false],
  // ['mother_of(mark,andrew).', false],
  // ['father_of(mark,andrew).', true],
  // ['father_of(phyllis, andrew).', false],
  // [
  //   'male(Who).',
  //   [{Who: 'mark'}, {Who: 'andrew'}, {Who: 'joshua'}, {Who: 'nathan'}],
  // ],
  // [
  //   'parent_of(mark,Who).',
  //   [{Who: 'andrew'}, {Who: 'marie'}, {Who: 'emily'}, {Who: 'joshua'}],
  // ],
  // ['parent_of(Who,andrew).', [{Who: 'mark'}, {Who: 'phyllis'}]],
  // [
  //   'xx(Who).',
  //   [
  //     {Who: 'phyllis'},
  //     {Who: 'marie'},
  //     {Who: 'emily'},
  //     {Who: 'isla'},
  //     {Who: 'eden'},
  //   ],
  // ],
  // [
  //   'isParent(mark,Who).',
  //   [{Who: 'andrew'}, {Who: 'marie'}, {Who: 'emily'}, {Who: 'joshua'}],
  // ],
  // [
  //   'parent_of(X, Y).',
  //   [
  //     {X: 'mark', Y: 'andrew'},
  //     {X: 'mark', Y: 'marie'},
  //     {X: 'mark', Y: 'emily'},
  //     {X: 'mark', Y: 'joshua'},
  //     {X: 'phyllis', Y: 'andrew'},
  //     {X: 'phyllis', Y: 'marie'},
  //     {X: 'phyllis', Y: 'emily'},
  //     {X: 'phyllis', Y: 'joshua'},
  //     {X: 'marie', Y: 'isla'},
  //     {X: 'marie', Y: 'eden'},
  //     {X: 'nathan', Y: 'isla'},
  //     {X: 'nathan', Y: 'eden'},
  //   ],
  // ],
  // ['mother_of(marie, Who).', [{Who: 'isla'}, {Who: 'eden'}]],
  // ['isParent(Who,andrew).', [{Who: 'mark'}, {Who: 'phyllis'}]],
  // ['mother_of(Who, emily).', [{Who: 'phyllis'}]],
  // ['grandmother_of(phyllis, eden).', true],
  // ['grandmother_of(marie, eden).', false],
  // [
  //   'grandfather_of(X,Y).',
  //   [
  //     {X: 'mark', Y: 'isla'},
  //     {X: 'mark', Y: 'eden'},
  //   ],
  // ],

  // ['brother_of(andrew,joshua).', true],
  // ['brother_of(joshua,andrew).', true],
  // ['brother_of(marie,andrew).', false],
  // ['brother_of(andrew,marie).', true],
  // ['brother_of(emily,marie).', false],

  // ['grandmother_of(Who, eden).', [{Who: 'phyllis'}]],

  // ['uncle_of(andrew, isla).', true],
  // ['uncle_of(marie, isla).', false],
  // ['uncle_of(isla, marie).', false],

  // ['aunt_of(emily, isla).', true],
  // ['aunt_of(marie, isla).', false],

  // [
  //   'uncle_of(A, B).',
  //   [
  //     {A: 'andrew', B: 'isla'},
  //     {A: 'joshua', B: 'isla'},
  //     {A: 'andrew', B: 'eden'},
  //     {A: 'joshua', B: 'eden'},
  //   ],
  // ],

  // ['grandparent_of(mark, Who).', [{Who: 'isla'}, {Who: 'eden'}]],
  // ['grandparent_of(Who, eden).', [{Who: 'mark'}, {Who: 'phyllis'}]],
  [
    'ancestor_of(mark, Who).',
    [
      {Who: 'andrew'},
      {Who: 'marie'},
      {Who: 'emily'},
      {Who: 'joshua'},
      {Who: 'isla'},
      {Who: 'eden'},
    ],
  ],
];

for (const [input, expected] of tests) {
  Test.assertDeepEquals(query(input), expected, input);
}

// This one doesn't work yet
// ['ancestor_of(mark, eden).'), true);
