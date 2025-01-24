const input = `............
........0...
.....0......
.......0....
....0.......
......A.....
............
............
........A...
.........A..
............
............`.split('\n');

const width = input[0].length;
const height = input.length;

const ants = {};
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const t = input[y][x];
    if (t !== '.') (ants[t] ||= []).push({x, y});
  }
}

const part1Locations = new Set();
const part2Locations = new Set();

const add = (x, y, set) => {
  if (x >= 0 && y >= 0 && x < width && y < height) set.add(x + ',' + y);
};

for (const arr of Object.values(ants)) {
  for (let i = 1; i < arr.length; i++) {
    const a = arr[i];
    for (let j = 0; j < i; j++) {
      const b = arr[j];

      add(2 * a.x - b.x, 2 * a.y - b.y, part1Locations);
      add(2 * b.x - a.x, 2 * b.y - a.y, part1Locations);

      for (let k = 0; k < height; k++) {
        add(a.x - k * (b.x - a.x), a.y - k * (b.y - a.y), part2Locations);
        add(b.x + k * (b.x - a.x), b.y + k * (b.y - a.y), part2Locations);
      }
    }
  }
}
console.log('part1', part1Locations.size);
console.log('part2', part2Locations.size);
