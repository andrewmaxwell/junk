import {Tree} from './Tree.js';

const maxBranches = 20000; // higher is more detailed but it will make your computer slower and hotter

const canvas = document.querySelector('canvas');
const ctx = canvas.getContext('2d');

const tree = new Tree(-Math.PI / 2); // -Math.PI/2 is straight up

let frameCounter = 0;

function loop() {
  // if we let it grow forever, it'll probably crash something, so limit it
  if (tree.numDescendants() < maxBranches) {
    tree.grow();
  }

  // FUN FACT: setting the canvas size also clears it.
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  // draw the tree at the bottom middle
  tree.draw(ctx, window.innerWidth / 2, window.innerHeight, frameCounter);

  frameCounter++;
  requestAnimationFrame(loop);
}

loop();
