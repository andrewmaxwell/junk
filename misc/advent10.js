const input = `
.#.####..#.#...#...##..#.#.##.
..#####.##..#..##....#..#...#.
......#.......##.##.#....##..#
..#..##..#.###.....#.#..###.#.
..#..#..##..#.#.##..###.......
...##....#.##.#.#..##.##.#...#
.##...#.#.##..#.#........#.#..
.##...##.##..#.#.##.#.#.#.##.#
#..##....#...###.#..##.#...##.
.###.###..##......#..#...###.#
.#..#.####.#..#....#.##..#.#.#
..#...#..#.#######....###.....
####..#.#.#...##...##....#..##
##..#.##.#.#..##.###.#.##.##..
..#.........#.#.#.#.......#..#
...##.#.....#.#.##........#..#
##..###.....#.............#.##
.#...#....#..####.#.#......##.
..#..##..###...#.....#...##..#
...####..#.#.##..#....#.#.....
####.#####.#.#....#.#....##.#.
#.#..#......#.........##..#.#.
#....##.....#........#..##.##.
.###.##...##..#.##.#.#...#.#.#
##.###....##....#.#.....#.###.
..#...#......#........####..#.
#....#.###.##.#...#.#.#.#.....
.........##....#...#.....#..##
###....#.........#..#..#.#.#..
##...#...###.#..#.###....#.##.`
  .trim()
  .split('\n')
  .map(r => r.split('').map(v => v === '#'));

const gcd = (a, b) => (b ? gcd(b, a % b) : a);
// const lcm = (x, y) => x &&(!x || !y) ? 0 : Math.abs((x * y) / lcm(x, y));

const sum = arr => arr.reduce((r, v) => r + v, 0);

const numVisible = (input, y, x) => {
  input = input.map(r => r.slice());
  for (let i = 0; i < input.length; i++) {
    for (let j = 0; j < input[0].length; j++) {
      const dy = i - y;
      const dx = j - x;
      const m = 1 / Math.abs(gcd(dy, dx));
      if ((dx || dy) && input[i][j]) {
        for (
          let yy = y + dy + dy * m, xx = x + dx + dx * m;
          yy >= 0 && yy < input.length && xx >= 0 && xx < input[0].length;
          xx += dx * m, yy += dy * m
        ) {
          input[yy][xx] = false;
        }
      }
    }
  }
  // console.log(
  //   input
  //     .map((r, i) =>
  //       r.map((v, j) => (i === y && j === x ? 'O' : v ? '#' : '.')).join('')
  //     )
  //     .join('\n'),
  //   '\n\n'
  // );
  return sum(input.map(sum)) - 1;
};

const go = input => {
  let max = 0;
  let best;
  for (let i = 0; i < input.length; i++) {
    for (let j = 0; j < input[0].length; j++) {
      if (input[i][j]) {
        const n = numVisible(input, i, j);
        if (n > max) {
          max = n;
          best = {x: j, y: i};
        }
      }
    }
  }
  // return max;

  let asteroids = [];
  for (let i = 0; i < input.length; i++) {
    for (let j = 0; j < input[0].length; j++) {
      if ((i !== best.y || j !== best.x) && input[i][j]) {
        asteroids.push({
          x: j,
          y: i,
          dist: Math.hypot(i - best.y, j - best.x),
          angle:
            (Math.atan2(i - best.y, j - best.x) + Math.PI * 2.5) % (Math.PI * 2)
        });
      }
    }
  }

  asteroids.sort((a, b) => a.angle - b.angle || a.dist - b.dist);

  let num = 1;
  let temp = asteroids.slice();
  while (temp.length) {
    let lastAngle;
    temp = temp.filter(a => {
      if (a.angle === lastAngle) return true;
      lastAngle = a.angle;
      a.num = num++;
      return false;
    });
  }

  asteroids.sort((a, b) => a.num - b.num);
  return asteroids[199];

  const lookup = asteroids.reduce((res, a) => {
    res[a.y + '-' + a.x] = a.num;
    return res;
  }, {});

  console.log(
    input
      .map((r, i) =>
        r
          .map((v, j) =>
            String(
              i === best.y && j === best.x ? 'X' : lookup[i + '-' + j] || '.'
            ).padStart(4)
          )
          .join('')
      )
      .join('\n'),
    '\n\n'
  );
};

console.log(go(input));
