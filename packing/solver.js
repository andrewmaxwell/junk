// Packing solver: shrink-and-repair with basin hopping.
//
// The quantity being minimised is `scale` -- the side of the square with the
// same area as the container. Two nested loops, each with its own objective:
//
//   Outer (optimisation): propose a smaller container, warm-started by
//   compressing the last known-good layout into it. If the repair succeeds the
//   proposal becomes the new best and the next step is a little bolder; if it
//   fails the step is halved and retried. The best scale therefore decreases
//   monotonically, and a failed probe -- which only means "not repaired within
//   budget", never "provably infeasible" -- can never exclude the optimum the
//   way a bisection bracket would.
//
//   Inner (feasibility): at a *fixed* scale, drive violation to zero by contact
//   relaxation. On a plateau, perturb and locally settle a nearby arrangement.
//   Basin hopping keeps improving settled states. Failed probes increase the
//   perturbation scale, which encourages exploration but cannot establish
//   infeasibility.
//
// Restarts guard against a bad initial layout, and differ in kind as well as in
// seed: the first starts from an aligned lattice, the rest from scatter.
//
// `benchmark.mjs` checks the result against packings whose optimum is known.

import { testOverlap } from './geometry.js';
import {
  ITEM_SHAPES,
  CONTAINER_SHAPES,
  containerContacts,
  containmentExcess,
} from './shapes.js';
import {
  fibonacciSphere,
  scatterSphere,
  relaxOnSphere,
  measureOnSphere,
  settledOnSphere,
  hopOnSphere,
} from './sphere.js';

export const DEFAULT_CONFIG = {
  itemShape: 'square',
  containerShape: 'circle',
  aspect: 1,
  count: 12,
  attempts: 12,
  // Whether the first attempt starts from the aligned lattice. A parallel
  // search gives that opening to one worker only, since it begins the same
  // way whatever the seed.
  latticeStart: true,

  // --- outer loop: scale search ---
  iterationsPerAttempt: 3000,
  // Repair iterations a single candidate scale may consume before it is
  // declared a failure. Successful probes usually exit in a fraction of this.
  probeIterations: 300,
  // First candidate, as a multiple of the area lower bound.
  initialSlack: 1.6,
  // If even that is unpackable, open the container up by this much and retry.
  growFactor: 1.3,
  initialStep: 0.05, // fractional shrink per successful probe
  maxStep: 0.08,
  stepGrow: 1.15,
  stepShrink: 0.5,
  // Give up on the attempt once the step is this small: further probes cannot
  // improve the answer by enough to be worth the budget.
  minStep: 0.0005,
  // Consecutive failed probes at one size before the search stops compressing
  // the incumbent and scatters a fresh layout instead. 0 keeps the old
  // always-warm-start behaviour.
  reseedAfterFailures: 1,
  // A final fine-grained shrink from the global best, once the restarts are
  // done. 0 skips it.
  polishIterations: 1500,
  polishStep: 0.004,

  // --- inner loop: feasibility repair ---
  // Upper bound on relaxation passes per iteration; a pass that finds nothing
  // left to correct ends the sweep early, so this is a ceiling, not a cost.
  relaxIterations: 12,
  // Fraction of each overlap resolved per contact per pass. Below 1 the
  // Gauss-Seidel sweep converges instead of ringing between coupled contacts.
  correctionBias: 0.8,
  rotationPolicy: 'staged', // preserve aligned starts until sliding stalls; 'free' is the baseline
  // Cap on how far one contact may spin an item, in radians.
  maxAngularCorrection: 0.25,
  // A layout is feasible once *every* overlap and every escape is below this
  // fraction of an item's own radius. Relative so the threshold means the same
  // thing at any scale; a worst-case rather than a sum so that "feasible" is a
  // promise about each pair rather than about their total.
  feasibleTolerance: 1e-4,
  // Iterations without *meaningful* progress before the search perturbs. The
  // counter only advances on a plateau (see `plateauRelativeImprovement`), so
  // this is a far stronger condition than the older "iterations still
  // infeasible" rule and wants a correspondingly smaller limit: at 15 the
  // perturbations became rare enough to starve exploration.
  stuckLimit: 5,
  // Failed repair budgets increase exploration on the next probe. This is a
  // heuristic response to a difficult search, not evidence of infeasibility.
  startTemperature: 1,
  reheatFactor: 1.6,
  maxTemperature: 4,
  minTemperature: 0.02,
  coolingRate: 0.99,

  // Basin hopping perturbs a locally relaxed layout, settles it again, and
  // retains only improvements in normalized overlap energy. It beat the
  // annealed-repair baseline on every case measured once failed probes
  // re-seed, because its group moves are what turn one arrangement into a
  // differently-shaped one, so it is now the only strategy.
  hopRelaxIterations: 8,
  relaxationOrder: 'forward', // 'alternating' | 'forward'
  plateauRelativeImprovement: 0.001,
  seed: null,
};

const clamp = (v, limit) => (v > limit ? limit : v < -limit ? -limit : v);

// Resolve one contact by splitting the correction between translation and
// rotation in proportion to each body's effective mass along the contact
// normal: k = 1/m + (r x n)^2 / I. With infinite inertia this reduces exactly
// to the old translate-by-half-the-overlap rule, so rotation is a strict
// addition rather than a different algorithm.
//
// `b` may be null, which means the second body is the immovable container.
function resolveContact(a, b, nx, ny, depth, px, py, bias, maxAngular) {
  const sa = a.shape;
  const rax = px - a.x;
  const ray = py - a.y;
  const ca = rax * ny - ray * nx; // r x n
  const ia = maxAngular > 0 ? sa.invInertia : 0;
  let k = sa.invMass + ca * ca * ia;

  let sb;
  let cb = 0;
  let ib = 0;
  if (b) {
    sb = b.shape;
    const rbx = px - b.x;
    const rby = py - b.y;
    cb = rbx * ny - rby * nx;
    ib = maxAngular > 0 ? sb.invInertia : 0;
    k += sb.invMass + cb * cb * ib;
  }
  if (k <= 0) return;

  const lambda = (depth * bias) / k;
  a.x -= nx * lambda * sa.invMass;
  a.y -= ny * lambda * sa.invMass;
  a.theta -= clamp(ca * lambda * ia, maxAngular);
  if (b) {
    b.x += nx * lambda * sb.invMass;
    b.y += ny * lambda * sb.invMass;
    b.theta += clamp(cb * lambda * ib, maxAngular);
  }
}

// Side of the smallest axis-aligned square holding `shape` at orientation
// `theta` -- the pitch at which copies of it tile without overlapping.
function boundingWidth(shape, theta) {
  if (!shape.verts) return shape.radius * 2;
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  let w = 0;
  for (const [lx, ly] of shape.verts) {
    w = Math.max(w, Math.abs(lx * c - ly * s), Math.abs(lx * s + ly * c));
  }
  return w * 2;
}

// Perturbation sizes, from "nudge one piece" to "rearrange a neighbourhood".
const MOVE_SCALES = [0.15, 0.5, 1.5];

// Small deterministic PRNG so a run can be reproduced from its seed.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class PackingSolver {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.reset();
  }

  reset() {
    const seed = this.config.seed;
    this.seed = seed == null ? (Math.random() * 2 ** 32) >>> 0 : seed >>> 0;
    this.rand = mulberry32(this.seed);
    this.totalIterations = 0;
    this.hops = 0;
    this.acceptedHops = 0;
    this.sweepIndex = 0;
    this.attemptIndex = 0;
    this.history = [];
    this.best = null; // {scale, items, container}
    this.polishing = false;
    this.done = false;
    this.startAttempt();
  }

  get itemShape() {
    return ITEM_SHAPES[this.config.itemShape];
  }

  get containerShape() {
    return CONTAINER_SHAPES[this.config.containerShape];
  }

  // Items on a sphere live *on* the surface, in unit vectors rather than plane
  // coordinates, so seeding, relaxation, scoring and perturbation each take a
  // different route. Everything outside those -- the scale search, the restart
  // and polish schedule, the history -- is shared untouched.
  get onSphere() {
    return this.containerShape.space === 'sphere';
  }

  get totalItemArea() {
    return this.config.count * this.itemShape.area;
  }

  // No packing can do better than filling the container completely, so this is
  // a genuine lower bound and the scale search never probes below it.
  get scaleLowerBound() {
    return Math.sqrt(this.totalItemArea);
  }

  get efficiency() {
    return this.best ? this.totalItemArea / (this.best.scale ** 2) : null;
  }

  get temperatureFraction() {
    return this.T / this.config.startTemperature;
  }

  makeContainer(scale) {
    return this.containerShape.build(scale, this.config.aspect);
  }

  startAttempt() {
    const cfg = this.config;
    this.iteration = 0;
    this.attemptBest = null; // anchor for the current shrink sequence
    this.attemptRecord = null; // best over both warm-up and unrestricted search
    this.shrinkStep = cfg.initialStep;
    this.probeFailures = 0;
    this.attemptConverged = false;
    this.stagedFinished = false;
    this.startShrink();
  }

  // Seed a fresh layout at the initial slack and start shrinking it.
  startShrink() {
    const first = this.scaleLowerBound * this.config.initialSlack;
    this.items = this.seedLayout(first);
    this.beginProbe(first);
  }

  // Restarts are only useful if they differ in kind, not just in seed. The
  // first attempt starts from an aligned lattice, which is the arrangement
  // optimal packings of equal shapes usually resemble and which random starts
  // reach only by luck; later attempts scatter, to find everything the lattice
  // cannot reach.
  get latticeAttempt() {
    return this.attemptIndex === 0 && this.config.latticeStart;
  }

  seedLayout(first) {
    if (!this.latticeAttempt) return this.scatterFor(first);
    return this.onSphere
      ? fibonacciSphere(this.config.count, this.itemShape)
      : this.latticeLayout();
  }

  scatterFor(extent) {
    return this.onSphere
      ? scatterSphere(this.config.count, this.itemShape, this.rand)
      : this.scatterLayout(extent);
  }

  // Rest the shape on a flat edge rather than a vertex, and pitch the grid by
  // its bounding box, so squares start as a true grid rather than as diamonds
  // that have to be untangled first.
  latticeLayout() {
    const shape = this.itemShape;
    const count = this.config.count;
    const theta = shape.sides ? Math.PI / shape.sides : 0;
    const pitch = boundingWidth(shape, theta) * 1.02;
    const cols = Math.ceil(Math.sqrt(count));
    const rows = Math.ceil(count / cols);
    return Array.from({ length: count }, (_, i) => ({
      x: (i % cols - (cols - 1) / 2) * pitch,
      y: (Math.floor(i / cols) - (rows - 1) / 2) * pitch,
      theta,
      shape,
    }));
  }

  // Pieces dropped near the middle of a container of side `extent`, for
  // relaxation to spread out.
  scatterLayout(extent) {
    const shape = this.itemShape;
    const items = [];
    const spread = extent * 0.4;
    for (let i = 0; i < this.config.count; i++) {
      const ang = this.rand() * Math.PI * 2;
      const dist = Math.sqrt(this.rand()) * spread;
      items.push({
        x: Math.cos(ang) * dist,
        y: Math.sin(ang) * dist,
        theta: this.rand() * Math.PI * 2,
        shape,
      });
    }
    return items;
  }

  // Start testing a candidate scale. Once a feasible layout exists, the probe
  // is warm-started by compressing that layout into the smaller container --
  // positions scale with the container, orientations carry over -- so repair
  // only has to resolve the overlaps compression just introduced.
  beginProbe(targetScale) {
    const cfg = this.config;
    const scale = Math.max(targetScale, this.scaleLowerBound);
    // A failed probe says the incumbent arrangement could not absorb the
    // compression. Compressing it again only re-poses the same question, and
    // the answer is usually the same, so scatter and let this probe ask a
    // different one. The incumbent is still held in `attemptBest`, so an
    // exploration that goes nowhere costs one probe and no ground. Polishing is
    // exempt: there the incumbent is the whole point.
    const reseed = !this.polishing && cfg.reseedAfterFailures > 0 &&
      this.probeFailures >= cfg.reseedAfterFailures;
    if (reseed) {
      this.items = this.scatterFor(scale);
    } else if (this.attemptBest) {
      // A position on the sphere is a unit vector, so it does not depend on the
      // radius at all: compressing the container leaves the layout exactly
      // where it was and simply makes every cap subtend more of it.
      const ratio = this.onSphere ? 1 : scale / this.attemptBest.scale;
      this.items = this.attemptBest.items.map((it) => ({
        ...it,
        x: it.x * ratio,
        y: it.y * ratio,
      }));
    }
    this.scale = scale;
    this.probeIteration = 0;
    this.stuckCounter = 0;
    this.progressEnergy = Infinity;
    // The aligned first start can often settle by sliding alone. Unlock
    // rotation on a plateau; scattered restarts use all degrees of freedom.
    // On a sphere there is no rigid lattice to protect, so orientation is free
    // from the start; the staged sliding warm-up is a planar concern.
    this.rotationActive = cfg.rotationPolicy === 'free' || this.onSphere
      || this.stagedFinished || !this.latticeAttempt || this.itemShape.type === 'circle';
    this.T = Math.min(
      cfg.maxTemperature,
      cfg.startTemperature * cfg.reheatFactor ** this.probeFailures,
    );
  }

  // Iterative contact relaxation: separate overlapping pairs, then push
  // everything back inside the container. Each contact moves *and* rotates the
  // bodies involved, which is what lets polygons turn to face their neighbours
  // instead of relying on random jolts to find a good orientation.
  relax(container) {
    if (container.type === 'sphere') {
      const { relaxIterations, correctionBias, maxAngularCorrection } = this.config;
      relaxOnSphere(this.items, container.R, {
        relaxIterations,
        correctionBias,
        limit: this.violationLimit,
        maxAngular: this.rotationActive ? maxAngularCorrection : 0,
      });
      return;
    }
    const items = this.items;
    const { relaxIterations, correctionBias, maxAngularCorrection } = this.config;
    const contacts = this._contacts || (this._contacts = []);
    const limit = this.violationLimit;
    const angularLimit = this.rotationActive ? maxAngularCorrection : 0;

    for (let it = 0; it < relaxIterations; it++) {
      // The deepest violation this pass had to correct. Tracking it costs
      // nothing -- the depths are already in hand -- and lets an easy probe
      // stop after one or two passes while a hard one keeps the whole budget,
      // so `relaxIterations` can be a generous cap rather than a fixed price.
      let worst = 0;
      // Reverse each sweep to avoid always privileging the same pieces.
      const reverse = this.config.relaxationOrder === 'alternating' && this.sweepIndex++ % 2 === 1;
      for (let ii = 0; ii < items.length; ii++) {
        const i = reverse ? items.length - 1 - ii : ii;
        for (let jj = ii + 1; jj < items.length; jj++) {
          const j = reverse ? items.length - 1 - jj : jj;
          const res = testOverlap(items[i], items[j]);
          if (!res) continue;
          if (res.overlap > worst) worst = res.overlap;
          resolveContact(
            items[i], items[j],
            res.axis[0], res.axis[1], res.overlap, res.px, res.py,
            correctionBias, angularLimit,
          );
        }
      }
      for (let ii = 0; ii < items.length; ii++) {
        const item = items[reverse ? items.length - 1 - ii : ii];
        contacts.length = 0;
        containerContacts(item, container, contacts);
        for (const c of contacts) {
          if (c.ex > worst) worst = c.ex;
          resolveContact(
            item, null,
            c.nx, c.ny, c.ex, c.px, c.py,
            correctionBias, angularLimit,
          );
        }
      }
      if (worst < limit) break;
    }
  }

  // Both violation measures in a single O(n^2) sweep: `total` is the annealing
  // energy (continuous, though not everywhere differentiable) and `worst` is the
  // feasibility gate (per-pair, so "feasible" cannot be bought by spreading a
  // budget across many contacts).
  measureViolation(container) {
    const items = this.items;
    if (container.type === 'sphere') {
      const { total, worst } = measureOnSphere(items, container.R);
      return { total, worst, energy: total / this.itemShape.radius };
    }
    let total = 0;
    let worst = 0;
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const res = testOverlap(items[i], items[j]);
        if (!res) continue;
        total += res.overlap;
        if (res.overlap > worst) worst = res.overlap;
      }
    }
    for (const item of items) {
      const ex = containmentExcess(item, container);
      total += ex;
      if (ex > worst) worst = ex;
    }
    return { total, worst, energy: total / this.itemShape.radius };
  }

  // Absolute form of `feasibleTolerance`, which is stored relative to item size.
  get violationLimit() {
    return this.config.feasibleTolerance * this.itemShape.radius;
  }

  // Used only for colouring. The tolerance matches the feasibility threshold
  // the solver targets, otherwise a perfectly good layout whose shapes rest in
  // exact contact reads as "not settled" because of float residue.
  isSettled(item, container, tol = this.violationLimit) {
    if (container.type === 'sphere') {
      return settledOnSphere(this.items, item, container.R, tol);
    }
    if (containmentExcess(item, container) > tol) return false;
    for (const other of this.items) {
      if (other === item) continue;
      const res = testOverlap(item, other);
      if (res && res.overlap > tol) return false;
    }
    return true;
  }

  // Search neighbouring basins at a fixed container size. Different move scales
  // explore individual orientations and larger coordinated rearrangements. The
  // move itself depends on the space; judging it does not.
  basinHop(container) {
    // Each space saves exactly its own degrees of freedom, so a rollback
    // restores the incumbent without inventing coordinates it does not have.
    const before = this.items.map(container.type === 'sphere'
      ? ({ x, y, z, tx, ty, tz }) => ({ x, y, z, tx, ty, tz })
      : ({ x, y, theta }) => ({ x, y, theta }));
    const initialEnergy = this.measureViolation(container).energy;
    // Each space draws its own move, including the amplitude, so neither
    // disturbs the other's random sequence.
    const heat = Math.min(2, this.T);
    if (container.type === 'sphere') {
      hopOnSphere(this.items, this.rand, heat, container.R, MOVE_SCALES);
    } else {
      this.planarHop(heat);
    }
    return this.finishHop(container, before, initialEnergy);
  }

  // Displace a cluster of neighbours together, turning the group as it goes.
  // A group move is what turns one arrangement into a differently-shaped one;
  // jiggling pieces individually only rearranges the one already there.
  planarHop(heat) {
    const anchor = Math.floor(this.rand() * this.items.length);
    const center = this.items[anchor];
    const count = 1 + Math.floor(this.rand() * Math.max(1, this.items.length * 0.35));
    const neighbours = this.items.map((it, index) => ({
      index, distance: Math.hypot(it.x - center.x, it.y - center.y),
    })).sort((a, b) => a.distance - b.distance).slice(0, count);
    const radius = this.itemShape.radius;
    const amplitude = MOVE_SCALES[Math.floor(this.rand() * MOVE_SCALES.length)] * heat;
    const dx = (this.rand() - 0.5) * 2 * radius * amplitude;
    const dy = (this.rand() - 0.5) * 2 * radius * amplitude;
    const angle = (this.rand() - 0.5) * Math.PI * amplitude;
    const cx = center.x;
    const cy = center.y;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    for (const { index } of neighbours) {
      const item = this.items[index];
      const x = item.x - cx;
      const y = item.y - cy;
      item.x = cx + x * c - y * s + dx;
      item.y = cy + x * s + y * c + dy;
      if (item.shape.type !== 'circle') item.theta += angle;
    }
  }

  // Settle whatever the perturbation produced and decide whether to keep it. A
  // hop is accepted only after settling, never just because its raw jitter
  // happens to reduce an overlap -- unless `hopRelaxIterations` is 0, which
  // removes the settling step entirely. Failed hops restore the incumbent
  // exactly.
  finishHop(container, before, initialEnergy) {
    // Measured up front so a zero relaxation budget still yields a verdict
    // rather than reading `worst` off an undefined.
    let violation = this.measureViolation(container);
    let previous = Infinity;
    for (let i = 0; i < this.config.hopRelaxIterations; i++) {
      this.relax(container);
      violation = this.measureViolation(container);
      if (violation.worst < this.violationLimit) break;
      if (Math.abs(previous - violation.energy) < 1e-7) break;
      previous = violation.energy;
    }
    this.hops++;
    if (violation.worst < this.violationLimit || violation.energy < initialEnergy) {
      this.acceptedHops++;
      return true;
    }
    this.items.forEach((it, i) => Object.assign(it, before[i]));
    return false;
  }

  // One solver iteration. Returns false once every attempt is exhausted.
  step() {
    if (this.done) return false;
    const cfg = this.config;
    this.iteration++;
    this.totalIterations++;
    this.probeIteration++;

    const container = this.makeContainer(this.scale);
    this.relax(container);
    let violation = this.measureViolation(container);
    if (violation.worst >= this.violationLimit) {
      // Small improvements accumulate relative to the last meaningful progress.
      if (violation.energy < this.progressEnergy * (1 - cfg.plateauRelativeImprovement)) {
        this.progressEnergy = violation.energy;
        this.stuckCounter = 0;
      } else {
        this.stuckCounter++;
      }
      if (this.stuckCounter >= cfg.stuckLimit) {
        if (!this.rotationActive) {
          // Sliding found a jam. Restart the aligned search with rotation free,
          // instead of forcing it to escape the rigid grid it just created.
          // Preserve the global best and charge this work to the same attempt.
          this.stagedFinished = true;
          this.attemptBest = null;
          this.shrinkStep = cfg.initialStep;
          this.probeFailures = 0;
          this.startShrink();
          if (this.iteration >= cfg.iterationsPerAttempt) this.finishAttempt();
          return !this.done;
        }
        this.basinHop(container);
        this.stuckCounter = 0;
        violation = this.measureViolation(container);
        this.progressEnergy = violation.energy;
      }
    }
    // A last-iteration hop can succeed: check its result before spending the
    // probe/attempt budget or cooling for another iteration.
    if (violation.worst < this.violationLimit) {
      this.probeSucceeded();
    } else {
      this.T = Math.max(cfg.minTemperature, this.T * cfg.coolingRate);
      if (this.probeIteration >= cfg.probeIterations) this.probeFailed();
    }

    const budget = this.polishing ? cfg.polishIterations : cfg.iterationsPerAttempt;
    if (this.attemptConverged || this.iteration >= budget) {
      this.finishAttempt();
    }
    return !this.done;
  }

  probeSucceeded() {
    const cfg = this.config;
    this.attemptBest = { scale: this.scale, items: this.items.map((it) => ({ ...it })) };
    if (!this.attemptRecord || this.scale < this.attemptRecord.scale) this.attemptRecord = this.attemptBest;
    if (!this.best || this.scale < this.best.scale) {
      this.best = { ...this.attemptBest, container: this.makeContainer(this.scale) };
    }
    this.probeFailures = 0;
    if (this.scale <= this.scaleLowerBound) {
      // Perfect packing; nothing left to win.
      this.attemptConverged = true;
      return;
    }
    this.shrinkStep = Math.min(cfg.maxStep, this.shrinkStep * cfg.stepGrow);
    this.beginProbe(this.scale * (1 - this.shrinkStep));
  }

  probeFailed() {
    const cfg = this.config;
    if (!this.attemptBest) {
      // Nothing has ever packed. Open the container up rather than shrinking.
      this.beginProbe(this.scale * cfg.growFactor);
      return;
    }
    this.probeFailures++;
    this.shrinkStep *= cfg.stepShrink;
    if (this.shrinkStep < cfg.minStep) {
      this.attemptConverged = true;
      return;
    }
    this.beginProbe(this.attemptBest.scale * (1 - this.shrinkStep));
  }

  // `best` needs no update here: every successful probe already promoted itself
  // the moment it was found.
  finishAttempt() {
    const cfg = this.config;
    this.history.push({
      attempt: this.attemptIndex + 1,
      scale: this.attemptRecord?.scale ?? null,
      polish: this.polishing,
    });
    if (this.polishing) {
      this.done = true;
      return;
    }
    this.attemptIndex++;
    const spent = this.attemptIndex >= cfg.attempts;
    const perfect = this.best?.scale <= this.scaleLowerBound;
    if (spent || perfect) {
      if (this.best && !perfect && cfg.polishIterations > 0) this.startPolish();
      else this.done = true;
      return;
    }
    this.startAttempt();
  }

  // The global best usually comes from an attempt that ended several restarts
  // ago, and nothing has compressed it since -- each restart begins from its own
  // seed, not from the incumbent. One last fine-grained shrink from it costs a
  // fraction of an attempt and cannot lose ground, because the layout it starts
  // from is already recorded as the best.
  startPolish() {
    const cfg = this.config;
    this.polishing = true;
    this.iteration = 0;
    this.attemptConverged = false;
    this.stagedFinished = true;
    this.probeFailures = 0;
    this.shrinkStep = cfg.polishStep;
    this.attemptBest = {
      scale: this.best.scale,
      items: this.best.items.map((it) => ({ ...it })),
    };
    this.attemptRecord = this.attemptBest;
    this.beginProbe(this.best.scale * (1 - cfg.polishStep));
  }

  // What the view should draw right now.
  snapshot() {
    if (this.done && this.best) {
      return { container: this.best.container, items: this.best.items, final: true };
    }
    return { container: this.makeContainer(this.scale), items: this.items, final: false };
  }
}
