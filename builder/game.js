'use strict';
import {BuilderEditor} from './BuilderEditor.js';
import {Sim, animationLoop} from './box2dutils.js';

function Camera() {
  var self = this;

  var cameraSpeed = 0.1;
  var moveSpeed = 30;
  var zoomSpeed = 1.001;
  var movementThreshold = 1;
  var zoomThreshold = 0.002;

  self.target = {};
  self.x = self.target.x = 0;
  self.y = self.target.y = 0;
  self.zoom = self.targetZoom = 0.6;
  self.move = function(pressing) {
    if (pressing.left) self.target.x -= moveSpeed / self.zoom;
    if (pressing.right) self.target.x += moveSpeed / self.zoom;
    if (pressing.up) self.target.y -= moveSpeed / self.zoom;
    if (pressing.down) self.target.y += moveSpeed / self.zoom;

    self.x += (self.target.x - self.x) * cameraSpeed;
    self.y += (self.target.y - self.y) * cameraSpeed;
    self.zoom += (self.targetZoom - self.zoom) * cameraSpeed;

    if (
      Math.abs(self.x - self.target.x) * self.zoom > movementThreshold ||
      Math.abs(self.y - self.target.y) * self.zoom > movementThreshold ||
      Math.abs(self.zoom - self.targetZoom) > zoomThreshold
    ) {
      return true;
    } else {
      self.x = self.target.x;
      self.y = self.target.y;
      self.zoom = self.targetZoom;
      return false;
    }
  };
  self.changeZoom = function(amt) {
    self.targetZoom *= Math.pow(zoomSpeed, amt);
  };
  self.toWorldCoords = function(x, y) {
    return {
      x: (x - innerWidth / 2) / self.zoom + self.x,
      y: (y - innerHeight / 2) / self.zoom + self.y
    };
  };
  self.transform = function(ctx) {
    ctx.translate(innerWidth / 2, innerHeight / 2);
    ctx.scale(self.zoom, self.zoom);
    ctx.translate(-self.x, -self.y);
  };
  self.isVisible = function(x, y) {
    x = ((x - self.x) * self.zoom) / innerWidth;
    y = ((y - self.y) * self.zoom) / innerHeight;
    return x >= -0.5 && x < 0.5 && y >= -0.5 && y < 0.5;
  };
  self.save = function() {
    return (
      Math.round(self.target.x) +
      '_' +
      Math.round(self.target.y) +
      '_' +
      self.targetZoom.toFixed(2)
    );
  };
  self.load = function(str) {
    var parts = str.split('_').map(parseFloat);
    self.target.x = parts[0] && !isNaN(parts[0]) ? parts[0] : 0;
    self.target.y = parts[1] && !isNaN(parts[1]) ? parts[1] : 0;
    self.targetZoom = parts[2] && !isNaN(parts[2]) ? parts[2] : 0.6;
  };
}

export function BuilderGame(level) {
  var self = this;

  var canvas = document.getElementById('sim');

  self.view = new Camera();
  self.editor = new BuilderEditor();
  self.sim = new Sim({
    canvas,
    gravity: 9.8
  });
  self.simulating = false;
  self.fastForward = 0;

  if (level.defaultView) {
    self.view.load(level.defaultView);
  }
  if (level.init) {
    level.init(self);
  }
  if (level.instructions) {
    document.getElementById('instructions').innerHTML = level.instructions;
  }

  var movementKeys = {
    65: 'left',
    87: 'up',
    68: 'right',
    83: 'down',
    37: 'left',
    38: 'up',
    39: 'right',
    40: 'down'
  };
  var mouse = {x: 0, y: 0};
  var pressing = {};
  var listeners = {
    keypress(e) {
      if (e.which == 102) {
        // f
        self.editor.toggleFixed();
        save();
      }
    },
    keydown(e) {
      if (
        document.activeElement == document.body &&
        e.which == 8 &&
        !self.simulating
      ) {
        e.preventDefault();
        self.editor.removeSelected();
        save();
      } else if (e.which in movementKeys) {
        e.preventDefault();
        pressing[movementKeys[e.which]] = true;
        update();
      }
    },
    keyup(e) {
      if (e.which in movementKeys) {
        e.preventDefault();
        pressing[movementKeys[e.which]] = false;
      }
    },
    mousedown(e) {
      mouse.target = e.target;
      if (mouse.target == canvas && e.which == 1) {
        if (self.simulating) {
          self.sim.makeMouseJoint(mouse.x, mouse.y);
        } else {
          self.editor.mouseDown(
            mouse.x,
            mouse.y,
            e.ctrlKey || e.metaKey,
            e.altKey,
            e.shiftKey
          );
          update();
        }
      }
    },
    mousemove(e) {
      mouse = {...mouse, ...self.view.toWorldCoords(e.pageX, e.pageY)};

      if (self.simulating) {
        self.sim.moveMouseJoint(mouse.x, mouse.y);
      } else {
        if (self.editor.mouseMove(mouse.x, mouse.y, e.which == 1)) {
          update();
        }
      }
    },
    mouseup() {
      if (mouse.target != canvas) return;

      if (self.simulating) {
        self.sim.destroyMouseJoint();
      } else {
        self.editor.mouseUp(mouse.x, mouse.y);
        save();
      }
    },
    mousewheel(e) {
      e.preventDefault();
      self.view.changeZoom(e.wheelDeltaY, e.pageX, e.pageY);
      update();
    },
    resize() {
      update();
    }
  };
  for (var e in listeners) {
    window.addEventListener(e, listeners[e]);
  }

  function resetSim() {
    self.sim.reset();
    if (level.setup) level.setup(self);
  }
  function addItemsToSim() {
    self.editor.edges.concat(self.editor.wheels).forEach(function(b) {
      b._body = self.sim.make(b);
    });
    self.editor.joints.forEach(function(j) {
      self.sim.make({
        a: j.a._body,
        b: j.b._body,
        offsetA: [j.coord.x, j.coord.y],
        offsetB: j.offsetB || [j.coord.x, j.coord.y]
      });
    });
  }

  function drawEdge(ctx, e) {
    if (e.pts.length) {
      ctx.moveTo(e.pts[0][0], e.pts[0][1]);
      for (var i = 1; i < e.pts.length; i++) {
        ctx.lineTo(e.pts[i][0], e.pts[i][1]);
      }
      ctx.lineTo(e.pts[0][0], e.pts[0][1]);
    }
  }
  function drawWheel(ctx, w) {
    ctx.moveTo(w.x, w.y);
    ctx.arc(w.x, w.y, w.radius, 0, 2 * Math.PI);
  }
  function draw() {
    var T = self.sim.ctx;
    T.clearRect(0, 0, innerWidth, innerHeight);

    T.save();
    self.view.transform(T);
    self.sim.debugDraw();

    var iz = 1 / self.view.zoom;

    // calculate grid spacing
    var topLeft = self.view.toWorldCoords(0, 0);
    var bottomRight = self.view.toWorldCoords(innerWidth, innerHeight);
    var stepSize = 1;
    while (stepSize * self.view.zoom <= 50) {
      stepSize *= 5;
      if (stepSize * self.view.zoom > 50) break;
      stepSize *= 2;
    }
    // grid
    T.strokeStyle = 'black';
    T.lineWidth = 0.125 * iz;
    T.beginPath();
    for (
      var x = Math.ceil(topLeft.x / stepSize) * stepSize;
      x < bottomRight.x;
      x += stepSize
    ) {
      T.moveTo(x, topLeft.y);
      T.lineTo(x, bottomRight.y);
    }
    for (
      var y = Math.ceil(topLeft.y / stepSize) * stepSize;
      y < bottomRight.y;
      y += stepSize
    ) {
      T.moveTo(topLeft.x, y);
      T.lineTo(bottomRight.x, y);
    }
    T.stroke();

    if (level.draw) {
      level.draw(self);
    }

    // joints
    T.lineWidth = 4 * iz;
    T.lineCap = 'round';
    T.strokeStyle = 'rgba(0,0,0,0.5)';
    T.beginPath();
    self.sim.joints.forEach(function(j) {
      var info = self.sim.getInfo(j);
      T.moveTo(info.x, info.y);
      T.lineTo(info.x2 + 0.1, info.y2);
    });
    T.stroke();

    if (!self.simulating) {
      var ed = self.editor;

      if (ed.selectBox) {
        T.lineWidth = 2 * iz;
        T.strokeStyle = ed.selectBox.invert
          ? 'rgba(255,0,0,0.5)'
          : 'rgba(0,0,255,0.5)';
        T.strokeRect(
          ed.selectBox.x,
          ed.selectBox.y,
          mouse.x - ed.selectBox.x,
          mouse.y - ed.selectBox.y
        );
      }

      // edges
      T.lineWidth = 0.5 * iz;
      T.strokeStyle = 'black';
      T.beginPath();
      ed.edges.forEach(function(e) {
        if (!e.fixed) drawEdge(T, e);
      });
      ed.wheels.forEach(function(w) {
        if (!w.fixed) drawWheel(T, w);
      });
      T.stroke();

      // Fixed edges and wheels
      T.lineWidth = 0.25 * iz;
      T.fillStyle = 'rgba(0,255,0,0.15)';
      T.beginPath();
      ed.edges.forEach(function(e) {
        if (e.fixed) drawEdge(T, e);
      });
      ed.wheels.forEach(function(w) {
        if (w.fixed) drawWheel(T, w);
      });
      T.fill();
      T.stroke();

      // joints
      T.fillStyle = 'rgba(0,0,0,0.5)';
      T.beginPath();
      ed.joints.forEach(function(j) {
        T.moveTo(j.coord.x + 2 * iz, j.coord.y);
        T.arc(j.coord.x, j.coord.y, 2 * iz, 0, 2 * Math.PI);
      });
      T.fill();

      // selected points
      T.fillStyle = 'rgba(0,255,0,0.5)';
      T.beginPath();
      ed.highlightedNodes.forEach(function(n) {
        T.moveTo(n.x + 4 * iz, n.y);
        T.arc(n.x, n.y, 4 * iz, 0, 2 * Math.PI);
      });
      T.fill();
    }

    T.restore();

    // grid numbers
    T.fillStyle = 'black';
    T.font = '12px sans-serif';
    T.textAlign = 'left';
    T.textBaseline = 'bottom';
    T.beginPath();
    for (
      let x = Math.ceil(topLeft.x / stepSize) * stepSize;
      x < bottomRight.x;
      x += stepSize
    ) {
      T.fillText(
        x,
        (x - self.view.x) * self.view.zoom + innerWidth / 2 + 3,
        innerHeight - 3
      );
    }
    T.textAlign = 'right';
    for (
      let y = Math.ceil(topLeft.y / stepSize) * stepSize;
      y < bottomRight.y;
      y += stepSize
    ) {
      T.fillText(
        y,
        innerWidth - 3,
        (y - self.view.y) * self.view.zoom + innerHeight / 2 - 3
      );
    }

    if (level.drawUI) {
      level.drawUI(self);
    }
  }

  // this is the animation loop. It continues running until it returns false
  var update = animationLoop(function() {
    var viewIsMoving = self.view.move(pressing);
    if (self.simulating) self.sim.tick();
    draw();
    return viewIsMoving || self.simulating;
  });

  self.startSimulating = function() {
    addItemsToSim();
    self.simulating = true;
    if (level.onStart) level.onStart(self);
    for (var i = 0; i < self.fastForward; i++) {
      self.sim.tick();
    }
    update();
  };
  self.stopSimulating = function() {
    self.simulating = false;
    resetSim();
    update();
  };

  // STATE SAVING AND UPDATING

  // When the hash is changed internally (save), we don't want to reload the editor and view, so this variable indicates when the state change is internal
  var stateChangeIsInternal = false;

  function save() {
    stateChangeIsInternal = true;
    location.hash = self.editor.save() + '|' + self.view.save();
    update();
  }

  // called by window.hashchange
  self.changeState = function(stateStr) {
    // load editor and view from hash
    if (stateStr !== undefined && !stateChangeIsInternal) {
      var parts = stateStr.split('|');
      self.editor.load(parts[0]);
      self.view.load(parts[1] || level.defaultView || '');
    }
    self.simulating = false;
    stateChangeIsInternal = false;
    resetSim();

    // calculate trajectory, update stats
    if (level.onChange) {
      addItemsToSim();
      level.onChange(self);
      resetSim();
    }
    update();
  };
}
