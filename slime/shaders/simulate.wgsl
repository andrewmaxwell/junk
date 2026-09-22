@group(0) @binding(1) var<storage, read_write> agents: array<vec4f>; // x, y, angle, species
// One channel per species; w is food (> 0) or wall (< 0), painted with the brush.
@group(0) @binding(2) var<storage, read> trailIn: array<trail4>;
@group(0) @binding(3) var<storage, read_write> trailOut: array<trail4>;
// How many agents of each species landed in each cell this step, packed into
// 10/11/11 bits so one atomic (and 4 bytes to clear) covers all species.
@group(0) @binding(4) var<storage, read_write> deposit: array<atomic<u32>>;
// What was painted (food 1, wall -1), so reset can restore food that's been eaten.
@group(0) @binding(5) var<storage, read_write> drawing: array<f32>;

const TAU = 6.2831853;
const WALL_AVOIDANCE = 2.0;
const DEPOSIT_SHIFT = vec3u(0u, 10u, 21u);
const DEPOSIT_MASK = vec3u(0x3ffu, 0x7ffu, 0x7ffu);

fn pcg(v: u32) -> u32 {
  let s = v * 747796405u + 2891336453u;
  let w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}
fn rand(seed: u32) -> f32 { return f32(pcg(seed)) / 4294967295.0; }

// Coordinates are never more than one grid size out of range, so no modulo needed.
fn wrap(v: i32, n: i32) -> i32 {
  return select(select(v, v - n, v >= n), v + n, v < 0);
}
fn idx(x: i32, y: i32) -> u32 {
  let w = i32(p.width);
  return u32(wrap(y, i32(p.height)) * w + wrap(x, w));
}

fn sense(pos: vec2f, angle: f32, sp: Species) -> f32 {
  let c = vec2i(floor(pos + sp.sensingDistance * vec2f(cos(angle), sin(angle))));
  let r = sp.sensingRadius;
  let w = i32(p.width);
  // Sum the disc row by row; rows fully on screen skip the per-cell wrapping.
  var total = vec4f(0.0);
  var walls = 0.0; // negative
  var n = 0;
  for (var y = -r; y <= r; y++) {
    let span = i32(sqrt(f32(r * r - y * y)));
    let row = wrap(c.y + y, i32(p.height)) * w;
    if (c.x - span >= 0 && c.x + span < w) {
      for (var x = c.x - span; x <= c.x + span; x++) {
        let t = vec4f(trailIn[u32(row + x)]);
        total += t;
        walls += min(t.w, 0.0);
      }
    } else {
      for (var x = c.x - span; x <= c.x + span; x++) {
        let t = vec4f(trailIn[u32(row + wrap(x, w))]);
        total += t;
        walls += min(t.w, 0.0);
      }
    }
    n += 2 * span + 1;
  }
  total /= f32(n);
  walls /= f32(n);
  let food = total.w - walls;
  // Too much trail repels (so paths don't all collapse together), food never does.
  let amt = dot(total.xyz, sp.follow);
  return select(amt, -amt, amt > sp.maxStrength) + food * p.foodAttraction +
    walls * WALL_AVOIDANCE;
}

// Spawns agents in a disc in the middle, facing outward, one pie slice per species.
@compute @workgroup_size(256)
fn initAgents(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= p.numAgents) { return; }
  let seed = pcg(i ^ pcg(p.frame));
  let size = vec2f(f32(p.width), f32(p.height));
  // Angle follows index order so neighboring threads start near each other,
  // which keeps their trail reads cache-friendly.
  let angle = (f32(i) + rand(seed)) / f32(p.numAgents) * TAU;
  let r = min(size.x, size.y) * 0.1 * sqrt(rand(seed + 1u));
  let species = min(u32(angle / TAU * f32(NUM_SPECIES)), NUM_SPECIES - 1u);
  agents[i] = vec4f(size * 0.5 + r * vec2f(cos(angle), sin(angle)), angle, f32(species));
}

fn isWall(pos: vec2f) -> bool {
  let c = min(vec2u(pos), vec2u(p.width - 1u, p.height - 1u));
  return f32(trailIn[c.y * p.width + c.x].w) < 0.0;
}

@compute @workgroup_size(256)
fn updateAgents(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= p.numAgents) { return; }
  var pos = agents[i].xy;
  var angle = agents[i].z;
  let species = u32(agents[i].w);
  let sp = p.species[species];

  let forward = sense(pos, angle, sp);
  let left = sense(pos, angle - sp.sensingAngle, sp);
  let right = sense(pos, angle + sp.sensingAngle, sp);
  let m = max(forward, max(left, right));
  if (left == m) { angle -= sp.turnSpeed; }
  if (right == m) { angle += sp.turnSpeed; }
  let r = pcg(pcg(i) ^ p.frame);
  angle += (rand(r) - 0.5) * sp.scattering;

  let size = vec2f(f32(p.width), f32(p.height));
  var next = pos + sp.moveSpeed * vec2f(cos(angle), sin(angle));
  next -= size * floor(next / size);
  // Bounce off walls: turn around, give or take a radian so agents don't
  // retrace their path. Agents already inside a wall (painted over them) walk out.
  if (isWall(next) && !isWall(pos)) {
    angle += TAU * 0.5 + (rand(r + 1u) - 0.5) * 2.0;
  } else {
    pos = next;
  }
  angle -= TAU * floor(angle / TAU); // keep small so f32 cos/sin stay precise
  agents[i] = vec4f(pos, angle, agents[i].w);

  let cell = min(vec2u(pos), vec2u(p.width - 1u, p.height - 1u));
  let shifts = DEPOSIT_SHIFT;
  atomicAdd(&deposit[cell.y * p.width + cell.x], 1u << shifts[species]);
}

// Trail plus this step's deposits; only channels that were deposited to are
// capped at 1. Agents also eat any food they're on.
fn withDeposits(k: u32) -> vec4f {
  let t = vec4f(trailIn[k]);
  let counts = vec3f((vec3u(atomicLoad(&deposit[k])) >> DEPOSIT_SHIFT) & DEPOSIT_MASK);
  let strength = vec3f(p.species[0].strength, p.species[1].strength, p.species[2].strength);
  let added = min(t.xyz + counts * strength, vec3f(1.0));
  var food = t.w;
  let eaters = counts.x + counts.y + counts.z;
  if (food > 0.0 && eaters > 0.0) {
    // f16 can't represent tiny decrements near 1, so food goes in 1/1024 bites,
    // with a random chance per step that gives the right average rate.
    let bites = p.eatSpeed * eaters * 1024.0;
    let extra = select(0.0, 1.0, rand(pcg(k) ^ p.frame) < fract(bites));
    food = max(0.0, food - (floor(bites) + extra) / 1024.0);
  }
  return vec4f(select(t.xyz, added, counts > vec3f(0.0)), food);
}

// Distance to the brush stroke since the last pointer event, so fast strokes don't leave gaps.
fn strokeDistance(pos: vec2f) -> f32 {
  let a = vec2f(p.lastMouseX, p.lastMouseY);
  let ab = vec2f(p.mouseX, p.mouseY) - a;
  let t = clamp(dot(pos - a, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
  return distance(pos, a + t * ab);
}

// Each workgroup loads its 16x16 cells plus a 1-cell border into shared memory
// once, so the blur doesn't read every cell (and its deposits) five times.
const TILE = 16u;
const APRON = TILE + 2u;
var<workgroup> tile: array<vec4f, APRON * APRON>;

@compute @workgroup_size(TILE, TILE)
fn diffuse(
  @builtin(workgroup_id) group: vec3u,
  @builtin(local_invocation_id) local: vec3u,
  @builtin(local_invocation_index) li: u32,
) {
  let origin = vec2i(group.xy * TILE) - 1;
  for (var t = li; t < APRON * APRON; t += TILE * TILE) {
    tile[t] = withDeposits(idx(origin.x + i32(t % APRON), origin.y + i32(t / APRON)));
  }
  workgroupBarrier();

  let cell = group.xy * TILE + local.xy;
  if (cell.x >= p.width || cell.y >= p.height) { return; }
  let t = (local.y + 1u) * APRON + local.x + 1u;
  let center = tile[t];
  let sum = center + tile[t - 1u] + tile[t + 1u] + tile[t - APRON] + tile[t + APRON];
  let fade = vec4f(p.species[0].fadeSpeed, p.species[1].fadeSpeed, p.species[2].fadeSpeed, 0.0);
  var v = sum / 5.0 * (1.0 - fade);
  // Food and walls don't spread or fade, and walls hold no trail.
  v.w = center.w;
  if (v.w < 0.0) { v = vec4f(0.0, 0.0, 0.0, v.w); }
  let k = cell.y * p.width + cell.x;
  if (p.brushMode != BRUSH_OFF && strokeDistance(vec2f(cell) + 0.5) < p.brushRadius) {
    var paint = 0.0;
    if (p.brushMode == BRUSH_FOOD) { paint = 1.0; }
    if (p.brushMode == BRUSH_WALL) { paint = -1.0; }
    v.w = paint;
    drawing[k] = paint;
  }
  trailOut[k] = trail4(v);
}

// Restart: clear the trails and restore the drawing, including eaten food.
@compute @workgroup_size(256)
fn restoreDrawing(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= p.width * p.height) { return; }
  trailOut[id.x] = trail4(vec4f(0.0, 0.0, 0.0, drawing[id.x]));
}

// After the drawing is cleared: keep the trails, remove food and walls.
@compute @workgroup_size(256)
fn clearFood(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= p.width * p.height) { return; }
  trailOut[id.x] = trail4(vec4f(vec4f(trailIn[id.x]).xyz, 0.0));
}
