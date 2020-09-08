import {noise} from '../sheep/utils.js';

const cols = 100;
const rows = 50;
const size = 16;

const canvas = document.querySelector('canvas');

const types = [
  {name: 'grass', color: '#8de38e', cost: 1},
  {name: 'tallGrass', color: '#009914', cost: 4},
  {name: 'brush', color: '#785a00', cost: 10},
  {name: 'stoneWall', color: '#9c9c9c', cost: 100},
  {name: 'obsidianWall', color: '#363636', cost: 1000},
  {name: 'gold', color: '#ffe100', cost: 1},
];
const typeIndex = types.reduce(
  (res, t) => Object.assign(res, {[t.name]: t}),
  {}
);
const dirs = [
  [0, 1],
  [0, -1],
  [1, 0],
  [-1, 0],
  [1, 1],
  [-1, -1],
  [1, -1],
  [-1, 1],
];
let grid,
  selectedType = typeIndex.obsidianWall,
  showHeatMap = false;

const init = () => {
  const pgrid = localStorage.grid && JSON.parse(localStorage.grid);
  grid = [];
  const offset = Math.random() * 1e6;
  for (let i = 0; i < rows; i++) {
    grid[i] = [];
    for (let j = 0; j < cols; j++) {
      grid[i][j] = {
        x: j,
        y: i,
        type: pgrid
          ? types[pgrid[i][j]]
          : types[Math.floor(3 * noise(j / 5, i / 5 + offset) ** 1.5)],
        neighbors: [],
      };
    }
  }
  if (!pgrid)
    grid[Math.floor(rows / 2)][Math.floor(cols / 2)].type = typeIndex.gold;

  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      for (let k = 0; k < dirs.length; k++) {
        const [dx, dy] = dirs[k];
        const n = grid[i + dy] && grid[i + dy][j + dx];
        if (n) grid[i][j].neighbors.push(n);
        // grid[i][j].neighbors.push(
        //   grid[(i + dy + rows) % rows][(j + dx + cols) % cols]
        // );
      }
    }
  }

  draw();
};

const draw = () => {
  const q = [];
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      grid[i][j].dist = grid[i][j].type === typeIndex.gold ? 0 : Infinity;
      grid[i][j].visited = false;
      delete grid[i][j].prev;
      q.push(grid[i][j]);
    }
  }

  while (q.length) {
    let indexOfMin = 0;
    for (let i = 0; i < q.length; i++) {
      if (q[i].dist < q[indexOfMin].dist) indexOfMin = i;
    }

    // const current = q.splice(indexOfMin, 1)[0];
    const current = q[indexOfMin];
    q[indexOfMin] = q[q.length - 1];
    q.pop();

    current.visited = true;

    for (let i = 0; i < current.neighbors.length; i++) {
      const n = current.neighbors[i];
      const alt =
        current.dist +
        n.type.cost * (current.x - n.x && current.y - n.y ? Math.SQRT2 : 1);
      if (!n.visited && alt < n.dist) {
        n.dist = alt;
        n.prev = current;
      }
    }
  }

  canvas.width = cols * size;
  canvas.height = rows * size;
  const T = canvas.getContext('2d');
  T.scale(size, size);

  if (showHeatMap) {
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        T.fillStyle = `hsl(${grid[i][j].dist / 2},100%,50%)`;
        T.fillRect(j, i, 1, 1);
      }
    }
  } else {
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        T.fillStyle = grid[i][j].type.color;
        T.fillRect(j, i, 1, 1);
      }
    }
    T.fillStyle = 'rgba(0,0,0,0.5)';
    T.translate(0.5, 0.5);
    T.beginPath();
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        const g = grid[i][j];
        if (g.prev) {
          const dx = g.prev.x - g.x;
          const dy = g.prev.y - g.y;
          T.save();
          T.translate(g.x, g.y);
          T.rotate(Math.atan2(dy, dx));
          T.moveTo(0.5, 0);
          T.lineTo(0, -0.15);
          T.lineTo(0, 0.15);
          T.restore();
        }
      }
    }
    T.fill();
  }
};

const {$} = window;
$('#controls')
  .html(
    types
      .map(
        ({name, color, cost}) =>
          `<label data-type="${name}">
            <div class="color" style="background: ${color}"></div> 
            ${name}: 
            <input data-type="${name}" type="number" value="${cost}"/>
          </label>`
      )
      .join(' ')
  )
  .on('input', 'input', function () {
    const type = $(this).data('type');
    const value = $(this).val();
    if (typeIndex[type] && !isNaN(value)) {
      typeIndex[type].cost = Number(value);
      draw();
    }
  })
  .on('click', 'label', function () {
    const t = typeIndex[$(this).data('type')];
    if (t) {
      selectedType = t;
      $('.active').removeClass('active');
      $(this).addClass('active');
    }
  })
  .append(
    $('<button>Reset</button>').on('click', function () {
      localStorage.grid = null;
      init();
    })
  )
  .append(
    $('<button>Clear</button>').on('click', function () {
      for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
          grid[i][j].type = typeIndex.grass;
        }
      }
      draw();
    })
  );

$(`label[data-type="${selectedType.name}"]`).addClass('active');

$(canvas).on('click mousemove', ({which, offsetX, offsetY}) => {
  if (which !== 1) return;
  const x = Math.floor(offsetX / size);
  const y = Math.floor(offsetY / size);
  if (grid[y][x].type === selectedType) return;
  grid[y][x].type = selectedType;
  localStorage.grid = JSON.stringify(
    grid.map((r) => r.map((c) => types.indexOf(c.type)))
  );
  draw();
});

$(window).on('keydown keyup', (e) => {
  if (e.key === 's') {
    showHeatMap = e.type === 'keydown';
    draw();
  }
});

init();
