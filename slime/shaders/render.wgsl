@group(0) @binding(1) var<storage, read> trail: array<trail4>; // one channel per species, then food

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let uv = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  return vec4f(uv * 2.0 - 1.0, 0.0, 1.0);
}

// Species colors are added together, then tone mapped so dense areas glow
// toward white instead of clipping.
@fragment
fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let c = vec2u(pos.xy);
  let v = vec4f(trail[c.y * p.width + c.x]);
  var color = vec3f(v.w * 0.1); // food shows as a faint gray
  for (var s = 0u; s < NUM_SPECIES; s++) {
    color += p.species[s].color * v[s];
  }
  return vec4f(1.0 - exp(-color * p.brightness * 4.0), 1.0);
}
