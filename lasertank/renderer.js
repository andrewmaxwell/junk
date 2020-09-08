import {SPRITE_SIZE, DIRS, TYPES} from './consts.js';

const graphics = document.querySelector('img');

export const drawSprite = (ctx, time, {x, y, type}, tankDir) => {
  const [sx, sy] = type.sprite(time, tankDir);
  ctx.drawImage(
    graphics,
    sx * SPRITE_SIZE,
    sy * SPRITE_SIZE,
    SPRITE_SIZE,
    SPRITE_SIZE,
    x * SPRITE_SIZE,
    y * SPRITE_SIZE,
    SPRITE_SIZE,
    SPRITE_SIZE
  );
};

export class Renderer {
  constructor(canvas, rows, cols) {
    this.canvas = canvas;
    this.width = canvas.width = SPRITE_SIZE * cols;
    this.height = canvas.height = SPRITE_SIZE * rows;
    this.time = 0;
  }
  draw(game) {
    const {canvas, width, height} = this;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, width, height);

    game
      .getBoardSorted()
      .forEach((b) => drawSprite(ctx, this.time, b, game.tankDir));

    game.lasers.forEach(({x, y, dir}) => {
      ctx.fillStyle = 'lime';
      if (dir === DIRS.LEFT || dir === DIRS.RIGHT) {
        ctx.fillRect(x * SPRITE_SIZE, y * SPRITE_SIZE + 14, SPRITE_SIZE, 4);
      } else {
        ctx.fillRect(x * SPRITE_SIZE + 14, y * SPRITE_SIZE, 4, SPRITE_SIZE);
      }
    });

    if (game.lost()) {
      ctx.fillStyle = 'red';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '128px sans-serif';
      ctx.fillText('YOU DEAD', width / 2, height / 2);
      ctx.font = '32px sans-serif';
      ctx.fillText('Press "R" to try again', width / 2, height / 2 + 60);
    } else if (game.won()) {
      ctx.fillStyle = 'blue';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '128px sans-serif';
      ctx.fillText('You won!', width / 2, height / 2);
    }
  }
  drawGhost(e, tankDir, currentType) {
    const ctx = this.canvas.getContext('2d');
    ctx.globalAlpha = 0.5;
    drawSprite(
      ctx,
      this.time,
      {
        x: Math.floor(e.offsetX / SPRITE_SIZE),
        y: Math.floor(e.offsetY / SPRITE_SIZE),
        type: currentType,
      },
      tankDir
    );
    ctx.globalAlpha = 1;
  }
  increment(game) {
    this.time++;
    this.draw(game);
  }
}
