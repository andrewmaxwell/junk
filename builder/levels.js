const {$} = window;

function setDOM(props) {
  for (var prop in props) {
    var el = document.getElementById(prop);
    if (el) el.innerHTML = props[prop];
  }
}

function drawWheel(T, x, y, angle, radius, colors) {
  T.save();
  T.translate(x, y);
  T.scale(radius + 0.5, radius + 0.5);
  T.rotate(angle + (Math.PI * 2) / 3);
  T.fillStyle = colors[0];
  T.beginPath();
  T.arc(0, 0, 1, 0, Math.PI);
  T.fill();
  T.fillStyle = colors[1];
  T.beginPath();
  T.arc(0, 0, 1, Math.PI, 2 * Math.PI);
  T.fill();
  T.restore();
}

export const levels = {
  NoRules() {
    return {
      instructions: 'Choose your own adventure, make everything from scratch.',
      onChange(game) {
        setDOM(game.editor.getInfo());
      }
    };
  },
  Classic() {
    var ballDef = {x: 100, y: 100, radius: 25};
    var ballBody;
    var goal = {
      x: 1300,
      y: 120,
      radius: 100
    };
    var won = false;
    var ballColors = ['#F88', '#F33'];
    var maxJointForce = 5;
    var forceSizeMult = 5;

    return {
      instructions:
        'Get the red ball to the goal. Minimize size, pieces, and/or cost.',
      defaultView: '659_406_0.58',
      setup(game) {
        game.sim.setGravity(0, 9);
        ballBody = game.sim.make(ballDef);
        game.sim.make({
          fixed: true,
          x: 400,
          y: 600,
          width: 600,
          height: 20
        });
        won = false;
      },
      onChange(game) {
        setDOM(game.editor.getInfo());
      },
      draw(game) {
        var T = game.sim.ctx;

        // force indicators
        T.fillStyle = 'rgba(255,0,0,0.5)';
        T.beginPath();
        game.sim.joints.forEach(function(joint) {
          var info = game.sim.getInfo(joint);
          T.moveTo(info.x + info.force * forceSizeMult, info.y);
          T.arc(info.x, info.y, info.force * forceSizeMult, 0, 2 * Math.PI);
          T.closePath();

          if (info.force > maxJointForce) {
            game.sim.destroy(joint);
          }
        });
        T.fill();

        T.fillStyle = 'rgba(0,128,0,0.1)';
        T.beginPath();
        T.arc(goal.x, goal.y, goal.radius - 2.5, 0, 2 * Math.PI);
        T.fill();

        T.fillStyle = 'green';
        T.font = '32px sans-serif';
        T.textAlign = 'center';
        T.textBaseline = 'middle';
        T.fillText(won ? 'SUCCESS!' : 'GOAL', goal.x, goal.y);

        var ballInfo = game.sim.getInfo(ballBody);
        drawWheel(
          T,
          ballInfo.x,
          ballInfo.y,
          ballInfo.angle,
          ballDef.radius,
          ballColors
        );
        if (game.simulating && !won) {
          var dx = ballInfo.x - goal.x;
          var dy = ballInfo.y - goal.y;
          won = dx * dx + dy * dy < goal.radius * goal.radius;
        }
      }
    };
  },
  Distance() {
    var ballDef = {x: 0, y: 0, radius: 30};
    var ballBody;
    var trajectory = [];
    var ballColors = ['#888', '#333'];
    var platformWidth = 1e6;
    var markerSpacing = 5000;

    var timeLimit = 8 * 60;
    var timer;

    return {
      instructions:
        'Build a contraption to move the ball as far to the right as possible! To challenge yourself, try to minimize Pieces, Cost or Size.',
      init(game) {
        $(`
					<div title="How many seconds out should the trajectory be calculated?">
						<label>Time Limit</label>
						<input type="number" min="0" id="timeLimit" value="8"> s
					</div>
					<div title="How far the ball travels to the right in the time limit.">
						<label>Max Distance</label>
						<span id="distance"></span> cm
					</div>
					<div title="Total distance traveled in time limit.">
						<label>Total Distance</label>
						<span id="totalDist"></span> cm
					</div>
					<div title="Maximum height achieved in time limit.">
						<label>Max Height</label>
						<span id="maxHeight"></span> cm
					</div>
					<div title="Greatest velocity reached in time limit.">
						<label>Max Velocity</label>
						<span id="maxVel"></span> cm/s
					</div>
					<div title="Greatest angular velocity reached in time limit.">
						<label>Max Spin</label>
						<span id="maxSpin"></span> r/s
					</div>
				`).appendTo('#customHUD');

        $(document).on('change', '#timeLimit', function() {
          var val = '' + $(this).val();
          if (val && /^[0-9]+$/.test(val)) {
            timeLimit = val * 60;
            game.changeState();
          }
        });
      },
      setup(game) {
        ballBody = game.sim.make(ballDef);

        var rampTop = 50;
        var rampBottom = 60;
        var markers = [];
        for (var x = markerSpacing; x < platformWidth / 2; x += markerSpacing) {
          markers.push({
            pts: [
              [x - rampTop, -15],
              [x + rampTop, -15],
              [x + rampBottom, -5],
              [x - rampBottom, -5]
            ]
          });
        }
        game.sim.make({
          fixed: true,
          x: 0,
          y: 305,
          shapes: [
            {
              width: platformWidth,
              height: 10
            }
          ].concat(markers)
        });

        timer = 0;
      },
      onStart(game) {
        timer = game.fastForward;
      },
      onChange(game) {
        trajectory.length = 0;
        var maxX = 0;
        var maxHeight = 0;
        var maxVel = 0;
        var maxSpin = 0;
        var totalDistance = 0;
        var prevX = ballDef.x;
        var prevY = ballDef.y;
        for (var i = 0; i < timeLimit; i++) {
          game.sim.tick();
          var ballInfo = game.sim.getInfo(ballBody);

          trajectory[i] = [ballInfo.x, ballInfo.y];

          maxX = Math.max(maxX, ballInfo.x);
          maxHeight = Math.max(maxHeight, -ballInfo.y);
          maxVel = Math.max(
            maxVel,
            Math.sqrt(ballInfo.xs * ballInfo.xs + ballInfo.ys * ballInfo.ys)
          );
          maxSpin = Math.max(maxSpin, Math.abs(ballInfo.as));

          var dx = ballInfo.x - prevX;
          var dy = ballInfo.y - prevY;
          totalDistance += Math.sqrt(dx * dx + dy * dy);
          prevX = ballInfo.x;
          prevY = ballInfo.y;
        }
        setDOM({
          ...game.editor.getInfo(),
          distance: Math.round(maxX),
          maxHeight: Math.round(maxHeight),
          maxVel: Math.round(maxVel),
          maxSpin: (maxSpin / Math.PI).toFixed(2),
          totalDist: Math.round(totalDistance)
        });
      },
      draw(game) {
        var T = game.sim.ctx;

        // marker labels
        T.textAlign = 'center';
        T.textBaseline = 'middle';
        T.font = '24px sans-serif';
        T.fillStyle = 'black';
        for (var x = markerSpacing; x < platformWidth / 2; x += markerSpacing) {
          T.fillText(x, x, 300);
        }

        if (!game.simulating) {
          // trajectory
          T.strokeStyle = 'cyan';
          T.lineWidth = 0.5 / game.view.zoom;
          T.beginPath();
          for (let i = 0; i < trajectory.length; i++) {
            T.lineTo(trajectory[i][0], trajectory[i][1]);
          }
          for (let i = 60; i < trajectory.length; i += 60) {
            const t = trajectory[i];
            if (game.view.isVisible(t[0], t[1])) {
              T.moveTo(t[0] + ballDef.radius, t[1]);
              T.arc(t[0], t[1], ballDef.radius, 0, 2 * Math.PI);
            }
          }
          T.stroke();

          // second marker text
          // T.fillStyle = "black"
          // T.textAlign = "center"
          // T.textBaseline = "middle"
          // T.font = "24px sans-serif"
          for (let i = 60; i < trajectory.length; i += 60) {
            const t = trajectory[i];
            if (game.view.isVisible(t[0], t[1])) T.fillText(i / 60, t[0], t[1]);
          }
        }

        // ball
        var ballInfo = game.sim.getInfo(ballBody);
        drawWheel(
          T,
          ballInfo.x,
          ballInfo.y,
          ballInfo.angle,
          ballDef.radius,
          ballColors
        );

        if (game.simulating && timer < timeLimit) {
          timer++;
        }
      },
      drawUI(game) {
        if (game.simulating) {
          var T = game.sim.ctx;
          T.fillStyle = 'green';
          T.fillRect(
            0,
            0,
            innerWidth * Math.max(0, Math.min(1, timer / timeLimit)),
            2
          );
        }
      }
    };
  },
  Boxes() {
    var boxSize = 50;
    var rows = 4;

    var goal = {
      x: -450,
      y: -1300,
      width: 900,
      height: 300
    };

    var platform = [
      [
        [-500, 0],
        [500, 0],
        [500, 50],
        [-500, 50]
      ], // bottom
      [
        [450, -50],
        [500, -50],
        [500, 0],
        [450, 0]
      ], // right lip
      [
        [-500, -50],
        [-450, -50],
        [-450, 0],
        [-500, 0]
      ] // left lip
    ];

    var boxBodies;

    var won = false;

    return {
      instructions:
        'Get all the boxes into the goal. Minimize size, pieces, and/or cost.',
      defaultView: '0_-600_0.5',
      setup(game) {
        boxBodies = [];
        for (var r = 0; r < rows; r++) {
          for (var c = 0; c < rows; c++) {
            boxBodies.push(
              game.sim.make({
                x: (c - rows / 2 + 0.5) * boxSize,
                y: (r - rows + 0.5) * boxSize,
                width: boxSize - 0.99,
                height: boxSize - 0.99
              })
            );
          }
        }

        game.sim.make({
          fixed: true,
          shapes: platform
            .map(function(p) {
              return {pts: p};
            })
            .concat(
              platform.map(function(p) {
                return {
                  pts: p.map(function(c) {
                    return [c[0], c[1] - 1000];
                  })
                };
              })
            )
        });

        won = false;
      },
      onChange(game) {
        setDOM(game.editor.getInfo());
      },
      draw(game) {
        var T = game.sim.ctx;

        var numBoxesLeft = 0;
        for (var i = 0; i < boxBodies.length; i++) {
          var info = game.sim.getInfo(boxBodies[i]);
          if (
            info.cx < goal.x ||
            info.cy < goal.y ||
            info.cx > goal.x + goal.width ||
            info.cy > goal.y + goal.height
          ) {
            numBoxesLeft++;
          }
        }

        T.fillStyle = 'rgba(0,128,0,0.05)';
        T.fillRect(goal.x, goal.y, goal.width, goal.height);

        T.fillStyle = 'rgba(0,128,0,0.5)';
        T.font = '72px sans-serif';
        T.textAlign = 'center';
        T.textBaseline = 'middle';
        var msg = won
          ? 'SUCCESS!'
          : game.simulating
          ? numBoxesLeft + ' MORE TO GO'
          : 'BOXES GO HERE';
        T.fillText(msg, goal.x + goal.width / 2, goal.y + goal.height / 2);

        if (game.simulating && !won && !numBoxesLeft) {
          won = true;
        }
      }
    };
  }
};
