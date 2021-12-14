const NUM_NODES = 100;

const addToTreeRandomly = (tree, node) => {
  if (!tree) return node;
  if (Math.random() < 0.5) {
    tree.left = addToTreeRandomly(tree.left, node);
  } else {
    tree.right = addToTreeRandomly(tree.right, node);
  }
  return tree;
};
const generateTree = () => {
  let tree;
  for (let i = 0; i < NUM_NODES; i++) {
    tree = addToTreeRandomly(tree, {size: 1 + Math.floor(Math.random() * 6)});
  }
  return tree;
};

const setWidth = (tree) => {
  if (tree.left) setWidth(tree.left);
  if (tree.right) setWidth(tree.right);
  tree.leftWidth = 1 + Math.max(tree.size / 2, tree.left?.width || 0);
  tree.width = tree.leftWidth + Math.max(tree.size / 2, tree.right?.width || 0);
};

const setCoords = (tree, x, y) => {
  tree.x = x + tree.leftWidth;
  tree.y = y;

  if (tree.left) setCoords(tree.left, x, y + tree.size + 1);
  if (tree.right) setCoords(tree.right, x + tree.leftWidth, y + tree.size + 1);
};

const drawTree = (tree, ctx) => {
  ctx.strokeRect(tree.x - tree.size / 2, tree.y, tree.size, tree.size);

  if (tree.left) {
    drawTree(tree.left, ctx);

    ctx.beginPath();
    ctx.moveTo(tree.x, tree.y + tree.size);
    ctx.lineTo(tree.left.x, tree.left.y);
    ctx.stroke();
  }

  if (tree.right) {
    drawTree(tree.right, ctx);

    ctx.beginPath();
    ctx.moveTo(tree.x, tree.y + tree.size);
    ctx.lineTo(tree.right.x, tree.right.y);
    ctx.stroke();
  }
};

const getNodesAndEdges = (tree, nodes = [], edges = []) => {
  nodes.push(tree);
  if (tree.left) {
    edges.push({parent: tree, child: tree.left});
    getNodesAndEdges(tree.left, nodes, edges);
  }
  if (tree.right) {
    edges.push({parent: tree, child: tree.right});
    getNodesAndEdges(tree.right, nodes, edges);
  }
  return {nodes, edges};
};

const attract = (edges, strength) => {
  for (const {parent, child} of edges) {
    const amt = ((child.x - parent.x) / 2) * strength;
    parent.x += amt;
    child.x -= amt;
    // child.x += (parent.x - child.x) / 10;
  }
};

const repel = (nodes) => {
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i];
    for (let j = i + 1; j < nodes.length; j++) {
      const b = nodes[j];
      const dx1 = a.x + (a.size + b.size) / 2 - b.x;
      const dx2 = b.x + (a.size + b.size) / 2 - a.x;

      if (dx2 > 0 && dx1 > 0 && a.y < b.y + b.size && b.y < a.y + a.size) {
        const amt = Math.min(dx1, dx2);
        a.x -= amt;
        b.x += amt;
      }
    }
  }
};

const tree = generateTree();

setWidth(tree);
setCoords(tree, 0, 0);

const canvas = document.querySelector('canvas');
canvas.width = innerWidth * 3;
canvas.height = innerHeight;
const ctx = canvas.getContext('2d');

const scale = 8;
ctx.lineWidth = 1 / scale;
ctx.scale(scale, scale);
ctx.fillStyle = 'rgba(0,0,255,0.25)';

const {nodes, edges} = getNodesAndEdges(tree);
let strength = 0.1;

const loop = () => {
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  drawTree(tree, ctx);

  // attract(edges, strength);

  // repel(nodes);
  // repel(nodes);
  // repel(nodes);

  // strength *= 0.999;

  // requestAnimationFrame(loop);
};

loop();
