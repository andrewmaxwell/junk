const X_SYMBOL = 'x';
const O_SYMBOL = 'o';

class TicTacToeRenderer {
  constructor(canvas, width) {
    this.canvas = canvas;
    this.width = width;
    this.canvas.width = width;
    this.canvas.height = width;
  }
  drawLines(context) {
    for (let i = 1; i < 3; i++) {
      context.moveTo(i, 0);
      context.lineTo(i, 3);
      context.moveTo(0, i);
      context.lineTo(3, i);
    }
  }
  drawSymbols(context, rows) {
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
  }
  drawWinLine(context, winLine) {
    if (!winLine) return;
    const offsetX = winLine.x1 === winLine.x2 ? 0.5 : 0;
    const offsetY = winLine.y1 === winLine.y2 ? 0.5 : 0;
    context.lineWidth *= 2;
    context.beginPath();
    context.moveTo(winLine.x1 + offsetX, winLine.y1 + offsetY);
    context.lineTo(winLine.x2 + offsetX, winLine.y2 + offsetY);
    context.stroke();
  }
  render(game) {
    const context = this.canvas.getContext('2d');
    context.save();
    context.scale(this.width / 3, this.width / 3);
    context.lineWidth = 9 / this.width;
    context.clearRect(0, 0, 3, 3);
    context.beginPath();
    this.drawLines(context);
    this.drawSymbols(context, game.rows);
    context.stroke();
    this.drawWinLine(context, game.winLine);
    context.restore();
  }
}

class WinLine {
  constructor(x1, y1, xLength, yLength) {
    this.x1 = x1;
    this.y1 = y1;
    this.x2 = x1 + xLength;
    this.y2 = y1 + yLength;
  }
}

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
    return new WinLine(colStart, rowStart, colDirection * 3, rowDirection * 3);
  }
  checkRow(rowIndex) {
    return this.checkLine(rowIndex, 0, 0, 1);
  }
  checkCol(colIndex) {
    return this.checkLine(0, colIndex, 1, 0);
  }
}

window.App = class App {
  constructor() {
    const canvas = document.querySelector('canvas');
    this.width = 600;
    this.renderer = new TicTacToeRenderer(canvas, this.width);
    this.game = new TicTacToe();

    canvas.addEventListener('click', this.click.bind(this));
    this.renderer.render(this.game);
  }
  click(event) {
    this.game.move(
      Math.floor((event.offsetX / this.width) * 3),
      Math.floor((event.offsetY / this.width) * 3)
    );
    this.renderer.render(this.game);
  }
};
