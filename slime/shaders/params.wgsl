// Shared by every shader; keep in sync with uniforms.js.
const NUM_SPECIES = 3u;

struct Species {
  color: vec3f, sensingDistance: f32,
  sensingRadius: i32, sensingAngle: f32, moveSpeed: f32, turnSpeed: f32,
  scattering: f32, strength: f32, maxStrength: f32, fadeSpeed: f32,
  follow: vec3f, // how much this species follows each species' trail (padded to 64 bytes)
}

struct Params {
  width: u32, height: u32, numAgents: u32, frame: u32,
  mouseX: f32, mouseY: f32, brushMode: u32, brushRadius: f32, // brushMode: see BRUSH_*
  foodAttraction: f32, brightness: f32, lastMouseX: f32, lastMouseY: f32,
  glow: f32, hue: f32, agentDots: f32, eatSpeed: f32,
  species: array<Species, NUM_SPECIES>,
}
@group(0) @binding(0) var<uniform> p: Params;

const BRUSH_OFF = 0u;
const BRUSH_FOOD = 1u;
const BRUSH_WALL = 2u;
const BRUSH_ERASE = 3u;
