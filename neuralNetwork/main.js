import {NeuralNetwork} from './NeuralNetwork.js';
import {Renderer} from './Renderer.js';

const itsPerFrame = 200;
const learnRate = 0.3;
const probeMs = 1500; // how long to show each example point
const maxHiddenLayers = 6;
const maxNeurons = 16;

// two interleaved spirals on the [-1, 1]² plane, labeled 0 (orange) and 1 (blue)
const makeSpiral = () => {
  const pointsPerClass = 150;
  const turns = 1.5;
  const noise = () => (Math.random() - 0.5) * 0.15;
  const points = [];
  for (let label = 0; label < 2; label++) {
    for (let i = 0; i < pointsPerClass; i++) {
      const r = (i / pointsPerClass) * 0.85 + 0.05; // stays inside the plane even with noise
      const t = (i / pointsPerClass) * turns * 2 * Math.PI + label * Math.PI;
      points.push({x: r * Math.cos(t) + noise(), y: r * Math.sin(t) + noise(), label});
    }
  }
  return points;
};

const $ = (selector) => document.querySelector(selector);
const canvas = $('#nn');
const renderer = new Renderer(canvas);
const points = makeSpiral();

const hiddenLayers = [8, 8]; // neurons in each hidden layer
let neuralNet;
let progress; // accuracy and loss over time, for the graph
let totalIterations;
let probe = points[0];
let lastProbeChange = 0;
let hoverPoint = null; // the point under the mouse on the heatmap

const evaluate = () => {
  let correct = 0;
  let loss = 0;
  for (const {x, y, label} of points) {
    const output = neuralNet.predict(x, y);
    correct += Math.round(output) === label;
    loss += (label - output) ** 2;
  }
  return {accuracy: correct / points.length, loss: loss / points.length};
};

const record = () => {
  // the graph's x axis is logarithmic, so log-spaced points are plenty and keep the history small.
  // the last point is always the current state, it gets replaced until it's far enough along.
  const point = {iterations: totalIterations, ...evaluate()};
  const prev = progress[progress.length - 2];
  if (prev && totalIterations <= prev.iterations * 1.01) progress[progress.length - 1] = point;
  else progress.push(point);
};

const makeStepper = (value, onChange, min, max) => {
  const div = document.createElement('div');
  div.className = 'stepper';
  div.style.top = '40px';
  div.style.transform = 'translateX(-50%)'; // centered over the layer
  const minus = document.createElement('button');
  const plus = document.createElement('button');
  minus.textContent = '−';
  plus.textContent = '+';
  minus.disabled = value <= min;
  plus.disabled = value >= max;
  minus.onclick = () => onChange(-1);
  plus.onclick = () => onChange(1);
  div.append(minus, String(value), plus);
  return div;
};

// changing the shape starts training over, the old weights don't fit the new shape
const reset = () => {
  neuralNet = window.neuralNet = new NeuralNetwork([2, ...hiddenLayers, 1], learnRate);
  progress = [];
  totalIterations = 0;
  record();

  $('#numLayers').textContent = hiddenLayers.length;
  $('#removeLayer').disabled = hiddenLayers.length === 0;
  $('#addLayer').disabled = hiddenLayers.length === maxHiddenLayers;
  $('#layerControls').replaceChildren(
    ...hiddenLayers.map((size, i) =>
      makeStepper(size, (change) => {
        hiddenLayers[i] += change;
        reset();
      }, 1, maxNeurons)
    )
  );
};

$('#removeLayer').onclick = () => {
  hiddenLayers.pop();
  reset();
};
$('#addLayer').onclick = () => {
  hiddenLayers.push(hiddenLayers[hiddenLayers.length - 1] ?? 4);
  reset();
};
reset();

// pointer events so dragging a finger over the heatmap works too
canvas.addEventListener('pointermove', (e) => (hoverPoint = renderer.heatmapPointAt(e.clientX, e.clientY)));
canvas.addEventListener('pointerleave', () => (hoverPoint = null));

const loop = () => {
  const now = performance.now();
  neuralNet.train(points, itsPerFrame);
  totalIterations += itsPerFrame;
  record();

  if (now - lastProbeChange > probeMs) {
    probe = points[Math.floor(Math.random() * points.length)];
    lastProbeChange = now;
  }

  renderer.render(neuralNet, {probe: hoverPoint ?? probe, progress, points});
  // keep each layer's neuron count control above its column
  const {layers} = neuralNet;
  for (const [i, el] of [...$('#layerControls').children].entries()) {
    el.style.left = `${renderer.layerX(i + 1, layers.length)}px`;
  }
  requestAnimationFrame(loop);
};
loop();
