const directions = [
  [0, 1], // right
  [1, 0], // down
  [0, -1], // left
  [-1, 0], // up
];

// a helper function for getting the index of the basin at (x, y)
const getIndexOfBasin = (arr, size, x, y) => {
  const currentIndex = y * size + x;
  const currentHeight = arr[currentIndex];

  // get an array of the heights of neighboring cells: [right, down, left, up]
  const neighborHeights = directions.map(([dx, dy]) => {
    const nx = x + dx; // calculate coordinates of the neighbor
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= size || ny >= size) return Infinity; // if the neighbor is off the map, it has height Infinity
    return arr[ny * size + nx];
  });

  // if all the surrounding cells are higher OR they are the same but up or left, this is the "bottom" of the basin, return the index of the cell
  const isBasin = neighborHeights.every(
    (n, i) => n > currentHeight || (n === currentHeight && i > 1)
  );
  if (isBasin) return currentIndex;

  // otherwise, find the index of the lowest one
  const indexOfLowest = neighborHeights.reduce(
    (m, x, i) => (x < neighborHeights[m] ? i : m),
    0
  );

  // return the index of the basin of the lowest neighbor (I love recursion!)
  const [dx, dy] = directions[indexOfLowest];
  return getIndexOfBasin(arr, size, x + dx, y + dy); // note: we end up calculating the index of a basin multiple times for various cells. If performance was a concern, we could memoize this function.
};

// the main function
// given a string of space-separated numbers where the first is the square size and the rest are elevations...
const getBasins = (str) => {
  // parse the input
  const [size, ...elevations] = str.split(' ').map(Number);

  // keep track of how many cells belong to the same basins. If 3 cells' basins are at index 5, this would have {5: 3} in it, among other indexes.
  const counts = {};
  for (let i = 0; i < elevations.length; i++) {
    const basinIndex = getIndexOfBasin(
      elevations,
      size,
      i % size, // x coordinate
      Math.floor(i / size) // y coordinate
    );

    if (!counts[basinIndex]) counts[basinIndex] = 0;
    counts[basinIndex]++; // increment the counter for the appropriate basin index
  }

  // take the counts, sort them, turn the list into a string, return it
  return Object.values(counts)
    .sort((a, b) => b - a)
    .join(' ');
};

// tests
console.log(getBasins('3 1 5 2 2 4 7 3 6 9'), '= 7 2');
console.log(getBasins('1 10'), '= 1');
console.log(
  getBasins('5 1 0 2 5 8 2 3 4 7 9 3 5 7 8 9 1 2 5 4 3 3 3 5 2 1'),
  '= 11 7 7'
);
console.log(getBasins('4 0 2 1 3 2 1 0 4 3 3 3 3 5 5 2 1'), '= 7 5 4');
console.log(getBasins('2 1 1 1 1'), '= 4'); // extra test for all the same level
