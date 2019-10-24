const playerSpeed = 3;
const playerRad = 8;
const ballRad = 4;
const pickupRad = 16;
const ballSpeed = 10;
const ballFriction = 0.995;
const ballRestitution = 0.5;

const canvas = document.querySelector('canvas');
const width = (canvas.width = 800);
const height = (canvas.height = 600);
const ctx = canvas.getContext('2d');
const id = Math.random()
  .toString(36)
  .slice(2);

if (!localStorage.username) {
  localStorage.username = prompt('Enter your name.', '');
}

const you = {
  id,
  name: localStorage.username || 'Anonymous',
  x: Math.floor(Math.random() * width),
  y: Math.floor(Math.random() * height),
  ball: {held: true},
  pressing: {}
};
const playerIndex = {[you.id]: you};

const socket = new WebSocket('ws://everyone-is-it.herokuapp.com/');
let heartbeat;
const send = (data = you) => {
  socket.send(JSON.stringify(data));
  clearTimeout(heartbeat);
  heartbeat = setTimeout(send, 1000);
};
socket.addEventListener('open', () => send());
socket.addEventListener('message', ({data}) => {
  console.log('Received', data);
  data = JSON.parse(data);
  if (!data.id) return;
  if (data.newOwner && playerIndex[data.newOwner]) {
    playerIndex[data.newOwner].ball = data.ball;
  } else {
    if (!playerIndex[data.id]) send();
    playerIndex[data.id] = data;
    playerIndex[data.id].lastSeen = Date.now();
  }
});

const loop = () => {
  ctx.clearRect(0, 0, width, height);

  const players = Object.values(playerIndex);
  players.forEach(p => {
    const {w, a, s, d} = p.pressing;
    const xs = a && !d ? -1 : d && !a ? 1 : 0;
    const ys = w && !s ? -1 : s && !w ? 1 : 0;
    const m = xs && ys ? 1 / Math.SQRT2 : 1;
    p.x += xs * playerSpeed * m;
    p.y += ys * playerSpeed * m;
    p.x = Math.max(playerRad, Math.min(width - playerRad, p.x));
    p.y = Math.max(playerRad, Math.min(height - playerRad, p.y));

    players.forEach(p2 => {
      if (p2.ball.held) return;
      const dist = Math.hypot(p2.ball.x - p.x, p2.ball.y - p.y);
      if (p2.ball.thrownBy && dist < playerRad + ballRad) {
      }
      if (!p.ball.held && !p2.ball.thrownBy && dist < pickupRad) {
        if (p.ball !== p2.ball) {
          p2.ball = p.ball;
          if (p === you) send({id: p.id, newOwner: p2.id, ball: p.ball});
        }
        p.ball = {held: true};
      }
    });

    ctx.fillStyle = p === you ? 'red' : 'blue';
    ctx.fillRect(
      p.x - playerRad,
      p.y - playerRad,
      playerRad * 2,
      playerRad * 2
    );
  });

  players.forEach(p => {
    const {ball} = p;
    if (!ball.held) {
      ball.x += ball.xs;
      ball.y += ball.ys;
      ball.xs *= ballFriction;
      ball.ys *= ballFriction;
      if (ball.x <= ballRad) {
        ball.x = ballRad;
        ball.xs *= -ballRestitution;
        delete ball.thrownBy;
      } else if (ball.x > width - ballRad) {
        ball.x = width - ballRad;
        ball.xs *= -ballRestitution;
        delete ball.thrownBy;
      }
      if (ball.y <= ballRad) {
        ball.y = ballRad;
        ball.ys *= -ballRestitution;
        delete ball.thrownBy;
      } else if (ball.y > height - ballRad) {
        ball.y = height - ballRad;
        ball.ys *= -ballRestitution;
        delete ball.thrownBy;
      }
    }
    const {x, y} = ball.held ? p : ball;
    ctx.fillStyle = ball.thrownBy ? 'red' : 'green';
    ctx.beginPath();
    ctx.moveTo(x + ballRad, y);
    ctx.arc(x, y, ballRad, 0, 2 * Math.PI);
    ctx.fill();
  });

  ctx.textAlign = 'center';
  ctx.fillStyle = 'black';
  players.forEach(p => {
    ctx.fillText(p.name, p.x, p.y - playerRad - 2);
  });

  const now = Date.now();
  for (const key in playerIndex) {
    if (now - playerIndex[key].lastSeen > 1500) delete playerIndex[key];
  }

  requestAnimationFrame(loop);
};

window.onkeyup = window.onkeydown = e => {
  if (!['w', 'a', 's', 'd'].includes(e.key)) return;
  const prev = you.pressing[e.key];
  if (e.type === 'keydown') {
    you.pressing[e.key] = 1;
  } else {
    delete you.pressing[e.key];
  }
  if (prev !== you.pressing[e.key]) send();
};
canvas.onclick = e => {
  if (!you.ball.held) return;
  const dx = e.offsetX - you.x;
  const dy = e.offsetY - you.y;
  const m = 1 / Math.hypot(dx, dy);
  you.ball = {
    x: you.x + dx * m * (playerRad + ballRad),
    y: you.y + dy * m * (playerRad + ballRad),
    xs: dx * m * ballSpeed,
    ys: dy * m * ballSpeed,
    thrownBy: you.id
  };
  send();
};

loop();
