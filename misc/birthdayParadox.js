// const runTrial = (numDays, target) => {
//   const counts = new Array(numDays).fill(0);
//   let total = 0;
//   let birthday;
//   do {
//     birthday = Math.floor(Math.random() * numDays);
//     counts[birthday]++;
//     total++;
//   } while (counts[birthday] < target);

//   return total - 1;
// };

// console.time();
// const numTrials = 1e6;
// let sum = 0;
// for (let i = 0; i < numTrials; i++) {
//   sum += runTrial(365, 2);
// }
// console.log(sum / numTrials);
// console.timeEnd();

const numDays = 365;
const target = 2;

const runTrial = (numPeople) => {
  const counts = new Array(numDays).fill(0);
  for (let i = 0; i < numPeople; i++) {
    const birthday = Math.floor(Math.random() * numDays);
    if (++counts[birthday] === target) return true;
  }
  return false;
};

const numTrials = 1e4;

for (let i = 0; i < 200; i++) {
  let total = 0;
  for (let j = 0; j < numTrials; j++) total += runTrial(i);
  console.log(`${i} people: ${((total / numTrials) * 100).toFixed(1)}%`);
}
