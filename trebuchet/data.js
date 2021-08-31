export const traits = {
  baseWidth: {min: 1, max: 100},
  baseHeight: {min: 1, max: 100},
  baseDensity: {min: 0, max: 0.1},
  armLengthLeft: {min: 0, max: 100},
  armLengthRight: {min: 0, max: 100},
  armThickness: {min: 1, max: 10},
  armDensity: {min: 0, max: 0.1},
  weightRad: {min: 1, max: 40},
  weightDensity: {min: 0, max: 0.1},
  launchAngle: {min: 0, max: 3},
  fulcrumX: {min: 0, max: 1},
  fulcrumY: {min: 0, max: 1},
};

export const goals = {
  'Distance Right': (s) => s.ball.position.x,
  'Distance Left': (s) => -s.ball.position.x,
  'Max Altitude': (s) => s.maxAltitude,
};
