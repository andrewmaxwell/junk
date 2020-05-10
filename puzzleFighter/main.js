// https://www.codewars.com/kata/5a3cbf29ee1aae06160000c9/train/javascript

Array.prototype.tap = function (func) {
  func(this);
  return this;
};
import {render} from './renderer.js';
// seeStates = true;

const DEBUG = typeof document !== 'undefined';
const RIGHT = {x: 1, y: 0};
const DOWN = {x: 0, y: 1};
const LEFT = {x: -1, y: 0};
const UP = {x: 0, y: -1};
const dirs = [RIGHT, DOWN, LEFT, UP];

const WIDTH = 6;
const HEIGHT = 12;

const copy = (ob) =>
  Array.isArray(ob)
    ? ob.map(copy)
    : ob && typeof ob === 'object'
    ? Object.fromEntries(Object.keys(ob).map((k) => [k, copy(ob[k])]))
    : ob;

const overlaps = (g, x, y, w, h) =>
  g.x < x + w && g.x + g.w > x && g.y < y + h && g.y + g.h > y;
const isInside = (g, x, y, w, h) =>
  g.x >= x && g.x + g.w <= x + w && g.y >= y && g.y + g.h <= y + h;

export class PuzzleFighter {
  constructor() {
    this.gems = [];
    this.frames = [];
    this.move = 0;
  }
  applyMove([[gem1, gem2], moves]) {
    if (this.gameOver) return;
    let x = 3;
    let dir = DOWN;
    moves.split('').forEach((m) => {
      if (m === 'L') x--;
      else if (m === 'R') x++;
      else if (m === 'A')
        dir = dirs[(dirs.indexOf(dir) + dirs.length - 1) % dirs.length];
      else if (m === 'B') dir = dirs[(dirs.indexOf(dir) + 1) % dirs.length];

      while (x < 0 || (dir === LEFT && x < 1)) x++;
      while (x > WIDTH - 1 || (dir === RIGHT && x > WIDTH - 2)) x--;
    });

    const gems = [
      {x, y: dir === UP ? 1 : 0, color: gem1, w: 1, h: 1},
      {x: x + dir.x, y: dir.y + (dir === UP ? 1 : 0), color: gem2, w: 1, h: 1},
    ];

    if (gems.some((g) => this.getGem(g.x, g.y))) this.gameOver = true;
    else {
      this.gems.push(...gems);
      this.applyChanges();
      this.move++;
    }
  }
  getGem(x, y) {
    return this.gems.find(
      (g) => x >= g.x && y >= g.y && x < g.x + g.w && y < g.y + g.h
    );
  }
  getGemColor(x, y) {
    const g = this.getGem(x, y);
    return g ? g.color : ' ';
  }
  applyChanges() {
    do {
      this.resolveGravity();
      this.resolvePowerGems(true);
    } while (this.resolveCrashAndRainbowGems());
    this.resolvePowerGems();
  }
  resolveGravity() {
    this.gems.sort((a, b) => b.y + b.h - (a.y + a.h));
    let falling = true;
    this.saveFrame();
    while (falling) {
      falling = false;
      for (const gem of this.gems) {
        while (this.canFall(gem)) {
          gem.y++;
          falling = true;
        }
      }
    }
    this.saveFrame();
  }
  resolveCrashAndRainbowGems() {
    let resolved = false;

    const targetColors = this.gems
      .filter((g) => g.color === '0')
      .map((g) => this.getGemColor(g.x, g.y + 1).toUpperCase());
    if (targetColors.length) {
      this.gems = this.gems.filter(
        (g) => g.color !== '0' && !targetColors.includes(g.color.toUpperCase())
      );
      resolved = true;
    }

    const coords = this.gems
      .filter((g) => /[a-z]/.test(g.color))
      .map((g) => {
        const q = [{x: g.x, y: g.y}];
        for (const c of q) {
          for (const d of dirs) {
            const x = d.x + c.x;
            const y = d.y + c.y;
            if (
              this.getGemColor(x, y).toUpperCase() === g.color.toUpperCase() &&
              q.every((m) => m.x !== x || m.y !== y)
            )
              q.push({x, y});
          }
        }
        return q;
      })
      .filter((q) => q.length > 1)
      .reduce((a, b) => a.concat(b), []);

    if (coords.length) {
      this.gems = this.gems.filter(
        (g) =>
          !coords.some(
            ({x, y}) => x >= g.x && y >= g.y && x < g.x + g.w && y < g.y + g.h
          )
      );
      resolved = true;
    }
    return resolved;
  }
  isSameColor(grid, x, y, w, h, color) {
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        const g = grid[yy][xx];
        if (!g || g.color !== color) return false;
      }
    }
    return true;
  }
  powerGemSize({x, y, w: ow, h: oh, color}) {
    let best = {w: ow, h: oh};
    const grid = this.getGrid();
    for (let h = Math.max(2, oh); h < HEIGHT - y + 1; h++) {
      for (let w = Math.max(2, ow); w < WIDTH - x + 1; w++) {
        if (!this.isSameColor(grid, x, y, w, h, color)) break;
        if (
          w >= best.w &&
          this.gems.every(
            (gem) => !overlaps(gem, x, y, w, h) || isInside(gem, x, y, w, h)
          )
        )
          best = {w, h};
      }
    }
    return best;
  }
  resolvePowerGems(smallOnly) {
    this.gems
      .reduce((res, gem) => {
        const {w, h} = this.powerGemSize(gem);
        if ((w > gem.w || h > gem.h) && (!smallOnly || (w === 2 && h === 2)))
          res.push({
            gem,
            w,
            h,
            widest: this.gems.reduce(
              (res, g) =>
                isInside(g, gem.x, gem.y, w, h) && g.w > res ? g.w : res,
              gem.w
            ),
          });
        return res;
      }, [])
      .sort(
        (a, b) =>
          b.w - b.widest - (a.w - a.widest) ||
          a.gem.y - b.gem.y ||
          a.gem.x - b.gem.x
      )
      // .tap((x) => console.log('>>>', this.move, x))
      .reduce((res, p) => {
        if (
          res.every(
            ({gem, w, h}) =>
              !overlaps(
                {x: gem.x, y: gem.y, w, h},
                p.gem.x,
                p.gem.y,
                p.gem.x + p.w,
                p.gem.y + p.h
              )
          )
        )
          res.push(p);
        return res;
      }, [])
      .forEach(({gem, w, h}) => {
        gem.w = w;
        gem.h = h;
        this.gems = this.gems.filter(
          (g) =>
            g === gem ||
            g.x + g.w <= gem.x ||
            g.x >= gem.x + gem.w ||
            g.y + g.h <= gem.y ||
            g.y >= gem.y + gem.h
        );
      });
  }
  canFall(gem) {
    const y = gem.y + gem.h;
    if (y > HEIGHT - 1) return false;
    for (let i = 0; i < gem.w; i++) {
      if (this.getGemColor(gem.x + i, y) !== ' ') return false;
    }
    return true;
  }
  getGrid() {
    const grid = new Array(HEIGHT).fill().map(() => new Array(WIDTH).fill());
    for (const gem of this.gems) {
      for (let x = gem.x; x < gem.x + gem.w; x++) {
        for (let y = gem.y; y < gem.y + gem.h; y++) {
          grid[y][x] = gem;
        }
      }
    }
    return grid;
  }
  getState() {
    return this.getGrid()
      .map((r) => r.map((c) => (c ? c.color : ' ')).join(''))
      .join('\n');
  }
  saveFrame() {
    if (DEBUG) this.frames.push({gems: copy(this.gems), move: this.move});
  }
}

const puzzleFighter = (arr, expected) => {
  const game = new PuzzleFighter();
  console.log(arr);
  arr.forEach((m) => game.applyMove(m));

  if (DEBUG) render(WIDTH, HEIGHT, game, expected);
  return game.getState();
};

if (DEBUG) {
  puzzleFighter(
    [
      ['RB', 'BBLRR'],
      ['YY', 'LL'],
      ['YG', 'ALALL'],
      ['BB', 'LA'],
      ['GR', 'LBB'],
      ['YG', 'AAALLL'],
      ['YG', 'BLRRR'],
      ['RB', 'AAALRRR'],
      ['GG', 'ALA'],
      ['Bb', 'LAALLL'],
      ['YR', 'LLL'],
      ['yb', 'LL'],
      ['BB', 'L'],
      ['YG', 'L'],
      ['YB', 'LA'],
      ['RG', 'ALLLL'],
      ['YG', 'BBBLR'],
      ['G0', 'LLLL'],
      ['BB', 'AALR'],
      ['Gb', 'AALLL'],
      ['RG', 'LR'],
      ['BG', 'ALR'],
      ['BG', 'LAAL'],
      ['GR', 'BLL'],
      ['BG', 'AALLLL'],
      ['bY', 'AALRR'],
      ['RG', 'LB'],
      ['G0', 'LRR'],
      ['GY', 'AAALRRR'],
      ['YR', 'LAAA'],
      ['BY', 'BBLL'],
      ['YG', 'LLL'],
      ['Gg', 'ALRRR'],
      ['YB', 'L'],
      ['RG', 'LA'],
      ['YG', 'BBLR'],
      ['GB', 'LL'],
      ['RG', 'LA'],
      ['YY', 'BBLBLL'],
      ['GG', 'AAALL'],
      ['YR', 'ALL'],
      ['BY', 'AALRR'],
      ['RY', 'LB'],
      ['RY', 'LLL'],
      ['GB', 'LBBLL'],
      ['YG', 'LBBB'],
      ['BB', 'AALR'],
      ['RG', 'LLLL'],
      ['YR', 'BBLB'],
      ['BG', 'ALALL'],
      ['RG', 'L'],
      ['bY', 'LRR'],
      ['Yb', 'L'],
      ['RY', 'LAA'],
      ['YY', 'BBBLR'],
      ['RR', 'LR'],
      ['Rb', 'ALRRR'],
      ['RG', 'AAALR'],
      ['GG', 'LBBBLL'],
      ['GB', 'BLRRR'],
      ['GB', 'ALAL'],
      ['GG', 'L'],
    ],
    `PAIR 0: RB | MOVE: BBLRR
  ╔═══ ══╗
 0║      ║
 1║      ║
 2║      ║
 3║      ║
 4║      ║
 5║      ║
 6║      ║
 7║      ║
 8║      ║
 9║      ║
10║    B ║
11║    R ║
  ╚══════╝

PAIR 1: YY | MOVE: LL
  ╔═══ ══╗
 0║      ║
 1║      ║
 2║      ║
 3║      ║
 4║      ║
 5║      ║
 6║      ║
 7║      ║
 8║      ║
 9║      ║
10║ Y  B ║
11║ Y  R ║
  ╚══════╝

PAIR 2: YG | MOVE: ALALL
  ╔═══ ══╗
 0║      ║
 1║      ║
 2║      ║
 3║      ║
 4║      ║
 5║      ║
 6║      ║
 7║      ║
 8║      ║
 9║      ║
10║GY  B ║
11║YY  R ║
  ╚══════╝

PAIR 3: BB | MOVE: LA
  ╔═══ ══╗
 0║      ║
 1║      ║
 2║      ║
 3║      ║
 4║      ║
 5║      ║
 6║      ║
 7║      ║
 8║      ║
 9║      ║
10║GY  B ║
11║YYBBR ║
  ╚══════╝

PAIR 4: GR | MOVE: LBB
  ╔═══ ══╗
 0║      ║
 1║      ║
 2║      ║
 3║      ║
 4║      ║
 5║      ║
 6║      ║
 7║      ║
 8║      ║
 9║  R   ║
10║GYG B ║
11║YYBBR ║
  ╚══════╝

PAIR 5: YG | MOVE: AAALLL
  ╔═══ ══╗
 0║      ║
 1║      ║
 2║      ║
 3║      ║
 4║      ║
 5║      ║
 6║      ║
 7║      ║
 8║      ║
 9║GYR   ║
10║GYG B ║
11║YYBBR ║
  ╚══════╝

PAIR 6: YG | MOVE: BLRRR
  ╔═══ ══╗
 0║      ║
 1║      ║
 2║      ║
 3║      ║
 4║      ║
 5║      ║
 6║      ║
 7║      ║
 8║      ║
 9║GYR G ║
10║GYG B ║
11║YYBBRY║
  ╚══════╝

PAIR 7: RB | MOVE: AAALRRR
  ╔═══ ══╗
 0║      ║
 1║      ║
 2║      ║
 3║      ║
 4║      ║
 5║      ║
 6║      ║
 7║      ║
 8║    B ║
 9║GYR G ║
10║GYG BR║
11║YYBBRY║
  ╚══════╝

PAIR 8: GG | MOVE: ALA
  ╔═══ ══╗
 0║      ║
 1║      ║
 2║      ║
 3║      ║
 4║      ║
 5║      ║
 6║      ║
 7║  G   ║
 8║  G B ║
 9║GYR G ║
10║GYG BR║
11║YYBBRY║
  ╚══════╝

PAIR 9: Bb | MOVE: LAALLL
  ╔═══ ══╗
 0║      ║
 1║      ║
 2║      ║
 3║      ║
 4║      ║
 5║      ║
 6║      ║
 7║  G   ║
 8║  G B ║
 9║GYR G ║
10║GYG BR║
11║YYBBRY║
  ╚══════╝

PAIR 10: YR | MOVE: LLL
  ╔═══ ══╗
 0║      ║
 1║      ║
 2║      ║
 3║      ║
 4║      ║
 5║      ║
 6║      ║
 7║Y G   ║
 8║R G B ║
 9║GYR G ║
10║GYG BR║
11║YYBBRY║
  ╚══════╝

PAIR 11: yb | MOVE: LL
  ╔═══ ══╗
 0║      ║
 1║      ║
 2║      ║
 3║      ║
 4║      ║
 5║      ║
 6║      ║
 7║  G   ║
 8║RbG B ║
 9║GYR G ║
10║GYG BR║
11║YYBBRY║
  ╚══════╝

PAIR 12: BB | MOVE: L
  ╔═══ ══╗
 0║      ║
 1║      ║
 2║      ║
 3║      ║
 4║      ║
 5║  B   ║
 6║  B   ║
 7║  G   ║
 8║RbG B ║
 9║GYR G ║
10║GYG BR║
11║YYBBRY║
  ╚══════╝

PAIR 13: YG | MOVE: L
  ╔═══ ══╗
 0║      ║
 1║      ║
 2║      ║
 3║  Y   ║
 4║  G   ║
 5║  B   ║
 6║  B   ║
 7║  G   ║
 8║RbG B ║
 9║GYR G ║
10║GYG BR║
11║YYBBRY║
  ╚══════╝

PAIR 14: YB | MOVE: LA
  ╔═══ ══╗
 0║      ║
 1║      ║
 2║  Y   ║
 3║  Y   ║
 4║  G   ║
 5║  B   ║
 6║  B   ║
 7║  G   ║
 8║RbG B ║
 9║GYR G ║
10║GYGBBR║
11║YYBBRY║
  ╚══════╝

PAIR 15: RG | MOVE: ALLLL
  ╔═══ ══╗
 0║      ║
 1║      ║
 2║  Y   ║
 3║  Y   ║
 4║  G   ║
 5║  B   ║
 6║  B   ║
 7║RGG   ║
 8║RbG B ║
 9║GYR G ║
10║GYGBBR║
11║YYBBRY║
  ╚══════╝

PAIR 16: YG | MOVE: BBBLR
  ╔═══ ══╗
 0║      ║
 1║      ║
 2║  Y   ║
 3║  Y   ║
 4║  G   ║
 5║  B   ║
 6║  B   ║
 7║RGG G ║
 8║RbG B ║
 9║GYRYG ║
10║GYGBBR║
11║YYBBRY║
  ╚══════╝

PAIR 17: G0 | MOVE: LLLL
  ╔═══ ══╗
 0║      ║
 1║      ║
 2║      ║
 3║  Y   ║
 4║  Y   ║
 5║  G   ║
 6║  B   ║
 7║ GB   ║
 8║GbG G ║
 9║GYGYB ║
10║GYGBG ║
11║YYBBBY║
  ╚══════╝

PAIR 18: BB | MOVE: AALR
  ╔═══ ══╗
 0║      ║
 1║      ║
 2║      ║
 3║  Y   ║
 4║  Y   ║
 5║  G   ║
 6║  B   ║
 7║ GBB  ║
 8║GbGBG ║
 9║GYGYB ║
10║GYGBG ║
11║YYBBBY║
  ╚══════╝

PAIR 19: Gb | MOVE: AALLL
  ╔═══ ══╗
 0║      ║
 1║      ║
 2║      ║
 3║  Y   ║
 4║  Y   ║
 5║  G   ║
 6║b B   ║
 7║GGBB  ║
 8║GbGBG ║
 9║GYGYB ║
10║GYGBG ║
11║YYBBBY║
  ╚══════╝

PAIR 20: RG | MOVE: LR
  ╔═══ ══╗
 0║      ║
 1║      ║
 2║      ║
 3║  Y   ║
 4║  Y   ║
 5║  GR  ║
 6║b BG  ║
 7║GGBB  ║
 8║GbGBG ║
 9║GYGYB ║
10║GYGBG ║
11║YYBBBY║
  ╚══════╝

PAIR 21: BG | MOVE: ALR
  ╔═══ ══╗
 0║      ║
 1║      ║
 2║      ║
 3║  Y   ║
 4║  YB  ║
 5║  GR  ║
 6║b BG  ║
 7║GGBBG ║
 8║GbGBG ║
 9║GYGYB ║
10║GYGBG ║
11║YYBBBY║
  ╚══════╝

PAIR 22: BG | MOVE: LAAL
  ╔═══ ══╗
 0║      ║
 1║      ║
 2║      ║
 3║      ║
 4║      ║
 5║  Y   ║
 6║ GYB  ║
 7║GGGRG ║
 8║GbGGG ║
 9║GYGYB ║
10║GYGBG ║
11║YYBBBY║
  ╚══════╝

PAIR 23: GR | MOVE: BLL
  ╔═══ ══╗
 0║      ║
 1║      ║
 2║      ║
 3║      ║
 4║      ║
 5║ GY   ║
 6║RGYB  ║
 7║GGGRG ║
 8║GbGGG ║
 9║GYGYB ║
10║GYGBG ║
11║YYBBBY║
  ╚══════╝

PAIR 24: BG | MOVE: AALLLL
  ╔═══ ══╗
 0║      ║
 1║      ║
 2║      ║
 3║      ║
 4║G     ║
 5║BGY   ║
 6║RGYB  ║
 7║GGGRG ║
 8║GbGGG ║
 9║GYGYB ║
10║GYGBG ║
11║YYBBBY║
  ╚══════╝

PAIR 25: bY | MOVE: AALRR
  ╔═══ ══╗
 0║      ║
 1║      ║
 2║      ║
 3║      ║
 4║G     ║
 5║BGY   ║
 6║RGY Y ║
 7║GGGRG ║
 8║GbGGG ║
 9║GYGYB ║
10║GYGBG ║
11║YYBBBY║
  ╚══════╝

PAIR 26: RG | MOVE: LB
  ╔═══ ══╗
 0║      ║
 1║      ║
 2║      ║
 3║      ║
 4║GGR   ║
 5║BGY   ║
 6║RGY Y ║
 7║GGGRG ║
 8║GbGGG ║
 9║GYGYB ║
10║GYGBG ║
11║YYBBBY║
  ╚══════╝

PAIR 27: G0 | MOVE: LRR
  ╔═══ ══╗
 0║      ║
 1║      ║
 2║      ║
 3║      ║
 4║      ║
 5║G     ║
 6║B     ║
 7║R R G ║
 8║GGG G ║
 9║GGG G ║
10║GGGRB ║
11║GGGGG ║
  ╚══════╝

PAIR 28: GY | MOVE: AAALRRR
  ╔═══ ══╗
 0║      ║
 1║      ║
 2║      ║
 3║      ║
 4║      ║
 5║G     ║
 6║B   Y ║
 7║R R G ║
 8║GGG G ║
 9║GGG G ║
10║GGGRB ║
11║GGGGGG║
  ╚══════╝

PAIR 29: YR | MOVE: LAAA
  ╔═══ ══╗
 0║      ║
 1║      ║
 2║      ║
 3║      ║
 4║      ║
 5║G     ║
 6║B Y Y ║
 7║RRR G ║
 8║GGG G ║
 9║GGG G ║
10║GGGRB ║
11║GGGGGG║
  ╚══════╝

PAIR 30: BY | MOVE: BBLL
  ╔═══ ══╗
 0║      ║
 1║      ║
 2║      ║
 3║      ║
 4║      ║
 5║GY    ║
 6║BBY Y ║
 7║RRR G ║
 8║GGG G ║
 9║GGG G ║
10║GGGRB ║
11║GGGGGG║
  ╚══════╝

PAIR 31: YG | MOVE: LLL
  ╔═══ ══╗
 0║      ║
 1║      ║
 2║      ║
 3║Y     ║
 4║G     ║
 5║GY    ║
 6║BBY Y ║
 7║RRR G ║
 8║GGG G ║
 9║GGG G ║
10║GGGRB ║
11║GGGGGG║
  ╚══════╝

PAIR 32: Gg | MOVE: ALRRR
  ╔═══ ══╗
 0║      ║
 1║      ║
 2║      ║
 3║      ║
 4║      ║
 5║      ║
 6║    G ║
 7║Y   Y ║
 8║G   G ║
 9║GY  G ║
10║BBY G ║
11║RRRRB ║
  ╚══════╝

PAIR 33: YB | MOVE: L
  ╔═══ ══╗
 0║      ║
 1║      ║
 2║      ║
 3║      ║
 4║      ║
 5║      ║
 6║    G ║
 7║Y   Y ║
 8║G Y G ║
 9║GYB G ║
10║BBY G ║
11║RRRRB ║
  ╚══════╝

PAIR 34: RG | MOVE: LA
  ╔═══ ══╗
 0║      ║
 1║      ║
 2║      ║
 3║      ║
 4║      ║
 5║      ║
 6║    G ║
 7║Y R Y ║
 8║G Y G ║
 9║GYB G ║
10║BBYGG ║
11║RRRRB ║
  ╚══════╝

PAIR 35: YG | MOVE: BBLR
  ╔═══ ══╗
 0║      ║
 1║      ║
 2║      ║
 3║      ║
 4║      ║
 5║      ║
 6║    G ║
 7║Y R Y ║
 8║G YGG ║
 9║GYBYG ║
10║BBYGG ║
11║RRRRB ║
  ╚══════╝

PAIR 36: GB | MOVE: LL
  ╔═══ ══╗
 0║      ║
 1║      ║
 2║      ║
 3║      ║
 4║      ║
 5║      ║
 6║    G ║
 7║YGR Y ║
 8║GBYGG ║
 9║GYBYG ║
10║BBYGG ║
11║RRRRB ║
  ╚══════╝

PAIR 37: RG | MOVE: LA
  ╔═══ ══╗
 0║      ║
 1║      ║
 2║      ║
 3║      ║
 4║      ║
 5║      ║
 6║  R G ║
 7║YGRGY ║
 8║GBYGG ║
 9║GYBYG ║
10║BBYGG ║
11║RRRRB ║
  ╚══════╝

PAIR 38: YY | MOVE: BBLBLL
  ╔═══ ══╗
 0║      ║
 1║      ║
 2║      ║
 3║      ║
 4║      ║
 5║      ║
 6║YYR G ║
 7║YGRGY ║
 8║GBYGG ║
 9║GYBYG ║
10║BBYGG ║
11║RRRRB ║
  ╚══════╝

PAIR 39: GG | MOVE: AAALL
  ╔═══ ══╗
 0║      ║
 1║      ║
 2║      ║
 3║      ║
 4║      ║
 5║GG    ║
 6║YYR G ║
 7║YGRGY ║
 8║GBYGG ║
 9║GYBYG ║
10║BBYGG ║
11║RRRRB ║
  ╚══════╝

PAIR 40: YR | MOVE: ALL
  ╔═══ ══╗
 0║      ║
 1║      ║
 2║      ║
 3║      ║
 4║ Y    ║
 5║GGR   ║
 6║YYR G ║
 7║YGRGY ║
 8║GBYGG ║
 9║GYBYG ║
10║BBYGG ║
11║RRRRB ║
  ╚══════╝

PAIR 41: BY | MOVE: AALRR
  ╔═══ ══╗
 0║      ║
 1║      ║
 2║      ║
 3║      ║
 4║ Y  Y ║
 5║GGR B ║
 6║YYR G ║
 7║YGRGY ║
 8║GBYGG ║
 9║GYBYG ║
10║BBYGG ║
11║RRRRB ║
  ╚══════╝

PAIR 42: RY | MOVE: LB
  ╔═══ ══╗
 0║      ║
 1║      ║
 2║      ║
 3║ Y    ║
 4║ YR Y ║
 5║GGR B ║
 6║YYR G ║
 7║YGRGY ║
 8║GBYGG ║
 9║GYBYG ║
10║BBYGG ║
11║RRRRB ║
  ╚══════╝

PAIR 43: RY | MOVE: LLL
  ╔═══ ══╗
 0║      ║
 1║      ║
 2║      ║
 3║RY    ║
 4║YYR Y ║
 5║GGR B ║
 6║YYR G ║
 7║YGRGY ║
 8║GBYGG ║
 9║GYBYG ║
10║BBYGG ║
11║RRRRB ║
  ╚══════╝

PAIR 44: GB | MOVE: LBBLL
  ╔═══ ══╗
 0║      ║
 1║B     ║
 2║G     ║
 3║RY    ║
 4║YYR Y ║
 5║GGR B ║
 6║YYR G ║
 7║YGRGY ║
 8║GBYGG ║
 9║GYBYG ║
10║BBYGG ║
11║RRRRB ║
  ╚══════╝

PAIR 45: YG | MOVE: LBBB
  ╔═══ ══╗
 0║      ║
 1║B     ║
 2║G     ║
 3║RYY   ║
 4║YYR Y ║
 5║GGR B ║
 6║YYRGG ║
 7║YGRGY ║
 8║GBYGG ║
 9║GYBYG ║
10║BBYGG ║
11║RRRRB ║
  ╚══════╝

PAIR 46: BB | MOVE: AALR
  ╔═══ ══╗
 0║      ║
 1║B     ║
 2║G     ║
 3║RYY   ║
 4║YYRBY ║
 5║GGRBB ║
 6║YYRGG ║
 7║YGRGY ║
 8║GBYGG ║
 9║GYBYG ║
10║BBYGG ║
11║RRRRB ║
  ╚══════╝`
  );
  puzzleFighter(
    [
      ['YR', 'LLL'],
      ['GY', 'LLLRL'],
      ['RY', 'BBLL'],
      ['RB', 'AAL'],
      ['GR', 'BR'],
      ['GG', 'A'],
      ['YY', 'LL'],
      ['GG', 'BLLL'],
      ['YY', 'ALLL'],
      ['BY', 'BL'],
      ['YB', 'ALLLR'],
      ['RY', 'LLLB'],
      ['GG', 'BBBBB'],
      ['GB', 'A'],
      ['GR', 'AA'],
      ['gB', 'AALAB'],
      ['YR', 'RRAAA'],
      ['BB', ''],
      ['RG', 'AL'],
      ['GG', 'L'],
      ['RG', 'RRBL'],
      ['Gb', 'A'],
      ['rB', 'R'],
      ['GG', 'RR'],
      ['RB', 'AARR'],
      ['GG', 'BR'],
      ['bR', 'AARR'],
    ],
    `PAIR 0: YR | MOVE: LLL
    ╔═══ ══╗
   0║      ║
   1║      ║
   2║      ║
   3║      ║
   4║      ║
   5║      ║
   6║      ║
   7║      ║
   8║      ║
   9║      ║
  10║Y     ║
  11║R     ║
    ╚══════╝

  PAIR 1: GY | MOVE: LLLRL
    ╔═══ ══╗
   0║      ║
   1║      ║
   2║      ║
   3║      ║
   4║      ║
   5║      ║
   6║      ║
   7║      ║
   8║G     ║
   9║Y     ║
  10║Y     ║
  11║R     ║
    ╚══════╝

  PAIR 2: RY | MOVE: BBLL
    ╔═══ ══╗
   0║      ║
   1║      ║
   2║      ║
   3║      ║
   4║      ║
   5║      ║
   6║      ║
   7║      ║
   8║G     ║
   9║Y     ║
  10║YY    ║
  11║RR    ║
    ╚══════╝

  PAIR 3: RB | MOVE: AAL
    ╔═══ ══╗
   0║      ║
   1║      ║
   2║      ║
   3║      ║
   4║      ║
   5║      ║
   6║      ║
   7║      ║
   8║G     ║
   9║Y     ║
  10║YYB   ║
  11║RRR   ║
    ╚══════╝

  PAIR 4: GR | MOVE: BR
    ╔═══ ══╗
   0║      ║
   1║      ║
   2║      ║
   3║      ║
   4║      ║
   5║      ║
   6║      ║
   7║      ║
   8║G     ║
   9║Y     ║
  10║YYB   ║
  11║RRRRG ║
    ╚══════╝

  PAIR 5: GG | MOVE: A
    ╔═══ ══╗
   0║      ║
   1║      ║
   2║      ║
   3║      ║
   4║      ║
   5║      ║
   6║      ║
   7║      ║
   8║G     ║
   9║Y     ║
  10║YYBGG ║
  11║RRRRG ║
    ╚══════╝

  PAIR 6: YY | MOVE: LL
    ╔═══ ══╗
   0║      ║
   1║      ║
   2║      ║
   3║      ║
   4║      ║
   5║      ║
   6║      ║
   7║      ║
   8║GY    ║
   9║YY    ║
  10║YYBGG ║
  11║RRRRG ║
    ╚══════╝

  PAIR 7: GG | MOVE: BLLL
    ╔═══ ══╗
   0║      ║
   1║      ║
   2║      ║
   3║      ║
   4║      ║
   5║      ║
   6║      ║
   7║GG    ║
   8║GY    ║
   9║YY    ║
  10║YYBGG ║
  11║RRRRG ║
    ╚══════╝

  PAIR 8: YY | MOVE: ALLL
    ╔═══ ══╗
   0║      ║
   1║      ║
   2║      ║
   3║      ║
   4║      ║
   5║      ║
   6║YY    ║
   7║GG    ║
   8║GY    ║
   9║YY    ║
  10║YYBGG ║
  11║RRRRG ║
    ╚══════╝

  PAIR 9: BY | MOVE: BL
    ╔═══ ══╗
   0║      ║
   1║      ║
   2║      ║
   3║      ║
   4║      ║
   5║ Y    ║
   6║YY    ║
   7║GG    ║
   8║GY    ║
   9║YYB   ║
  10║YYBGG ║
  11║RRRRG ║
    ╚══════╝

  PAIR 10: YB | MOVE: ALLLR
    ╔═══ ══╗
   0║      ║
   1║      ║
   2║      ║
   3║      ║
   4║ Y    ║
   5║ Y    ║
   6║YY    ║
   7║GG    ║
   8║GYB   ║
   9║YYB   ║
  10║YYBGG ║
  11║RRRRG ║
    ╚══════╝

  PAIR 11: RY | MOVE: LLLB
    ╔═══ ══╗
   0║      ║
   1║      ║
   2║      ║
   3║ R    ║
   4║ Y    ║
   5║YY    ║
   6║YY    ║
   7║GG    ║
   8║GYB   ║
   9║YYB   ║
  10║YYBGG ║
  11║RRRRG ║
    ╚══════╝

  PAIR 12: GG | MOVE: BBBBB
    ╔═══ ══╗
   0║      ║
   1║      ║
   2║      ║
   3║ R    ║
   4║ Y    ║
   5║YY    ║
   6║YY    ║
   7║GGG   ║
   8║GYB   ║
   9║YYBG  ║
  10║YYBGG ║
  11║RRRRG ║
    ╚══════╝

  PAIR 13: GB | MOVE: A
    ╔═══ ══╗
   0║      ║
   1║      ║
   2║      ║
   3║ R    ║
   4║ Y    ║
   5║YY    ║
   6║YY    ║
   7║GGG   ║
   8║GYBG  ║
   9║YYBGB ║
  10║YYBGG ║
  11║RRRRG ║
    ╚══════╝

  PAIR 14: GR | MOVE: AA
    ╔═══ ══╗
   0║      ║
   1║      ║
   2║      ║
   3║ R    ║
   4║ Y    ║
   5║YY    ║
   6║YY R  ║
   7║GGGG  ║
   8║GYBG  ║
   9║YYBGB ║
  10║YYBGG ║
  11║RRRRG ║
    ╚══════╝

  PAIR 15: gB | MOVE: AALAB
    ╔═══ ══╗
   0║      ║
   1║      ║
   2║      ║
   3║      ║
   4║ R    ║
   5║ Y    ║
   6║YY    ║
   7║YYB   ║
   8║ YB   ║
   9║YYB   ║
  10║YYBR  ║
  11║RRRRB ║
    ╚══════╝

  PAIR 16: YR | MOVE: RRAAA
    ╔═══ ══╗
   0║      ║
   1║      ║
   2║      ║
   3║      ║
   4║ R    ║
   5║ Y    ║
   6║YY    ║
   7║YYB   ║
   8║ YB   ║
   9║YYBR  ║
  10║YYBRY ║
  11║RRRRB ║
    ╚══════╝

  PAIR 17: BB | MOVE:
    ╔═══ ══╗
   0║      ║
   1║      ║
   2║      ║
   3║      ║
   4║ R    ║
   5║ Y    ║
   6║YY    ║
   7║YYBB  ║
   8║ YBB  ║
   9║YYBR  ║
  10║YYBRY ║
  11║RRRRB ║
    ╚══════╝

  PAIR 18: RG | MOVE: AL
    ╔═══ ══╗
   0║      ║
   1║      ║
   2║      ║
   3║      ║
   4║ R    ║
   5║ Y    ║
   6║YYRG  ║
   7║YYBB  ║
   8║ YBB  ║
   9║YYBR  ║
  10║YYBRY ║
  11║RRRRB ║
    ╚══════╝

  PAIR 19: GG | MOVE: L
    ╔═══ ══╗
   0║      ║
   1║      ║
   2║      ║
   3║      ║
   4║ RG   ║
   5║ YG   ║
   6║YYRG  ║
   7║YYBB  ║
   8║ YBB  ║
   9║YYBR  ║
  10║YYBRY ║
  11║RRRRB ║
    ╚══════╝

  PAIR 20: RG | MOVE: RRBL
    ╔═══ ══╗
   0║      ║
   1║      ║
   2║      ║
   3║      ║
   4║ RG   ║
   5║ YGG  ║
   6║YYRG  ║
   7║YYBB  ║
   8║ YBB  ║
   9║YYBRR ║
  10║YYBRY ║
  11║RRRRB ║
    ╚══════╝

  PAIR 21: Gb | MOVE: A
    ╔═══ ══╗
   0║      ║
   1║      ║
   2║      ║
   3║      ║
   4║ R    ║
   5║ Y    ║
   6║YYGG  ║
   7║YYGG  ║
   8║ Y G  ║
   9║YY RR ║
  10║YYRRY ║
  11║RRRRB ║
    ╚══════╝

  PAIR 22: rB | MOVE: R
    ╔═══ ══╗
   0║      ║
   1║      ║
   2║      ║
   3║      ║
   4║ R    ║
   5║ Y    ║
   6║YYGG  ║
   7║YYGGr ║
   8║ Y GB ║
   9║YY RR ║
  10║YYRRY ║
  11║RRRRB ║
    ╚══════╝

  PAIR 23: GG | MOVE: RR
    ╔═══ ══╗
   0║      ║
   1║      ║
   2║      ║
   3║      ║
   4║ R    ║
   5║ Y    ║
   6║YYGG  ║
   7║YYGGr ║
   8║ Y GB ║
   9║YY RR ║
  10║YYRRYG║
  11║RRRRBG║
    ╚══════╝

  PAIR 24: RB | MOVE: AARR
    ╔═══ ══╗
   0║      ║
   1║      ║
   2║      ║
   3║      ║
   4║ R    ║
   5║ Y    ║
   6║YYGG  ║
   7║YYGGr ║
   8║ Y GBB║
   9║YY RRR║
  10║YYRRYG║
  11║RRRRBG║
    ╚══════╝

  PAIR 25: GG | MOVE: BR
    ╔═══ ══╗
   0║      ║
   1║      ║
   2║      ║
   3║      ║
   4║ R    ║
   5║ Y G  ║
   6║YYGGG ║
   7║YYGGr ║
   8║ Y GBB║
   9║YY RRR║
  10║YYRRYG║
  11║RRRRBG║
    ╚══════╝

  PAIR 26: bR | MOVE: AARR
    ╔═══ ══╗
   0║      ║
   1║      ║
   2║      ║
   3║      ║
   4║      ║
   5║ R    ║
   6║ Y    ║
   7║YY    ║
   8║YY G  ║
   9║ YGGG ║
  10║YYGGYG║
  11║YY GBG║
    ╚══════╝`
  );
}
