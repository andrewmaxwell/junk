const toNum = (str) =>
  [...str.toLowerCase()].reduce(
    (res, t) => res | (1 << (t.charCodeAt(0) - 97)),
    0
  );

const numOnes = (n) => (n ? (n & 1) + numOnes(n >> 1) : 0);

let shortest = Infinity;

const dfs = (nameList, chosen, num) => {
  if (num === 2 ** 26 - 1) {
    const c = chosen.join(' ');
    if (c.length < shortest) {
      shortest = c.length;
      console.log(c);
    }
    return;
  } else if (chosen.join(' ').length >= shortest) {
    return;
  }

  const nextNames = nameList
    .map((o) => ({
      ...o,
      numNewLetters: numOnes(o.num & ~num),
    }))
    .sort(
      (a, b) =>
        b.numNewLetters - a.numNewLetters || a.name.length - b.name.length
    )
    .slice(0, 10);

  for (const n of nextNames) {
    dfs(nameList, [...chosen, n.name], num | n.num);
  }
};

const go = async () => {
  const response = await fetch(
    'https://www.usna.edu/Users/cs/roche/courses/s15si335/proj1/files.php%3Ff=names.txt&downloadcode=yes'
  );
  const nameList = (await response.text())
    .split(/\s+/)
    .filter((i) => i)
    .sort()
    .map((name) => ({name, num: toNum(name)}));

  // console.log(nameList);

  console.log(dfs(nameList, ['Maxwell'], 0));
};

go();
