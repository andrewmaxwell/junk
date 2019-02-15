'use strict';

import 'https://code.jquery.com/jquery-3.3.1.min.js';
import {Controls} from '../common/Controls.js';
const {$} = window;

var makeMaze = function(opts) {
  var C = document.createElement('canvas'),
    W = (C.width = opts.size * opts.cols + 1),
    H = (C.height = opts.size * opts.rows + 1),
    T = C.getContext('2d'),
    maze = [],
    Q = [];

  //prepare the canvas and context
  $('body').prepend(C);
  T.fillStyle = 'black';
  T.fillRect(0, 0, W, H);
  T.translate(0.5, 0.5);
  T.scale(opts.size, opts.size);
  T.translate(0.5, 0.5);
  T.strokeStyle = '#FFF';
  T.lineCap = T.lineJoin = 'round';
  T.lineWidth = 0.8;

  //init the maze
  for (var i = 0, j; i < opts.rows; i++) {
    for (maze[i] = [], j = 0; j < opts.cols; j++) {
      maze[i][j] = {r: i, c: j, v: 0};
    }
  }

  maze[0][0].hue = 0;
  Q = [maze[0][0]];

  //generate and draw the maze
  var iterate = function() {
    for (var t = 0, u; t < opts.speed && Q.length; t++) {
      u = Q.pop();
      if (!u.v) {
        u.v = 1;
        if (u.p) {
          if (opts.color) {
            u.hue = u.p.hue + 0.05;
            T.strokeStyle = 'hsl(' + (u.hue % 360) + ',100%,20%)';
          }
          T.beginPath();
          T.moveTo(u.c, u.r);
          T.lineTo(u.p.c, u.p.r);
          T.stroke();
        }
        for (
          var o = [[-1, 0], [0, -1], [1, 0], [0, 1]], i = 0, n, k;
          i < 4;
          i++
        ) {
          n = (4 * Math.random()) >> 0;
          k = o[n];
          o[n] = o[i];
          o[i] = k;
        }
        for (let i = 0, r, c; i < 4; i++) {
          r = u.r + o[i][0];
          c = u.c + o[i][1];
          if (
            r >= 0 &&
            r < opts.rows &&
            c >= 0 &&
            c < opts.cols &&
            !maze[r][c].v
          ) {
            maze[r][c].p = u;
            Q.push(maze[r][c]);
          }
        }
      }
    }
    if (Q.length) setTimeout(iterate, 0);
    else {
      if (!opts.color) {
        T.beginPath();
        T.moveTo(0, -1);
        T.lineTo(0, 0);
        T.moveTo(opts.cols - 1, opts.rows - 1);
        T.lineTo(opts.cols - 1, opts.rows);
        T.stroke();
      }
      C.style['background-image'] = 'url(' + C.toDataURL() + ')';
      onmousemove = function(e) {
        var x = (e.pageX / opts.size) >> 0,
          y = (e.pageY / opts.size) >> 0,
          u;
        T.clearRect(-1, -1, opts.cols + 1, opts.rows + 1);
        if (maze[y] && maze[y][x]) {
          u = maze[y][x];
          T.strokeStyle = opts.color ? '#FFF' : '#F00';
          T.lineWidth = 0.3;
          T.beginPath();
          T.moveTo(u.c, u.r);
          while ((u = u.p)) T.lineTo(u.c, u.r);
          T.stroke();
        }
      };
    }
  };
  iterate();
};

const config = {
  rows: 150,
  cols: 300,
  size: 4,
  speed: 10,
  ...location.search
    .slice(1)
    .split('&')
    .map(p => p.split('='))
    .reduce((res, p) => ((res[p[0]] = parseFloat(p[1]) || p[1]), res), {})
};

makeMaze(config);

Controls({
  instructions: `After the maze is drawn, use the mouse to find the path from the start to
    the mouse position. With colors turned on, the hue of the path corresponds
    to its distance from the beginning of the maze.
    <style>label{width:50px;display:inline-block}input{width:50px}</style>
    <form action='' method='get' style='width:110px;margin:0 auto'>
      <label for='rows'>Rows</label>
      <input id='rows' name='rows' value='${config.rows}'>
      <br/>
      <label for='cols'>Cols</label>
      <input id='cols' name='cols' value='${config.cols}'>
      <br/>
      <label for='size'>Size</label>
      <input id='size' name='size' value='${config.size}'>
      <br/>
      <label for='speed'>Speed</label>
      <input id='speed' name='speed' value='${config.speed}'/>
      <br/>
      <label for='color'>Color</label>
      <input type='checkbox' id='color' name='color'${
        config.color ? ' checked="checked"' : ''
      }>
      <br/>
      <label>
      </label>
      <input type='submit' value='Go'/>
      </form>`
});
