import {debounce} from '../misc/debounce.js';

const rad = 8;
const colors = ['#FFF', '#F00', '#FF0', '#0F0', '#0FF', '#00F', '#F0F'];

const canvas = document.querySelector('canvas');

let isChangeInternal = false;
let state;
let selected;

const save = debounce(({nodes, edges}) => {
  isChangeInternal = true;
  location.hash = [
    nodes.map((n) => `${n.x},${n.y},${n.c || 0}`),
    edges.map(({a, b}) => `${nodes.indexOf(a)},${nodes.indexOf(b)}`),
  ]
    .map((a) => [...new Set(a)].join(';'))
    .join('_');
  isChangeInternal = false;

  console.log(
    JSON.stringify({
      nodes: nodes.map(({x, y}) => [x, y]),
      edges: edges.map(({a, b}) => [nodes.indexOf(a), nodes.indexOf(b)]),
    })
  );
});

const load = () => {
  const [a, b] = location.hash.slice(1).split('_');
  const nodes = a
    ? a.split(';').map((p) => {
        const [x, y, c] = p.split(',').map(Number);
        return {x, y, c};
      })
    : [{x: 100, y: 100, c: 0}];
  state = {
    nodes,
    edges: b
      ? b.split(';').map((e) => {
          const [a, b] = e.split(',').map((i) => nodes[i]);
          return {a, b};
        })
      : [],
  };
};

const update = () => {
  console.log('update!!!');
  canvas.width = innerWidth;
  canvas.height = innerHeight;
  const ctx = canvas.getContext('2d');

  ctx.strokeStyle = 'white';
  ctx.beginPath();
  for (const {a, b} of state.edges) {
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.save();
    ctx.translate((a.x + b.x) / 2, (a.y + b.y) / 2);
    ctx.rotate(Math.atan2(a.y - b.y, a.x - b.x));
    ctx.moveTo(4, 0);
    ctx.lineTo(0, 4);
    ctx.moveTo(4, 0);
    ctx.lineTo(0, -4);
    ctx.restore();
  }
  ctx.stroke();

  ctx.globalAlpha = 0.5;
  for (const {x, y, c} of state.nodes) {
    ctx.fillStyle = colors[c];
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, 2 * Math.PI);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  save(state);
};

// window.addEventListener('dblclick', (e) => {
//   if (!selected) {
//     state.nodes.push({x: e.pageX, y: e.pageY, c: 0});
//   }
//   update();
// });

window.addEventListener(
  'mousedown',
  ({pageX, pageY, metaKey, altKey, shiftKey}) => {
    let minDist = Infinity;
    for (const node of state.nodes) {
      const d = Math.hypot(node.x - pageX, node.y - pageY);
      if (d < minDist) {
        minDist = d;
        selected = node;
      }
    }

    let isEdge = false;
    for (const edge of state.edges) {
      const d = Math.hypot(
        (edge.a.x + edge.b.x) / 2 - pageX,
        (edge.a.y + edge.b.y) / 2 - pageY
      );
      if (d < minDist) {
        minDist = d;
        selected = edge;
        isEdge = true;
      }
    }

    if (isEdge) {
      if (altKey) {
        state.edges = state.edges.filter((e) => e !== selected);
      } else {
        [selected.a, selected.b] = [selected.b, selected.a];
      }
    } else if (shiftKey) {
      selected.c = (selected.c + 1) % colors.length;
    } else if (metaKey) {
      const newNode = {x: pageX, y: pageY, c: 0};
      state.nodes.push(newNode);
      state.edges.push({a: newNode, b: selected});
      selected = newNode;
    } else if (altKey) {
      state.nodes = state.nodes.filter((n) => n !== selected);
      state.edges = state.edges.filter(
        (e) => e.a !== selected && e.b !== selected
      );
    }
    update();
  }
);

window.addEventListener('mousemove', ({pageX, pageY}) => {
  if (!selected) return;
  selected.x = pageX;
  selected.y = pageY;
  update();
});

window.addEventListener('mouseup', ({pageX, pageY}) => {
  const otherNode = state.nodes.find(
    (n) => n !== selected && Math.hypot(pageX - n.x, pageY - n.y) < rad
  );
  if (otherNode) {
    state.nodes = state.nodes.filter((n) => n !== selected);
    for (const edge of state.edges) {
      if (edge.a === selected) edge.a = otherNode;
      else if (edge.b === selected) edge.b = otherNode;
    }
    state.edges = state.edges.filter((e) => e.a !== e.b);
  }

  selected = undefined;
  update();
});

window.addEventListener('hashchange', () => {
  if (isChangeInternal) return;
  load();
  update();
});

window.addEventListener('resize', update);

load();
update();
