import {
  DIRS,
  TYPES,
  DIR_COORDS,
  ACTIONS,
  SYMBOLS,
  TYPE_INDEX,
} from './consts.js';

export class Game {
  constructor(rows, cols) {
    this.rows = rows;
    this.cols = cols;
    this.board = [];
    this.lasers = [];
    this.tankDir = DIRS.RIGHT;
    this.tankMoving = false;
  }
  reset(hash) {
    this.lasers = [];
    this.board = (hash.replace(/#/g, '').match(/.../g) || []).map((p) => {
      const [t, x, y] = p.split('').map((m) => SYMBOLS.indexOf(m));
      return {type: TYPE_INDEX[t], x, y};
    });
  }
  inBounds(x, y) {
    return x >= 0 && y >= 0 && x < this.cols && y < this.rows;
  }
  tankVisible({x, y}, dirCoords) {
    for (let i = 1; i < 1e5; i++) {
      const nx = x + i * dirCoords.x;
      const ny = y + i * dirCoords.y;
      if (!this.inBounds(nx, ny)) return false;
      for (const b of this.board) {
        if (b.x !== nx || b.y !== ny) continue;
        if (b.type === TYPES.TANK) return true;
        if (b.type.onHit) return false;
      }
    }
    console.error('this should never happen');
  }
  shootTurrets() {
    this.board.forEach((b) => {
      const {shootDir} = b.type;
      if (shootDir === undefined) return;
      if (this.tankVisible(b, DIR_COORDS[shootDir]))
        this.lasers.push({x: b.x, y: b.y, dir: shootDir});
    });
  }
  moveItem(item, dir) {
    const {board} = this;
    const nx = item.x + DIR_COORDS[dir].x;
    const ny = item.y + DIR_COORDS[dir].y;

    if (!this.inBounds(nx, ny)) return;

    const blocked = board.some((b) => b.x === nx && b.y === ny && b.type.onHit);
    if (blocked) return false;
    item.px = item.x;
    item.py = item.y;
    item.x += DIR_COORDS[dir].x;
    item.y += DIR_COORDS[dir].y;

    const target = board.find(
      (b) => b.x === nx && b.y === ny && b.type.onCollide
    );
    if (target) {
      const action = target.type.onCollide(item);
      if (action === ACTIONS.SINK) target.type = TYPES.SUNKEN_BLOCK;
      if (action === ACTIONS.SINK || action === ACTIONS.REMOVE)
        board.splice(board.indexOf(item), 1);
    }

    this.shootTurrets();

    return true;
  }
  moveTank(dir) {
    if (this.tankDir === dir) {
      this.board.forEach((b) => {
        if (b.type === TYPES.TANK) this.moveItem(b, dir);
      });
    }
    this.tankDir = dir;
    this.tankMoving = true;
  }
  slideTankMoveLasers() {
    this.lasers.forEach((laser, i) => {
      const {x, y, dir} = laser;
      const nx = x + DIR_COORDS[dir].x;
      const ny = y + DIR_COORDS[dir].y;
      if (!this.inBounds(nx, ny)) {
        this.lasers.splice(i, 1);
      } else {
        const n = this.board.find(
          (b) => b.x === nx && b.y === ny && b.type.onHit
        );
        if (n) {
          const action = n.type.onHit[dir];
          if (action == ACTIONS.TRANSMIT) {
            laser.x = nx;
            laser.y = ny;
          } else if (action === ACTIONS.REFLECT_LEFT) {
            laser.x = nx;
            laser.y = ny;
            laser.dir = (dir + 3) % 4;
          } else if (action === ACTIONS.REFLECT_RIGHT) {
            laser.x = nx;
            laser.y = ny;
            laser.dir = (dir + 1) % 4;
          } else {
            this.lasers.splice(i, 1);
            if (action === ACTIONS.MOVE) this.moveItem(n, dir);
            else if (action === ACTIONS.DESTROY) n.type = TYPES.RUBBLE;
            else if (action === ACTIONS.REMOVE) {
              this.board.splice(this.board.indexOf(n), 1);
              this.shootTurrets();
            }
          }
        } else {
          laser.x = nx;
          laser.y = ny;
        }
      }
    });

    if (this.tankMoving) {
      this.tankMoving = false;
      this.board.forEach((b) => {
        const n =
          b.type === TYPES.TANK &&
          this.board.find(
            (m) => m.x === b.x && m.y === b.y && m.type.slide !== undefined
          );
        if (!n) return;
        const {slide, melt} = n.type;
        const slideDir =
          slide === ACTIONS.MOMENTUM
            ? DIR_COORDS.findIndex(
                (d) => d.x === b.x - b.px && d.y === b.y - b.py
              )
            : slide;
        this.tankMoving = this.moveItem(b, slideDir);
        if (melt) n.type = TYPES.WATER;
      });
    }
  }
  shoot() {
    this.lasers.push(
      ...this.board
        .filter((b) => b.type === TYPES.TANK)
        .map(({x, y}) => ({x, y, dir: this.tankDir}))
    );
  }
  setCell(x, y, type) {
    this.board = this.board.filter((b) => b.x !== x || b.y !== y);
    if (type !== TYPES.EMPTY) this.board.push({x, y, type});
  }
  toHash() {
    return this.board
      .flatMap(({x, y, type}) => [type.id, x, y])
      .map((m) => SYMBOLS[m])
      .join('');
  }
  getBoardSorted() {
    return this.board.sort((a, b) => !b.type.onHit - !a.type.onHit);
  }
  won() {
    return this.board.every(
      (b) =>
        b.type !== TYPES.TANK ||
        this.board.some(
          (m) => m.x === b.x && m.y === b.y && m.type === TYPES.FLAG
        )
    );
  }
  lost() {
    return !this.board.some((b) => b.type === TYPES.TANK);
  }
  canMove() {
    return (
      !this.lasers.length && !this.tankMoving && !this.lost() && !this.won()
    );
  }
}
