export class StatGraph {
  constructor(canvas) {
    this.canvas = canvas;
    this.context = this.canvas.getContext('2d');
    this.graphs = [];
  }
  addGraph(opts) {
    this.graphs.push(opts);
    this.reset();
    return val => {
      opts.max = Math.max(opts.max, val);
      opts.data.push(val);
    };
  }
  reset() {
    this.graphs.forEach(type => {
      type.max = -Infinity;
      type.data = [];
    });
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
      .filter(type => type.data.length)
      .forEach((type, i) => {
        T.fillStyle = T.strokeStyle = type.color;
        T.beginPath();
        for (let i = 0; i < type.data.length; i++) {
          T.lineTo(
            (i / type.data.length) * W,
            H - (type.data[i] / type.max) * H
          );
        }
        T.stroke();

        T.fillText(type.data[type.data.length - 1], 0, H - 12 - 10 * i);
      });

    T.fillStyle = 'white';
    T.fillText(this.graphs[0].data.length, 0, H - 2);
  }
}
