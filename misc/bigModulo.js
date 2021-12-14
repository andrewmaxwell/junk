const modulo = (s, n) =>
  s.split('').reduce((r, t) => (r * 10 + Number(t)) % n, 0);

const remainder = modulo(
  '29347561222837465869938344239823489623845712874523849345345023498243775868796799483827',
  10
);

console.log(remainder);
