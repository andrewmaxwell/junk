'use strict';

export function BuilderEditor() {
  var self = this;
  var edgeWidth = 10;
  var selected = [];

  self.nodes = [];
  self.edges = [];
  self.wheels = [];
  self.joints = [];
  self.highlightedNodes = [];
  self.selectBox = false;

  function dist2(dx, dy) {
    return dx * dx + dy * dy;
  }
  function edgeBox(e) {
    var angle = Math.atan2(e.b.y - e.a.y, e.b.x - e.a.x) + Math.PI / 2;
    var dx = (edgeWidth / 2) * Math.cos(angle);
    var dy = (edgeWidth / 2) * Math.sin(angle);
    return [
      [e.a.x - dx, e.a.y - dy],
      [e.b.x - dx, e.b.y - dy],
      [e.b.x + dx, e.b.y + dy],
      [e.a.x + dx, e.a.y + dy],
    ];
  }
  function edgeIntersection(e1, e2) {
    var dx1 = e1.b.x - e1.a.x;
    var dy1 = e1.b.y - e1.a.y;
    var dx2 = e2.b.x - e2.a.x;
    var dy2 = e2.b.y - e2.a.y;
    var mult = 1 / (dx1 * dy2 - dx2 * dy1);
    var s = mult * (dy1 * (e2.a.x - e1.a.x) + dx1 * (e1.a.y - e2.a.y));
    var t = mult * (dx2 * (e1.a.y - e2.a.y) + dy2 * (e2.a.x - e1.a.x));
    return (
      s >= 0 &&
      s <= 1 &&
      t >= 0 &&
      t <= 1 && {
        x: e1.a.x + t * dx1,
        y: e1.a.y + t * dy1,
      }
    );
  }
  function edgeJoint(e1, e2) {
    var intersection = edgeIntersection(e1, e2);
    if (intersection) {
      return intersection;
    }

    var minDist = Infinity;
    var jointCoord = false;
    var pairs = [
      [e1.a, e2.a],
      [e1.a, e2.b],
      [e1.b, e2.a],
      [e1.b, e2.b],
    ];
    for (var i = 0; i < pairs.length; i++) {
      var p = pairs[i];
      var sqDist = dist2(p[0].x - p[1].x, p[0].y - p[1].y);
      var midPoint = {
        x: (p[0].x + p[1].x) / 2,
        y: (p[0].y + p[1].y) / 2,
      };
      if (
        sqDist < minDist &&
        pointInPolygon(midPoint, e1.pts) &&
        pointInPolygon(midPoint, e2.pts)
      ) {
        minDist = sqDist;
        jointCoord = midPoint;
      }
    }

    return jointCoord;
  }
  function pointInPolygon(point, pts) {
    var inside = false;
    for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      if (
        pts[i][1] > point.y != pts[j][1] > point.y &&
        point.x <
          ((pts[j][0] - pts[i][0]) * (point.y - pts[i][1])) /
            (pts[j][1] - pts[i][1]) +
            pts[i][0]
      ) {
        inside = !inside;
      }
    }
    return inside;
  }
  function inSelectBox(x, y) {
    return (
      self.selectBox &&
      Math.abs(
        (x - self.selectBox.x) / (self.selectBox.x2 - self.selectBox.x) - 0.5
      ) < 0.5 &&
      Math.abs(
        (y - self.selectBox.y) / (self.selectBox.y2 - self.selectBox.y) - 0.5
      ) < 0.5
    );
  }
  function closeNode(x, y) {
    var minDist = Infinity;
    var minNode;
    for (var i = 0; i < self.nodes.length; i++) {
      var sqDist = dist2(x - self.nodes[i].x, y - self.nodes[i].y);
      if (sqDist < minDist && sqDist < edgeWidth * edgeWidth) {
        minDist = sqDist;
        minNode = self.nodes[i];
      }
    }
    return minNode;
  }
  function closeWheel(x, y) {
    var minDist = Infinity;
    var minWheel;
    for (var i = 0; i < self.wheels.length; i++) {
      var dist = Math.abs(
        self.wheels[i].radius -
          Math.sqrt(dist2(x - self.wheels[i].x, y - self.wheels[i].y))
      );
      if (dist < minDist && dist < edgeWidth) {
        minDist = dist;
        minWheel = self.wheels[i];
      }
    }
    return minWheel;
  }
  function removeNode(node) {
    for (let i = 0; i < self.edges.length; i++) {
      if (self.edges[i].a == node || self.edges[i].b == node) {
        self.edges.splice(i, 1);
        break;
      }
    }
    for (let i = 0; i < self.wheels.length; i++) {
      if (self.wheels[i] == node) {
        self.wheels.splice(i, 1);
        break;
      }
    }
    self.nodes.splice(self.nodes.indexOf(node), 1);
  }
  function cleanUp() {
    self.edges = self.edges.filter(function (e) {
      return dist2(e.a.x - e.b.x, e.a.y - e.b.y) > 4;
    });

    self.wheels = self.wheels.filter(function (w) {
      return w.radius > 2;
    });

    self.nodes = self.nodes.filter(function (n) {
      for (let i = 0; i < self.wheels.length; i++) {
        if (self.wheels[i] == n) {
          return true;
        }
      }
      for (let i = 0; i < self.edges.length; i++) {
        if (self.edges[i].a == n || self.edges[i].b == n) {
          return true;
        }
      }
      return false;
    });

    updateJoints();
  }
  function updateHighlightedNodes() {
    self.highlightedNodes = self.nodes.filter(function (n) {
      var inBox = inSelectBox(n.x, n.y);
      var tempDeselected = inBox && self.selectBox.invert;
      var tempSelected = inBox && !self.selectBox.invert;
      return tempSelected || (selected.contains(n) && !tempDeselected);
    });
  }
  function updateJoints() {
    self.joints = [];
    for (let i = 0; i < self.edges.length; i++) {
      for (let j = 0; j < i; j++) {
        const intersection = edgeJoint(self.edges[i], self.edges[j]);
        if (intersection) {
          self.joints.push({
            a: self.edges[i],
            b: self.edges[j],
            coord: intersection,
          });
        }
      }
      for (let j = 0; j < self.wheels.length; j++) {
        if (pointInPolygon(self.wheels[j], self.edges[i].pts)) {
          self.joints.push({
            a: self.edges[i],
            b: self.wheels[j],
            coord: self.wheels[j],
            offsetB: [0, 0],
          });
        }
      }
    }
  }

  this.mouseDown = function (x, y, ctrl, alt, shift) {
    x = Math.round(x);
    y = Math.round(y);

    if (ctrl && shift) {
      var wheel = {
        x,
        y,
        radius: 0,
        resize: true,
      };
      self.nodes.push(wheel);
      self.wheels.push(wheel);
      selected = [wheel];
    } else if (ctrl) {
      var edge = {
        a: {x, y},
        b: {x, y},
        pts: [],
        fixed: false,
      };
      self.edges.push(edge);
      self.nodes.push(edge.a, edge.b);
      selected = [edge.b];
    } else if (shift || alt) {
      self.selectBox = {
        x,
        y,
        x2: x,
        y2: y,
        invert: alt,
      };
    } else {
      var minNode = closeNode(x, y);
      if (minNode) {
        if (!selected.contains(minNode)) {
          selected = [minNode];
        }
      } else {
        var minWheel = closeWheel(x, y);
        if (minWheel) {
          minWheel.resize = true;
          selected = [minWheel];
        } else {
          selected = [];
          self.selectBox = {
            x,
            y,
            x2: x,
            y2: y,
            invert: alt,
          };
        }
      }
    }

    updateHighlightedNodes();
  };
  var px = 0;
  var py = 0;
  this.mouseMove = function (x, y, dragging) {
    x = Math.round(x);
    y = Math.round(y);

    var draw = false;

    if (selected[0] && selected[0].resize) {
      selected[0].radius = Math.round(
        Math.sqrt(dist2(x - selected[0].x, y - selected[0].y))
      );
      draw = true;
    } else if (dragging && !self.selectBox && selected.length) {
      var mx = x - px;
      var my = y - py;

      selected.forEach(function (n) {
        n.x += mx;
        n.y += my;
      });

      self.edges.forEach(function (e) {
        if (selected.contains(e.a) || selected.contains(e.b)) {
          e.pts = edgeBox(e);
        }
      });
      updateJoints();

      draw = true;
    } else if (self.selectBox) {
      self.selectBox.x2 = x;
      self.selectBox.y2 = y;
      draw = true;
      updateHighlightedNodes();
    }

    px = x;
    py = y;

    return draw;
  };
  this.mouseUp = function (x, y) {
    if (self.selectBox) {
      if (
        Math.abs(x - self.selectBox.x) < 2 &&
        Math.abs(y - self.selectBox.y) < 2
      ) {
        var minNode = closeNode(x, y);
        if (minNode) {
          var index = selected.indexOf(minNode);
          if (self.selectBox.invert && index >= 0) {
            selected.splice(index, 1);
          } else if (!self.selectBox.invert && index == -1) {
            selected.push(minNode);
          }
        }
      } else {
        selected = self.nodes.filter(function (n) {
          var inBox = inSelectBox(n.x, n.y);
          return (
            (inBox && !self.selectBox.invert) ||
            (selected.contains(n) && (!inBox || !self.selectBox.invert))
          );
        });
      }

      self.selectBox = false;
    }

    if (selected[0] && selected[0].resize) {
      delete selected[0].resize;
      selected = [];
    }

    updateHighlightedNodes();
    cleanUp();
  };
  this.removeSelected = function () {
    for (var i = 0; i < selected.length; i++) {
      removeNode(selected[i]);
    }
    selected = [];
    updateHighlightedNodes();
    cleanUp();
  };
  this.toggleFixed = function () {
    self.edges.forEach(function (e) {
      if (selected.contains(e.a) || selected.contains(e.b)) {
        e.fixed = !e.fixed;
      }
    });
    self.wheels.forEach(function (w) {
      if (selected.contains(w)) {
        w.fixed = !w.fixed;
      }
    });
  };
  this.save = function () {
    var edgeData = [];
    self.edges.forEach(function (e) {
      edgeData.push((e.fixed ? 'f' : '') + e.a.x, e.a.y, e.b.x, e.b.y);
    });

    var wheelData = [];
    self.wheels.forEach(function (w) {
      wheelData.push((w.fixed ? 'f' : '') + w.x, w.y, w.radius);
    });

    return (
      edgeData.join('_') + (wheelData.length ? '__' + wheelData.join('_') : '')
    );
  };
  this.load = function (data) {
    self.nodes.length = 0;
    self.edges.length = 0;
    self.wheels.length = 0;

    var parts = data.split('__').map(function (p) {
      return p
        ? p.split('_').map(function (n) {
            var f = parseFloat(n);
            return isNaN(f) ? n : f;
          })
        : [];
    });
    const edgeData = parts[0];
    const wheelData = parts[1];

    for (let i = 0; edgeData && i < edgeData.length; i += 4) {
      const fixed = edgeData[i][0] == 'f';
      const n1 = {
        x: fixed ? parseFloat(edgeData[i].substring(1)) : edgeData[i],
        y: edgeData[i + 1],
      };
      const n2 = {x: edgeData[i + 2], y: edgeData[i + 3]};
      const edge = {
        a: n1,
        b: n2,
        fixed,
      };
      edge.pts = edgeBox(edge);
      self.nodes.push(n1, n2);
      self.edges.push(edge);
    }

    for (let i = 0; wheelData && i < wheelData.length; i += 3) {
      const fixed = wheelData[i][0] == 'f';
      const wheel = {
        x: fixed ? parseFloat(wheelData[i].substring(1)) : wheelData[i],
        y: wheelData[i + 1],
        radius: wheelData[i + 2],
        fixed,
      };
      self.nodes.push(wheel);
      self.wheels.push(wheel);
    }

    cleanUp();
  };
  this.getInfo = function () {
    // calculate cost
    let cost = 0;
    for (let i = 0; i < self.edges.length; i++) {
      const e = self.edges[i];
      cost += 100 * dist2(e.a.x - e.b.x, e.a.y - e.b.y);
    }
    for (let i = 0; i < self.wheels.length; i++) {
      const area = self.wheels[i].radius * self.wheels[i].radius * Math.PI;
      cost += area * area;
    }
    cost /= 1e6;

    // calculate size
    let size = 0;
    if (self.edges.length || self.wheels.length) {
      let minX = Infinity,
        maxX = -Infinity,
        minY = Infinity,
        maxY = -Infinity;

      self.edges.forEach(function (e) {
        minX = Math.min(minX, e.a.x, e.b.x);
        maxX = Math.max(maxX, e.a.x, e.b.x);
        minY = Math.min(minY, e.a.y, e.b.y);
        maxY = Math.max(maxY, e.a.y, e.b.y);
      });
      self.wheels.forEach(function (w) {
        minX = Math.min(minX, w.x - w.radius);
        maxX = Math.max(maxX, w.x + w.radius);
        minY = Math.min(minY, w.y - w.radius);
        maxY = Math.max(maxY, w.y + w.radius);
      });
      size = (Math.max(10, maxX - minX) * Math.max(10, maxY - minY)) / 10000;
    }

    return {
      cost: cost.toFixed(2),
      size: size.toFixed(2),
      pieces: self.edges.length + self.wheels.length,
    };
  };
}
