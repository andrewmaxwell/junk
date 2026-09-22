// Shared by every shader; keep in sync with uniforms.js.
const NUM_SPECIES = 3u;

struct Species {
  color: vec3f, sensingDistance: f32,
  sensingRadius: i32, sensingAngle: f32, moveSpeed: f32, turnSpeed: f32,
  scattering: f32, strength: f32, maxStrength: f32, others: f32,
  fadeSpeed: f32, // padded to 64 bytes
}

struct Params {
  width: u32, height: u32, numAgents: u32, frame: u32,
  mouseX: f32, mouseY: f32, mouseDown: f32, brushRadius: f32,
  brushValue: f32, brightness: f32, _pad0: f32, _pad1: f32,
  species: array<Species, NUM_SPECIES>,
}
@group(0) @binding(0) var<uniform> p: Params;
