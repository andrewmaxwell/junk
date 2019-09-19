const X_SYMBOL = 'x';
const O_SYMBOL = 'o';

const drawLines = context => {
  for (let i = 1; i < 3; i++) {
    context.moveTo(i, 0);
    context.lineTo(i, 3);
    context.moveTo(0, i);
    context.lineTo(3, i);
  }
};

const drawSymbols = (context, rows) => {
  for (let i = 0; i < rows.length; i++) {
    for (let j = 0; j < rows[i].length; j++) {
      if (rows[i][j] !== undefined) {
        context.save();
        context.translate(j, i);
        if (rows[i][j] === X_SYMBOL) {
          context.moveTo(0, 0);
          context.lineTo(1, 1);
          context.moveTo(1, 0);
          context.lineTo(0, 1);
        } else {
          context.moveTo(1, 0.5);
          context.arc(0.5, 0.5, 0.5, 0, 2 * Math.PI);
        }
        context.restore();
      }
    }
  }
};

const drawWinLine = (context, winLine) => {
  if (!winLine) return;
  const offsetX = winLine.x1 === winLine.x2 ? 0.5 : 0;
  const offsetY = winLine.y1 === winLine.y2 ? 0.5 : 0;
  context.lineWidth *= 2;
  context.beginPath();
  context.moveTo(winLine.x1 + offsetX, winLine.y1 + offsetY);
  context.lineTo(winLine.x2 + offsetX, winLine.y2 + offsetY);
  context.stroke();
};

const renderTicTacToe = (canvas, width, game) => {
  canvas.width = width;
  canvas.height = width;
  const context = canvas.getContext('2d');
  context.save();
  context.scale(width / 3, width / 3);
  context.lineWidth = 9 / width;
  context.beginPath();
  drawLines(context);
  drawSymbols(context, game.rows);
  context.stroke();
  drawWinLine(context, game.winLine);
  context.restore();
};

class TicTacToe {
  constructor() {
    this.nextMove = X_SYMBOL;
    this.rows = new Array(3);
    for (let i = 0; i < 3; i++) {
      this.rows[i] = new Array(3);
    }
  }
  move(x, y) {
    if (
      !this.winLine &&
      x >= 0 &&
      x < 3 &&
      y >= 0 &&
      y < 3 &&
      !this.rows[y][x]
    ) {
      this.rows[y][x] = this.nextMove;
      this.nextMove = this.nextMove === X_SYMBOL ? O_SYMBOL : X_SYMBOL;
      this.checkBoard();
    }
  }
  checkBoard() {
    for (let i = 0; !this.winLine && i < 3; i++) {
      this.winLine = this.checkRow(i) || this.checkCol(i);
    }
    if (!this.winLine)
      this.winLine = this.checkLine(0, 0, 1, 1) || this.checkLine(0, 2, 1, -1);
  }
  checkLine(rowStart, colStart, rowDirection, colDirection) {
    for (
      let rowIndex = rowStart, colIndex = colStart;
      rowIndex < 3 && colIndex < 3;
      rowIndex += rowDirection, colIndex += colDirection
    ) {
      if (
        !this.rows[rowIndex][colIndex] ||
        this.rows[rowIndex][colIndex] !== this.rows[rowStart][colStart]
      )
        return false;
    }
    return {
      x1: colStart,
      y1: rowStart,
      x2: colStart + colDirection * 3,
      y2: rowStart + rowDirection * 3
    };
  }
  checkRow(rowIndex) {
    return this.checkLine(rowIndex, 0, 0, 1);
  }
  checkCol(colIndex) {
    return this.checkLine(0, colIndex, 1, 0);
  }
}

const makeStore = (reducer, onChange) => {
  let state;
  const dispatch = action => {
    state = reducer(action, state);
    onChange(state);
  };
  dispatch({type: 'init'});
  return {dispatch};
};

const initialState = {
  rows: [[], [], []],
  nextMove: X_SYMBOL
};

const reducer = (action) => pipe(
  defaultTo(initialState),
  when()
), state = initialState) => {
  if (action.type === 'move') {

  }
  return state;
};

window.init = (canvas, width) => {
  const render = state => renderTicTacToe(canvas, width, state);
  const store = makeStore(reducer)(render);

  canvas.addEventListener('click', event => {
    store.dispatch({
      type: 'move',
      x: Math.floor((event.offsetX / width) * 3),
      y: Math.floor((event.offsetY / width) * 3)
    });
  });
};
