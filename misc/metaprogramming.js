const callNextMethod = (self, ...args) => {
  if (self.aroundIndex < self.around.length) {
    return self.around[self.aroundIndex++].func.call(self, ...args);
  }

  if (self.primaryIndex >= self.primary.length) {
    throw `No next method found for ${self.name} in ${
      self.around.length ? 'around' : 'primary'
    }`;
  }

  for (const m of self.before) m.func(...args);
  const retVal = self.primary[self.primaryIndex++].func.call(
    {...self, around: [], before: [], after: []},
    ...args
  );
  for (const m of self.after.reverse()) m.func(...args);
  return retVal;
};

const isImmediateConstructor = (t, a) =>
  a instanceof Object && a.constructor.name === t;

const isAncestorConstructor = (t, a) =>
  a instanceof Object &&
  (isImmediateConstructor(t, a.__proto__) ||
    isAncestorConstructor(t, a.__proto__));

const matchingRules = [
  isImmediateConstructor,
  isAncestorConstructor,
  (t, a) => t === 'null' && a === null,
  (t, a) => typeof a === t,
  (t) => t === '*',
];

const getScore = (sig, args) =>
  sig.reduce((sum, t, i) => {
    const x = matchingRules.findIndex((r) => r(t, args[i]));
    return sum + (x < 0 ? Infinity : x);
  }, 0);

const getType = (a) =>
  a === null ? 'null' : a instanceof Object ? a.constructor.name : typeof a;

function defgeneric(name) {
  const methods = {};
  let cache = {};

  const gen = (...args) => gen.findMethod(...args)(...args);

  gen.defmethod = (sig, func, combo = 'primary') => {
    methods[sig + '|' + combo] = {sig: sig.split(','), func, combo};
    cache = {};
    return gen;
  };

  gen.removeMethod = (sig, combo = 'primary') => {
    delete methods[sig + '|' + combo];
    cache = {};
    return gen;
  };

  gen.findMethod = (...args) => {
    const key = args.map(getType).join(',');
    if (!cache[key]) {
      const funcs = Object.values(methods)
        .filter(({sig}) => sig.length === args.length)
        .map((m) => ({...m, score: getScore(m.sig, args)}))
        .filter((m) => m.score !== Infinity)
        .sort((a, b) => a.score - b.score)
        .reduce(
          (g, m) => {
            g[m.combo].push(m);
            return g;
          },
          {primary: [], after: [], around: [], before: []}
        );

      if (!funcs.around.length && !funcs.primary.length) {
        throw `No method found for ${name} with args: ${args.map(getType)}`;
      }

      cache[key] = (...args) =>
        callNextMethod(
          {...funcs, name, aroundIndex: 0, primaryIndex: 0},
          ...args
        );
    }

    return cache[key];
  };

  return gen;
}

// https://www.codewars.com/kata/526de57c8f428fc1fd000b8c/train/javascript
///////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////

const {Test} = require('./test');
// Simple tests for 'primary' methods
var append = defgeneric('append');
append.defmethod('Array,Array', function (a, b) {
  return a.concat(b);
});
append.defmethod('*,Array', function (a, b) {
  return [a].concat(b);
});
append.defmethod('Array,*', function (a, b) {
  return a.concat([b]);
});

Test.assertSimilar(
  append([1, 2], [3, 4]),
  [1, 2, 3, 4],
  'Append array + array'
);
Test.assertSimilar(append(1, [2, 3, 4]), [1, 2, 3, 4], 'Append number + array');
Test.assertSimilar(append([1, 2, 3], 4), [1, 2, 3, 4], 'Append array + number');
Test.expectError('No way to append two integers.', function () {
  append(1, 2);
});

function Mammal() {}
function Rhino() {}
Rhino.prototype = new Mammal();
Rhino.prototype.constructor = Rhino;

function Platypus() {}
Platypus.prototype = new Mammal();
Platypus.prototype.constructor = Platypus;

// Simple test for inheritance and callNextMethod() on 'primary' method
var name = defgeneric('name')
  .defmethod('Mammal', function () {
    return 'Mammy';
  })
  .defmethod('Platypus', function (p) {
    return 'Platty ' + callNextMethod(this, p);
  });

Test.assertDeepEquals(name(new Rhino()), 'Mammy', 'Rhino name');
Test.assertDeepEquals(name(new Platypus()), 'Platty Mammy', 'Platypus name');

var laysEggs = defgeneric('laysEggs')
  .defmethod('Mammal', function () {
    return false;
  })
  .defmethod('Platypus', function () {
    return true;
  })
  .defmethod(
    'Platypus',
    function () {
      console.log('Before platypus egg check.');
    },
    'before'
  )
  .defmethod(
    'Mammal',
    function () {
      console.log('Before mammal egg check.');
    },
    'before'
  )
  .defmethod(
    '*',
    function () {
      console.log('Before egg check.');
    },
    'before'
  )
  .defmethod(
    'Platypus',
    function () {
      console.log('After platypus egg check.');
    },
    'after'
  )
  .defmethod(
    'Mammal',
    function () {
      console.log('After mammal egg check.');
    },
    'after'
  );

Test.assertDeepEquals(laysEggs(new Rhino()), false);
Test.assertDeepEquals(laysEggs(new Platypus()), true);
Test.expectError(() => laysEggs(5));

laysEggs.defmethod(
  'Platypus',
  function (p) {
    console.log('>>>Around platypus check.');
    var ret = callNextMethod(this, p);
    console.log('<<<Around platypus check.');
    return ret;
  },
  'around'
);
laysEggs.defmethod(
  'Mammal',
  function (p) {
    console.log('>>>Around mammal check.');
    var ret = callNextMethod(this, p);
    console.log('<<<Around mammal check.');
    return ret;
  },
  'around'
);

console.log('.....', laysEggs(new Platypus()));

var appendLists = append.findMethod([], []);
Test.assertSimilar(appendLists([1, 2], [3, 4]), append([1, 2], [3, 4]));

var msgs = '';
var log = function (str) {
  msgs += str;
};
var describe = defgeneric('describe')
  .defmethod('Platypus', function () {
    log('Platy' + arguments.length.toString());
    return 'P';
  })
  .defmethod('Mammal', function () {
    log('Mammy' + arguments.length.toString());
    return 'M';
  })
  .defmethod(
    'Platypus',
    function () {
      log('platypus' + arguments.length.toString());
    },
    'before'
  )
  .defmethod(
    'Platypus',
    function () {
      log('/platypus' + arguments.length.toString());
    },
    'after'
  )
  .defmethod(
    'Mammal',
    function () {
      log('mammal' + arguments.length.toString());
    },
    'before'
  )
  .defmethod(
    'Mammal',
    function () {
      log('/mammal' + arguments.length.toString());
    },
    'after'
  )
  .defmethod(
    'object',
    function () {
      log('object' + arguments.length.toString());
    },
    'before'
  )
  .defmethod(
    'object',
    function () {
      log('/object' + arguments.length.toString());
    },
    'after'
  );

var tryIt = function (a) {
  msgs = '';
  var ret = describe(a);
  return ret + ':' + msgs;
};

Test.assertDeepEquals(
  tryIt(new Platypus()),
  'P:platypus1mammal1object1Platy1/object1/mammal1/platypus1',
  'Platypus: Before methods from most-to-least, then primary, then after, returning primary.'
);

let find1 = describe.findMethod(new Platypus());
var find2 = describe.findMethod(new Platypus());
describe.removeMethod('Platypus');

Test.assertEquals(
  find1,
  find2,
  'Multiple calls with the same types and no intervening def/remove'
);

find1 = name.findMethod(new Platypus());

name.defmethod('Platypus', function () {
  return 'Pat';
});
name.removeMethod('Mammal');

Test.assertDeepEquals(find1(new Platypus()), 'Platty Mammy');
Test.assertDeepEquals(name(new Platypus()), 'Pat');
