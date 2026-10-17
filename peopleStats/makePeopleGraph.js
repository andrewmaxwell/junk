const height = 600;
const pad = 40;
const numLines = 5;

const scale = (values, from, to) => {
  const min = Math.min(...values);
  const max = Math.max(...values);
  return values.map((v) => from + ((to - from) * (v - min)) / (max - min));
};

// Everyone placed on the first two trait factors. Hovering over or tapping a
// person draws lines to the people most consistently similar to them (near[i][j]
// is how often j is among i's most similar). Returns a function that highlights
// one person by name, whose lines show when nobody is hovered.
export const makePeopleGraph = (canvasId, data, factors, traitKeys, near) => {
  const canvas = document.querySelector('#' + canvasId);
  const width = canvas.parentElement.clientWidth;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  const xs = scale(factors[0].scores, pad, width - pad);
  const ys = scale(factors[1].scores, height - pad, pad);

  const byLoading = traitKeys
    .map((key, j) => ({key, loading: factors[1].loadings[j]}))
    .sort((a, b) => b.loading - a.loading)
    .map(({key}) => key);
  const top = byLoading.slice(0, 3).join(', ');
  const bottom = byLoading.slice(-3).reverse().join(', ');

  let highlighted;
  let hovered = -1;

  const draw = () => {
    ctx.clearRect(0, 0, width, height);

    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#888';
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillText(`↑ ${top}`, 4, 14);
    ctx.fillText(`↓ ${bottom}`, 4, height - 22);
    ctx.fillText('← Lower self-ratings', 4, height - 6);
    ctx.textAlign = 'right';
    ctx.fillText('Higher self-ratings →', width - 4, height - 6);

    const focus =
      hovered >= 0 ? hovered : data.findIndex((d) => d.name === highlighted);
    const neighbors =
      focus < 0
        ? []
        : near[focus]
            .map((freq, j) => ({freq, j}))
            .filter(({freq, j}) => freq > 0 && j !== focus)
            .sort((a, b) => b.freq - a.freq)
            .slice(0, numLines);

    ctx.lineWidth = 2;
    for (const {freq, j} of neighbors) {
      ctx.strokeStyle = `rgba(255,204,68,${freq})`;
      ctx.beginPath();
      ctx.moveTo(xs[focus], ys[focus]);
      ctx.lineTo(xs[j], ys[j]);
      ctx.stroke();
    }

    const isNeighbor = new Set(neighbors.map(({j}) => j));
    const color = (i) =>
      i === focus ? '#FC4' : focus < 0 || isNeighbor.has(i) ? 'white' : '#777';

    for (let i = 0; i < data.length; i++) {
      ctx.fillStyle = color(i);
      ctx.beginPath();
      ctx.arc(xs[i], ys[i], i === focus ? 4 : 2.5, 0, 2 * Math.PI);
      ctx.fill();
    }

    // Label as many people as fit without overlapping each other or anyone's
    // dot, starting with the focused person and their matches. The rest stay
    // dots, and hovering shows their name.
    const taken = data.map((_, i) => ({
      x0: xs[i] - 3,
      y0: ys[i] - 3,
      x1: xs[i] + 3,
      y1: ys[i] + 3,
      i,
    }));
    const order = [
      ...(focus >= 0 ? [focus] : []),
      ...neighbors.map(({j}) => j),
      ...data.map((_, i) => i).filter((i) => i !== focus && !isNeighbor.has(i)),
    ];
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    for (const i of order) {
      ctx.font = i === focus ? 'bold 14px sans-serif' : '10px sans-serif';
      const w = ctx.measureText(data[i].name).width;
      const h = i === focus ? 16 : 11;
      const candidates = [
        [xs[i] + 5, ys[i]],
        [xs[i] - 5 - w, ys[i]],
        [xs[i] - w / 2, ys[i] - h],
        [xs[i] - w / 2, ys[i] + h],
        [xs[i] + 5, ys[i] - h],
        [xs[i] + 5, ys[i] + h],
        [xs[i] - 5 - w, ys[i] - h],
        [xs[i] - 5 - w, ys[i] + h],
        [xs[i] - w / 2, ys[i] - 2 * h],
        [xs[i] - w / 2, ys[i] + 2 * h],
      ].map(([x, y]) => ({x0: x, y0: y - h / 2, x1: x + w, y1: y + h / 2}));
      // Dots in taken have an i; labels don't.
      const fits = (b, overDots) =>
        b.x0 >= 0 &&
        b.x1 <= width &&
        taken.every(
          (t) =>
            t.i === i ||
            (overDots && t.i !== undefined) ||
            b.x1 < t.x0 ||
            b.x0 > t.x1 ||
            b.y1 < t.y0 ||
            b.y0 > t.y1,
        );
      const mustShow = i === focus || isNeighbor.has(i);
      const box =
        candidates.find((b) => fits(b, false)) ||
        (mustShow && (candidates.find((b) => fits(b, true)) || candidates[0]));
      if (!box) continue;
      taken.push(box);
      ctx.fillStyle = color(i);
      ctx.fillText(data[i].name, box.x0, (box.y0 + box.y1) / 2);
    }
  };

  const hover = (x, y) => {
    let closest = 20;
    hovered = -1;
    data.forEach((_, i) => {
      const d = Math.hypot(xs[i] - x, ys[i] - y);
      if (d < closest) {
        closest = d;
        hovered = i;
      }
    });
    draw();
  };
  canvas.addEventListener('mousemove', (e) => hover(e.offsetX, e.offsetY));
  canvas.addEventListener('mouseleave', () => hover(-Infinity, -Infinity));
  canvas.addEventListener('touchstart', (e) => {
    const {left, top} = canvas.getBoundingClientRect();
    const {clientX, clientY} = e.targetTouches[0];
    hover(clientX - left, clientY - top);
  });

  draw();

  return (name) => {
    highlighted = name;
    draw();
  };
};
