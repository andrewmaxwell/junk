class Tree {
  constructor(start, end) {
    this.start = start;
    this.middle = Math.floor((end + start) / 2);
    this.end = end;
    this.val = 0;
    this.touched = [];
  }
  addVal(left, right, val, counter) {
    if (this.start === left && this.end === right) {
      this.val += val;
      this.touched.push(counter);
    } else {
      if (left < Math.min(this.middle, right)) {
        if (!this.left) this.left = new Tree(this.start, this.middle);
        this.left.addVal(left, Math.min(this.middle, right), val, counter);
      }
      if (right > Math.max(this.middle, left)) {
        if (!this.right) this.right = new Tree(this.middle, this.end);
        this.right.addVal(Math.max(this.middle, left), right, val, counter);
      }
    }
    this.total =
      this.val > 0
        ? this.end - this.start
        : (this.left ? this.left.total : 0) +
          (this.right ? this.right.total : 0);
  }
}

const calculate = (recs) => {
  if (!recs.length) return 0;
  const obs = [];
  let minX = Infinity;
  let maxX = -Infinity;
  for (const [left, top, right, bottom] of recs) {
    obs.push({y: top, left, right, val: 1}, {y: bottom, left, right, val: -1});
    minX = Math.min(minX, left);
    maxX = Math.max(maxX, right);
  }
  obs.sort((a, b) => a.y - b.y);

  const tree = new Tree(minX, maxX);
  let result = 0;
  const arr = [];
  for (let i = 0; i < obs.length - 1; i++) {
    const {y, val, left, right} = obs[i];
    tree.addVal(left, right, val, arr.length);
    result += tree.total * (obs[i + 1].y - y);
    arr.push({
      y,
      val,
      left,
      right,
      tree: JSON.parse(JSON.stringify(tree)),
      result,
    });
  }

  return arr;
};

const scale = 30;
const numRectangles = 16;
const msPerFrame = 300;

const recs = [];

for (let i = 0; i < numRectangles; i++) {
  const left = Math.floor(Math.random() * 20);
  const right = left + 1 + Math.floor(Math.random() * 20);
  const top = Math.floor(Math.random() * 10);
  const bottom = top + 1 + Math.floor(Math.random() * 10);
  recs.push([left, top, right, bottom]);
}

const canvas = document.querySelector('canvas');
canvas.width = innerWidth;
canvas.height = innerHeight;
const T = canvas.getContext('2d');

const arr = calculate(recs);
let frame = 0;

console.log(arr);

const drawTree = (
  T,
  {start, end, val, total, left, right, touched},
  y,
  frame
) => {
  T.lineWidth = (touched.includes(frame) ? 3 : 0.5) / scale;
  T.strokeStyle = 'black';
  T.fillStyle = `rgba(128,128,255,${val * 0.2})`;
  T.strokeRect(start, y, end - start, 1);
  T.fillRect(start, y, end - start, 1);

  T.fillStyle = 'black';
  T.font = `${10 / scale}px sans-serif`;
  T.textBaseline = 'top';
  T.fillText(`val=${val}`, start + 2 / scale, y + 2 / scale);
  T.fillText(`total=${total}`, start + 2 / scale, y + 12 / scale);

  if (left) drawTree(T, left, y + 1, frame);
  if (right) drawTree(T, right, y + 1, frame);
};

const draw = () => {
  T.clearRect(0, 0, canvas.width, canvas.height);
  T.save();
  T.scale(scale, scale);

  T.save();
  T.translate(0, 10);
  T.strokeStyle = 'black';
  T.lineWidth = 0.2 / scale;
  T.fillStyle = 'rgba(0,0,0,0.1)';
  for (const [left, top, right, bottom] of recs) {
    T.fillRect(left, top, right - left, bottom - top);
  }
  for (const [left, top, right, bottom] of recs) {
    T.strokeRect(left, top, right - left, bottom - top);
  }

  const {y, val, left, right, tree} = arr[frame];
  T.strokeStyle = val > 0 ? 'lime' : 'red';
  T.lineWidth = 2 / scale;
  T.beginPath();
  T.moveTo(left, y);
  T.lineTo(right, y);
  T.stroke();
  T.restore();

  drawTree(T, tree, 0, frame);

  T.restore();

  frame = (frame + 1) % arr.length;
  setTimeout(draw, msPerFrame);
};

draw();
