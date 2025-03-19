/**
 * @typedef {Object} Graph
 * @property {string} color - CSS color used to draw the graph line and text
 * @property {number[]} data - The recorded data points
 * @property {number} min - The minimum observed value among data points
 * @property {number} max - The maximum observed value among data points
 * @property {number} [forceMin] - If defined, overrides the computed minimum
 * @property {string} [label] - If defined, a label
 */

/**
 * A class to plot multiple graphs (series) of numerical data onto an HTML canvas.
 */
export default class StatGraph {
  /**
   * Creates a new StatGraph.
   * @param {HTMLCanvasElement | null} canvas - The canvas element to draw on.
   */
  constructor(canvas) {
    if (!canvas) throw new Error(`Canvas not found`);

    /** @type {HTMLCanvasElement} */
    this.canvas = canvas;
    /** @type {CanvasRenderingContext2D | null} */
    this.context = this.canvas.getContext('2d');
    /** @type {Graph[]} */
    this.graphs = [];
  }

  /**
   * Adds a new graph configuration to track and draws/reset as needed.
   * Returns a function you can call to record new data values.
   *
   * @param {{color: string; label?: string; forceMin?: number}} graphConfig
   * @returns {(val: number) => void} A function to push a new data point to this graph.
   */
  addGraph(graphConfig) {
    /** @type {Graph} */
    const graph = {
      ...graphConfig,
      min: graphConfig.forceMin !== undefined ? graphConfig.forceMin : Infinity,
      max: -Infinity,
      data: [],
    };

    this.graphs.push(graph);

    return (val) => {
      graph.min = Math.min(graph.min, val);
      graph.max = Math.max(graph.max, val);
      graph.data.push(val);
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

  /**
   * Resizes the underlying canvas to the given dimensions and re-draws.
   * @param {number} width - New width for the canvas
   * @param {number} height - New height for the canvas
   */
  resize(width, height) {
    this.canvas.width = width;
    this.canvas.height = height;
    this.draw();
  }
  draw() {
    const ctx = this.context;
    if (!ctx) return;
    const canvasWidth = this.canvas.width;
    const canvasHeight = this.canvas.height;

    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    ctx.font = 'monospace';

    this.graphs
      .filter((g) => g.data.length > 0)
      .forEach(({color, label, data, min, max}, graphIndex) => {
        ctx.fillStyle = color;
        ctx.strokeStyle = color;
        ctx.beginPath();

        for (let i = 0; i < data.length; i++) {
          const x = (i / (data.length - 1)) * canvasWidth;
          const y =
            canvasHeight - ((data[i] - min) / (max - min)) * canvasHeight;
          ctx.lineTo(x, y);
        }
        ctx.stroke();

        const latestValue =
          (label ? label + ': ' : '') + data[data.length - 1].toLocaleString();
        ctx.fillText(latestValue, 2, canvasHeight - 12 - 10 * graphIndex);
      });

    // Show the total number of data points in the first graph as a simple label
    if (this.graphs.length && this.graphs[0].data) {
      ctx.fillStyle = 'white';
      ctx.fillText(
        'Iterations: ' + this.graphs[0].data.length.toLocaleString(),
        2,
        canvasHeight - 2,
      );
    }
  }
}
