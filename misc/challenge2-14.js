// console.clear();

// const split = n => {
//   const result = [];
//   for (let i = n + 1; i <= 5; i++) result.push(i);
//   return result;
// };

// const graph = {}; // map on state to its possible next states
// const q = ['1']; // keep track of which states we've seen
// for (let i = 0; i < q.length; i++) {
//   const envelope = q[i].split('').map(Number);

//   const nextStates = [];
//   const seen = {};
//   for (let j = 0; j < envelope.length; j++) {
//     if (seen[envelope[j]]) continue;
//     seen[envelope[j]] = true;

//     const newEnv = envelope.slice();
//     newEnv.splice(j, 1, ...split(envelope[j]));

//     if (newEnv.length) {
//       const newState = newEnv.sort((a, b) => a - b).join('');
//       nextStates.push(newState);
//       if (!q.includes(newState)) q.push(newState);
//     }
//   }

//   graph[q[i]] = nextStates;
// }

// let possibilities = [['1']]; // the array of all possible paths
// for (let i = 0; i < possibilities.length; i++) {
//   const cur = possibilities[i];
//   for (let n of graph[cur[cur.length - 1]]) possibilities.push(cur.concat(n));
// }

// possibilities = possibilities.filter(p => p.length === 16); // remove incomplete ones
// console.log('Number of possibilities:', possibilities.length);

// let total = 0;
// for (const p of possibilities) {
//   for (let i = 1; i < 15; i++) {
//     // ignore first and last
//     if (p[i].length === 1) total++;
//   }
// }

// // console.log(possibilities.map(p => p.join(' ')).join('\n'));

// console.log(
//   'Probability of finding one sheet in the envelope (not counting first of last:',
//   ((100 * total) / possibilities.length / 14).toFixed(2) + '%'
// );

// DRAW A PRETTY PICTURE!

// const vals = {1: 16, 2: 8, 3: 4, 4: 2, 5: 1};
// const getLevel = str => 17 - str.split('').reduce((sum, v) => sum + vals[v], 0);

// const groups = Object.values(
//   q.reduce((groups, item) => {
//     const key = getLevel(item);
//     (groups[key] = groups[key] || []).push(item);
//     return groups;
//   }, {})
// );

// const sum = arr => arr.reduce((a, b) => a + b, 0);

// const margin = 50;

// const canvas = document.querySelector('canvas');
// const width = (canvas.width = 800);
// const height = (canvas.height = 1200);
// const T = canvas.getContext('2d');

// T.font = '18px sans-serif';
// T.fillStyle = 'white';
// T.fillRect(0, 0, width, height);
// T.fillStyle = 'black';

// const nodes = {};
// groups.forEach((g, i) => {
//   g.sort();
//   const widths = g.map(s => T.measureText(s).width);
//   const spacing = (width - 2 * margin - sum(widths)) / g.length;
//   const y = margin + (i * (height - 2 * margin)) / (groups.length - 1);
//   let x = margin + spacing / 2;
//   groups[i] = g.map((s, j) => {
//     T.fillText(s, x - widths[j] / 2, y + 9);
//     nodes[s] = {x, y};
//     x += spacing + widths[j];
//   });
// });

// T.lineWidth = 0.25;
// T.beginPath();
// for (const s in nodes) {
//   for (const n of graph[s]) {
//     T.moveTo(nodes[s].x, nodes[s].y);
//     T.lineTo(nodes[n].x, nodes[n].y);
//   }
// }
// T.stroke();

// const splits = {
//   1: [2, 3, 4, 5],
//   2: [3, 4, 5],
//   3: [4, 5],
//   4: [5],
//   5: []
// };

// const oneWeek = () => {
//   let result = 0;
//   let envelope = splits[1].slice();
//   while (envelope.length) {
//     if (envelope.length === 1) {
//       result++;
//       envelope = splits[envelope[0]].slice();
//     } else {
//       const index = Math.floor(Math.random() * envelope.length);
//       const chosen = envelope.splice(index, 1)[0];
//       envelope.push(...splits[chosen]);
//     }
//   }
//   return result - 1;
// };

// let total = 0;
// let count = 0;

// while (true) {
//   total += oneWeek();
//   count++;
//   if (count % 1e6 === 0) console.log(total / count);
// }

const split = n => {
  const result = [];
  for (let i = n + 1; i <= 5; i++) result.push(i);
  return result;
};

const lookup = {5: 0};

const solve = curr => {
  if (curr in lookup) return lookup[curr];

  let result = curr.length === 1 ? 1 : 0;
  for (let i = 0; i < curr.length; i++) {
    const next = curr.slice();
    next.splice(i, 1, ...split(curr[i]));
    result += solve(next.sort()) / curr.length;
  }
  return (lookup[curr] = result);
};

console.log(solve(split(1)).toFixed(6));
