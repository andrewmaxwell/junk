const mapRes = 48; // each neuron's map is mapRes x mapRes, the big heatmap is the output neuron's map
const neuronRad = 26;
const maxWeightWidth = 4;
const controlsHeight = 72; // room for the layer controls above the network
const graphHeight = 180;
const lossColor = 'darkorange';
// colors for labels 0 and 1
const color0 = [255, 140, 0];
const color1 = [30, 110, 255];

const getX = (box, t) => box.x + 50 + t * (box.w - 100);
// each layer is centered vertically, spread out up to a limit
const getSpacing = (box, n) => Math.min((box.h - 60) / Math.max(n - 1, 1), 80);
const getY = (box, j, n) => box.y + box.h / 2 + (j - (n - 1) / 2) * getSpacing(box, n);

// blend toward white near 0.5 so the decision boundary stands out
const boundaryColor = (t, c) => 255 + (color0[c] + (color1[c] - color0[c]) * t - 255) * Math.abs(t - 0.5) * 1.4;
// activations are white at 0 and black at 1
const activationColor = (t) => (1 - t) * 255;

const formatIterations = (n) => Intl.NumberFormat('en', {notation: 'compact'}).format(n);

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.maps = null;
    this.mapsNet = null;
    this.heatmapBox = null;
    this.networkBox = null;
  }
  // the x position of a layer's column, for placing controls over it
  layerX(i, numLayers) {
    return getX(this.networkBox, i / (numLayers - 1));
  }
  // the point on the plane under the mouse, or null if it's not over the heatmap
  heatmapPointAt(clientX, clientY) {
    const box = this.heatmapBox;
    if (!box) return null;
    const x = ((clientX - box.x) / box.w) * 2 - 1;
    const y = 1 - ((clientY - box.y) / box.h) * 2;
    return Math.abs(x) <= 1 && Math.abs(y) <= 1 ? {x, y} : null;
  }
  // runs the network over a grid of points to color every neuron's map
  updateMaps(net) {
    const {layers} = net;
    if (this.mapsNet !== net) {
      this.mapsNet = net;
      this.maps = layers.map(({values}) =>
        Array.from(values, () => {
          const canvas = new OffscreenCanvas(mapRes, mapRes);
          const ctx = canvas.getContext('2d');
          return {canvas, ctx, imageData: ctx.createImageData(mapRes, mapRes)};
        })
      );
    }
    for (let py = 0; py < mapRes; py++) {
      for (let px = 0; px < mapRes; px++) {
        net.predict(((px + 0.5) / mapRes) * 2 - 1, 1 - ((py + 0.5) / mapRes) * 2);
        const i = (py * mapRes + px) * 4;
        for (let l = 0; l < layers.length; l++) {
          const {values} = layers[l];
          for (let n = 0; n < values.length; n++) {
            const {data} = this.maps[l][n].imageData;
            for (let c = 0; c < 3; c++) {
              // inputs range from -1 to 1
              if (l === 0) data[i + c] = activationColor((values[n] + 1) / 2);
              else if (l === layers.length - 1) data[i + c] = boundaryColor(values[n], c);
              else data[i + c] = activationColor(values[n]);
            }
            data[i + 3] = 255;
          }
        }
      }
    }
    for (const layer of this.maps) {
      for (const {ctx, imageData} of layer) ctx.putImageData(imageData, 0, 0);
    }
  }
  drawGraph(progress, box) {
    const {ctx} = this;
    const pad = 40;
    const lastIterations = progress[progress.length - 1].iterations;
    const logMax = Math.log10(1 + Math.max(lastIterations, 10));
    const getGraphX = (iterations) => box.x + pad + (Math.log10(1 + iterations) / logMax) * (box.w - pad * 2);
    const top = box.y + 30; // leave room for the labels
    const bottom = box.y + box.h - 20;
    const getAccuracyY = (accuracy) => bottom - accuracy * (bottom - top);
    // loss is scaled so its highest point so far is at the top
    let maxLoss = 0;
    for (const {loss} of progress) maxLoss = Math.max(maxLoss, loss);
    const getLossY = (loss) => bottom - (loss / (maxLoss || 1)) * (bottom - top);

    ctx.fillStyle = '#f4f4f4';
    ctx.fillRect(box.x, box.y, box.w, box.h);

    // x axis ticks at powers of 10
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 1;
    ctx.fillStyle = 'gray';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let n = 1; n <= lastIterations; n *= 10) {
      const x = getGraphX(n);
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, bottom);
      ctx.stroke();
      ctx.fillText(formatIterations(n), x, bottom + 4);
    }

    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath();
    ctx.moveTo(getGraphX(0), bottom);
    for (const {iterations, accuracy} of progress) ctx.lineTo(getGraphX(iterations), getAccuracyY(accuracy));
    ctx.lineTo(getGraphX(lastIterations), bottom);
    ctx.fill();

    ctx.strokeStyle = lossColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (const {iterations, loss} of progress) ctx.lineTo(getGraphX(iterations), getLossY(loss));
    ctx.stroke();

    const {accuracy, loss} = progress[progress.length - 1];
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = 'black';
    ctx.fillText(`Accuracy: ${(accuracy * 100).toFixed()}%`, box.x + pad, box.y + 6);
    ctx.fillStyle = lossColor;
    ctx.fillText(`Loss: ${loss.toPrecision(2)}`, box.x + pad + 150, box.y + 6);
  }
  // each neuron shows its map, with a dot where the probe point is. the outline shows the bias.
  drawNeurons(layers, probe, box) {
    const {ctx} = this;
    for (let i = 0; i < layers.length; i++) {
      const {biases, values} = layers[i];
      const x = getX(box, i / (layers.length - 1));
      // shrink the neurons when there are too many to fit
      const rad = Math.min(neuronRad, getSpacing(box, values.length) / 2.2);
      for (let j = 0; j < values.length; j++) {
        const y = getY(box, j, values.length);
        ctx.drawImage(this.maps[i][j].canvas, x - rad, y - rad, rad * 2, rad * 2);
        ctx.strokeStyle = biases ? (biases[j] < 0 ? 'red' : 'blue') : 'gray';
        ctx.lineWidth = biases ? Math.min(Math.abs(biases[j]), rad / 3) + 1 : 1;
        ctx.beginPath();
        ctx.roundRect(x - rad, y - rad, rad * 2, rad * 2, 4);
        ctx.stroke();

        ctx.fillStyle = 'black';
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x + probe.x * rad, y - probe.y * rad, 2.5, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
      }
    }
  }
  drawConnections(layers, box) {
    const {ctx} = this;
    ctx.lineCap = 'round';
    for (let i = 1; i < layers.length; i++) {
      const {weights} = layers[i];
      const x1 = getX(box, i / (layers.length - 1));
      const x2 = getX(box, (i - 1) / (layers.length - 1));
      // scale relative to the layer's biggest weight so the important connections stand out
      let maxWeight = 0;
      for (const row of weights) for (const w of row) maxWeight = Math.max(maxWeight, Math.abs(w));
      for (let j = 0; j < weights.length; j++) {
        const y1 = getY(box, j, weights.length);
        for (let k = 0; k < weights[j].length; k++) {
          const y2 = getY(box, k, weights[0].length);
          const weight = weights[j][k];
          const strength = (Math.abs(weight) / maxWeight) ** 2;
          if (strength < 0.005) continue; // invisible anyway
          ctx.strokeStyle = weight < 0 ? 'red' : 'blue';
          ctx.globalAlpha = strength;
          ctx.lineWidth = strength * maxWeightWidth;
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        }
      }
    }
    ctx.globalAlpha = 1;
  }
  // the network's output for the whole plane, with the points on top
  drawHeatmap(heatmap, points, probe, box) {
    const {ctx} = this;
    const toScreen = ({x, y}) => [box.x + ((x + 1) / 2) * box.w, box.y + ((1 - y) / 2) * box.h];
    ctx.drawImage(heatmap, box.x, box.y, box.w, box.h);
    ctx.strokeStyle = 'gray';
    ctx.lineWidth = 1;
    ctx.strokeRect(box.x, box.y, box.w, box.h);

    ctx.strokeStyle = 'white';
    for (const point of points) {
      const [x, y] = toScreen(point);
      ctx.fillStyle = `rgb(${point.label ? color1 : color0})`;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();
    }

    // ring the point the neurons are showing
    const [x, y] = toScreen(probe);
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, 2 * Math.PI);
    ctx.stroke();
  }
  render(net, {probe, progress, points}) {
    const {canvas, ctx} = this;
    const dpr = devicePixelRatio;
    if (canvas.width !== innerWidth * dpr || canvas.height !== innerHeight * dpr) {
      canvas.width = innerWidth * dpr;
      canvas.height = innerHeight * dpr;
      canvas.style.width = `${innerWidth}px`;
      canvas.style.height = `${innerHeight}px`;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    ctx.imageSmoothingEnabled = true;

    // network on the left, heatmap on the right, graph along the bottom
    const networkBox = {x: 0, y: controlsHeight, w: innerWidth, h: innerHeight - controlsHeight - graphHeight};
    const size = Math.min(networkBox.h - 40, innerWidth * 0.45);
    this.heatmapBox = {x: innerWidth - size - 20, y: networkBox.y + (networkBox.h - size) / 2, w: size, h: size};
    networkBox.w -= size + 40;
    this.networkBox = networkBox;

    this.updateMaps(net);
    this.drawConnections(net.layers, networkBox);
    this.drawNeurons(net.layers, probe, networkBox);
    this.drawGraph(progress, {x: 0, y: innerHeight - graphHeight, w: innerWidth, h: graphHeight});
    this.drawHeatmap(this.maps[this.maps.length - 1][0].canvas, points, probe, this.heatmapBox);
  }
}
