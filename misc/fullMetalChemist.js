const RADICALS = [
  'meth',
  'eth',
  'prop',
  'but',
  'pent',
  'hex',
  'hept',
  'oct',
  'non',
  'dec',
  'undec',
  'dodec',
  'tridec',
  'tetradec',
  'pentadec',
  'hexadec',
  'heptadec',
  'octadec',
  'nonadec',
];
const MULTIPLIERS = [
  'di',
  'tri',
  'tetra',
  'penta',
  'hexa',
  'hepta',
  'octa',
  'nona',
  'deca',
  'undeca',
  'dodeca',
  'trideca',
  'tetradeca',
  'pentadeca',
  'hexadeca',
  'heptadeca',
  'octadeca',
  'nonadeca',
];

const SUFFIXES = [
  'ol',
  'al',
  'one',
  'oic acid',
  'carboxylic acid',
  'oate',
  'ether',
  'amide',
  'amine',
  'imine',
  'benzene',
  'thiol',
  'phosphine',
  'arsine',
];
const PREFIXES = [
  'cyclo',
  'hydroxy',
  'oxo',
  'carboxy',
  'oxycarbonyl',
  'anoyloxy',
  'formyl',
  'oxy',
  'amido',
  'amino',
  'imino',
  'phenyl',
  'mercapto',
  'phosphino',
  'arsino',
  'fluoro',
  'chloro',
  'bromo',
  'iodo',
];

const combine = (a, b) => {
  const result = {};
  for (const k in {...a, ...b}) {
    const sum = (a[k] || 0) + (b[k] || 0);
    if (sum) result[k] = sum;
  }
  return result;
};

const mult = (obj, x) => {
  const result = {};
  for (const k in obj) result[k] = x * obj[k];
  return result;
};

const regex = new RegExp(
  [
    ...RADICALS.map((r) => `${r}(?!e$)`),
    ...MULTIPLIERS,
    ...SUFFIXES,
    ...PREFIXES,
    'ene',
    'yne',
  ].join('|'),
  'g'
);

const things = {
  cyclo: {},
  ene: {},
  yne: {H: -2},
  ol: {O: 1, H: 2},
  al: {O: 1},
  one: {O: 1},
  fluoro: {F: 1, H: 1},
  chloro: {Cl: 1, H: 1},
  bromo: {Br: 1, H: 1},
  amine: {N: 1, H: 3},
  amide: {N: 1, O: 1, H: 1},
  hydroxy: {C: 39, H: 80, O: 1},
};

const parse = (name) => {
  const parts = name.replace(/\d+-/g, '').match(regex);
  console.log('parts', parts);

  const r = parts.map((part) => {
    const m = MULTIPLIERS.indexOf(part);
    if (m >= 0) return {mult: m + 2};

    const radical = RADICALS.indexOf(part) + 1;
    if (radical > 0) return {C: radical, H: 2 * radical + 2};

    if (things[part]) return things[part];

    console.error(`WTF if ${part}`);
    return {};
  });

  console.log(r);

  let numParts = 0;
  return r
    .reduce((arr, el) => {
      const last = arr[arr.length - 1];
      if (last && last.mult) {
        numParts += last.mult - 1;
        return [...arr.slice(0, -1), mult(el, last.mult)];
      }
      numParts++;
      return [...arr, el];
    }, [])
    .reduce((res, p) => (p.mult ? mult(res, p.mult) : combine(res, p)), {
      H: -2 * (numParts - 1),
    });
};

// https://www.codewars.com/kata/5a529cced8e145207e000010/train/javascript

import {Test, describe, it} from './test.js';
Test.failFast = true;

const moreTests = [
  // ['2,5-di[dimethyl]ethylhexan-1,6-diol', {C: 14, H: 30, O: 2}],
  [
    '3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12-nonadecanonadecylnonadecanone',
    {C: 380, H: 760, O: 1},
  ],
  ['tetrafluoromethane', {C: 1, F: 4}],
  ['cyclohexanone', {C: 6, H: 10, O: 1}],
  ['3,3,4,4,5,5-hexanonyl-2-hydroxycyclohexanone', {C: 60, H: 118, O: 2}],
  ['methyl methanoate', {C: 2, H: 4, O: 2}],
  ['propanoic acid', {C: 3, H: 6, O: 2}],
  ['cyclobutyl 6-oxoheptanoate', {C: 11, H: 18, O: 3}],
];

for (const [input, expected] of moreTests) {
  console.log(input);
  Test.assertDeepEquals(parse(input), expected);
}

const strip = (it) => it.replace(/^\n+|\n+$/g, '');

describe('Simple chains / impact of the number of C', () => {
  it('methane', () => {
    const draw = `

CH4

`;
    const molec = 'methane';

    console.log(molec + ':\n' + strip(draw) + '\n' + '{C: 1, H: 4}');
    Test.assertDeepEquals(
      parse(molec),
      {C: 1, H: 4},
      'Wrong result for methane'
    );
  });

  it('ethane', () => {
    const draw = `

CH3-CH3

`;
    const molec = 'ethane';

    console.log(molec + ':\n' + strip(draw) + '\n' + '{C: 2, H: 6}');
    Test.assertDeepEquals(
      parse(molec),
      {C: 2, H: 6},
      'Wrong result for ethane'
    );
  });

  it('butane', () => {
    const draw = `

CH3-CH2-CH2-CH3

`;
    const molec = 'butane';

    console.log(molec + ':\n' + strip(draw) + '\n' + '{C: 4, H: 10}');
    Test.assertDeepEquals(
      parse(molec),
      {C: 4, H: 10},
      'Wrong result for butane'
    );
  });

  it('decane', () => {
    const draw = `

CH3-CH2-CH2-CH2-CH2-CH2-CH2-CH2-CH2-CH3

`;
    const molec = 'decane';

    console.log(molec + ':\n' + strip(draw) + '\n' + '{C: 10, H: 22}');
    Test.assertDeepEquals(
      parse(molec),
      {C: 10, H: 22},
      'Wrong result for decane'
    );
  });
});

describe('Simple ramifications', () => {
  it('REFERENCE: C8H18 (octane)', () => {
    const draw = `

CH3-CH2-CH2-CH2-CH2-CH2-CH2-CH3

`;
    const molec = 'octane';

    console.log(molec + ':\n' + strip(draw) + '\n' + '{C: 8, H: 18}');
    Test.assertDeepEquals(
      parse(molec),
      {C: 8, H: 18},
      'Wrong result for octane'
    );
  });

  it('One ramification', () => {
    const draw = `

        CH2-CH3
        |
CH3-CH2-CH-CH2-CH2-CH3

`;
    const molec = '3-ethylhexane';

    console.log(molec + ':\n' + strip(draw) + '\n' + '{C: 8, H: 18}');
    Test.assertDeepEquals(
      parse(molec),
      {C: 8, H: 18},
      'Wrong result for 3-ethylhexane'
    );
  });

  it('Two ramifications', () => {
    const draw = `

   CH3  CH2-CH3
    |   |
CH3-CH-CH-CH2-CH3

`;
    const molec = '3-ethyl-2-methylpentane';

    console.log(molec + ':\n' + strip(draw) + '\n' + '{C: 8, H: 18}');
    Test.assertDeepEquals(
      parse(molec),
      {C: 8, H: 18},
      'Wrong result for 3-ethyl-2-methylpentane'
    );
  });

  it('Two ramifications on the same C', () => {
    const draw = `

        CH2-CH3
        |
CH3-CH2-C-CH2-CH3
        |
        CH3

`;
    const molec = '3-ethyl-3-methylpentane';

    console.log(molec + ':\n' + strip(draw) + '\n' + '{C: 8, H: 18}');
    Test.assertDeepEquals(
      parse(molec),
      {C: 8, H: 18},
      'Wrong result for 3-ethyl-3-methylpentane'
    );
  });

  it('Handle multipliers', () => {
    const draw = `

        CH3
        |
CH3-CH2-C-CH2-CH2-CH3
        |
        CH3

`;
    const molec = '3,3-dimethylhexane';

    console.log(molec + ':\n' + strip(draw) + '\n' + '{C: 8, H: 18}');
    Test.assertDeepEquals(
      parse(molec),
      {C: 8, H: 18},
      'Wrong result for 3,3-dimethylhexane'
    );
  });

  it('Handle multipliers', () => {
    const draw = `

 CH3   CH3
   \\   /
CH3-C-C-CH3
   /   \\
 CH3   CH3

`;
    const molec = '2,2,3,3-tetramethylbutane';

    console.log(molec + ':\n' + strip(draw) + '\n' + '{C: 8, H: 18}');
    Test.assertDeepEquals(
      parse(molec),
      {C: 8, H: 18},
      'Wrong result for 2,2,3,3-tetramethylbutane'
    );
  });
});

describe('Effect of cycles and multiple bonds', () => {
  it('REFERENCE: C8H16 (cyclooctane)', () => {
    const draw = `

 CH2-CH2-CH2-CH2
 |           |
 CH2-CH2-CH2-CH2

`;
    const molec = 'cyclooctane';

    console.log(molec + ':\n' + strip(draw) + '\n' + '{C: 8, H: 16}');
    Test.assertDeepEquals(
      parse(molec),
      {C: 8, H: 16},
      'Wrong result for cyclooctane'
    );
  });

  it('One cycle of size 6 and one ramification', () => {
    const draw = `

 CH2-CH2-CH-CH2-CH3
 |       |
 CH2-CH2-CH2

`;
    const molec = '1-ethylcyclohexane';

    console.log(molec + ':\n' + strip(draw) + '\n' + '{C: 8, H: 16}');
    Test.assertDeepEquals(
      parse(molec),
      {C: 8, H: 16},
      'Wrong result for 1-ethylcyclohexane'
    );
  });

  it('One cycle of size 4 and several ramifications', () => {
    const draw = `

 CH2-CH-CH2-CH3
 |   |
 CH2-C-CH3
     |
     CH3

`;
    const molec = '1-ethyl-2,2-dimethylcyclobutane';

    console.log(molec + ':\n' + strip(draw) + '\n' + '{C: 8, H: 16}');
    Test.assertDeepEquals(
      parse(molec),
      {C: 8, H: 16},
      'Wrong result for 1-ethyl-2,2-dimethylcyclobutane'
    );
  });

  it('One double bond: at an extremity', () => {
    const draw = `

CH2=CH-CH2-CH2-CH2-CH2-CH2-CH3

`;
    const molec = 'oct-1-ene';

    console.log(molec + ':\n' + strip(draw) + '\n' + '{C: 8, H: 16}');
    Test.assertDeepEquals(
      parse(molec),
      {C: 8, H: 16},
      'Wrong result for oct-1-ene'
    );
  });

  it('One double bond: anywhere in the chain', () => {
    const draw = `

CH3-CH2-CH=CH-CH2-CH2-CH2-CH3

`;
    const molec = 'oct-3-ene';

    console.log(molec + ':\n' + strip(draw) + '\n' + '{C: 8, H: 16}');
    Test.assertDeepEquals(
      parse(molec),
      {C: 8, H: 16},
      'Wrong result for oct-3-ene'
    );
  });

  it("One double bond: elision of the position '-1-'", () => {
    const draw = `

CH2=CH-CH2-CH2-CH2-CH2-CH2-CH3

`;
    const molec = 'octene';

    console.log(molec + ':\n' + strip(draw) + '\n' + '{C: 8, H: 16}');
    Test.assertDeepEquals(
      parse(molec),
      {C: 8, H: 16},
      'Wrong result for octene'
    );
  });
});

describe('Effect of mutliple bonds and cycles, part 2', () => {
  it('Double bonds', () => {
    const draw = `

CH3-CH=CH-CH2-CH=CH-CH2-CH3

`;
    const molec = 'oct-2,5-diene';

    console.log(molec + ':\n' + strip(draw) + '\n' + '{C: 8, H: 14}');
    Test.assertDeepEquals(
      parse(molec),
      {C: 8, H: 14},
      'Wrong result for oct-2,5-diene'
    );
  });

  it('Triple bond: at an extremity', () => {
    const draw = `

CH{=}C-CH2-CH2-CH2-CH2-CH2-CH3      '{=}' used as triple bond (should be 3 lines)

`;
    const molec = 'oct-1-yne';

    console.log(molec + ':\n' + strip(draw) + '\n' + '{C: 8, H: 14}');
    Test.assertDeepEquals(
      parse(molec),
      {C: 8, H: 14},
      'Wrong result for oct-1-yne'
    );
  });

  it('Triple bond: in the chain', () => {
    const draw = `

CH3-C{=}C-CH2-CH2-CH2-CH2-CH3

`;
    const molec = 'oct-2-yne';

    console.log(molec + ':\n' + strip(draw) + '\n' + '{C: 8, H: 14}');
    Test.assertDeepEquals(
      parse(molec),
      {C: 8, H: 14},
      'Wrong result for oct-2-yne'
    );
  });

  it('Triple bond: elision of the position', () => {
    const draw = `

CH{=}C-CH2-CH2-CH2-CH2-CH2-CH3

`;
    const molec = 'octyne';

    console.log(molec + ':\n' + strip(draw) + '\n' + '{C: 8, H: 14}');
    Test.assertDeepEquals(
      parse(molec),
      {C: 8, H: 14},
      'Wrong result for octyne'
    );
  });

  it('Mix of cycles and multiple bonds', () => {
    const draw = `

 CH2-CH2-CH-CH2-CH3
 |       |
 CH=CH-CH2

`;
    const molec = '3-ethylcyclohexene';

    console.log(molec + ':\n' + strip(draw) + '\n' + '{C: 8, H: 14}');
    Test.assertDeepEquals(
      parse(molec),
      {C: 8, H: 14},
      'Wrong result for 3-ethylcyclohexene'
    );
  });
});

describe('Simple functions: oxygen', () => {
  it('REFERENCE: C5H12 (pentane)', () => {
    const draw = `

CH3-CH2-CH2-CH2-CH3

`;
    const molec = 'pentane';

    console.log(molec + ':\n' + strip(draw) + '\n' + '{C: 5, H: 12}');
    Test.assertDeepEquals(
      parse(molec),
      {C: 5, H: 12},
      'Wrong result for pentane'
    );
  });

  it('pentanol', () => {
    const draw = `

CH3-CH2-CH2-CH2-CH2-OH

`;
    const molec = 'pentanol';

    console.log(molec + ':\n' + strip(draw) + '\n' + '{C: 5, H: 12, O: 1}');
    Test.assertDeepEquals(
      parse(molec),
      {C: 5, H: 12, O: 1},
      'Wrong result for pentanol'
    );
  });

  it('pentan-2-ol', () => {
    const draw = `

    OH
    |
CH3-CH-CH2-CH2-CH3

`;
    const molec = 'pentan-2-ol';

    console.log(molec + ':\n' + strip(draw) + '\n' + '{C: 5, H: 12, O: 1}');
    Test.assertDeepEquals(
      parse(molec),
      {C: 5, H: 12, O: 1},
      'Wrong result for pentan-2-ol'
    );
  });

  it('pentan-2,4-diol', () => {
    const draw = `

    OH     OH
    |      |
CH3-CH-CH2-CH-CH3

`;
    const molec = 'pentan-2,4-diol';

    console.log(molec + ':\n' + strip(draw) + '\n' + '{C: 5, H: 12, O: 2}');
    Test.assertDeepEquals(
      parse(molec),
      {C: 5, H: 12, O: 2},
      'Wrong result for pentan-2,4-diol'
    );
  });

  it('pentanal', () => {
    const draw = `

CH3-CH2-CH2-CH2-CH=O

`;
    const molec = 'pentanal';

    console.log(molec + ':\n' + strip(draw) + '\n' + '{C: 5, H: 10, O: 1}');
    Test.assertDeepEquals(
      parse(molec),
      {C: 5, H: 10, O: 1},
      'Wrong result for pentanal'
    );
  });

  it('pentan-2-one', () => {
    const draw = `

    O
    ||
CH3-C-CH2-CH2-CH3

`;
    const molec = 'pentan-2-one';

    console.log(molec + ':\n' + strip(draw) + '\n' + '{C: 5, H: 10, O: 1}');
    Test.assertDeepEquals(
      parse(molec),
      {C: 5, H: 10, O: 1},
      'Wrong result for pentan-2-one'
    );
  });

  it('pentandial', () => {
    const draw = `

O=CH-CH2-CH2-CH2-CH=O

`;
    const molec = 'pentandial';

    console.log(molec + ':\n' + strip(draw) + '\n' + '{C: 5, H: 8, O: 2}');
    Test.assertDeepEquals(
      parse(molec),
      {C: 5, H: 8, O: 2},
      'Wrong result for pentandial'
    );
  });

  it('pentan-2,4-dione', () => {
    const draw = `

    O     O
    ||    ||
CH3-C-CH2-C-CH3

`;
    const molec = 'pentan-2,4-dione';

    console.log(molec + ':\n' + strip(draw) + '\n' + '{C: 5, H: 8, O: 2}');
    Test.assertDeepEquals(
      parse(molec),
      {C: 5, H: 8, O: 2},
      'Wrong result for pentan-2,4-dione'
    );
  });
});

describe('Simple functions: halogens', () => {
  it('REFERENCE: C5H12 (pentane)', () => {
    const draw = `

CH3-CH2-CH2-CH2-CH3

`;
    const molec = 'pentane';

    console.log(molec + ':\n' + strip(draw) + '\n' + '{C: 5, H: 12}');
    Test.assertDeepEquals(
      parse(molec),
      {C: 5, H: 12},
      'Wrong result for pentane'
    );
  });

  it('1-fluoropentane', () => {
    const draw = `

CH3-CH2-CH2-CH2-CH2-F

`;
    const molec = '1-fluoropentane';

    console.log(molec + ':\n' + strip(draw) + '\n' + '{C: 5, F: 1, H: 11}');
    Test.assertDeepEquals(
      parse(molec),
      {C: 5, F: 1, H: 11},
      'Wrong result for 1-fluoropentane'
    );
  });

  it('2-chloropentane', () => {
    const draw = `

    Cl
    |
CH3-CH-CH2-CH2-CH3

`;
    const molec = '2-chloropentane';

    console.log(molec + ':\n' + strip(draw) + '\n' + '{C: 5, Cl: 1, H: 11}');
    Test.assertDeepEquals(
      parse(molec),
      {C: 5, Cl: 1, H: 11},
      'Wrong result for 2-chloropentane'
    );
  });

  it('1-bromo-4-chloropentane', () => {
    const draw = `

    Cl
    |
CH3-CH-CH2-CH2-CH2-Br

`;
    const molec = '1-bromo-4-chloropentane';

    console.log(
      molec + ':\n' + strip(draw) + '\n' + '{Br: 1, C: 5, Cl: 1, H: 10}'
    );
    Test.assertDeepEquals(
      parse(molec),
      {Br: 1, C: 5, Cl: 1, H: 10},
      'Wrong result for 1-bromo-4-chloropentane'
    );
  });
});

describe('Simple functions: nitrogen', () => {
  it('REFERENCE: C6H14 (hexane)', () => {
    const draw = `

CH3-CH2-CH2-CH2-CH2-CH3

`;
    const molec = 'hexane';

    console.log(molec + ':\n' + strip(draw) + '\n' + '{C: 6, H: 14}');
    Test.assertDeepEquals(
      parse(molec),
      {C: 6, H: 14},
      'Wrong result for hexane'
    );
  });

  it('hexylamine', () => {
    const draw = `

CH3-CH2-CH2-CH2-CH2-CH2-NH2

`;
    const molec = 'hexylamine';

    console.log(molec + ':\n' + strip(draw) + '\n' + '{C: 6, H: 15, N: 1}');
    Test.assertDeepEquals(
      parse(molec),
      {C: 6, H: 15, N: 1},
      'Wrong result for hexylamine'
    );
  });

  it('butylethylamine', () => {
    const draw = `

CH3-CH2-CH2-CH2-NH-CH2-CH3

`;
    const molec = 'butylethylamine';

    console.log(molec + ':\n' + strip(draw) + '\n' + '{C: 6, H: 15, N: 1}');
    Test.assertDeepEquals(
      parse(molec),
      {C: 6, H: 15, N: 1},
      'Wrong result for butylethylamine'
    );
  });

  it('ethylmethylpropylamine', () => {
    const draw = `

            CH3
            |
CH3-CH2-CH2-N-CH2-CH3

`;
    const molec = 'ethylmethylpropylamine';

    console.log(molec + ':\n' + strip(draw) + '\n' + '{C: 6, H: 15, N: 1}');
    Test.assertDeepEquals(
      parse(molec),
      {C: 6, H: 15, N: 1},
      'Wrong result for ethylmethylpropylamine'
    );
  });

  it('triethylamine', () => {
    const draw = `

N(CH2-CH3)3

`;
    const molec = 'triethylamine';

    console.log(molec + ':\n' + strip(draw) + '\n' + '{C: 6, H: 15, N: 1}');
    Test.assertDeepEquals(
      parse(molec),
      {C: 6, H: 15, N: 1},
      'Wrong result for triethylamine'
    );
  });

  it('Alternative nomenclature: hexan-1,6-diamine', () => {
    const draw = `

NH2-CH2-CH2-CH2-CH2-CH2-CH2-NH2

`;
    const molec = 'hexan-1,6-diamine';

    console.log(molec + ':\n' + strip(draw) + '\n' + '{C: 6, H: 16, N: 2}');
    Test.assertDeepEquals(
      parse(molec),
      {C: 6, H: 16, N: 2},
      'Wrong result for hexan-1,6-diamine'
    );
  });

  it('WARNING: amiDe, not amiNe, here!', () => {
    const draw = `

                    O
                    ||
CH3-CH2-CH2-CH2-CH2-C-NH2

`;
    const molec = 'hexanamide';

    console.log(
      molec + ':\n' + strip(draw) + '\n' + '{C: 6, H: 13, N: 1, O: 1}'
    );
    Test.assertDeepEquals(
      parse(molec),
      {C: 6, H: 13, N: 1, O: 1},
      'Wrong result for hexanamide'
    );
  });
});
