import {makeWebgl} from './webgl.js';

const fragmentShader = `
precision mediump float;
uniform float cx;
uniform float cy;
uniform float scale;
uniform float max;
uniform vec2 resolution;

const vec4 black = vec4(0, 0, 0, 1);
const vec4 blue = vec4(0, 0.25, 1, 1);
const vec4 white = vec4(1, 1, 1, 1);
const vec4 yellow = vec4(1, 0.75, 0, 1);

float val (vec2 c0) {
  vec2 c = c0;
  for (int n = 0; n < 1024; n++) {
    if (length(c) > 2.) return float(n) / float(max);
    if (n >= int(max)) break;
    c = c0 + vec2(c.x * c.x - c.y * c.y, 2. * c.x * c.y);
  }
  return 0.;
}

vec4 color (vec2 c0) {
  float v = val(c0) * 4.;
  vec4 color1 = v < 1. ? black : v < 2. ? blue : v < 3. ? white  : yellow;
  vec4 color2 = v < 1. ? blue  : v < 2. ? white: v < 3. ? yellow : black;
  return mix(color1, color2, fract(v));
}

void main() {
  vec2 c = vec2(cx, cy);
  vec4 c0 = color(c + scale * ( gl_FragCoord.xy                    / resolution - 0.5));
  vec4 c1 = color(c + scale * ((gl_FragCoord.xy + vec2(0.5, 0  ))  / resolution - 0.5));
  vec4 c2 = color(c + scale * ((gl_FragCoord.xy + vec2(0  , 0.5))  / resolution - 0.5));
  vec4 c3 = color(c + scale * ((gl_FragCoord.xy + vec2(0.5, 0.5))  / resolution - 0.5));
  gl_FragColor = mix(mix(c0, c1, 0.5), mix(c2, c3, 0.5), 0.5);
}`;

const current = localStorage.current
  ? JSON.parse(localStorage.current)
  : {cx: -0.5, cy: 0, scale: 2.5, max: 100};

const webgl = makeWebgl({
  canvas: document.querySelector('canvas'),
  fragmentShader,
});

const render = () => {
  webgl.draw(current);
  localStorage.current = JSON.stringify(current);
  console.log(current);
};

window.addEventListener('mousemove', (e) => {
  if (!e.buttons) return;
  current.cx -= (e.movementX / window.innerWidth) * current.scale;
  current.cy += (e.movementY / window.innerHeight) * current.scale;
  render();
});

window.addEventListener('mousewheel', (e) => {
  const zoomAmt = Math.pow(1.01, e.deltaY);
  if (e.shiftKey) current.max /= zoomAmt;
  else {
    current.cx +=
      (e.offsetX / window.innerWidth - 0.5) * (1 - zoomAmt) * current.scale;
    current.cy -=
      (e.offsetY / window.innerHeight - 0.5) * (1 - zoomAmt) * current.scale;
    current.scale *= zoomAmt;
  }
  render();
});

render();
