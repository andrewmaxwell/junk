const input = `190: 10 19
3267: 81 40 27
83: 17 5
156: 15 6
7290: 6 8 6 15
161011: 16 10 13
192: 17 8 14
21037: 9 7 18 13
292: 11 6 16 20`
  .split('\n')
  .map((r) => r.split(/:? /).map(Number));

const part1 = input
  .filter(([res, ...args]) =>
    [...Array(2 ** (args.length - 1)).keys()].some(
      (i) =>
        args.reduce((res, a, j) => (i & (1 << (j - 1)) ? res + a : res * a)) ===
        res
    )
  )
  .reduce((sum, r) => sum + r[0], 0);

console.log('part1', part1);

//////////

const part2 = input
  .filter(([res, ...args]) =>
    [...Array(3 ** (args.length - 1)).keys()].some(
      (i) =>
        [...i.toString(3).padStart(args.length - 1, '0')].reduce(
          (res, d, j) => {
            if (d == 0) return res + args[j + 1];
            if (d == 1) return res * args[j + 1];
            return +(String(res) + String(args[j + 1]));
          },
          args[0]
        ) === res
    )
  )
  .reduce((sum, r) => sum + r[0], 0);

console.log('part2', part2);
