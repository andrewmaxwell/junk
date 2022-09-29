const countAndSay = (n) => {
  if (n === 1) return '1';
  const prev = countAndSay(n - 1);
  let result = '';
  let count = 0;
  for (let i = 0; i < prev.length; i++) {
    if (i < prev.length - 1 && prev[i] === prev[i + 1]) count++;
    else {
      result += 1 + count + prev[i];
      count = 0;
    }
  }
  return result;
};

countAndSay(30);
