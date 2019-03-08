var C = document.body.childNodes[0],
  W = (C.width = 900),
  H = (C.height = 600),
  T = C.getContext('2d'),
  size = 15,
  LEFT = 1,
  RIGHT = 2,
  UP = 3,
  DOWN = 4,
  FOOD = 5,
  AI = 6,
  rows = (H / size) << 0,
  cols = (W / size) << 0,
  pause,
  you,
  A,
  pressed = 0,
  deadColor = '#C9C9C9',
  frameRate = 100,
  foodFrequency = 0.1,
  reset = function() {
    pause = 0;
    you = {dir: RIGHT, body: [[3, 3], [2, 3], [1, 3]], color: '#00CC36'};
    var x = W / size - 4,
      y = H / size - 4;
    A = [
      you,
      {
        type: AI,
        dir: LEFT,
        body: [[x, y], [x + 1, y], [x + 2, y]],
        color: 'red',
        total: 0,
        times: 0
      }
    ]; //,
    //{type: AI, dir: RIGHT, body: [[3,3],[2,3],[1,3]], color: "blue", total: 0, times: 0}]
    T.fillStyle = '#333';
    T.fillRect(0, 0, W, H);
  },
  ai = (function() {
    var buildMap = function() {
        var map = [];
        for (var r = 0; r < rows; r++) {
          map[r] = [];
          for (var c = 0; c < cols; c++)
            map[r][c] = {
              d: Infinity,
              r,
              c,
              v: !r || r == rows - 1 || !c || c == cols - 1,
              f: 0
            };
        }
        for (var i = 0; i < A.length; i++) {
          if (A[i].type == FOOD) {
            var m = map[A[i].body[0][1]][A[i].body[0][0]];
            m.f = 1;
            m.i = A[i];
          } else {
            for (var j = 0; j < A[i].body.length; j++)
              map[A[i].body[j][1]][A[i].body[j][0]].v = 1;
          }
        }
        return map;
      },
      findAndRemoveMin = function(Q) {
        for (var minDist = Infinity, u, i = 0; i < Q.length; i++) {
          if (Q[i].d < minDist) {
            u = i;
            minDist = u.d;
          }
        }
        return Q.splice(u, 1)[0];
      },
      o = [[0, -1], [0, 1], [-1, 0], [1, 0]];

    return function(s) {
      var sr = s.body[0][1],
        sc = s.body[0][0],
        map = buildMap(),
        Q = [map[sr][sc]];

      map[sr][sc].d = 0;

      // T.globalAlpha=0.2
      // T.fillStyle=s.color
      while (Q.length) {
        var u = findAndRemoveMin(Q);
        if (u.d == Infinity) break;
        u.visited = 1;
        for (var i = 0; i < 4; i++) {
          var r = u.r + o[i][0],
            c = u.c + o[i][1];
          if (map[r] && map[r][c]) {
            var m = map[r][c];
            if (!m.v && m.d > u.d + 1) {
              m.d = u.d + 1;
              m.p = u;
              if (m.f) {
                // && !claimed(m)){
                // s.pursuing=m.i
                // s.pursueDist=m.d
                while (m.p) {
                  // T.fillRect(m.c,m.r,1,1)
                  if (m.p.r == sr && m.p.c == sc) {
                    if (m.c < sc) return LEFT;
                    else if (m.c > sc) return RIGHT;
                    else if (m.r < sr) return UP;
                    else return DOWN;
                  }
                  m = m.p;
                }
              } else Q.push(m);
            }
          }
        }
      }
      // if ((s.dir==LEFT && map[sr][sc-1].d==Infinity)
      // || (s.dir==RIGHT && map[sr][sc+1].d==Infinity)
      // || (s.dir==UP && map[sr-1][sc].d==Infinity)
      // || (s.dir==DOWN && map[sr+1][sc].d==Infinity)){
      if (s.dir != RIGHT && map[sr][sc - 1].d != Infinity) return LEFT;
      else if (s.dir != LEFT && map[sr][sc + 1].d != Infinity) return RIGHT;
      else if (s.dir != UP && map[sr + 1][sc].d != Infinity) return DOWN;
      else if (s.dir != DOWN && map[sr - 1][sc].d != Infinity) return UP;
      // }
      return s.dir;
    };
  })(),
  move = function(s) {
    if (s.dir && !s.dead) {
      if (s.type == AI) {
        var start = new Date();
        s.dir = ai(s);
        s.total += new Date() - start;
        s.times++;
      }
      var head = s.body[0],
        newCoord;
      switch (s.dir) {
        case UP:
          newCoord = [head[0], head[1] - 1];
          break;
        case DOWN:
          newCoord = [head[0], head[1] + 1];
          break;
        case LEFT:
          newCoord = [head[0] - 1, head[1]];
          break;
        case RIGHT:
          newCoord = [head[0] + 1, head[1]];
          break;
      }
      var here = whatsHere(newCoord);
      if (here == -1) {
        s.body.unshift(newCoord);
        s.body.pop();
      } else if (A[here] && A[here].type == FOOD) {
        s.body.unshift(newCoord);
        A.splice(here, 1);
      } else {
        s.dead = 1;
      }
    }
    for (var i = 0; i < s.body.length; i++) {
      T.globalAlpha = i == 0 ? 1 : 0.7;
      T.fillStyle = s.dead ? deadColor : s.color;
      T.fillRect(s.body[i][0], s.body[i][1], 1, 1);
    }
  },
  whatsHere = function(coord) {
    if (
      coord[0] < 1 ||
      coord[0] > cols - 2 ||
      coord[1] < 1 ||
      coord[1] > rows - 2
    )
      return -2;
    for (var i = 0; i < A.length; i++) {
      for (var j = 0; j < A[i].body.length; j++) {
        if (A[i].body[j][0] == coord[0] && A[i].body[j][1] == coord[1])
          return i;
      }
    }
    return -1;
  },
  loop = function() {
    T.clearRect(size, size, W - 2 * size, H - 2 * size);
    T.save();
    T.scale(size, size);
    for (var i = 0; i < A.length; i++) move(A[i]);
    pressed = 0;
    if (Math.random() < foodFrequency) {
      var coord;
      while (!coord || whatsHere(coord) != -1)
        coord = [
          (1 + (cols - 2) * Math.random()) >> 0,
          (1 + (rows - 2) * Math.random()) >> 0
        ];
      A.push({type: FOOD, body: [coord], color: '#C49700'});
    }
    T.restore();

    if (you.dead) {
      T.fillStyle = 'rgba(0,0,0,.5)';
      T.fillRect(0, 0, W, H);
      T.textAlign = 'center';
      T.textBaseline = 'middle';
      T.fillStyle = 'red';
      T.font = '120px Helvetica';
      T.fillText('YOU DEAD', W / 2, H / 2);
      T.font = '40px Helvetica';
      T.fillText('press space', W / 2, H / 2 + 80);
      pause = 1;
    }
    if (!pause) setTimeout(loop, frameRate);
  };
onkeydown = function(e) {
  switch (e.keyCode) {
    case 32:
      if (you.dead) {
        reset();
      } else if (pause) {
        pause = 0;
      } else pause = 1;
      loop();
      break;
    case 37:
      if (!pressed && you.dir != RIGHT) you.dir = LEFT;
      pressed = 1;
      break;
    case 38:
      if (!pressed && you.dir != DOWN) you.dir = UP;
      pressed = 1;
      break;
    case 39:
      if (!pressed && you.dir != LEFT) you.dir = RIGHT;
      pressed = 1;
      break;
    case 40:
      if (!pressed && you.dir != UP) you.dir = DOWN;
      pressed = 1;
      break;
  }
};
reset();
loop();
