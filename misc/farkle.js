// Rules: https://www.playmonster.com/wp-content/uploads/2018/06/Farkle-Rules.pdf?srsltid=AfmBOoq6RdCUdBAvAGef2ER8id_XO6sofsi9YukvnponO2qLCpXho1B-

/** @param {number} n */
const roll = (n) => {
  const res = [0, 0, 0, 0, 0, 0];
  for (let i = 0; i < n; i++) {
    res[Math.floor(Math.random() * 6)]++;
  }
  return res;
};

/** @param {number[]} diceCounts */
const getScore = (diceCounts) => {
  if (diceCounts.includes(6)) {
    return {score: 3000, num: 6, description: '6 of a number'};
  }
  if (diceCounts.filter((d) => d === 3).length === 2) {
    return {score: 2500, num: 6, description: '2 triplets'};
  }
  if (diceCounts.includes(5)) {
    return {score: 2000, num: 5, description: '5 of a number'};
  }
  if (diceCounts.includes(4) && diceCounts.includes(2)) {
    return {score: 1500, num: 6, description: '4 of a number and a pair'};
  }
  if (diceCounts.filter((d) => d === 2).length === 3) {
    return {score: 1500, num: 6, description: 'three pairs'};
  }
  if (diceCounts.every((d) => d === 1)) {
    return {score: 1500, num: 6, description: 'straight'};
  }
  if (diceCounts.includes(4)) {
    return {score: 1000, num: 4, description: '4 of a number'};
  }
  if (diceCounts[5] === 3) return {score: 600, num: 3, description: 'three 6s'};
  if (diceCounts[4] === 3) return {score: 500, num: 3, description: 'three 5s'};
  if (diceCounts[3] === 3) return {score: 400, num: 3, description: 'three 4s'};
  if (diceCounts[2] === 3) return {score: 300, num: 3, description: 'three 3s'};
  if (diceCounts[1] === 3) return {score: 200, num: 3, description: 'three 2s'};
  if (diceCounts[0] === 3) return {score: 300, num: 3, description: 'three 1s'};

  if (diceCounts[0] === 2) return {score: 200, num: 2, description: 'two 1s'};
  if (diceCounts[4] === 2) return {score: 100, num: 2, description: 'two 5s'};

  if (diceCounts[0] === 1) return {score: 100, num: 1, description: 'one 1'};
  if (diceCounts[4] === 1) return {score: 50, num: 1, description: 'one 5'};

  return {score: 0, num: 0, description: 'farkle'};
};

const turn = () => {
  let numDice = 6;
  // let totalScore = 0;
  for (let i = 0; i < Infinity; i++) {
    const diceCounts = roll(numDice);
    const {score, num} = getScore(diceCounts);
    // totalScore += score;
    numDice = num === numDice ? 6 : numDice - num;
    if (!score) return i;
  }
  return 0;
};

const trials = 1e7;

let total = 0;
for (let i = 0; i < trials; i++) {
  total += turn();
}
console.log(total / trials);

// /** @type {Record<string, number>} */
// const scores = {};
// for (let i = 0; i < trials; i++) {
//   const s = turn();
//   scores[s] = (scores[s] ?? 0) + 1;
// }

// // const result = Object.entries(scores)
// //   .sort((a, b) => +b[0] * b[1] - +a[0] * a[1])
// //   .map(
// //     ([score, count]) =>
// //       `${score.padStart(5)}: ${((count / trials) * 100).toLocaleString()}%`,
// //   )
// //   .join('\n');
// // console.log(result);
