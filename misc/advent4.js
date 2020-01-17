const hasDoubles = str => {
  // for (let i = 1; i < str.length; i++) {
  //   if (str[i] === str[i - 1]) return true;
  // }
  // return false;

  let count = 1;
  for (let i = 1; i < str.length; i++) {
    if (str[i] === str[i - 1]) {
      count++;
    } else {
      if (count === 2) return true;
      count = 1;
    }
  }
  return count === 2;
};

const hasDecreasing = str => {
  for (let i = 1; i < str.length; i++) {
    if (str[i - 1] > str[i]) return true;
  }
  return false;
};

let count = 0;
for (let i = 172851; i <= 675869; i++) {
  const str = i.toString();
  if (hasDoubles(str) && !hasDecreasing(str)) count++;
}

console.log(count);
