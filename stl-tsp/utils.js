Array.prototype.unique = function() {
  return Array.from(new Set(this));
};

export const distance = (a, b) => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
};

export const boundingBox = coords => {
  let min = {x: Infinity, y: Infinity};
  let max = {x: -Infinity, y: -Infinity};
  coords.forEach(coord => {
    min.x = Math.min(min.x, coord.x);
    min.y = Math.min(min.y, coord.y);
    max.x = Math.max(max.x, coord.x);
    max.y = Math.max(max.y, coord.y);
  });
  return {min, max};
};

export const closestNode = (nodes, x, y) => {
  let closestNode;
  let minDist = Infinity;
  nodes.forEach(node => {
    let dx = node.x - x;
    let dy = node.y - y;
    let sqDist = dx * dx + dy * dy;
    if (sqDist < minDist) {
      minDist = sqDist;
      closestNode = node;
    }
  });
  return closestNode;
};

export const reverseRandomSlice = arr => {
  var newArr = arr.slice(0);
  var n = Math.floor(Math.random() * arr.length);
  var m = Math.floor(Math.random() * arr.length);
  var start = Math.min(n, m);
  var end = Math.max(n, m);
  while (start < end) {
    newArr[start] = arr[end];
    newArr[end] = arr[start];
    start++;
    end--;
  }
  return newArr;
};
