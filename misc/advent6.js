const numOrbits = data => {
  // const q = [{n: 'COM', d: 0}];
  // let total = 0;
  // for (let i = 0; i < q.length; i++) {
  //   const {n, d} = q[i];
  //   for (let j = 0; j < data.length; j++) {
  //     const [a, b] = data[j];
  //     if (a === n && q.every(x => x.n !== b)) {
  //       q.push({n: b, d: d + 1});
  //       total += d + 1;
  //     }
  //   }
  // }
  // return total;
  const q = [{n: 'YOU', d: 0}];
  for (let i = 0; i < q.length; i++) {
    const {n, d} = q[i];
    if (n === 'SAN') return d - 2;
    for (let j = 0; j < data.length; j++) {
      const [a, b] = data[j];
      if (a === n && q.every(x => x.n !== b)) {
        q.push({n: b, d: d + 1});
      }
      if (b === n && q.every(x => x.n !== a)) {
        q.push({n: a, d: d + 1});
      }
    }
  }
};

const parse = str => str.split('\n').map(r => r.split(')'));

const input = `COM)B
B)C
C)D
D)E
E)F
B)G
G)H
D)I
E)J
J)K
K)L
K)YOU
I)SAN`;
console.log(numOrbits(parse(input)));
