'use strict';
require('augmentArray.js');
const Room = require('room.js');
const Annealer = require('annealer.js');

var checkRoom = roomStr => {
  var room = new Room(roomStr);
  return room.getIssue();
};

var getNeighbor = state => {
  var next = state.slice(0);
  var index1, index2;
  do {
    index1 = Math.floor(Math.random() * next.length);
    index2 = Math.floor(Math.random() * next.length);
  } while (state[index2] === state[index1]);
  return next.swap(index1, index2);
};

// var easing = t => t < 0.5 ? 2*t*t : (4-2*t)*t-1;
var easing = t => t * t;

var calculate = (roomStr, iterations, moveCost) => {
  var room = new Room(roomStr);
  var initialState = room.seats.map(s => s.char);
  var costs = new Array(iterations);

  var getCost = state => {
    var spreadCost = 0;
    var moves = 0;
    for (var i = 0; i < state.length; i++) {
      if (state[i] !== '_') {
        for (var j = 0; j < i; j++) {
          if (state[i] === state[j]) {
            spreadCost += room.seats[i].distances[j];
          }
        }
        if (state[i] !== initialState[i]) moves++;
      }
    }
    return spreadCost + moves * moveCost;
  };

  var solver = new Annealer({
    initialState,
    iterations,
    easing,
    getCost,
    getNeighbor
  });

  for (var i = 0; i < iterations; i++) {
    costs[i] = solver.currentCost;
    solver.iterate();
  }

  return {
    output: room.interpolate(solver.bestState),
    bestCost: solver.bestCost,
    origCost: getCost(initialState),
    costs
  };
};

module.exports = {checkRoom, calculate};
