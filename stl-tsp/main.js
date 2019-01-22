console.clear();

const statCanvasHeight = 100;

const params = {
  searchSpeed: 1000,
  annealSpeed: 100,
  coolingFactor: 300,
  randomPoints: 0
};

import {OverlayRenderer} from './overlayRenderer.js';
import {SimulatedAnnealingSolver} from './solver.js';
import {PathFinder} from './pathFinder.js';
import {StatGraph} from './statGraph.js';
import {MapRenderer} from './mapRenderer.js';
import {reverseRandomSlice, closestNode} from './utils.js';
import {processNodes} from './processNodes.js';

const mapCanvas = document.getElementById('mapCanvas');
const overlayCanvas = document.getElementById('mainCanvas');
const statCanvas = document.getElementById('statCanvas');

fetch('map.json')
  .then(r => r.json())
  .then(mapData => {
    const nodes = processNodes(mapData);

    const IDLE = 0,
      STARTING = 1,
      PATHFINDING = 2,
      SOLVING = 3;
    let state = IDLE,
      selected = []; //[nodes[19086]];

    const mapRenderer = new MapRenderer(mapCanvas, {
      roads: mapData.roads,
      selected
    });
    const overlayRenderer = new OverlayRenderer(overlayCanvas);
    const stats = new StatGraph(statCanvas);
    const annealingGraph = stats.addGraph({color: 'red'});
    const temperatureGraph = stats.addGraph({color: 'green'});

    const pathFinder = new PathFinder({
      onPathFound: () => mapRenderer.draw()
    });

    const solver = new SimulatedAnnealingSolver({
      generateNeighbor: reverseRandomSlice,
      getCost: path => {
        let sum = path[path.length - 1].paths[path[0].id].cost;
        for (let i = 0; i < path.length - 1; i++) {
          sum += path[i].paths[path[i + 1].id].cost;
        }
        if (isNaN(sum)) {
          console.error('NaN!', path);
          state = IDLE;
        }
        return sum;
      }
    });

    const resize = (window.onresize = () => {
      const width = window.innerWidth;

      nodes.forEach(node => {
        node.screenX = node.x * width;
        node.screenY = node.y * width;
      });

      const scaledMapHeight = Math.floor(
        (mapData.height / mapData.width) * width
      );

      mapRenderer.resize(width, scaledMapHeight);
      overlayRenderer.resize(width, scaledMapHeight);
      stats.resize(width, statCanvasHeight);
    });

    const loop = () => {
      requestAnimationFrame(loop);
      if (state == IDLE) return;

      if (state == STARTING) {
        pathFinder.init(nodes, selected);
        stats.reset();
        mapRenderer.draw();
        overlayRenderer.bind({nodes, solveState: false});
        state = PATHFINDING;
      }

      for (let i = 0; state == PATHFINDING && i < params.searchSpeed; i++) {
        if (!pathFinder.iterate()) {
          if (selected.length > 2) {
            solver.init(
              selected,
              selected.length,
              1 - 1 / params.coolingFactor / selected.length
            );
            state = SOLVING;
          } else state = IDLE;
        }
      }

      if (state == SOLVING) {
        for (let i = 0; state == SOLVING && i < params.annealSpeed; i++) {
          if (!solver.iterate()) state = IDLE;
        }
        annealingGraph(solver.currentCost);
        temperatureGraph(solver.temperature);
        overlayRenderer.bind({solveState: solver.currentState});
      }

      overlayRenderer.draw();
      stats.draw();
    };

    overlayCanvas.onclick = e => {
      const x = e.offsetX / overlayCanvas.width;
      const y = e.offsetY / overlayCanvas.width;
      const closest = closestNode(nodes, x, y);
      const index = selected.indexOf(closest);
      if (index == -1) {
        selected.unshift(closest);
      } else {
        selected.splice(index, 1);
      }
      state = STARTING;
    };

    overlayCanvas.onmousemove = e => {
      const x = e.offsetX / overlayCanvas.width;
      const y = e.offsetY / overlayCanvas.width;
      overlayRenderer.bind({
        nodeAtCursor: closestNode(nodes, x, y)
      });
      overlayRenderer.draw();
    };

    const setRandom = () => {
      selected.length = 0;
      for (let i = 0; i < params.randomPoints; i++) {
        let n = nodes[Math.floor(Math.random() * nodes.length)];
        if (!selected.includes(n)) selected.push(n);
      }
      state = STARTING;
    };

    const gui = new window.dat.GUI();
    gui.add(params, 'searchSpeed', 1, 10000);
    gui.add(params, 'annealSpeed', 1, 1000);
    gui.add(params, 'coolingFactor', 10, 1000);
    gui
      .add(params, 'randomPoints', 0, 100)
      .step(1)
      .onChange(setRandom);
    gui.add(
      {
        'Clear All Points': () => {
          selected.length = 0;
          state = STARTING;
        }
      },
      'Clear All Points'
    );

    window.onerror = () => (state = IDLE);
    window.onresize = resize;
    window.top.selected = selected;

    resize();
    setRandom();
    loop();
  });
