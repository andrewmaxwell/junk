const conversions = {
  'm^3': 1e9,
  'cm^3': 1000,
  'mm^3': 1,
  m: 1000,
  cm: 10,
  mm: 1,
};

const normalize = ({value, unit}) => value * conversions[unit];

const workersNeeded = (workers, {length, width, height}) => {
  workers = Object.entries(workers)
    .map(([letter, w]) => ({letter, number: w.number, value: normalize(w)}))
    .sort((a, b) => b.value - a.value);

  let volume = normalize(length) * normalize(width) * normalize(height);

  const result = {};

  for (const {letter, number, value} of workers) {
    const numWorker = Math.min(number, Math.floor(volume / value));
    if (numWorker) result[letter] = numWorker;
    volume -= numWorker * value;
  }

  if (volume) {
    const lastWorkerLetter = workers[workers.length - 1].letter;
    result[lastWorkerLetter] = (result[lastWorkerLetter] || 0) + 1;
  }

  return result;
};

import {Test, it} from './test.js';
Test.failFast = true;
it('simple', function () {
  let workers = {
    a: {value: 400, unit: 'm^3', number: 8},
    b: {value: 2000000, unit: 'cm^3', number: 20},
    c: {value: 1000000000, unit: 'mm^3', number: 10},
  };
  let dimension = {
    length: {value: 300, unit: 'm'},
    width: {value: 1000, unit: 'cm'},
    height: {value: 1070, unit: 'mm'},
  };
  console.log('>>>', workers, dimension);
  Test.assertDeepEquals(workersNeeded(workers, dimension), {a: 8, b: 5});

  workers = {
    a: {value: 2, unit: 'm^3', number: 20},
    b: {value: 1, unit: 'm^3', number: 10},
  };
  dimension = {
    length: {value: 3, unit: 'm'},
    width: {value: 300, unit: 'cm'},
    height: {value: 3000, unit: 'mm'},
  };
  console.log('>>>', workers, dimension);
  Test.assertDeepEquals(workersNeeded(workers, dimension), {a: 13, b: 1});

  workers = {
    a: {value: 10, unit: 'm^3', number: 20},
    b: {value: 5, unit: 'm^3', number: 5},
    c: {value: 1, unit: 'm^3', number: 8},
  };
  dimension = {
    length: {value: 4, unit: 'm'},
    width: {value: 3, unit: 'm'},
    height: {value: 8, unit: 'm'},
  };
  console.log('>>>', workers, dimension);
  Test.assertDeepEquals(workersNeeded(workers, dimension), {a: 9, b: 1, c: 1});
});

it('more', function () {
  let workers = {
    a: {value: 2000, unit: 'm^3', number: 5},
    b: {value: 1500, unit: 'm^3', number: 5},
    c: {value: 1000, unit: 'm^3', number: 7},
    d: {value: 900, unit: 'm^3', number: 3},
    e: {value: 200000000, unit: 'cm^3', number: 3},
    f: {value: 2, unit: 'm^3', number: 50},
  };
  let dimension = {
    length: {value: 8000, unit: 'mm'},
    width: {value: 5543, unit: 'cm'},
    height: {value: 2785, unit: 'mm'},
  };
  console.log('>>>', workers, dimension);
  Test.assertDeepEquals(workersNeeded(workers, dimension), {c: 1, e: 1, f: 18});

  workers = {
    '8d4a': {value: 13000000000, unit: 'mm^3', number: 99},
    iyo5l: {value: 20000000000, unit: 'mm^3', number: 63},
    tfqns: {value: 15000000000, unit: 'mm^3', number: 84},
    cmc1t: {value: 18, unit: 'm^3', number: 70},
    nlsfl: {value: 17000000000, unit: 'mm^3', number: 76},
    flxk: {value: 263, unit: 'm^3', number: 5},
    vukni: {value: 27, unit: 'm^3', number: 48},
    vdmzc: {value: 39000000, unit: 'cm^3', number: 33},
    lnawt: {value: 438000000000, unit: 'mm^3', number: 3},
    fxeud: {value: 73000000, unit: 'cm^3', number: 18},
    rv8gp: {value: 77, unit: 'm^3', number: 17},
    qkgk7: {value: 37000000000, unit: 'mm^3', number: 35},
    jnyvv: {value: 21, unit: 'm^3', number: 62},
    bgkj: {value: 24, unit: 'm^3', number: 53},
    ypmnm: {value: 26, unit: 'm^3', number: 49},
    emd36: {value: 82000000000, unit: 'mm^3', number: 16},
    pqrmb: {value: 34000000000, unit: 'mm^3', number: 38},
    o48d: {value: 19000000000, unit: 'mm^3', number: 67},
    u9uj: {value: 23000000000, unit: 'mm^3', number: 55},
    ibpj: {value: 38000000000, unit: 'mm^3', number: 34},
  };

  dimension = {
    length: {unit: 'cm', value: 900},
    width: {unit: 'cm', value: 200},
    height: {unit: 'm', value: 3},
  };
  console.log('>>>', workers, dimension);
  Test.assertDeepEquals(workersNeeded(workers, dimension), {
    vdmzc: 1,
    tfqns: 1,
  });
});
