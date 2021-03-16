const dirs = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
  // [1, 1],
  // [-1, 1],
  // [-1, -1],
  // [1, -1],
];

const findPath = (str) => {
  const map = str.split('\n').map((r) => r.split(''));
  const start = [
    map.find((r) => r.includes('S')).indexOf('S'),
    map.findIndex((r) => r.includes('S')),
  ];
  const seen = map.map(() => []);
  const q = [{curr: start, dist: 0}];

  for (const {curr, dist} of q) {
    for (const [dx, dy] of dirs) {
      const n = [curr[0] + dx, curr[1] + dy];
      const char = (map[n[1]] || {})[n[0]];
      if (char === 'E') return dist + 1;
      if (char === ' ' && !seen[n[1]][n[0]]) {
        seen[n[1]][n[0]] = true;
        q.push({curr: n, dist: dist + 1});
      }
    }
  }
};

const result = findPath(
  `
###############################
#         #                   #
# S       #    ############## #
#         #  ###              #
######    #    ####    ########
#                 #    #   E  #
#  ################    #      #
#           #                 #
###############################
`.trim()
);

console.log(result);
