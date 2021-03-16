const input = '19,x,x,x,x,x,x,x,x,41,x,x,x,x,x,x,x,x,x,523,x,x,x,x,x,x,x,x,x,x,x,x,x,x,x,x,17,13,x,x,x,x,x,x,x,x,x,x,29,x,853,x,x,x,x,x,37,x,x,x,x,x,x,x,x,x,x,x,x,x,x,x,x,23'
  .split(',')
  .map((n, i) => ({n: Number(n), i}))
  .filter(({n}) => n);

console.log(input);


const t = 0;

const a = t % 19 === 0 && (t + 9) % 41 === 0


for (let i = 0; true; i += 19) {
  if ()
}