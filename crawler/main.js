const DESIRED_DIST = 100;

const getData = async () => {
  const [urlsStr, edgesStr] = await Promise.all([
    fetch('./urls.txt').then((r) => r.text()),
    fetch('./edges.txt').then((r) => r.text()),
  ]);

  const nodes = urlsStr.split('\n').map((url) => ({
    url,
    x: Math.random() * innerWidth,
    y: Math.random() * innerHeight,
  }));

  const edges = [];
  for (const row of edgesStr.split('\n')) {
    const [from, to] = row.split(':');
    if (!to) continue;
    edges.push(...to.split(',').map((e) => ({from: +from, to: +e})));
  }

  console.log({nodes, edges});

  return {nodes, edges};
};

const normalize = (nodes) => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const {x, y} of nodes) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  for (const n of nodes) {
    n.x = ((n.x - minX) / (maxX - minX)) * innerWidth;
    n.y = ((n.y - minY) / (maxY - minY)) * innerHeight;
  }
};

const force = (na, nb, getAmt) => {
  if (!na || !nb) return;
  const dx = nb.x - na.x;
  const dy = nb.y - na.y;
  const sqDist = dx ** 2 + dy ** 2;
  if (!sqDist) return;
  const amt = getAmt(sqDist);

  na.x += amt * dx;
  na.y += amt * dy;
  nb.x -= amt * dx;
  nb.y -= amt * dy;
};

const repel = (sqDist) => -100 / sqDist;
const attract = (sqDist) => (1 - DESIRED_DIST ** 2 / sqDist) / 1000;

const animate = ({nodes, edges}) => {
  const limit = 800;
  nodes = nodes.slice(0, limit);
  edges = edges.filter((e) => e.from < limit && e.to < limit);
  console.log(nodes, edges);

  const canvas = document.querySelector('canvas');

  const ctx = canvas.getContext('2d');

  console.log(ctx.measureText('kljnsdfkjnsdfkjnsdf'));

  const loop = () => {
    canvas.width = innerWidth;
    canvas.height = innerHeight;

    for (let i = 1; i < nodes.length; i++) {
      for (let j = 0; j < i; j++) {
        force(nodes[i], nodes[j], repel);
      }
    }
    for (const {from, to} of edges) {
      force(nodes[from], nodes[to], attract);
    }
    normalize(nodes);

    ctx.lineWidth = 0.25;
    ctx.strokeStyle = 'white';
    ctx.beginPath();
    for (const {from, to} of edges) {
      const na = nodes[from];
      const nb = nodes[to];
      ctx.moveTo(na.x, na.y);
      ctx.lineTo(nb.x, nb.y);
    }
    ctx.stroke();

    // ctx.fillStyle = 'black';
    // ctx.globalAlpha = 0.5;
    // for (const {url, x, y} of nodes) {
    //   ctx.fillRect(x, y - 10, ctx.measureText(url).width, 12);
    // }
    // ctx.fillStyle = 'white';
    // ctx.globalAlpha = 1;
    // for (const {url, x, y} of nodes) {
    //   ctx.fillText(url, x, y);
    // }

    ctx.fillStyle = 'red';
    ctx.beginPath();
    for (const {x, y} of nodes) {
      ctx.moveTo(x + 3, y);
      ctx.arc(x, y, 3, 0, 2 * Math.PI);
    }
    ctx.fill();

    requestAnimationFrame(loop);
  };

  loop();
};

getData().then(animate);
