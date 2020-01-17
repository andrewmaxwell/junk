// 0, 1, 1, 2, 3, 5, 8, 13, 21

const fib = n => {
  if (!n) return 0n;
  let a = 0n,
    b = 1n,
    abs = n < 0 ? -n : n,
    x;
  for (let i = 1; i < abs; i++) {
    x = a + b;
    a = b;
    b = x;
  }
  return n < 0 && n % 2 === 0 ? -b : b;
};

console.time();
console.log(fib(1e5).toString().length);
console.timeEnd();

/*

Logarithmic Temperature Scale (L)
Based on freezing point of water at sea-level, natural log

L = ln(K / 273.15)
K = 273.15 * e^L

0L = 0C = 273.15K
1L = 242.5 K = 877 F
2L = 3173 F
-1L = 100K = -280F

373K = 0.31 L (Boiling point of water)
77K = -1.27L (Boiling point of nitrogen)
4K = -4.17L (Boiling point of helium)
0.00000000005K = -29.33 L (Lowest temperature in a laboratory)
0K = -Infinity L (Absolute Zero)
1.416e32 K = 68.42 L (Absolute Hot)


----------

Logarithmic temperature scale based on 0L = 0C and 1L = 1C

Celsius: L = C => Math.log(C / 273.15 + 1) / Math.log(274.15 / 273.15)
Kelvin: L = K => Math.log(K / 273.15) / Math.log(274.15 / 273.15)

100C = 85.4L (Boiling point of water)
37C = 34.8L (Body temperature)
22C = 21L (Room temperature)
1C = 1L
0C = 0L (Freezing point of water)
-196C = -346.5L (Boiling point of nitrogen)
4K = -1156L (Boiling point of helium)
0.00000000005K = -8026 L (Lowest temperature in a laboratory)
0K = -Infinity L (Absolute Zero)
1.416e32 K = 18723 L (Absolute Hot)


*/

('use strict');
console.clear();

const temps = `
100 Boiling point of water
37 Body temperature
22 Room temperature
1 1C
0 Freezing point of water
-196 Boiling point of nitrogen
-269 Boiling point of helium
-273.1499999995 Lowest temperature in a lab
-273.15 Absolute Zero
1.416786e32 Absolute Hot
5505 Surface of Sun
15000000 Core of Sun
1e13 Highest temperature in a lab
`
  .trim()
  .split('\n')
  .map(r => r.split(' '))
  .map(([v, ...l]) => ({label: l.join(' '), value: Number(v)}))
  .sort((a, b) => a.value - b.value);

const scales = Object.entries({
  label: 'label',
  F: C => C * 1.8 + 32,
  C: C => C,
  K: C => C + 273.15,
  L: C => Math.log(C / 273.15 + 1) / Math.log(274.15 / 273.15)
});

const formatNum = n => (n >= 1e9 ? n.toExponential() : n.toLocaleString());

const makeTable = ({rows, cols, getValue}) => {
  const trs = rows
    .map(row => {
      const tds = cols.map(col => `<td>${getValue(row, col)}</td>`).join('');
      return `<tr>${tds}</tr>`;
    })
    .join('\n');
  return `<table class="table"><tbody>${trs}</tbody></table>`;
};

document.body.innerHTML = makeTable({
  rows: temps,
  cols: scales,
  getValue: (row, [scale, func]) =>
    typeof func === 'string'
      ? row[func]
      : formatNum(func(row.value)) + ' ' + scale
});
