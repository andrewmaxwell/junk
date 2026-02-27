import { makeRenderer } from '../sand/makeRenderer.js';
import {
  CHARGE_GND,
  CHARGE_VCC,
  C_WIRE_HIGH,
  C_WIRE_LOW,
  C_WIRE_Z,
  HEIGHT,
  M_BRIDGE,
  M_EMPTY,
  M_GATE,
  M_GND,
  M_NTYPE,
  M_PTYPE,
  M_VCC,
  M_WIRE,
  WIDTH,
  materialColors,
  materialDefs,
} from './constants.js';
import { compressGrid, expandGrid, requestSave } from './persistence.js';
import { Simulator } from './simulation.js';

const simulator = new Simulator(WIDTH, HEIGHT);
const canvas = /** @type {HTMLCanvasElement} */ (
  document.querySelector('canvas')
);
const render = makeRenderer(canvas, WIDTH, HEIGHT, (mat, _, i) => {
  if (mat !== M_WIRE) return materialColors[mat];
  if (simulator.chargeGrid[i] === CHARGE_VCC) return C_WIRE_HIGH;
  if (simulator.chargeGrid[i] === CHARGE_GND) return C_WIRE_LOW;
  return C_WIRE_Z;
});

const NAND_TEMPLATE = [
  'W.V.V.W.', // Y=0: A and B enter. Dual VCCs for the parallel P-Types.
  'WGPWPGW.', // Y=1: Parallel PUN. Current flows from VCC through P down to W(3,1).
  'W..W..W.', // Y=2: Insulation row.
  'W..WWWBW', // Y=3: Output manifold branches right, safely crossing B.
  'WWGN..W.', // Y=4: First series N-Type (Gate fed by A).
  'W..NGWW.', // Y=5: Second series N-Type (Gate fed by B).
  'W..D..W.', // Y=6: Sink to Ground.
  'W.....W.', // Y=7: A and B pass completely through the bottom!
];

const NOR_TEMPLATE = [
  'W..V..W.', // Y=0: Single VCC for the series P-Types.
  'WWGP..W.', // Y=1: First series P-Type.
  'W..PGWW.', // Y=2: Second series P-Type. (Now stacked vertically for true series flow!)
  'W..W..W.', // Y=3: Insulation row.
  'W.WWWWBW', // Y=4: Output branches right, crossing B.
  'W.W.W.W.', // Y=5: Output safely drops down to the parallel N-Types.
  'WGN.NGW.', // Y=6: Parallel PDN. N1 fed by A, N2 fed by B.
  'W.D.D.W.', // Y=7: Dual Grounds. A and B pass through!
];

const NOT_TEMPLATE = [
  'W.V.', // Y=0: VCC power source
  'WGP.', // Y=1: Input wire hits Gate -> controls P-Type
  'W.WW', // Y=2: Output wire connects P and N, branching out to the right
  'WGN.', // Y=3: Input wire hits Gate -> controls N-Type
  'W.D.', // Y=4: GND sink
];

/**
 * @param {number} startX
 * @param {number} startY
 * @param {string[]} template
 */
function pasteTemplate(startX, startY, template) {
  /** @type {Record<string, number>} */
  const charMap = {
    W: M_WIRE,
    P: M_PTYPE,
    N: M_NTYPE,
    G: M_GATE,
    V: M_VCC,
    D: M_GND,
    B: M_BRIDGE,
  };

  for (let y = 0; y < template.length; y++) {
    for (let x = 0; x < template[y].length; x++) {
      const char = template[y][x];
      const mat = charMap[char] ?? M_EMPTY;

      if (mat !== M_EMPTY) {
        const idx = simulator.getIndex(startX + x, startY + y);
        if (idx !== -1) simulator.materialGrid[idx] = mat;
      }
    }
  }
}

function loadFromHash() {
  if (location.hash.length > 1) {
    expandGrid(simulator, location.hash);
  } else {
    // Default Map Initialization
    simulator.materialGrid.fill(M_EMPTY);
    pasteTemplate(16, 26, NAND_TEMPLATE);
    pasteTemplate(28, 26, NOR_TEMPLATE);
    pasteTemplate(40, 26, NOT_TEMPLATE);
    // Overwrite the hash initially without triggering history
    history.replaceState(null, '', '#' + compressGrid(simulator));
  }
}

// Initialize the grid!
loadFromHash();

window.addEventListener('hashchange', () => {
  // Try to load new state. If it's valid, instantly render it to reflect history jump.
  if (location.hash.length > 1 && expandGrid(simulator, location.hash)) {
    render(simulator.materialGrid);
  }
});

function loop() {
  simulator.tick();
  render(simulator.materialGrid);
  setTimeout(loop, 250);
}

let activeMaterial = M_WIRE;

/** @param {MouseEvent} e */
function handleDraw(e) {
  if (e.buttons !== 1) return;
  const rect = canvas.getBoundingClientRect();
  const x = Math.floor((e.clientX - rect.left) * (WIDTH / rect.width));
  const y = Math.floor((e.clientY - rect.top) * (HEIGHT / rect.height));
  const idx = simulator.getIndex(x, y);
  if (idx !== -1 && simulator.materialGrid[idx] !== activeMaterial) {
    simulator.materialGrid[idx] = activeMaterial;
    requestSave(simulator);
  }
  render(simulator.materialGrid);
}
canvas.addEventListener('mousedown', handleDraw);
canvas.addEventListener('mousemove', handleDraw);
const controlsDiv = document.getElementById('controls');
if (controlsDiv) {
  const header = document.createElement('h3');
  header.style.marginTop = '0';
  header.textContent = 'Material';
  controlsDiv.appendChild(header);

  materialDefs.forEach((def) => {
    const label = document.createElement('label');
    label.className = 'material-option';

    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'material';
    input.value = def.id.toString();
    if (def.id === M_WIRE) input.checked = true;

    input.addEventListener('change', (e) => {
      activeMaterial = parseInt(
        /** @type {HTMLInputElement} */ (e.target).value,
        10,
      );
    });

    const colorDiv = document.createElement('div');
    colorDiv.className = 'material-color';
    colorDiv.style.background = `rgb(${def.r}, ${def.g}, ${def.b})`;

    label.appendChild(input);
    label.appendChild(colorDiv);
    label.appendChild(
      document.createTextNode(` ${def.name} (${def.description})`),
    );

    controlsDiv.appendChild(label);
  });
}

loop();
