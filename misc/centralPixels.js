const dirs = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];

const isEdge = (pixels, width, height, x, y, color) => {
  for (const [dx, dy] of dirs) {
    const xx = x + dx;
    const yy = y + dy;
    if (
      xx < 0 ||
      yy < 0 ||
      xx >= width ||
      yy >= height ||
      pixels[yy * width + xx] !== color
    )
      return true;
  }
};

const central_pixels = ({pixels, width, height}, color) => {
  const q = [];
  const dists = {};
  for (let i = 0; i < pixels.length; i++) {
    const x = i % width;
    const y = Math.floor(i / width);
    if (pixels[i] === color && isEdge(pixels, width, height, x, y, color)) {
      q.push({x, y});
      dists[i] = 1;
    }
  }

  const res = [];
  let max = 0;
  for (const {x, y} of q) {
    for (const [dx, dy] of dirs) {
      const xx = x + dx;
      const yy = y + dy;
      const ii = yy * width + xx;
      if (
        xx >= 0 &&
        yy >= 0 &&
        xx < width &&
        yy < height &&
        pixels[ii] === color &&
        dists[ii] === undefined
      ) {
        q.push({x: xx, y: yy});
        dists[ii] = dists[y * width + x] + 1;
      }
    }

    const i = y * width + x;
    if (dists[i] > max) {
      max = dists[i];
      res.length = 0;
    }
    if (dists[i] === max) res.push(i);
  }
  return res;
};

//////
class Image {
  constructor(data, w, h) {
    this.pixels = data.slice();
    this.width = w;
    this.height = h;
  }
  copy() {
    return new Image(this.pixels, this.width, this.height);
  }
  toString() {
    const res = [];
    for (let i = 0; i < this.width * this.height; i += this.width) {
      res.push(this.pixels.slice(i, i + this.width).join(''));
    }
    return res.join('\n');
  }
}

const {Test} = require('./test');
var ascending = (a, b) => a - b; // ascending order for sorting

var picture = new Image(
  [
    1,
    1,
    4,
    4,
    4,
    4,
    2,
    2,
    2,
    2,
    1,
    1,
    1,
    1,
    2,
    2,
    2,
    2,
    2,
    2,
    1,
    1,
    1,
    1,
    2,
    2,
    2,
    2,
    2,
    2,
    1,
    1,
    1,
    1,
    1,
    3,
    2,
    2,
    2,
    2,
    1,
    1,
    1,
    1,
    1,
    3,
    3,
    3,
    2,
    2,
    1,
    1,
    1,
    1,
    1,
    1,
    3,
    3,
    3,
    3,
  ],
  10,
  6
);
var image;

console.log(picture.toString());

// Only one red pixel has the maximum depth of 3:
image = picture.copy();
var red_ctr = [32];
Test.assertSimilar(central_pixels(image, 1), red_ctr);

// Multiple blue pixels have the maximum depth of 2:
image = picture.copy();
var blue_ctr = [16, 17, 18, 26, 27, 28, 38];
Test.assertSimilar(central_pixels(image, 2).sort(ascending), blue_ctr);

// All the green pixels have depth 1, so they are all "central":
image = picture.copy();
var green_ctr = [35, 45, 46, 47, 56, 57, 58, 59];
Test.assertSimilar(central_pixels(image, 3).sort(ascending), green_ctr);

// Similarly, all the purple pixels have depth 1:
image = picture.copy();
var purple_ctr = [2, 3, 4, 5];
Test.assertSimilar(central_pixels(image, 4).sort(ascending), purple_ctr);

// There are no pixels with colour 5:
image = picture.copy();
var non_existent_ctr = [];
Test.assertSimilar(central_pixels(image, 5), non_existent_ctr);
