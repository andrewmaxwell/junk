const {
  React,
  ReactDOM,
  R: {assocPath, pipe, uniq, flatten, filter, path, identity, pluck},
  LZString
} = window;

const debounce = (fn, time = 1000) => {
  let timeout;
  return function() {
    const functionCall = () => fn.apply(this, arguments);
    clearTimeout(timeout);
    timeout = setTimeout(functionCall, time);
  };
};

const getColors = pipe(
  path(['state', 'grids']),
  pluck('grid'),
  flatten,
  uniq,
  filter(identity)
);

const dirs = [
  ['Nudge Left', -1, 0],
  ['Nudge Right', 1, 0],
  ['Nudge Up', 0, -1],
  ['Nudge Down', 0, 1]
];

class App extends React.Component {
  constructor() {
    super();
    this.state = {
      rows: 64,
      cols: 64,
      size: 10,
      painting: false,
      current: '#000000',
      gridIndex: 0,
      grids: [
        {
          name: 'New Frame',
          grid: new Array(4096).fill(0)
        }
      ],
      help: false
    };
    this.canvas = React.createRef();
  }
  pressKey = e => {
    const {gridIndex, grids} = this.state;
    const dir = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
    if (dir) {
      this.setState({
        gridIndex: (gridIndex + dir + grids.length) % grids.length
      });
    }
  };
  mouseUp = () => this.setState({painting: false});
  componentDidMount() {
    const {rows, cols, size} = this.state;
    this.canvas.current.width = cols * size;
    this.canvas.current.height = rows * size;
    window.addEventListener('hashchange', this.load);
    window.addEventListener('keyup', this.pressKey);
    window.addEventListener('mouseup', this.mouseUp);
    this.load();
  }
  componentWillUnmount() {
    window.removeEventListener('hashchange', this.load);
    window.removeEventListener('keyup', this.pressKey);
    window.removeEventListener('mouseup', this.mouseUp);
  }
  componentDidUpdate() {
    const {rows, cols, size, grids, gridIndex} = this.state;
    const T = this.canvas.current.getContext('2d');

    T.fillStyle = '#F8F8F8';
    T.fillRect(0, 0, cols * size, rows * size);
    T.save();
    T.translate(-0.5, -0.5);

    T.lineWidth = 1 / 32;
    T.beginPath();
    for (let i = 1; i < cols; i++) {
      T.moveTo(i * size, 0);
      T.lineTo(i * size, rows * size);
    }
    for (let i = 1; i < rows; i++) {
      T.moveTo(0, i * size);
      T.lineTo(cols * size, i * size);
    }
    T.stroke();

    const {grid} = grids[gridIndex];
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        if (grid[i * cols + j]) {
          T.fillStyle = grid[i * cols + j];
          T.fillRect(j * size, i * size, size, size);
        }
      }
    }

    T.lineWidth = 0.5;
    T.beginPath();
    T.moveTo(size * (cols / 2 - 0.5), (size * rows) / 2);
    T.lineTo(size * (cols / 2 + 0.5), (size * rows) / 2);
    T.moveTo((size * cols) / 2, size * (rows / 2 - 0.5));
    T.lineTo((size * cols) / 2, size * (rows / 2 + 0.5));
    T.stroke();

    T.restore();

    this.save();
  }
  getIndex(e) {
    const {offsetX: x, offsetY: y} = e.nativeEvent;
    const {size, cols} = this.state;
    return Math.floor(y / size) * cols + Math.floor(x / size);
  }
  load = () => {
    if (location.hash.length < 2) return this.componentDidUpdate();
    try {
      const decompressed = LZString.decompressFromBase64(
        location.hash.slice(1)
      );
      this.setState(JSON.parse(decompressed));
    } catch (e) {
      console.log(e);
      this.componentDidUpdate();
    }
  };
  save = debounce(() => {
    const {gridIndex, grids} = this.state;
    const data = JSON.stringify({gridIndex, grids});
    const compressed = (location.hash = LZString.compressToBase64(data));
    console.log(compressed.length);
    // console.log(data);

    // Store data a different way?
    // const {grids, cols} = this.state;
    // const colors = getColors(this);
    // const colorIndex = colors.reduce((res, c, i) => (res[c] = i + 1, res), {});
    // var data = [
    //   grids.map(n => n.name),
    //   colors.map(c => c.slice(1)),
    //   grids.map(g =>  g.grid.map(v => (colorIndex[v] || 0).toString(36)).join(''))
    // ].map(m => m.join(';')).join('|');

    // console.log(data);
    // console.log(data.length);
    // console.log(LZString.compressToBase64(data));
  });
  render() {
    const {
      state: {grids, gridIndex, current, rows, cols, painting, help}
    } = this;
    const {grid} = grids[gridIndex];

    return (
      <div style={{width: 840}}>
        <div className="col" style={{width: 200}}>
          <button onClick={() => this.setState({help: !help})}>
            {help ? 'Hide' : 'Show'} Help
          </button>

          {help && (
            <div className="help">
              You can make multiple frames, they will show up as a list here.
              Click on them to change them, or press the up and down arrows.
            </div>
          )}
          {grids.map(({name}, index) => (
            <div
              key={index}
              className={'frameRow' + (index === gridIndex ? ' active' : '')}
              onClick={() => this.setState({gridIndex: index})}
              title={
                index === gridIndex
                  ? 'You are currently viewing this frame.'
                  : 'Click to switch to this frame.'
              }
            >
              {name}
            </div>
          ))}

          {help && (
            <div className="help">
              Use these buttons to copy, rename, or delete the currently
              selected (blue) frame. You can always undo by hitting the back
              button.
            </div>
          )}
          <button
            onClick={() => {
              const name = prompt('Enter a name for this frame.');
              if (name) {
                this.setState({
                  gridIndex: grids.length,
                  grids: grids.concat({name, grid: grid.slice(0)})
                });
              }
            }}
          >
            Copy
          </button>

          <button
            onClick={() => {
              const name = prompt(
                'Enter a name for this frame.',
                grids[gridIndex].name
              );
              if (name)
                this.setState(assocPath(['grids', gridIndex, 'name'], name));
            }}
          >
            Rename
          </button>

          {grids.length > 1 && (
            <button
              onClick={() => {
                this.setState({
                  gridIndex: 0,
                  grids: grids.filter((g, i) => i !== gridIndex)
                });
              }}
            >
              Delete
            </button>
          )}

          <hr />

          <div style={{marginTop: 32}}>
            {help && (
              <div className="help">
                {`The large square is the current color. Click on it to pick a new
                color from a color palette. The small squares are colors you're
                already using. Click on to set it as your current color.`}
              </div>
            )}
            <input
              type="color"
              value={current}
              onChange={e => this.setState({current: e.target.value})}
              title="Click to change the current color using a color picker"
            />

            {getColors(this).map(c => (
              <button
                key={c}
                className={c === current ? 'active' : ''}
                style={{backgroundColor: c}}
                onClick={() => this.setState({current: c})}
                title="Click to the change the current color to this one."
              >
                &nbsp;
              </button>
            ))}

            <br />

            {dirs.map(([dir, x, y]) => (
              <button
                key={dir}
                title="Nudge the whole image by one pixel. WARNING: pixels on the edge will be lost."
                onClick={() => {
                  const newGrid = grid.map((_, i) => {
                    const nx = (i % cols) - x;
                    const ny = Math.floor(i / cols) - y;
                    return nx >= 0 && nx < cols && ny >= 0 && ny < rows
                      ? grid[ny * cols + nx]
                      : 0;
                  });
                  this.setState(
                    assocPath(['grids', gridIndex, 'grid'], newGrid)
                  );
                }}
              >
                {dir}
              </button>
            ))}

            <button
              onClick={() => {
                this.setState(
                  assocPath(
                    ['grids', gridIndex, 'grid'],
                    new Array(4096).fill(0)
                  )
                );
              }}
            >
              Clear Screen
            </button>

            {help && (
              <div className="help">
                You can always press the back button to undo. Or forward to
                redo. Click or drag on the grid to draw with the selected color.
                To erase, click or drag starting from a cell that is already the
                selected color.
              </div>
            )}
          </div>
        </div>
        <div className="col">
          <canvas
            ref={this.canvas}
            style={{background: '#F8F8F8'}}
            onMouseDown={e => {
              const index = this.getIndex(e);
              const painting = grid[index] === current ? 0 : current;
              this.setState({
                painting,
                grids: assocPath([gridIndex, 'grid', index], painting, grids)
              });
            }}
            onMouseMove={e => {
              if (painting !== false) {
                const index = this.getIndex(e);
                if (grid[index] !== painting) {
                  this.setState(
                    assocPath(['grids', gridIndex, 'grid', index], painting)
                  );
                }
              }
            }}
          />
        </div>
      </div>
    );
  }
}

ReactDOM.render(<App />, document.getElementById('root'));
