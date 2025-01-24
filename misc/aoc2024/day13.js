const input = `Button A: X+94, Y+34
Button B: X+22, Y+67
Prize: X=8400, Y=5400

Button A: X+26, Y+66
Button B: X+67, Y+21
Prize: X=12748, Y=12176

Button A: X+17, Y+86
Button B: X+84, Y+37
Prize: X=7870, Y=6450

Button A: X+69, Y+23
Button B: X+27, Y+71
Prize: X=18641, Y=10279`
  .split('\n\n')
  .map((s) => {
    const [ax, ay, bx, by, px, py] = s.match(/\d+/g).map(Number);
    return {ax, ay, bx, by, px, py};
  });

const aCost = 3;
const bCost = 1;

// const solve = ({ax, ay, bx, by, px, py}) => {
//   for (let b = Math.floor(Math.min(px / bx, py / by)); b >= 0; b--) {
//     const rx = (px - b * bx) / ax;
//     if (rx === (py - b * by) / ay) return aCost * rx + b * bCost;
//   }
//   return 0;
// };

const solve = ({ax, ay, bx, by, px, py}) => {
  const den = ax * by - bx * ay;
  const aa = (px * by - ay * py) / den;
  const bb = (ax * py - bx * px) / den;
  console.log({a: aa, b: bb});
  return aa * aCost + bb * bCost;
};

console.log(input.map(solve));
