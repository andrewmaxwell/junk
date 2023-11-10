import {webgl2} from './webgl2.js';

const canvas = document.querySelector('canvas');

const {createTexture, draw} = webgl2({
  canvas,
  fragmentShader: await (await fetch('./frag.glsl')).text(),
});

let prev = createTexture(innerWidth, innerHeight);
let next = createTexture(innerWidth, innerHeight);

function loop() {
  draw(prev, next);
  [prev, next] = [next, prev];
  requestAnimationFrame(loop);
}

loop();
