import {
  CHARGE_GND,
  CHARGE_VCC,
  CHARGE_Z,
  HEIGHT,
  M_BRIDGE,
  M_GATE,
  M_GND,
  M_NTYPE,
  M_PTYPE,
  M_VCC,
  M_WIRE,
  WIDTH,
} from './constants.js';

export class Simulator {
  constructor(width = WIDTH, height = HEIGHT) {
    this.width = width;
    this.height = height;
    const gridArea = width * height;

    this.materialGrid = new Uint8Array(gridArea);
    this.chargeGrid = new Uint8Array(gridArea).fill(CHARGE_Z);
    this.isConductive = new Uint8Array(gridArea);

    this.nextChargeBuffer = new Uint8Array(gridArea);
    this.floodVisitedBuffer = new Uint8Array(gridArea);
    this.floodQueue = new Uint16Array(gridArea);

    this.dirs = [
      {dx: 0, dy: -1},
      {dx: 0, dy: 1},
      {dx: -1, dy: 0},
      {dx: 1, dy: 0},
    ];
  }

  /**
   * @param {number} x
   * @param {number} y
   */
  getIndex(x, y) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return -1;
    return y * this.width + x;
  }

  updateConductivity() {
    this.isConductive.fill(0);

    for (let i = 0; i < this.materialGrid.length; i++) {
      const mat = this.materialGrid[i];
      if (mat === M_PTYPE || mat === M_NTYPE) {
        const x = i % this.width;
        const y = Math.floor(i / this.width);

        let adjacentGateCharge = CHARGE_Z;
        for (const d of this.dirs) {
          const idx = this.getIndex(x + d.dx, y + d.dy);
          if (idx !== -1 && this.materialGrid[idx] === M_GATE) {
            adjacentGateCharge = this.chargeGrid[idx];
            break;
          }
        }

        if (
          (mat === M_NTYPE && adjacentGateCharge === CHARGE_VCC) ||
          (mat === M_PTYPE && adjacentGateCharge === CHARGE_GND)
        ) {
          this.isConductive[i] = 1;
        }
      }
    }
  }

  /**
   * @param {number} vccOrGnd
   * @param {number} chargeValue
   */
  floodFill(vccOrGnd, chargeValue) {
    this.floodVisitedBuffer.fill(0);
    let queueStart = 0;
    let queueEnd = 0;

    for (let i = 0; i < this.materialGrid.length; i++) {
      if (this.materialGrid[i] === vccOrGnd) {
        this.floodQueue[queueEnd++] = i;
        this.floodVisitedBuffer[i] = 1;
        this.nextChargeBuffer[i] = chargeValue;
      }
    }

    while (queueStart < queueEnd) {
      const idx = this.floodQueue[queueStart++];
      const x = idx % this.width;
      const y = Math.floor(idx / this.width);

      for (const d of this.dirs) {
        let nx = x + d.dx;
        let ny = y + d.dy;
        let nIdx = this.getIndex(nx, ny);

        if (nIdx === -1) continue;

        if (this.materialGrid[nIdx] === M_BRIDGE) {
          nx += d.dx;
          ny += d.dy;
          nIdx = this.getIndex(nx, ny);
          if (nIdx === -1) continue;
        }

        if (this.floodVisitedBuffer[nIdx]) continue;

        if (this.materialGrid[nIdx] === M_WIRE || this.isConductive[nIdx]) {
          this.floodVisitedBuffer[nIdx] = 1;
          this.nextChargeBuffer[nIdx] = chargeValue;
          this.floodQueue[queueEnd++] = nIdx;
        } else if (
          this.materialGrid[nIdx] === M_GATE &&
          !this.isConductive[idx]
        ) {
          this.nextChargeBuffer[nIdx] = chargeValue;
        }
      }
    }
  }

  tick() {
    this.updateConductivity();
    this.nextChargeBuffer.fill(CHARGE_Z);
    this.floodFill(M_VCC, CHARGE_VCC);
    this.floodFill(M_GND, CHARGE_GND);
    this.chargeGrid.set(this.nextChargeBuffer);
  }
}
