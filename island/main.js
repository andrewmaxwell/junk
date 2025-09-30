// main.js
import {makeSim} from './sim.js';
import {makeRenderer} from './makeRenderer.js';
import {GUI} from 'dat.gui';

// ---------- Init & Step Params ----------
/** Initialization + shared params (simple terrain) */
const initParams = {
  simSize: 256,
  seed: 'unused',
  seaLevel: 0,
  elevationScale: 220,
  islandRadiusCells: 256 * 0.48,
  cellSize: 10,
  hillGrid: 32,
  hillAmp: 30,
};

/** Per-step simulation parameters */
const stepParams = {
  dt: 0.05,
  rainRate: 0.002,
  evaporationRate: 0.00001,
  flowFactor: 1.0,
  capacityCoeff: 9.0,
  erodeRate: 0.18,
  depositRate: 0.4,
  maxErodePerStep: 0.003, // allow a touch more erosion per step
  talusAngleDeg: 33,
  thermalRate: 0.5,
  thermalPasses: 1,
  seaLevel: 0,

  // NEW: stream-power incision (valley carving)
  streamPowerK: 0.15,
  streamPowerM: 0.5,
  streamPowerN: 1.0,

  // Rendering controls
  waterMinDepth: 0.02,
  waterDepthMax: 6.0,
  sedimentTintScale: 0.6,
};

const canvas = /** @type {HTMLCanvasElement} */ (
  document.getElementById('app')
);
const render = makeRenderer(canvas);

/** @typedef {{ dt:number, rainRate:number, evaporationRate:number, flowFactor:number, capacityCoeff:number, erodeRate:number, depositRate:number, maxErodePerStep:number, talusAngleDeg:number, thermalRate:number, thermalPasses:number, seaLevel?:number, streamPowerK:number, streamPowerM:number, streamPowerN:number, waterMinDepth?:number, waterDepthMax?:number, sedimentTintScale?:number }} StepParams */
/** @typedef {{ landHeight: Float32Array, waterDepth: Float32Array, sediment: Float32Array, rockHardness: Float32Array, iterate: (stepParams: StepParams) => void }} Sim */
/** @type {Sim} */
let sim;

/** Rebuild sim with current init params. */
function rebuild() {
  sim = makeSim(initParams);
}

// Build initial sim before any usage
rebuild();

// ---------- Animation loop ----------
function tick() {
  sim.iterate(stepParams);
  render(sim, {
    cellSize: initParams.cellSize,
    seaLevel: stepParams.seaLevel ?? initParams.seaLevel,
    showWater: true,
    waterMinDepth: stepParams.waterMinDepth,
    waterDepthMax: stepParams.waterDepthMax,
    sedimentTintScale: stepParams.sedimentTintScale,
  });
  requestAnimationFrame(tick);
}
tick();

// ---------- dat.GUI ----------
const gui = new GUI({width: 360});

// Init folder: re-create sim on change
const fInit = gui.addFolder('Initialization (rebuild terrain)');
fInit
  .add(initParams, 'simSize', [128, 192, 256, 384, 512, 768, 1024])
  .name('Grid Size')
  .onFinishChange(rebuild);
fInit
  .add(initParams, 'elevationScale', 50, 800, 10)
  .name('Elevation Scale')
  .onFinishChange(rebuild);
fInit
  .add(initParams, 'islandRadiusCells', 32, 1024, 1)
  .name('Island Radius')
  .onFinishChange(rebuild);
fInit
  .add(initParams, 'cellSize', 2, 30, 1)
  .name('Cell Size (m)')
  .onFinishChange(rebuild);
fInit
  .add(initParams, 'hillGrid', 2, 128, 1)
  .name('Hill Grid')
  .onFinishChange(rebuild);
fInit
  .add(initParams, 'hillAmp', 0, 100, 1)
  .name('Hill Amp (m)')
  .onFinishChange(rebuild);
fInit.open();

// Step folder: live tweak during simulation
const fStep = gui.addFolder('Simulation (live)');
fStep.add(stepParams, 'dt', 0.01, 0.2, 0.005).name('dt (sec)');
fStep.add(stepParams, 'rainRate', 0, 0.01, 0.0001).name('Rain (m/s)');
fStep.add(stepParams, 'evaporationRate', 0, 0.002, 0.00001).name('Evap (m/s)');
fStep.add(stepParams, 'flowFactor', 0.1, 2.5, 0.05).name('Flow Factor');
fStep.add(stepParams, 'capacityCoeff', 0.1, 16, 0.1).name('Capacity Coeff');
fStep.add(stepParams, 'erodeRate', 0.01, 1.0, 0.01).name('Erode Rate');
fStep.add(stepParams, 'depositRate', 0.01, 1.0, 0.01).name('Deposit Rate');
fStep
  .add(stepParams, 'maxErodePerStep', 0.0001, 0.02, 0.0001)
  .name('Max Erode/Step');
fStep.add(stepParams, 'talusAngleDeg', 10, 45, 1).name('Talus Angle (deg)');
fStep.add(stepParams, 'thermalRate', 0.05, 1.0, 0.05).name('Thermal Rate');
fStep.add(stepParams, 'thermalPasses', 0, 5, 1).name('Thermal Passes');
fStep.add(stepParams, 'seaLevel', -50, 100, 1).name('Sea Level (m)');

// Stream-power carving controls
const fSP = gui.addFolder('Stream Power (valley carving)');
fSP.add(stepParams, 'streamPowerK', 0.01, 1.0, 0.01).name('K (strength)');
fSP.add(stepParams, 'streamPowerM', 0.2, 1.5, 0.05).name('m (discharge exp)');
fSP.add(stepParams, 'streamPowerN', 0.6, 2.0, 0.05).name('n (slope exp)');

// Rendering water controls
const fR = gui.addFolder('Rendering (water)');
fR.add(stepParams, 'waterMinDepth', 0.0, 0.1, 0.005).name('Show Water ≥ (m)');
fR.add(stepParams, 'waterDepthMax', 1.0, 20.0, 0.5).name('Depth Blue Max (m)');
fR.add(stepParams, 'sedimentTintScale', 0.0, 2.0, 0.05).name('Sediment Tint ×');
fStep.open();
fSP.open();
fR.open();
