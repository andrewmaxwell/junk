import {randEl, shuffle} from '../carcassonne/utils.js';

const MAX_DIST = 20;
const NEAR_DIST = 5;
const CELL_SIZE = 20;
const WORKER_MAX_CAPACITY = 5;
const BUILDING_MAX_CAPACITY = 100;
const AGE_SPEED = 0.1;
const ADULT_AGE = 18;
const MAX_TILL = 20;
const MAX_GROW = 100;
const FIELD_DIST_FROM_BUILDINGS = 10;
const MAX_BUILT = 50;

export const dirs = [
  {x: 1, y: 0},
  {x: 0, y: 1},
  {x: -1, y: 0},
  {x: 0, y: -1},
];

export const types = {
  building: {
    static: true,
    label: 'Building',
    color: 'tan',
    initialVals: {
      grain: 0,
      built: 0,
    },
  },
  worker: {
    label: 'Worker',
    color: 'blue',
    iterate: (unit, stats, units) => {
      unit.moveWorker(types, stats, units);
      unit.age = (unit.age || 0) + AGE_SPEED;
    },
    initialVals: {
      grain: 0,
    },
  },
  child: {
    label: 'Child',
    color: 'pink',
    iterate: (unit) => {
      unit.moveRandomButStayNear(types.building);
      unit.age = (unit.age || 0) + AGE_SPEED;
      if (unit.age >= ADULT_AGE) unit.setType(types.worker);
    },
  },
  crops: {
    static: true,
    label: 'Crops',
    color: 'yellow',
    initialVals: {
      grain: 10,
    },
  },
  soil: {
    static: true,
    label: 'Soil',
    color: 'brown',
    initialVals: {
      tilled: 0,
      growing: 0,
    },
    iterate: (unit) => {
      if (unit.tilled === MAX_TILL) {
        unit.growing++;
        if (unit.growing >= MAX_GROW) {
          unit.setType(types.crops);
        }
      }
    },
  },
};

const isBuildingWithSpace = (u) =>
  u?.type === types.building &&
  u.built >= MAX_BUILT &&
  u.grain < BUILDING_MAX_CAPACITY;

const isUnfinishedBuilding = (u) =>
  u?.type === types.building && u.built < MAX_BUILT;

const isCrops = (u) => u?.type === types.crops && u.grain > 0;

const isUntilledSoil = (u) => u?.type === types.soil && u.tilled < MAX_TILL;

export class Unit {
  constructor(type, x, y, grid) {
    this.grid = grid;
    this.el = document.createElement('div');
    this.el.classList.add('unit');
    this.el.style.width = CELL_SIZE + 'px';
    this.el.style.height = CELL_SIZE + 'px';
    this.setType(type);
    this.setPos(x, y);
    document.body.append(this.el);
  }
  setPos(x, y) {
    delete this.grid[this.x + ',' + this.y];
    this.grid[x + ',' + y] = this;
    this.x = x;
    this.y = y;
    this.el.style.left = x * CELL_SIZE + 'px';
    this.el.style.top = y * CELL_SIZE + 'px';
  }
  setType(t) {
    this.type = t;
    this.el.style.background = t.color;
    Object.assign(this, t.initialVals);
  }
  destroy() {
    delete this.grid[this.x + ',' + this.y];
    this.el.remove();
    this.dead = true;
  }
  thingAt(x, y) {
    return this.grid[x + ',' + y];
  }
  moveRandomButStayNear(nearType) {
    const d = randEl(dirs);
    const nx = this.x + d.x;
    const ny = this.y + d.y;
    if (
      !this.thingAt(nx, ny) &&
      Object.values(this.grid).some(
        (u) =>
          u.type === nearType &&
          Math.abs(u.x - nx) < NEAR_DIST &&
          Math.abs(u.y - ny) < NEAR_DIST
      )
    )
      this.setPos(nx, ny);
  }
  getAdjacent(isTarget) {
    for (const d of shuffle(dirs)) {
      const x = this.x + d.x;
      const y = this.y + d.y;
      const t = this.thingAt(x, y);
      if (isTarget(t, x, y)) return t || new Unit(types.soil, x, y, this.grid);
    }
  }
  goAndDo({isTarget, action, status}) {
    const adj = this.getAdjacent(isTarget);
    if (adj) {
      this.status = status;
      action(adj);
      return true;
    }
    const toward = this.getDirToward(isTarget);
    if (toward) {
      this.status = `going to ${status}`;
      this.setPos(toward.x, toward.y);
      return true;
    }
  }
  getDirToward(isTarget) {
    const seen = {[this.x + ',' + this.y]: true};
    const queue = [{ob: this, dist: 0}];

    for (const curr of queue) {
      for (const d of shuffle(dirs)) {
        const nx = curr.ob.x + d.x;
        const ny = curr.ob.y + d.y;

        if (seen[nx + ',' + ny]) continue;
        seen[nx + ',' + ny] = true;

        const ob = this.thingAt(nx, ny);

        if (isTarget(ob, nx, ny)) {
          let p = curr;
          while (p.prev && p.prev.ob !== this) p = p.prev;
          return p.ob;
        } else if (!ob && curr.dist < MAX_DIST) {
          queue.push({ob: {x: nx, y: ny}, dist: curr.dist + 1, prev: curr});
        }
      }
    }
  }
  moveWorker(types, {totalFood, totalBuildings}, units) {
    // unload grain
    const b = this.grain > 0 && this.getAdjacent(isBuildingWithSpace);
    if (b) {
      const amt = Math.min(BUILDING_MAX_CAPACITY - b.grain, this.grain);
      this.grain -= amt;
      b.grain += amt;
      return;
    }

    // when full, go to building to unload
    if (this.grain >= WORKER_MAX_CAPACITY) {
      const b = this.getDirToward(isBuildingWithSpace);
      if (b) {
        this.setPos(b.x, b.y);
        return;
      }
    }

    // if next to unfinished building, work on it
    const building = this.getAdjacent(isUnfinishedBuilding);
    if (building) {
      building.built++;
      return;
    }

    // if next to untilled soil, till it
    const soil = this.getAdjacent(isUntilledSoil);
    if (soil) {
      soil.tilled++;
      return;
    }

    // if next to crops, harvest
    const crops = this.grain < WORKER_MAX_CAPACITY && this.getAdjacent(isCrops);
    if (crops) {
      crops.grain--;
      this.grain++;
      if (crops.grain <= 0) crops.destroy();
      return;
    }

    // if need more buildings, go build one
    if (
      !totalBuildings ||
      (totalFood > (totalBuildings * BUILDING_MAX_CAPACITY) / 2 &&
        this.goAndDo({
          status: 'make building',
          isTarget: (u, x, y) => {
            if (u || x <= 0 || y <= 0) return false;
            if (!totalBuildings) return true;
            if (
              dirs.some((d) => {
                const t = this.thingAt(x + d.x, y + d.y);
                return t && t !== this && !t.type.static;
              })
              // ||
              // dirs.every(
              //   (d) => this.thingAt(x + d.x, y + d.y)?.type !== types.building
              // )
            )
              return false;

            const distToClosestFarm = units.reduce(
              (min, b) =>
                b.type === types.crops || b.type === types.soil
                  ? Math.min(min, Math.abs(b.x - x) + Math.abs(b.y - y))
                  : min,
              Infinity
            );
            return (
              distToClosestFarm === FIELD_DIST_FROM_BUILDINGS + 2 ||
              distToClosestFarm === Infinity
            );
          },
          action: (spot) => {
            spot.setType(types.building);
          },
        }))
    )
      return;

    // find closest grain, soil, or building in progress and work on it
    const toward = this.getDirToward(
      (u) =>
        isUnfinishedBuilding(u) ||
        isUntilledSoil(u) ||
        (this.grain < WORKER_MAX_CAPACITY && isCrops(u))
    );
    if (toward) {
      this.setPos(toward.x, toward.y);
      return;
    }

    // go make soil to till
    if (
      this.goAndDo({
        status: 'make soil',
        isTarget: (u, x, y) =>
          !u &&
          x > 0 &&
          y > 0 &&
          (!totalBuildings ||
            units.reduce(
              (min, b) =>
                b.type === types.building
                  ? Math.min(min, Math.abs(b.x - x) + Math.abs(b.y - y))
                  : min,
              Infinity
            ) === FIELD_DIST_FROM_BUILDINGS),
        action: (spot) => {
          spot.setType(types.soil);
        },
      })
    )
      return;
  }
}
