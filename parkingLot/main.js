import {getShortestPath} from './getShortestPath.js';

class Car {
  constructor({from, destination, nodes}) {
    this.from = from;
    this.destination = destination;
    this.progress = 0;
    this.setNext(nodes);
  }
  setNext(nodes) {
    if (!this.from.neighbors.length) return;
    this.path =
      this.path?.length > 1
        ? this.path.slice(1)
        : getShortestPath(this.from, this.destination, nodes);
    if (this.path?.length > 1) {
      this.to = this.path[1];
      this.roadLen = Math.hypot(
        this.from.x - this.to.x,
        this.from.y - this.to.y
      );
    } else {
      this.to = null;
    }
  }
  move(nodes, speed = 1) {
    if (!this.to) return;
    this.progress += speed;
    if (this.progress > this.roadLen) {
      this.progress -= this.roadLen;
      this.from = this.to;
      this.setNext(nodes);
    }
  }
  setDestination(dest, nodes) {
    this.destination = dest;
    this.setNext(nodes);
  }
}

const parseStr = (str) => {
  const types = ['', 'entrance', 'exit', 'spot'];
  const [a, b] = str.split('_');
  const nodes = a.split(';').map((p) => {
    const [x, y, c] = p.split(',').map(Number);
    return {x, y, type: types[c], neighbors: []};
  });
  for (const e of b.split(';')) {
    const [a, b] = e.split(',');
    nodes[b].neighbors.push(nodes[a]);
  }
  return nodes;
};

const randEl = (arr) => arr[Math.floor(Math.random() * arr.length)];

const canvas = document.querySelector('canvas');
const draw = (nodes, car) => {
  canvas.width = innerWidth;
  canvas.height = innerHeight;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath();
  for (const {x, y} of nodes) {
    ctx.moveTo(x + 4, y);
    ctx.arc(x, y, 4, 0, 2 * Math.PI);
  }
  ctx.fill();

  ctx.strokeStyle = 'white';
  ctx.beginPath();
  for (const {x, y, neighbors} of nodes) {
    for (const n of neighbors) {
      ctx.moveTo(x, y);
      ctx.lineTo(n.x, n.y);
    }
  }
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255,0,0,0.5)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (const {x, y} of car.path) {
    ctx.lineTo(x, y);
  }
  ctx.stroke();

  ctx.fillStyle = 'blue';
  const m = car.progress / car.roadLen;
  const x = car.from.x * (1 - m) + car.to.x * m;
  const y = car.from.y * (1 - m) + car.to.y * m;
  ctx.beginPath();
  ctx.arc(x, y, 8, 0, 2 * Math.PI);
  ctx.fill();
};

const str =
  '299,230,0;360,227,0;424,226,0;490,226,0;549,226,0;609,224,0;667,224,0;383,172,3;444,170,3;507,169,3;568,171,3;628,170,3;695,168,3;325,283,3;389,278,3;446,276,3;512,278,3;577,277,3;636,274,3;701,276,3;324,371,0;385,369,0;440,369,0;498,369,0;560,369,0;620,369,0;683,370,0;749,371,0;733,223,0;764,164,3;765,274,3;290,321,3;355,320,3;419,321,3;474,322,3;533,324,3;597,321,3;655,318,3;727,319,3;298,427,3;360,430,3;419,427,3;478,429,3;542,429,3;602,430,3;662,431,3;730,430,3;233,550,1;317,170,3;231,49,2;873,221,0;876,373,0;815,370,0;789,314,3;795,431,3;799,222,0;829,272,3;828,162,3;200,49,1;199,369,0;201,551,2;233,370,0;201,229,0;232,230,0;904,166,3;940,264,3;875,296,0;861,430,3;931,329,3;927,412,3_1,0;2,1;3,2;4,3;5,4;7,1;8,2;9,3;10,4;11,5;12,6;13,0;14,1;15,2;16,3;17,4;18,5;19,6;20,21;21,22;22,23;23,24;24,25;25,26;26,27;28,6;29,28;30,28;31,20;32,21;33,22;34,23;35,24;36,25;37,26;38,27;39,20;40,21;41,22;42,23;43,24;44,25;45,26;46,27;0,48;52,51;53,52;27,52;54,52;55,28;50,55;56,55;57,55;60,59;61,47;62,58;59,62;59,61;61,20;48,0;1,7;2,8;3,9;4,10;5,11;6,12;28,29;55,57;55,56;28,30;6,19;5,18;4,17;3,16;2,15;1,14;0,13;20,31;21,32;22,33;23,34;24,35;25,36;26,37;27,38;52,53;52,54;27,46;26,45;25,44;24,43;23,42;22,41;21,40;20,39;63,61;49,63;63,62;0,63;6,5;58,49;47,60;64,50;65,50;66,50;51,66;67,51;68,66;69,51;51,67;51,69;66,68;50,65;50,64';
const nodes = parseStr(str);
const typeIndex = {};
for (const n of nodes) {
  (typeIndex[n.type] = typeIndex[n.type] || []).push(n);
}

const car = new Car({
  from: randEl(typeIndex.entrance),
  destination: randEl(typeIndex.spot),
  nodes,
});

const loop = () => {
  draw(nodes, car);

  car.move(nodes);
  if (!car.to) {
    car.setDestination(randEl(typeIndex.exit), nodes);
  }

  requestAnimationFrame(loop);
};

loop();
