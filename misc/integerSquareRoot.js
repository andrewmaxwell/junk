const big = (str) => String(str).split('').map(Number).reverse();

const toStr = (x) => x.slice().reverse().join('');

const normalize = (x) => {
  let carry = 0;
  for (let i = 0; i < x.length || carry; i++) {
    const v = (x[i] || 0) + carry;
    carry = Math.floor(v / 10);
    x[i] = v % 10;
  }
  return x;
};

const add = (a, b) => {
  const res = [];
  for (let i = 0; i < a.length || i < b.length; i++) {
    res[i] = (a[i] || 0) + (b[i] || 0);
  }
  return normalize(res);
};

const mult = (a, b) => {
  const res = [];
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      res[i + j] = (res[i + j] || 0) + a[i] * b[j];
    }
  }
  return normalize(res);
};

const comp = (f) => (a, b) => {
  if (b.length !== a.length) return f(a.length, b.length);
  for (let i = a.length - 1; i >= 0; i--) {
    if (a[i] !== b[i]) return f(a[i], b[i]);
  }
};
const lt = comp((a, b) => a < b);
const gt = comp((a, b) => a > b);

const half = (x) => mult(x, big(5)).slice(1);

const integerSquareRoot = (n) => {
  n = big(n);
  let low = big(1);
  let high = n;
  while (lt(add(low, big(1)), high)) {
    const mid = half(add(high, low));
    const sq = mult(mid, mid);
    if (gt(sq, n)) high = mid;
    else if (lt(sq, n)) low = mid;
    else return toStr(mid);
  }
  return toStr(low);
};

const {Test} = require('./test');
Test.assertEquals(toStr(mult(big(123), big(987))), '121401');
Test.assertEquals(toStr(mult(big(12345), big(987))), '12184515');
Test.assertEquals(integerSquareRoot('1'), '1');
Test.assertEquals(integerSquareRoot('5'), '2');
Test.assertEquals(integerSquareRoot('17'), '4');
Test.assertEquals(integerSquareRoot('100'), '10');
Test.assertEquals(integerSquareRoot('1000'), '31');
Test.assertEquals(
  integerSquareRoot(
    '23232328323215435345345345343458098856756556809400840980980980980809092343243243243243098799634'
  ),
  '152421548093487868711992623730429930751178496967'
);
Test.assertEquals(
  integerSquareRoot(
    '12323309809809534545458098709854808654685688665486860956865654654654324238000980980980'
  ),
  '3510457208086937291253621317073222057793129'
);
