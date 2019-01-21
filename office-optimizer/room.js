'use strict';

var getDistances = ({start, destinations, nodes, isAccessible}) => {
  nodes.forEach(c => {
    c.dist = Infinity;
    c.visited = false;
  });

  start.dist = 0;
  var queue = [start];
  for (var i = 0; i < queue.length; i++) {
    var current = queue[i];
    current.visited = true;
    for (var j = 0; j < current.neighbors.length; j++) {
      var neighbor = current.neighbors[j];
      var nDist = current.dist + 1;
      if (nDist < neighbor.dist) {
        neighbor.dist = nDist;
      }
      if (!neighbor.visited && isAccessible(neighbor)) {
        queue.push(neighbor);
      }
    }
  }

  var distances = destinations.map(s => s.dist);

  nodes.forEach(c => {
    delete c.dist;
    delete c.visited;
  });

  return distances;
};

module.exports = function Room(str) {
  var directions = [
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [-1, -1],
    [0, -1],
    [1, -1]
  ];
  // var directions = [[1,0],[0,1],[-1,0],[0,-1]];

  var grid = str
    .trim()
    .split(/\r?\n/)
    .map((row, y) =>
      row
        .trim()
        .split('')
        .map((char, x) => ({x, y, char, neighbors: []}))
    );

  var cells = grid.flatten();
  cells.forEach((cell, i) => {
    cell.id = i;
    directions.forEach(dir => {
      var nx = cell.x + dir[0];
      var ny = cell.y + dir[1];
      var neighbor = grid[ny] && grid[ny][nx];
      if (neighbor) {
        cell.neighbors.push(neighbor);
      }
    });
  });

  var seats = (this.seats = cells.filter(c => /\w/.test(c.char)));

  seats.forEach(seat => {
    seat.distances = getDistances({
      start: seat,
      destinations: seats,
      nodes: cells,
      isAccessible: n => n.char === '.'
    });
  });

  this.interpolate = arrangement => {
    var dex = 0;
    return str
      .trim()
      .replace(/ /g, '')
      .replace(/\w/g, () => arrangement[dex++]);
  };

  this.getIssue = () => {
    for (var i = 0; i < seats.length; i++) {
      var s = seats[i];
      for (var j = 0; j < seats.length; j++) {
        if (s.distances[j] == Infinity) {
          var t = seats[j];
          return `${s.x},${s.y} can't get to ${t.x},${t.y}`;
        }
      }
    }
  };
};
