function nextBigger(n) {
  const chars = n.toString().split('').map(Number);
  for (let i = chars.length - 2; i >= 0; i--) {
    if (chars[i] < chars[i + 1]) {
      const s = chars.slice(i).sort();
      const j = s.findIndex((n) => n > chars[i]);
      return Number([...chars.slice(0, i), s.splice(j, 1)[0], ...s].join(''));
    }
  }
  return -1;
}

const {Test} = require('./test');
Test.assertEquals(nextBigger(12), 21);
Test.assertEquals(nextBigger(513), 531);
Test.assertEquals(nextBigger(2017), 2071);
Test.assertEquals(nextBigger(414), 441);
Test.assertEquals(nextBigger(144), 414);
Test.assertEquals(nextBigger(1234567890), 1234567908);
Test.assertEquals(nextBigger(303197), 303719);
