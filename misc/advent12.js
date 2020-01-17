const input = `<x=6, y=10, z=10>
<x=-9, y=3, z=17>
<x=9, y=-4, z=14>
<x=4, y=14, z=4>`
  .split('\n')
  .map(r => new Int16Array([...r.match(/-?\d+/g).map(Number), 0, 0, 0]));

// const sum = arr => arr.reduce((r, v) => r + v, 0);

// const totalEnergy = arr =>
//   sum(
//     arr.map(
//       a => sum(a.slice(0, 3).map(Math.abs)) * sum(a.slice(3).map(Math.abs))
//     )
//   );

const step = arr => {
  for (let i = 1; i < arr.length; i++) {
    const a = arr[i];
    for (let j = 0; j < i; j++) {
      const b = arr[j];
      const dx = a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0;
      const dy = a[1] < b[1] ? 1 : a[1] > b[1] ? -1 : 0;
      const dz = a[2] < b[2] ? 1 : a[2] > b[2] ? -1 : 0;
      a[3] += dx;
      b[3] -= dx;
      a[4] += dy;
      b[4] -= dy;
      a[5] += dz;
      b[5] -= dz;
    }
  }
  for (let i = 0; i < arr.length; i++) {
    const a = arr[i];
    a[0] += a[3];
    a[1] += a[4];
    a[2] += a[5];
  }
};

const res = [];
const seen = [{}, {}, {}];
for (let i = 0; i < 1e6; i++) {
  for (let j = 0; j < 3; j++) {
    if (res[j]) continue;
    const str = input.map(o => [o[j], o[j + 3]]).toString();
    if (seen[j][str]) res[j] = i - 1;
    seen[j][str] = i;
  }
  step(input);
}

console.log(res);

const gcd = (a, b) => (b ? gcd(b, a % b) : a);
const lcm = (x, y) => (x && y ? Math.abs((x * y) / gcd(x, y)) : 0);

console.log(res.reduce(lcm));

// x 231615 * 116329 * 102357
// y 116329
// z 102357

// const w = (window.C.width = innerWidth);
// const h = (window.C.height = innerHeight);
// const T = window.C.getContext('2d');

// const iterate = () => {
//   requestAnimationFrame(iterate);
//   T.globalAlpha = 0.02;
//   T.fillRect(0, 0, w, h);
//   T.globalAlpha = 1;
//   T.save();
//   T.translate(w / 2, h / 2);
//   input.forEach(([x, y, z], i) => {
//     // -50: 10, 0 -> 2, 50: 0.1
//     const rad = 400 / (y + 200);
//     T.fillStyle = `hsl(${(i / 4) * 360}, 100%, 50%)`;
//     T.fillRect(x - rad, z - rad, 2 * rad, 2 * rad);
//   });
//   // T.beginPath();
//   // input.forEach(([x, y, z, xs, ys, zs]) => {
//   //   T.moveTo(x, y);
//   //   T.lineTo(x + xs, y + ys);
//   // });
//   T.stroke();
//   T.restore();

//   step(input);
// };

// iterate();
// window.onkeypress = iterate;
