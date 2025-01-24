const input = `47|53
97|13
97|61
97|47
75|29
61|13
75|53
29|13
97|29
53|29
61|53
97|53
61|29
47|13
75|47
97|75
47|61
75|61
47|29
75|13
53|13

75,47,61,53,29
97,61,53,29,13
75,29,13
75,97,47,61,53
61,13,29
97,13,75,29,47`;

const [top, bottom] = input.split('\n\n');
const pairs = top.split('\n').map((r) => r.split('|').map((d) => +d));
const updates = bottom.split('\n').map((r) => r.split(',').map((d) => +d));

const isValid = (arr) =>
  pairs.every(([a, b]) => {
    const ai = arr.indexOf(a);
    const bi = arr.indexOf(b);
    return ai === -1 || bi === -1 || ai < bi;
  });

const part1 = updates
  .filter(isValid)
  .map((b) => b[Math.floor(b.length / 2)])
  .reduce((a, b) => a + b);

console.log('part1', part1);

//////

const before = (a, b) => pairs.some(([c, d]) => a === c && b === d);

const part2 = updates
  .filter((a) => !isValid(a))
  .map((a) =>
    a.sort((a, b) => {
      if (before(a, b)) return -1;
      if (before(b, a)) return 1;
      return 0;
    })
  )
  .map((b) => b[Math.floor(b.length / 2)])
  .reduce((a, b) => a + b);

console.log('part2', part2);
