function recoverSecret(triplets) {
  const graph = {};
  for (const t of triplets) {
    for (const u of t) graph[u] = new Set();
  }
  for (const [a, b, c] of triplets) {
    graph[c].add(a).add(b);
    graph[b].add(a);
  }

  let result = '';
  while (Object.keys(graph).length) {
    for (const letter in graph) {
      if (graph[letter].size) continue;
      result += letter;
      delete graph[letter];
      for (const key in graph) graph[key].delete(letter);
    }
  }
  return result;
}

const {Test} = require('./test');
const secret1 = 'whatisup';
const triplets1 = [
  ['t', 'u', 'p'],
  ['w', 'h', 'i'],
  ['t', 's', 'u'],
  ['a', 't', 's'],
  ['h', 'a', 'p'],
  ['t', 'i', 's'],
  ['w', 'h', 's'],
];

Test.assertEquals(recoverSecret(triplets1), secret1);
