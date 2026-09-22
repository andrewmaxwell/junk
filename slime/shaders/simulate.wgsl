@group(0) @binding(1) var<storage, read_write> agents: array<vec4f>; // x, y, angle, species
// One channel per species; w is unused.
@group(0) @binding(2) var<storage, read> trailIn: array<vec4f>;
@group(0) @binding(3) var<storage, read_write> trailOut: array<vec4f>;
// NUM_SPECIES fixed point channels per cell.
@group(0) @binding(4) var<storage, read_write> deposit: array<atomic<u32>>;

const TAU = 6.2831853;
const DEPOSIT_SCALE = 65536.0;

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

// weights: 1 for the agent's own species, sp.others for the rest.
fn sense(pos: vec2f, angle: f32, sp: Species, weights: vec4f) -> f32 {
  let c = vec2i(floor(pos + sp.sensingDistance * vec2f(cos(angle), sin(angle))));
  let r = sp.sensingRadius;
  var total = 0.0;
  var n = 0.0;
  for (var y = -r; y <= r; y++) {
    for (var x = -r; x <= r; x++) {
      if (x * x + y * y > r * r) { continue; }
      total += dot(trailIn[idx(c.x + x, c.y + y)], weights);
      n += 1.0;
    }
  }
  let amt = total / n;
  return select(amt, -amt, amt > sp.maxStrength);
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

@compute @workgroup_size(256)
fn updateAgents(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= p.numAgents) { return; }
  var pos = agents[i].xy;
  var angle = agents[i].z;
  let species = u32(agents[i].w);
  let sp = p.species[species];
  var weights = vec4f(vec3f(sp.others), 0.0);
  weights[species] = 1.0;

  let forward = sense(pos, angle, sp, weights);
  let left = sense(pos, angle - sp.sensingAngle, sp, weights);
  let right = sense(pos, angle + sp.sensingAngle, sp, weights);
  let m = max(forward, max(left, right));
  if (left == m) { angle -= sp.turnSpeed; }
  if (right == m) { angle += sp.turnSpeed; }
  angle += (rand(pcg(i) ^ p.frame) - 0.5) * sp.scattering;
  angle -= TAU * floor(angle / TAU); // keep small so f32 cos/sin stay precise

  let size = vec2f(f32(p.width), f32(p.height));
  pos += sp.moveSpeed * vec2f(cos(angle), sin(angle));
  pos -= size * floor(pos / size);
  agents[i] = vec4f(pos, angle, agents[i].w);

  let cell = min(vec2u(pos), vec2u(p.width - 1u, p.height - 1u));
  let k = (cell.y * p.width + cell.x) * NUM_SPECIES + species;
  atomicAdd(&deposit[k], u32(sp.strength * DEPOSIT_SCALE));
}

// Trail after this step's deposits; only channels that were deposited to are capped at 1.
fn cellValue(x: i32, y: i32) -> vec4f {
  let k = idx(x, y);
  let d = vec3f(
    f32(atomicLoad(&deposit[k * NUM_SPECIES])),
    f32(atomicLoad(&deposit[k * NUM_SPECIES + 1u])),
    f32(atomicLoad(&deposit[k * NUM_SPECIES + 2u])),
  ) / DEPOSIT_SCALE;
  let t = trailIn[k].xyz;
  return vec4f(select(t, min(t + d, vec3f(1.0)), d > vec3f(0.0)), 0.0);
}

@compute @workgroup_size(16, 16)
fn diffuse(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= p.width || id.y >= p.height) { return; }
  let x = i32(id.x);
  let y = i32(id.y);
  let sum = cellValue(x, y) + cellValue(x + 1, y) + cellValue(x - 1, y) +
    cellValue(x, y + 1) + cellValue(x, y - 1);
  let fade = vec4f(p.species[0].fadeSpeed, p.species[1].fadeSpeed, p.species[2].fadeSpeed, 0.0);
  var v = sum / 5.0 * (1.0 - fade);
  if (p.mouseDown > 0.5 &&
      distance(vec2f(id.xy) + 0.5, vec2f(p.mouseX, p.mouseY)) < p.brushRadius) {
    v = vec4f(vec3f(p.brushValue), 0.0);
  }
  trailOut[id.y * p.width + id.x] = v;
}
