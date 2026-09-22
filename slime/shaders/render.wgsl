// Draws the scene in linear color, before tone mapping (see post.wgsl).
@group(0) @binding(1) var<storage, read> trail: array<trail4>; // one channel per species, then food/wall
@group(0) @binding(2) var<storage, read> agents: array<vec4f>; // x, y, angle, species

@vertex
fn fullscreen(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let uv = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  return vec4f(uv * 2.0 - 1.0, 0.0, 1.0);
}

// Species colors added together, plus food in faint gold and walls in gray.
@fragment
fn trailColor(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let c = vec2u(pos.xy);
  let v = vec4f(trail[c.y * p.width + c.x]);
  var color = max(v.w, 0.0) * vec3f(0.3, 0.22, 0.05) + max(-v.w, 0.0) * vec3f(0.15);
  for (var s = 0u; s < NUM_SPECIES; s++) {
    color += p.species[s].color * v[s];
  }
  return vec4f(color, 1.0);
}

struct Dot {
  @builtin(position) pos: vec4f,
  @location(0) color: vec3f,
}

const AGENT_DOTS = 0.25; // brightness of each agent's point

// One point per agent, added faintly on top of the trails.
@vertex
fn agentDot(@builtin(vertex_index) i: u32) -> Dot {
  let a = agents[i];
  let size = vec2f(f32(p.width), f32(p.height));
  let clip = (a.xy + 0.5) / size * vec2f(2.0, -2.0) + vec2f(-1.0, 1.0);
  return Dot(vec4f(clip, 0.0, 1.0), p.species[u32(a.w)].color * AGENT_DOTS);
}

@fragment
fn dotColor(dot: Dot) -> @location(0) vec4f {
  return vec4f(dot.color, 1.0);
}
