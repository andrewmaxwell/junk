export class OverlayRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    this.opts = {};
    window.map = this;
  }
  resize(width, height) {
    this.canvas.width = width;
    this.canvas.height = height;
    this.draw();
  }
  bind(opts) {
    Object.keys(opts).forEach(key => (this.opts[key] = opts[key]));
  }
  draw() {
    const T = this.context;
    const nodes = this.opts.nodes;
    const solveState = this.opts.solveState;
    const cursor = this.opts.nodeAtCursor;

    T.clearRect(0, 0, this.canvas.width, this.canvas.height);

    if (nodes) {
      T.lineWidth = 0.5;
      T.strokeStyle = '#0F0';
      T.beginPath();
      for (let i = 0; i < nodes.length; i++) {
        let n = nodes[i];
        if (n.prev) {
          T.moveTo(n.screenX, n.screenY);
          T.lineTo(n.prev.screenX, n.prev.screenY);
        }
      }
      T.stroke();
    }

    if (solveState) {
      T.lineWidth = 2;
      T.strokeStyle = 'red';
      T.beginPath();
      for (let i = 0; i < solveState.length; i++) {
        let next =
          solveState[i].paths[solveState[(i + 1) % solveState.length].id];
        if (next) {
          let path = next.path;
          T.moveTo(path[0].screenX, path[0].screenY);
          for (let j = 1; j < path.length; j++) {
            T.lineTo(path[j].screenX, path[j].screenY);
          }
        }
      }
      T.stroke();
    }

    if (cursor) {
      T.fillStyle = 'white';
      T.fillRect(cursor.screenX - 2, cursor.screenY - 2, 4, 4);
      T.fillText(cursor.label, cursor.screenX, cursor.screenY - 10);
    }
  }
}
