// Counting sort of agents by 16x16 screen tile, so threads that run together read
// nearby trail memory. Agents drift apart as they move, so this reruns periodically.
@group(0) @binding(1) var<storage, read> agents: array<vec4f>;
@group(0) @binding(2) var<storage, read_write> sorted: array<vec4f>;
@group(0) @binding(3) var<storage, read_write> tiles: array<atomic<u32>>;

const TILE = 16u;
fn tilesX() -> u32 { return (p.width + TILE - 1u) / TILE; }
fn numTiles() -> u32 { return tilesX() * ((p.height + TILE - 1u) / TILE); }
fn tileOf(pos: vec2f) -> u32 {
  let c = min(vec2u(pos), vec2u(p.width - 1u, p.height - 1u)) / TILE;
  return c.y * tilesX() + c.x;
}

@compute @workgroup_size(256)
fn countTiles(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= p.numAgents) { return; }
  atomicAdd(&tiles[tileOf(agents[id.x].xy)], 1u);
}

// Exclusive prefix sum of the tile counts, in place, by a single workgroup.
var<workgroup> partial: array<u32, 256>;
@compute @workgroup_size(256)
fn scanTiles(@builtin(local_invocation_index) t: u32) {
  let n = numTiles();
  let chunk = (n + 255u) / 256u;
  let start = t * chunk;
  let end = min(start + chunk, n);
  var sum = 0u;
  for (var k = start; k < end; k++) { sum += atomicLoad(&tiles[k]); }
  partial[t] = sum;
  workgroupBarrier();
  if (t == 0u) {
    var acc = 0u;
    for (var k = 0u; k < 256u; k++) {
      let v = partial[k];
      partial[k] = acc;
      acc += v;
    }
  }
  workgroupBarrier();
  var acc = partial[t];
  for (var k = start; k < end; k++) {
    let v = atomicLoad(&tiles[k]);
    atomicStore(&tiles[k], acc);
    acc += v;
  }
}

@compute @workgroup_size(256)
fn scatter(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= p.numAgents) { return; }
  let a = agents[id.x];
  sorted[atomicAdd(&tiles[tileOf(a.xy)], 1u)] = a;
}
