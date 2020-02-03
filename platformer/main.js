const parseMap = str =>
  str
    .trim()
    .split('\n')
    .map(r => r.split(''));

const canvas = document.querySelector('canvas');
const width = (canvas.width = 800);
const height = (canvas.height = 600);
const T = canvas.getContext('2d');

const playerRad = 0.1;
const gravity = 0.01;
const playerMoveSpeed = 0.1;
const jumpAmt = 0.15;

let map,
  player,
  pressing = {};

const textarea = document.querySelector('textarea');
textarea.value =
  textarea.value ||
  `
##############
# p          #
#            #
#        #   #
#    ##  #####
#   ####     #
##############`;

const draw = () => {
  const scale = Math.min(width / map[0].length, height / map.length);
  T.clearRect(0, 0, width, height);
  T.save();
  T.scale(scale, scale);
  T.fillStyle = 'black';
  map.forEach((r, y) => {
    r.forEach((c, x) => {
      if (c === '#') T.fillRect(x, y, 1, 1);
    });
  });

  T.fillStyle = 'blue';
  T.fillRect(
    player.x - playerRad,
    player.y - playerRad,
    playerRad * 2,
    playerRad * 2
  );
  T.restore();
};

const onTextareaChange = () => {
  map = parseMap(textarea.value);
  player = {
    x: map.find(r => r.includes('p')).indexOf('p') + 0.5,
    y: map.findIndex(r => r.includes('p')) + 0.5,
    ys: 0
  };
  console.log(player);
  draw();
};

const getCell = (x, y) => {
  y = Math.floor(y);
  return map[y] && map[y][Math.floor(x)];
};

textarea.addEventListener('input', onTextareaChange);

const reset = () => {
  onTextareaChange();
};

const corners = [
  // [-1, -1]
  // [1, -1],
  // [1, 1]
  // [-1, 1]
  [0, 0]
];

const loop = () => {
  if (document.hasFocus()) {
    if (pressing.KeyR) reset();
    if (pressing.KeyW && getCell(player.x, player.y + playerRad) === '#')
      player.ys -= jumpAmt;

    player.ys += gravity;
    player.y += player.ys;

    corners.forEach(([dx, dy]) => {
      const wx = Math.floor(player.x + dx * playerRad);
      const wy = Math.floor(player.y + dy * playerRad);
      if (map[wy] && map[wy][wx] === '#') {
        // const overlapX = wx - player.x - 0.5 - playerRad;
        // const overlapY = wy - player.y - 0.5 - playerRad;
        // if (overlapX < overlapY) {
        //   player.x -= overlapX;
        // } else {
        //   player.y -= overlapY;
        //   player.ys = 0;
        // }
      }
    });

    if (pressing.KeyA || pressing.KeyD) {
      if (pressing.KeyA) player.x -= playerMoveSpeed;
      if (pressing.KeyD) player.x += playerMoveSpeed;
    }

    draw();
  }

  requestAnimationFrame(loop);
};

const keyHandler = e => {
  pressing[e.code] = e.type === 'keydown';
};
window.addEventListener('keyup', keyHandler);
window.addEventListener('keydown', keyHandler);

reset();
loop();
