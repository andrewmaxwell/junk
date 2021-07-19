const convert2 = (conversions, to, from) => {
  conversions = conversions.map((c) => {
    const [amt1, u1, amt2, u2] = c.split(/[\s=]+/);
    return [u1, u2, amt1 / amt2];
  });

  const queue = [[1, from]];
  for (const [amt, unit] of queue) {
    if (unit === to) return amt;

    for (const [u1, u2, conv] of conversions) {
      if (u1 === unit) {
        queue.push([amt / conv, u2]);
      } else if (u2 === unit) {
        queue.push([amt * conv, u1]);
      }
    }
  }
};

const convert = (...args) => console.log(convert2(...args));

const realConversions = [
  '12 inch = 1 ft',
  '1000 m = 1 km',
  '1 mile = 5280 ft',
  '127 cm = 50 inch',
  '1 mile = 1760 yard',
  '100 cm = 1 m',
  '1093.61 yard = 1 km',
];

convert(realConversions, 'ft', 'km'); //-> 3280.8
convert(realConversions, 'm', 'inch'); //-> 0.0254
convert(realConversions, 'yard', 'yard'); //-> 1

const fakeConversions = [
  '11 m = 1 f',
  '2 x = 1 y',
  '2046 f = 100 x',
  '7 x = 1 q',
  '6 q = 7 z',
  '3 y = 1 z',
  '31 z = 100 m',
];

convert(fakeConversions, 'x', 'z'); //-> 6
convert(fakeConversions, 'y', 'm'); //-> 0.93
convert(fakeConversions, 'f', 'q'); // 143.22
