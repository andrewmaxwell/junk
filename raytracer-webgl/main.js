'use strict';
console.clear();

const numWorkers = 6;
const size = 512;

var canvas = document.getElementById('C');
var T = canvas.getContext('2d', {antialias: false, depth: false});
canvas.width = canvas.height = size;

var requestFrameCounter = 0;
var numFinished = 0;
var frames = [];
var start = Date.now();
var msPerFrame = 1000;
var loopFrame = 0;
var pool = [];
var idleWorkers = [];

for (var i = 0; i < numWorkers; i++) {
  var w = new Worker('worker.js');
  w.onmessage = receiveMessage;
  idleWorkers[i] = w;
  requestFrame(w);
}

loop();

function requestFrame(worker) {
  if (requestFrameCounter < 1000) {
    var fromPool = pool.pop();
    if (fromPool) {
      worker.postMessage(
        {imageData: fromPool, size, frame: requestFrameCounter++},
        [fromPool.data.buffer]
      );
    } else {
      worker.postMessage({size, frame: requestFrameCounter++});
    }
  }
}

function receiveMessage(event) {
  var {imageData, frame} = event.data;
  numFinished++;
  frames[frame] = imageData;
  msPerFrame = (Date.now() - start) / numFinished;
  // console.log('ahead', numFinished - loopFrame, 'msPerFrame', msPerFrame.toFixed(1), 'pool', pool.length);
  requestFrame(event.currentTarget);
}

function loop() {
  if (frames[loopFrame]) {
    T.putImageData(frames[loopFrame], 0, 0);
    pool.push(frames[loopFrame]);
    loopFrame++;
    setTimeout(loop, msPerFrame + loopFrame - numFinished);
  } else {
    console.log('waiting');
    requestAnimationFrame(loop);
  }
}
