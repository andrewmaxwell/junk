// This is a general purpose implementation of the simulated annealing algorithm. It starts out hot and on each iteration, it gets a little cooler. When it's hot, it has a high probabilty of moving toward a less optimal state. As it cools, the probability of moving toward less optimal states goes down. At the end, it is only moving toward strictly better states. This makes it more likely to find an optimal solution instead of finding a local minimum.
const simulateAnnealing = ({
  initialState, // a random (or not) state
  getCost, // a function that takes a state and returns how much it "costs"
  getNextState, // a function that takes a state and returns a similar state. Ideally, we want to minimize the number of times this function would need to be called to get from any state to any other state.
  maxIterations, // the bigger this number, the more likely to find the optimal solution, but there are diminishing returns
  startingTemp, // this number should be big enough that it will jump out of any possible local minima
}) => {
  let state = initialState;
  let cost = getCost(state);
  for (let i = 0; i < maxIterations; i++) {
    const nextState = getNextState(state);
    const nextCost = getCost(nextState);
    if (
      nextCost <= cost ||
      Math.random() <
        Math.exp(
          (cost - nextCost) / (startingTemp * (i / maxIterations - 1) ** 2)
        )
    ) {
      state = nextState;
      cost = nextCost;
    }
  }

  return {state, cost};
};

const dirs = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];

const getDistToHouse = (startCoord, end, board) => {
  const q = [{coord: startCoord, dist: 0}];
  const seen = {};
  for (const {coord, dist} of q) {
    for (const [dx, dy] of dirs) {
      if (!board[coord[1] + dy]) continue;
      const n = [coord[0] + dx, coord[1] + dy];
      if (board[n[1]][n[0]] == end) return dist;
      if ('-tT'.includes(board[n[1]][n[0]]) && !seen[n]) {
        q.push({coord: n, dist: dist + 1});
        seen[n] = true;
      }
    }
  }
  throw new Error(`Could not find path from ${startCoord} to ${end}`);
};

const getDistBetweenTwoHouses = (start, end, board) => {
  if (start === end) return 0;
  const startCoord = [
    board.find((r) => r.includes(start)).indexOf(start),
    board.findIndex((r) => r.includes(start)),
  ];
  return getDistToHouse(startCoord, end, board);
};

const STREET_TIME = 15;
const HOUSE_TIME = 120;

// given a time of arrival and a schedule of when other trick-or-treaters will arrive, return when the others will be gone
const getVisitTime = (time, schedule) => {
  const v =
    schedule && schedule.find((s) => s <= time && s + HOUSE_TIME > time);
  return v ? getVisitTime(v + HOUSE_TIME, schedule) : time;
};

const getTotalTimeForRoute = (route, distances, visitSchedule, debug) => {
  let current = 0; // start at 0
  let time = 0;
  for (const next of route) {
    time += distances[current][next] * STREET_TIME;
    const v = getVisitTime(time, visitSchedule[next]);
    if (debug && v > time) console.log(`Waited ${v - time} to visit ${next}`);
    time = v + HOUSE_TIME;
    current = next;
  }
  return time + distances[current][0] * STREET_TIME; // end at 0
};

const getSimilarRoute = (route) => {
  // reverses a random subset of the route
  const newPath = route.slice();
  const n = Math.floor(Math.random() * route.length);
  let m;
  do {
    m = Math.floor(Math.random() * route.length);
  } while (m === n);
  let start = Math.min(n, m);
  let end = Math.max(n, m);
  while (start < end) {
    newPath[start] = route[end];
    newPath[end] = route[start];
    start++;
    end--;
  }
  return newPath;
};

const getVisitSchedule = (board, houses, distances) =>
  board
    .flatMap((r, y) => r.map((c, x) => ({c, x, y})))
    .filter((t) => 'tT'.includes(t.c))
    .flatMap(({c, x, y}) => {
      const ascending = c === 'T'; // descending is lowercase
      const {h: firstHouse, dist: firstDist} = houses
        .map((h) => ({h, dist: getDistToHouse([x, y], h, board)}))
        .reduce(
          (p, x) =>
            x.dist < p.dist ||
            (x.dist === p.dist && (ascending ? x.h > p.h : x.h < p.h))
              ? x
              : p,
          {dist: Infinity}
        );

      const route = [
        ...houses.slice(firstHouse + 1), // don't include firstHouse
        ...houses.slice(0, firstHouse),
      ];
      if (!ascending) route.reverse();

      let time = firstDist * STREET_TIME + HOUSE_TIME;
      let current = firstHouse;
      // console.log(
      //   `${[c, x, y]} visits ${current} ${time - HOUSE_TIME}-${time}`
      // );
      return [
        {h: current, t: time - HOUSE_TIME},
        ...route.map((next) => {
          time += distances[current][next] * STREET_TIME + HOUSE_TIME;
          current = next;
          // console.log(
          //   `${[c, x, y]} visits ${current} ${time - HOUSE_TIME}-${time}`
          // );
          return {h: current, t: time - HOUSE_TIME};
        }),
      ];
    })
    .sort((a, b) => a.t - b.t)
    .reduce((res, {h, t}) => {
      (res[h] = res[h] || []).push(t);
      return res;
    }, {});

const go = ({input, maxIterations, startingTemp}) => {
  const board = input
    .trim()
    .split('\n')
    .map((r) =>
      r
        .trim()
        .split(',')
        .map((n) => (isNaN(n) ? n : Number(n)))
    );

  const houses = board
    .flat()
    .filter((n) => !isNaN(n))
    .sort((a, b) => a - b);
  const distances = houses.map((h1) =>
    houses.map((h2) => getDistBetweenTwoHouses(h1, h2, board))
  );

  const visitSchedule = getVisitSchedule(board, houses, distances);

  const {state, cost} = simulateAnnealing({
    initialState: houses.filter((h) => h), // don't include 0
    getCost: (currentRoute) =>
      getTotalTimeForRoute(currentRoute, distances, visitSchedule),
    getNextState: getSimilarRoute,
    maxIterations,
    startingTemp,
  });

  console.log(
    board.map((r) => r.map((c) => String(c).padEnd(2)).join('')).join('\n')
  );
  console.log(`The best route is ${state}, which takes ${cost} seconds\n\n`);

  // log out when they waited by passing debug=true
  getTotalTimeForRoute(state, distances, visitSchedule, true);
};

const tests = [
  {
    input: `
      X,X,1,X,2,X,X
      -,-,-,-,-,-,-
      -,X,0,X,3,X,-
      -,9,X,X,X,4,-
      -,X,8,X,6,X,-
      -,-,-,-,-,-,-
      X,X,7,X,5,X,X
  `,
    maxIterations: 1e6,
    startingTemp: 1e5,
  },
  {
    input: `
      X,X,1,X,2,X,X
      -,-,-,-,-,-,-
      -,X,0,X,3,X,t
      -,9,X,X,X,4,-
      -,X,8,X,6,X,-
      -,-,-,-,-,-,-
      X,X,7,X,5,X,X
  `,
    maxIterations: 1e6,
    startingTemp: 1e5,
  },
  {
    input: `
      x,x,2,x,4,x,x,x,8,x,10,x,x
      -,-,-,t,-,T,-,-,-,-,-,-,-
      -,x,0,x,3,x,-,x,7,x,9,x,T
      -,1,x,x,x,5,-,6,x,x,x,11,-
      -,x,18,x,16,x,T,x,14,x,12,x,-
      -,-,-,T,-,-,-,t,-,-,-,-,-
      -,x,19,x,17,x,-,x,15,x,13,x,-
      -,20,x,x,x,25,-,26,x,x,x,31,-
      t,x,21,x,23,x,-,x,27,x,29,x,-
      -,-,-,t,-,T,-,-,-,-,-,-,-
      x,x,22,x,24,x,x,x,28,x,30,x,x
  `,
    maxIterations: 1e7,
    startingTemp: 1e6,
  },
];

tests.forEach(go);
