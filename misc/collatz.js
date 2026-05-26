// console.time('Search Time');

// // 10 million elements (20MB) perfectly pins the M4's L3 cache
// const CACHE_SIZE = 10_000_000;
// const cache = new Uint16Array(CACHE_SIZE);

// // Pre-fill base cases to prevent our jump logic from ever hitting 1 or 2
// cache[1] = 0;
// cache[2] = 1;

// let maxSteps = 0;
// let i = 3;

// while (true) {
//   let steps = 0;
//   let n = i;

//   // By taking the max of `i` and `CACHE_SIZE`, we ensure that `n`
//   // stops as soon as it enters our pre-calculated safe zone.
//   let limitThreshold = i < CACHE_SIZE ? i : CACHE_SIZE;

//   // We only loop while n is above our known threshold.
//   // Because limitThreshold is at least 3, n will NEVER evaluate 1 or 2 here.
//   while (n >= limitThreshold) {
//     let rem = n & 3;

//     if (rem === 0) {
//       n /= 4;
//       steps += 2;
//     } else if (rem === 1) {
//       n = (n * 3 + 1) / 4;
//       steps += 3;
//     } else if (rem === 2) {
//       // NEW MATH SHORTCUT: If n % 4 == 2, we know the exact next 3 steps!
//       // sequence: (even) -> (odd) -> (even)
//       n = (n * 3 + 2) / 4;
//       steps += 3;
//     } else {
//       n = (n * 9 + 5) / 4;
//       steps += 4;
//     }
//   }

//   // Add whatever remaining steps are stored in the fast L3 cache
//   steps += cache[n];

//   // Populate cache if we are still in the first 10 million
//   if (i < CACHE_SIZE) {
//     cache[i] = steps;
//   }

//   // Log record-breakers so you aren't staring at a blank console
//   if (steps > maxSteps) {
//     maxSteps = steps;
//     console.log(
//       `New record: ${i.toLocaleString()} takes ${maxSteps.toLocaleString()} steps`,
//     );
//   }

//   // Target condition
//   if (steps >= 1000) {
//     console.log(`\n🎉 TARGET REACHED!`);
//     console.log(
//       `The smallest number with at least 1,000 Collatz steps is ${i.toLocaleString()} (${steps} steps).`,
//     );
//     break;
//   }

//   i++;
// }

// console.timeEnd('Search Time');

let n = 1412987847;
let stepCount = 0;

let maxVal = n;
let minVal = n;

console.log(`Starting Number: ${n.toLocaleString()}`);

while (n > 1) {
  if (n % 2 === 0) {
    n /= 2;
  } else {
    n = n * 3 + 1;
  }
  stepCount++;

  if (n > maxVal) {
    maxVal = n;
    console.log(`${stepCount}: ${maxVal.toLocaleString()}`);
  }

  if (n < minVal) {
    minVal = n;
    console.log(`${stepCount}: ${minVal.toLocaleString()}`);
  }
}

console.log(`\nSequence completed in ${stepCount} steps.`);
