// GLSL patched into three.js's standard material, so the terrain, sea, lakes and rivers keep its
// lighting, shadows, reflections and fog but get their shape and color from the simulation on
// the GPU. The worker sends two textures per frame: fields (height, rain, log10 flow, ambient
// occlusion) and smooth normals, both one texel per grid point.

const common = /* glsl */ `
uniform sampler2D fieldsTex;
uniform sampler2D normalTex;
uniform sampler2D riverTex;
uniform float riverN;
uniform float gridN;
uniform float cellSize;
uniform float seaLevel;
uniform float temperature;
uniform float time;

vec2 toGrid(vec2 w) { return w / cellSize + (gridN - 1.0) * 0.5; }
bool onGrid(vec2 g) { return g.x >= 0.0 && g.y >= 0.0 && g.x <= gridN - 1.0 && g.y <= gridN - 1.0; }
vec4 fieldsAt(vec2 g) { return texture2D(fieldsTex, (g + 0.5) / gridN); }
vec3 baseNormalAt(vec2 g) { return normalize(texture2D(normalTex, (g + 0.5) / gridN).xyz); }

float texelHeight(ivec2 p) {
  return texelFetch(fieldsTex, clamp(p, ivec2(0), ivec2(int(gridN) - 1)), 0).r;
}
float catmullRom(float a, float b, float c, float d, float t) {
  return b + 0.5 * t * (c - a + t * (2.0 * a - 5.0 * b + 4.0 * c - d + t * (3.0 * (b - c) + d - a)));
}
// the simulated ground, smoothly interpolated between grid points
float baseHeight(vec2 g) {
  vec2 f = floor(g);
  vec2 t = g - f;
  ivec2 i = ivec2(f);
  float row[4];
  for (int y = 0; y < 4; y++) {
    row[y] = catmullRom(
      texelHeight(i + ivec2(-1, y - 1)), texelHeight(i + ivec2(0, y - 1)),
      texelHeight(i + ivec2(1, y - 1)), texelHeight(i + ivec2(2, y - 1)), t.x);
  }
  return catmullRom(row[0], row[1], row[2], row[3], t.y);
}

vec2 hash2(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy) * 2.0 - 1.0;
}
// gradient noise, roughly -0.5..0.5
float gnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(dot(hash2(i), f), dot(hash2(i + vec2(1, 0)), f - vec2(1, 0)), u.x),
    mix(dot(hash2(i + vec2(0, 1)), f - vec2(0, 1)), dot(hash2(i + 1.0), f - 1.0), u.x), u.y);
}
float fbm(vec2 p, float octaves) {
  float sum = 0.0;
  float amp = 0.5;
  for (int k = 0; k < 7; k++) {
    float weight = clamp(octaves - float(k), 0.0, 1.0); // fade the last octave in smoothly
    if (weight <= 0.0) break;
    sum += amp * weight * gnoise(p);
    p = mat2(1.6, 1.2, -1.2, 1.6) * p;
    amp *= 0.5;
  }
  return sum;
}

// distance to the nearest river (m), its half width (m), and how much of here is lake
vec3 riverAt(vec2 g) {
  // a little wander, so channels meander instead of running in straight stretches
  g += vec2(gnoise(g * 0.9), gnoise(g * 0.9 + 17.3)) * 0.3;
  vec4 r = texture2D(riverTex, (g * (riverN - 1.0) / (gridN - 1.0) + 0.5) / riverN);
  return vec3(r.r * 63.0, max(r.g * 31.5, 1.0), r.b);
}

// Meters of fine relief on top of the simulated ground: most on steep slopes, little on valley
// floors where rivers run, and on beaches.
float detailAmp(vec2 g, float h) {
  vec3 n = baseNormalAt(g);
  float steep = length(n.xz) / max(n.y, 0.05);
  float amp = mix(2.0, 16.0, smoothstep(0.15, 1.0, steep));
  // flat valley floors along rivers, and smooth lake beds
  vec3 river = riverAt(g);
  amp *= mix(0.08, 1.0, smoothstep(river.y + 2.0, 3.0 * river.y + 30.0, river.x));
  amp *= 1.0 - 0.9 * river.z;
  amp *= mix(0.25, 1.0, smoothstep(2.0, 20.0, abs(h - seaLevel)));
  return amp;
}
// ridged on top, so rock breaks into crests and gullies rather than blobs
float detailHeight(vec2 w, float amp, float octaves) {
  float n = fbm(w / 110.0, octaves);
  float ridged = 0.25 - abs(fbm(w / 70.0 + 5.2, octaves - 1.0));
  return amp * (n + 0.6 * ridged);
}
// a channel cut along each river, deeper for bigger ones, with sloping banks
float channelDepth(vec2 g) {
  vec3 river = riverAt(g);
  return (0.8 + 0.5 * river.y) * (1.0 - smoothstep(0.6 * river.y, 2.0 * river.y + 2.0, river.x));
}
float groundHeight(vec2 g, vec2 w) {
  float h = baseHeight(g);
  return h + detailHeight(w, detailAmp(g, h), 6.0) - channelDepth(g);
}
vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }
`;

const terrainVertex = /* glsl */ `
vec3 transformed = vec3(position);
vec2 grid = toGrid(position.xz);
transformed.y = groundHeight(grid, position.xz);
vWorld = transformed;
`;

// Color, roughness and small-scale bumps for every kind of ground, from the same climate as the
// simulation: temperature from height, aridity from rain over potential evaporation.
const terrainSurface = /* glsl */ `
void terrainSurface(vec3 w, vec3 n, vec4 f, vec3 river, float fade,
    out vec3 color, out float rough, out float bumpHeight, out float bumpScale) {
  float above = w.y - seaLevel;
  float t = temperature - 0.0065 * max(above, 0.0);
  float pet = max(0.0, 0.065 * t);
  float aridity = pet > 0.0 ? f.g / pet : 10.0;
  float cover = smoothstep(0.15, 0.85, aridity) * smoothstep(-3.0, 6.0, t);
  float steep = length(n.xz) / max(n.y, 0.05);
  float broad = fbm(w.xz / 260.0, 3.0);
  float clumps = fbm(w.xz / 30.0, 3.0 * fade);
  float fine = gnoise(w.xz / 5.0) * fade;

  // trees thin out with dryness and cold, in clumps
  // a strip of thicker growth along rivers, wider for bigger ones
  float bankside = 1.0 - smoothstep(river.y + 3.0, 4.0 * river.y + 25.0, river.x);
  float trees = smoothstep(0.4, 1.2, aridity + 0.45 * clumps + 0.2 * broad + 0.6 * bankside) * smoothstep(1.0, 7.0, t);
  vec3 forest = mix(lin(vec3(0.11, 0.2, 0.12)), lin(vec3(0.19, 0.31, 0.12)), smoothstep(4.0, 10.0, t));
  forest = mix(forest, lin(vec3(0.1, 0.27, 0.08)), smoothstep(15.0, 21.0, t));
  forest *= 0.6 + 0.8 * smoothstep(-0.35, 0.45, clumps); // sunlit crowns and dark gaps
  vec3 grass = mix(lin(vec3(0.6, 0.55, 0.3)), lin(vec3(0.35, 0.45, 0.17)), smoothstep(0.45, 0.9, aridity + 0.2 * broad));
  vec3 soil = mix(lin(vec3(0.82, 0.68, 0.47)), lin(vec3(0.68, 0.45, 0.3)), smoothstep(-0.2, 0.35, broad));
  color = mix(soil, grass, smoothstep(0.05, 0.55, cover + 0.25 * broad + 0.15 * clumps));
  color = mix(color, forest, trees);
  color = mix(color, lin(vec3(0.2, 0.33, 0.12)), bankside * (1.0 - trees) * 0.6);
  // gravel and sand bars just outside the water
  float bar = (1.0 - smoothstep(1.2 * river.y + 1.0, 1.8 * river.y + 4.0, river.x)) * smoothstep(0.1, 0.3, clumps) * smoothstep(1.5, 4.0, river.y);
  color = mix(color, mix(lin(vec3(0.45, 0.43, 0.38)), lin(vec3(0.6, 0.55, 0.45)), smoothstep(-0.2, 0.3, fine)), bar);
  // tundra, then snow on gentler slopes where it's cold
  vec3 tundra = mix(lin(vec3(0.36, 0.38, 0.26)), lin(vec3(0.58, 0.54, 0.44)), smoothstep(-0.3, 0.35, clumps + 0.5 * broad));
  color = mix(color, tundra, smoothstep(4.0, 1.0, t + 1.5 * broad));
  bumpHeight = mix(0.4, 3.5, trees);
  bumpScale = mix(4.0, 9.0, trees);

  // bare rock on steep slopes, in layers
  float rock = smoothstep(0.9, 1.4, steep + 0.4 * clumps) * (1.0 - bar);
  // faint layering that wanders, rather than contour lines
  float strata = fbm(vec2(w.y / 14.0 + 3.0 * broad + 1.5 * clumps, 0.37), 3.0);
  vec3 rockColor = mix(lin(vec3(0.4, 0.37, 0.33)), lin(vec3(0.5, 0.46, 0.4)), smoothstep(-0.3, 0.3, strata));
  rockColor = mix(rockColor, lin(vec3(0.2, 0.2, 0.2)), 0.5 * smoothstep(0.1, 0.5, clumps));
  color = mix(color, rockColor, rock);
  bumpHeight = mix(bumpHeight, 1.5, rock);
  bumpScale = mix(bumpScale, 5.0, rock);
  bumpHeight *= 1.0 - bar;
  rough = 0.95;
  // lake beds are mud
  color = mix(color, lin(vec3(0.33, 0.3, 0.24)), smoothstep(0.3, 0.8, river.z));

  // beaches, wet sand at the waterline, and the sea floor
  float beach = smoothstep(3.5 + 2.5 * broad, 1.0, above) * smoothstep(0.5, 0.25, steep);
  color = mix(color, lin(vec3(0.9, 0.82, 0.64)), beach);
  float wet = smoothstep(0.8, 0.2, above);
  color = mix(color, lin(vec3(0.62, 0.56, 0.44)), wet * beach);
  rough = mix(rough, 0.45, wet * beach);
  if (above < 0.0) {
    vec3 floorColor = mix(lin(vec3(0.7, 0.66, 0.52)), lin(vec3(0.22, 0.3, 0.16)), smoothstep(0.0, 0.45, clumps) * smoothstep(1.0, 6.0, -above));
    floorColor = mix(floorColor, lin(vec3(0.35, 0.36, 0.33)), smoothstep(30.0, 150.0, -above));
    color = mix(color, floorColor, smoothstep(0.0, -1.0, above));
    bumpHeight = mix(bumpHeight, 0.3, smoothstep(0.0, -1.0, above));
  }

  float snow = smoothstep(-1.0, -3.0, t + 2.0 * broad) * smoothstep(0.5, 0.75, n.y);
  color = mix(color, lin(vec3(0.94, 0.96, 1.0)), snow);
  rough = mix(rough, 0.7, snow);
  bumpHeight *= 1.0 - snow * 0.8;
  color *= 0.88 + 0.24 * fine;
}
`;

const terrainFragment = /* glsl */ `
vec2 grid = toGrid(vWorld.xz);
vec4 fields = fieldsAt(grid);
vec3 river = riverAt(grid);
float viewDist = length(vViewPosition);
// how much fine detail this pixel can show without shimmering
float footprint = max(length(fwidth(vWorld.xz)), 0.5);
float fade = 1.0 - smoothstep(4.0, 30.0, footprint);
float octaves = clamp(7.0 - log2(footprint / 1.5), 2.0, 6.0);

// slope of the simulated ground plus the same fine relief the vertices got
vec3 nb = baseNormalAt(grid);
vec2 slope = -nb.xz / nb.y;
float amp = detailAmp(grid, vWorld.y);
float e = max(1.5, footprint);
float d0 = detailHeight(vWorld.xz, amp, octaves);
slope += vec2(detailHeight(vWorld.xz + vec2(e, 0.0), amp, octaves) - d0,
              detailHeight(vWorld.xz + vec2(0.0, e), amp, octaves) - d0) / e;
float c0 = channelDepth(grid);
slope -= vec2(channelDepth(grid + vec2(e / cellSize, 0.0)) - c0,
              channelDepth(grid + vec2(0.0, e / cellSize)) - c0) / e;
vec3 shapeNormal = normalize(vec3(-slope.x, 1.0, -slope.y));

vec3 surfaceColor;
float surfaceRough;
float bumpHeight;
float bumpScale;
terrainSurface(vWorld, shapeNormal, fields, river, fade, surfaceColor, surfaceRough, bumpHeight, bumpScale);

// the river itself, never thinner than about half a pixel so it doesn't break up far away
float waterEdge = max(river.y, 0.5 * footprint);
float inWater = (1.0 - smoothstep(waterEdge - 0.5 * footprint, waterEdge + 0.5 * footprint, river.x)) * (1.0 - river.z);
if (inWater > 0.0) {
  float middle = 1.0 - smoothstep(0.0, waterEdge, river.x);
  vec3 riverColor = mix(lin(vec3(0.24, 0.32, 0.28)), lin(vec3(0.07, 0.2, 0.22)), middle);
  surfaceColor = mix(surfaceColor, riverColor, inWater);
  surfaceRough = mix(surfaceRough, 0.08, inWater);
  bumpHeight *= 1.0 - inWater;
  // water lies flat across, with ripples running on it
  vec2 q = vWorld.xz / 4.0;
  vec2 ripple = vec2(gnoise(q + time * 0.8), gnoise(q.yx - time * 0.7)) * 0.12 * fade;
  slope = mix(slope, ripple, inWater);
}

// tree crowns, tussocks and rubble, too small for the mesh
if (fade > 0.0) {
  float b0 = fbm(vWorld.xz / bumpScale, 3.0 * fade);
  float eb = bumpScale * 0.25;
  slope += bumpHeight * fade * vec2(fbm((vWorld.xz + vec2(eb, 0.0)) / bumpScale, 3.0 * fade) - b0,
                                    fbm((vWorld.xz + vec2(0.0, eb)) / bumpScale, 3.0 * fade) - b0) / eb;
}
vec3 worldNormal = normalize(vec3(-slope.x, 1.0, -slope.y));
normal = normalize((viewMatrix * vec4(worldNormal, 0.0)).xyz);
diffuseColor.rgb = surfaceColor;
roughnessFactor = surfaceRough;
float terrainAO = fields.a;
`;

const terrainAO = /* glsl */ `
reflectedLight.indirectDiffuse *= terrainAO;
reflectedLight.indirectSpecular *= terrainAO;
reflectedLight.directDiffuse *= mix(1.0, terrainAO, 0.35);
`;

/**
 * Turn a MeshStandardMaterial into the terrain.
 * @param {import('three').MeshStandardMaterial} material
 * @param {object} uniforms
 */
export function terrainMaterial(material, uniforms) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>\n${common}\nvarying vec3 vWorld;`,
      )
      .replace('#include <begin_vertex>', terrainVertex);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\n${common}\n${terrainSurface}\nvarying vec3 vWorld;`,
      )
      .replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>\n${terrainFragment}`,
      )
      .replace('#include <aomap_fragment>', terrainAO);
  };
  return material;
}

/**
 * The terrain's shape for shadow maps.
 * @param {import('three').MeshDepthMaterial} material
 * @param {object} uniforms
 */
export function terrainDepthMaterial(material, uniforms) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>\n${common}\nvarying vec3 vWorld;`,
      )
      .replace('#include <begin_vertex>', terrainVertex);
  };
  return material;
}

// Water, for the sea and lakes alike: clear over sand in the shallows, deep blue offshore,
// rippled by drifting waves, with foam where it laps the shore.
const waterFragment = /* glsl */ `
vec2 grid = toGrid(vWater.xz);
float ground = onGrid(grid) ? baseHeight(grid) : -1200.0;
float depth = max(vWater.y - ground, 0.0);
float viewDist = length(vViewPosition);

vec2 p = vWater.xz;
float calm = 1.0 - smoothstep(3000.0, 25000.0, viewDist);
float e = max(2.0, length(fwidth(p)));
// the smallest ripples drop out where a pixel covers several of them, or they glitter
float ripples = 1.0 - smoothstep(2.0, 6.0, e);
#define WAVES(q) (0.9 * gnoise(q / 60.0 + time * vec2(0.03, 0.02)) + 0.45 * gnoise(q / 21.0 - time * vec2(0.05, -0.04)) + 0.2 * ripples * gnoise(q / 7.0 + time * 0.09))
float w0 = WAVES(p);
vec2 waveSlope = vec2(WAVES(p + vec2(e, 0.0)) - w0, WAVES(p + vec2(0.0, e)) - w0) / e * 1.6 * calm;
vec3 waterNormal = normalize(vec3(-waveSlope.x, 1.0, -waveSlope.y));
normal = normalize((viewMatrix * vec4(waterNormal, 0.0)).xyz);

vec3 water = mix(lin(vec3(0.16, 0.6, 0.64)), lin(vec3(0.03, 0.33, 0.46)), smoothstep(0.0, 10.0, depth));
water = mix(water, lin(vec3(0.01, 0.07, 0.15)), smoothstep(8.0, 90.0, depth));
float alpha = mix(0.55, 0.97, smoothstep(0.0, 30.0, depth));
float swash = gnoise(p / 8.0 + vec2(time * 0.25, -time * 0.18)) + 0.5 * gnoise(p / 3.0 - time * 0.3);
float foam = SURF * smoothstep(2.5, 0.3, depth) * smoothstep(-0.1, 0.45, swash + 0.5 * sin(depth * 3.5 - time * 1.4)) * calm;
water = mix(water, vec3(0.9), foam);
alpha = max(alpha, foam * 0.95);
diffuseColor = vec4(water, alpha);
roughnessFactor = mix(0.04, 0.7, foam);
`;

/**
 * @param {import('three').MeshStandardMaterial} material
 * @param {object} uniforms
 * @param {{surf: boolean}} options waves break on the sea's shores, not on lakes
 */
export function waterMaterial(material, uniforms, {surf}) {
  material.defines = {SURF: surf ? '1.0' : '0.0'};
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWater;`)
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>\nvWater = (modelMatrix * vec4(position, 1.0)).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\n${common}\nvarying vec3 vWater;`,
      )
      .replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>\n${waterFragment}`,
      );
  };
  return material;
}
