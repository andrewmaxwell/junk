const SIZE = 64;

const splitEvery = (n, arr) => {
  const result = [];
  for (let i = 0; i < arr.length; i += n) {
    result.push(arr.slice(i, i + n));
  }
  return result;
};

class Renderer {
  constructor(width, height, frames) {
    this.frames = frames;
    const board = (this.board = document.createElement('div'));
    board.className = 'board';
    board.style.width = width * SIZE + 'px';
    board.style.height = height * SIZE + 'px';
    document.body.append(board);
  }
  render(index) {
    this.board.innerHTML = (this.frames[index] || [])
      .map(
        ({x, y, w, h, color}) =>
          `<div class="gem color${color.toUpperCase()} ${
            /[a-z]/.test(color) ? 'burst' : ''
          }" style="top: ${y * SIZE}px; left: ${x * SIZE}px; width: ${
            w * SIZE
          }px; height: ${h * SIZE}px"></div>`
      )
      .join('');
  }
}

export const render = (width, height, game, expected = []) => {
  if (typeof expected === 'string') {
    expected = splitEvery(
      12,
      expected.match(/║.{6}║/g).map((s) => s.slice(1, -1))
    ).map((b) => b.join('\n'));
  }

  const actualBoard = new Renderer(
    width,
    height,
    game.frames.map((f) => f.gems)
  );
  const expectedBoard = new Renderer(
    width,
    height,
    expected.map((f) =>
      f.split('\n').flatMap((r, y) =>
        r
          .split('')
          .map((color, x) => ({x, y, w: 1, h: 1, color}))
          .filter((g) => g.color !== ' ')
      )
    )
  );
  let index = Number(location.hash.slice(1)) || 0;
  const draw = () => {
    const i = index % game.frames.length;
    actualBoard.render(i);
    expectedBoard.render(game.frames[i].move);
  };
  draw();
  window.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowLeft')
      index = (index - 1 + game.frames.length) % game.frames.length;
    if (e.key === 'ArrowRight') index = (index + 1) % game.frames.length;
    location.hash = index;
    draw();
  });
};
