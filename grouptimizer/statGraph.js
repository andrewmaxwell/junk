export default class StatGraph {
  constructor(canvas) {
    this.canvas = canvas;
    this.context = this.canvas.getContext('2d');
    this.graphs = [];
  }
  addGraph(g) {
    this.graphs.push(g);
    this.reset();
    return (val) => {
      g.min = Math.min(g.min, val);
      g.max = Math.max(g.max, val);
      g.data.push(val);
    };
  }
  reset() {
    for (const g of this.graphs) {
      g.min = g.forceMin !== undefined ? g.forceMin : Infinity;
      g.max = -Infinity;
      g.data = [];
    }
    this.draw();
  }
  resize(width, height) {
    this.canvas.width = width;
    this.canvas.height = height;
    this.draw();
  }
  draw() {
    const T = this.context;
    const W = this.canvas.width;
    const H = this.canvas.height;

    T.clearRect(0, 0, W, H);
    T.font = 'monospace';

    this.graphs
      .filter((g) => g.data.length)
      .forEach(({color, data, min, max}, i) => {
        T.fillStyle = T.strokeStyle = color;
        T.beginPath();
        for (let i = 0; i < data.length; i++) {
          T.lineTo(
            (i / data.length) * W,
            H - ((data[i] - min) / (max - min)) * H
          );
        }
        T.stroke();

        T.fillText(data[data.length - 1], 0, H - 12 - 10 * i);
      });

    T.fillStyle = 'white';
    T.fillText(this.graphs[0].data.length, 0, H - 2);
  }
}
