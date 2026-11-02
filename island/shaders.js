// GLSL patched into three.js's standard material, so the terrain, sea, lakes and rivers keep its
// lighting, shadows, reflections and fog but get their shape and color from the simulation on
// the GPU. The worker sends three textures per frame: fields (height, rain, log10 flow, ambient
// occlusion), smooth normals with how fast coral grows in w, and the ground (dikes, sediment
// depth and where the lava layers lie), all one texel per grid point.
import * as THREE from 'three';
import {cloudCommon} from './clouds.js';
import {LAYER_THICKNESS, LAVA_FRESH_YEARS, LAVA_HEAT_YEARS} from './sim.js';
import {DEEP_FLOOR} from './terrain.js';

const common = /* glsl */ `
uniform sampler2D fieldsTex;
uniform sampler2D normalTex;
uniform sampler2D groundTex;
uniform sampler2D riverTex;
uniform float riverN;
uniform float gridN;
uniform float cellSize;
uniform float seaLevel;
uniform float temperature;
uniform float time;
uniform float night;
uniform float lavaClock;
uniform sampler2D heatTex;

vec2 toGrid(vec2 w) { return w / cellSize + (gridN - 1.0) * 0.5; }
bool onGrid(vec2 g) { return g.x >= 0.0 && g.y >= 0.0 && g.x <= gridN - 1.0 && g.y <= gridN - 1.0; }
vec4 fieldsAt(vec2 g) { return texture2D(fieldsTex, (g + 0.5) / gridN); }
vec3 baseNormalAt(vec2 g) { return normalize(texture2D(normalTex, (g + 0.5) / gridN).xyz); }
// A cubic B-spline through the grid points, from four bilinear lookups (Sigg and Hadwiger's
// trick). Read straight, with bilinear blending, a field's edges ran along the grid in steps and
// diamonds wherever the shader turned it into a sharp edge (deep sediment, a reef's rim, dry
// ground); this is smooth to its second derivative, so those edges come out as curves.
vec4 smoothAt(sampler2D tex, vec2 g) {
  vec2 f = fract(g);
  vec2 i = g - f;
  vec2 w0 = (1.0 - f) * (1.0 - f) * (1.0 - f) / 6.0;
  vec2 w1 = (4.0 - 6.0 * f * f + 3.0 * f * f * f) / 6.0;
  vec2 w3 = f * f * f / 6.0;
  vec2 w2 = 1.0 - w0 - w1 - w3;
  vec2 s0 = w0 + w1;
  vec2 s1 = w2 + w3;
  vec2 p0 = (i - 1.0 + w1 / s0 + 0.5) / gridN;
  vec2 p1 = (i + 1.0 + w3 / s1 + 0.5) / gridN;
  return (texture2D(tex, vec2(p0.x, p0.y)) * s0.x + texture2D(tex, vec2(p1.x, p0.y)) * s1.x) * s0.y
       + (texture2D(tex, vec2(p0.x, p1.y)) * s0.x + texture2D(tex, vec2(p1.x, p1.y)) * s1.x) * s1.y;
}
float coralAt(vec2 g) { return smoothAt(normalTex, g).w; }
vec4 groundAt(vec2 g) { return smoothAt(groundTex, g); }

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
// the same noise and its gradient (x, y), in one go (Quilez's analytic derivatives)
vec3 gnoised(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  vec2 du = 6.0 * f * (1.0 - f);
  vec2 ga = hash2(i);
  vec2 gb = hash2(i + vec2(1, 0));
  vec2 gc = hash2(i + vec2(0, 1));
  vec2 gd = hash2(i + 1.0);
  float va = dot(ga, f);
  float vb = dot(gb, f - vec2(1, 0));
  float vc = dot(gc, f - vec2(0, 1));
  float vd = dot(gd, f - 1.0);
  float k = va - vb - vc + vd;
  return vec3(
    va + u.x * (vb - va) + u.y * (vc - va) + u.x * u.y * k,
    ga + u.x * (gb - ga) + u.y * (gc - ga) + u.x * u.y * (ga - gb - gc + gd)
      + du * (u.yx * k + vec2(vb, vc) - va));
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

// fbm and its gradient
vec3 fbmd(vec2 p, float octaves) {
  vec3 sum = vec3(0.0);
  float amp = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  mat2 j = mat2(1.0); // how far p has been turned and stretched, for the gradient
  for (int k = 0; k < 7; k++) {
    float weight = clamp(octaves - float(k), 0.0, 1.0);
    if (weight <= 0.0) break;
    vec3 n = gnoised(p);
    sum += amp * weight * vec3(n.x, transpose(j) * n.yz);
    p = m * p;
    j = m * j;
    amp *= 0.5;
  }
  return sum;
}

// Where to read the river texture for grid point g: wandering, so channels meander instead of
// running in the grid's straight stretches, in broad bends a few grid points long plus small
// kinks. (A single wiggle a grid point long read as a regular zigzag, like a pixelated line.)
vec2 riverCoord(vec2 g) {
  return g + vec2(gnoise(g * 0.3), gnoise(g * 0.3 + 17.3)) * 0.8
     + vec2(gnoise(g * 1.3 + 3.1), gnoise(g * 1.3 + 41.7)) * 0.2;
}
// distance to the nearest river (m), its half width (m), how much of here is lake, and how
// steeply the river drops (m per m, up to 1), at a point riverCoord gave
vec4 riverSample(vec2 g) {
  vec4 r = texture2D(riverTex, (g * (riverN - 1.0) / (gridN - 1.0) + 0.5) / riverN);
  return vec4(r.r * 63.0, max(r.g * 31.5, 1.0), r.b, r.a);
}
vec4 riverAt(vec2 g) { return riverSample(riverCoord(g)); }

// Years since the lava here erupted, from the worker's blurred freshness (smoothLava), read
// through a little noise so a flow's edges come out lobed instead of following the grid. The
// blur spreads a one-point flow over about three, so its middle reads 0.25 to 0.4; scaled
// back up, a new flow is new across a couple of points and older-looking at its fringe.
float lavaYearsAt(vec2 g) {
  g += vec2(gnoise(g * 0.6), gnoise(g * 0.6 + 31.7)) * 0.5
     + vec2(gnoise(g * 2.1 + 5.3), gnoise(g * 2.1 + 9.1)) * 0.15;
  float fresh = smoothAt(groundTex, g).a;
  return -${LAVA_FRESH_YEARS.toFixed(1)} * log(clamp(fresh * 2.5, 1e-6, 1.0));
}

// How hot the lava is here, through the same noise as lavaYearsAt, cooling between the model's
// steps by lavaClock. The B-spline spreads a flow one point wide over about three at 0.44 of
// its heat, so it's doubled: 1 and over is a fresh flow, up to 2.2 in the middle of a wide one.
float lavaHeatAt(vec2 g) {
  g += vec2(gnoise(g * 0.6), gnoise(g * 0.6 + 31.7)) * 0.5
     + vec2(gnoise(g * 2.1 + 5.3), gnoise(g * 2.1 + 9.1)) * 0.15;
  return 2.2 * smoothAt(heatTex, g).r * exp(-lavaClock / ${LAVA_HEAT_YEARS.toFixed(1)});
}

// Meters of fine relief on top of the simulated ground: most on steep slopes, little on valley
// floors where rivers run, and on beaches.
float detailAmp(vec2 g, float h, vec4 river) {
  vec3 n = baseNormalAt(g);
  float steep = length(n.xz) / max(n.y, 0.05);
  float amp = mix(2.0, 16.0, smoothstep(0.15, 1.0, steep));
  // flat valley floors along rivers, and smooth lake beds
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
// the same and its gradient (per m)
vec3 detailHeightd(vec2 w, float amp, float octaves) {
  vec3 n = fbmd(w / 110.0, octaves);
  vec3 r = fbmd(w / 70.0 + 5.2, octaves - 1.0);
  return amp * (vec3(n.x, n.yz / 110.0) + 0.6 * vec3(0.25 - abs(r.x), -sign(r.x) * r.yz / 70.0));
}
// a channel cut along each river, deeper for bigger ones, with sloping banks, at least
// minHalf m wide each side
float channelDepth(vec4 river, float minHalf) {
  float wide = max(river.y, minHalf);
  return (0.8 + 0.5 * river.y) * (1.0 - smoothstep(0.6 * wide, 2.0 * wide + 2.0, river.x));
}
// The ground as the mesh draws it. The mesh's vertices are 11 m apart (16 on phones), wider than
// most streams, so the channel it cuts is at least that wide, or it caught some vertices and
// missed others and the river ran through a row of dents. The shading cuts it at its real width.
float groundHeight(vec2 g, vec2 w) {
  float h = baseHeight(g);
  vec4 river = riverAt(g);
  float ground = h + detailHeight(w, detailAmp(g, h, river), 6.0);
  // A channel crossing a beach stops half a meter above the sea: cut below it, the sea surface
  // showed through the riverbed in patches, and at 10 cm the depth buffer still couldn't tell
  // them apart from afar.
  return max(ground - channelDepth(river, 0.5 * cellSize / 3.0), min(ground, seaLevel + 0.5));
}
vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }
${cloudCommon}
`;

// Sea water absorbs red within a few meters and blue over tens, and scatters some light back
// up: sand under a meter of water stays pale aqua, under five it turns turquoise, and past
// thirty only the deep blue of the water itself is left. These are for clear tropical water
// (Jerlov type I), per meter.
const underwater = /* glsl */ `
uniform vec3 deepWater; // light scattered back up out of bottomless water
const vec3 WATER_ABSORPTION = vec3(0.45, 0.07, 0.022);
// sun: how much sunlight reaches the water here, past the clouds
vec3 throughWater(vec3 light, vec3 w, float sun) {
  float depth = seaLevel - w.y;
  if (depth <= 0.0) return light;
  // the path down from the surface to here and back up, bent steeper by refraction
  vec3 v = normalize(cameraPosition - w);
  float viewCos = sqrt(1.0 - (1.0 - v.y * v.y) / 1.77);
  float sunCos = sqrt(1.0 - (1.0 - sunDirection.y * sunDirection.y) / 1.77);
  vec3 up = exp(-WATER_ABSORPTION * depth / viewCos);
  vec3 down = exp(-WATER_ABSORPTION * depth / sunCos);
  // the light scattered back up is mostly sunlight, so cloud shadows darken the sea too
  return light * down * up + deepWater * (1.0 - up) * (0.35 + 0.65 * sun);
}
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
void terrainSurface(vec3 w, vec3 n, vec4 f, vec4 ground, vec4 river, float coral, float fade,
    out vec3 color, out float rough, out float bumpHeight, out float bumpScale) {
  float above = w.y - seaLevel;
  float t = temperature - 0.0065 * max(above, 0.0);
  float pet = max(0.0, 0.065 * t);
  float aridity = pet > 0.0 ? f.g / pet : 10.0;
  float cover = smoothstep(0.15, 0.85, aridity) * smoothstep(-3.0, 6.0, t);
  float steep = length(n.xz) / max(n.y, 0.05);
  vec2 pw = w.xz;
  float broad = fbm(pw / 260.0, 3.0);
  float clumps = fbm(pw / 30.0, 3.0 * fade);
  // close-up noise is only worked out where a pixel is small enough to show it
  bool near = fade > 0.0;
  float fine = near ? gnoise(pw / 5.0) * fade : 0.0;

  // trees thin out with dryness and cold, in clumps
  // thicker growth along rivers, wider for bigger ones, wider and narrower as it goes rather
  // than an even strip that outlined every stream (breaking it into stands and gaps made a
  // row of beads)
  float reach = (4.0 * river.y + 25.0) * (0.5 + smoothstep(-0.4, 0.4, broad + clumps));
  float bankside = 1.0 - smoothstep(river.y + 2.0, reach, river.x);
  float trees = smoothstep(0.4, 1.2, aridity + 0.45 * clumps + 0.2 * broad + 0.6 * bankside) * smoothstep(1.0, 7.0, t);
  vec3 forest = mix(lin(vec3(0.11, 0.2, 0.12)), lin(vec3(0.19, 0.31, 0.12)), smoothstep(4.0, 10.0, t));
  forest = mix(forest, lin(vec3(0.15, 0.31, 0.09)), smoothstep(15.0, 21.0, t));
  // crowns of different trees: some yellower, some bluer, some in flower or turning
  float crowns = near ? gnoise(pw / 9.0) * fade : 0.0;
  forest = mix(forest, forest * vec3(1.35, 1.2, 0.8), smoothstep(0.1, 0.4, crowns));
  forest = mix(forest, forest * vec3(0.8, 0.95, 1.1), smoothstep(-0.1, -0.4, crowns));
  forest *= 0.6 + 0.8 * smoothstep(-0.35, 0.45, clumps); // sunlit crowns and dark gaps
  vec3 grass = mix(lin(vec3(0.6, 0.55, 0.3)), lin(vec3(0.35, 0.45, 0.17)), smoothstep(0.45, 0.9, aridity + 0.2 * broad));
  // Hollows hold water and stay green; open slopes and spurs dry out and bleach in the sun.
  // (f.a is the ambient occlusion from the simulated ground: 1 in the open, lower in hollows.)
  float hollow = smoothstep(0.93, 0.78, f.a + 0.04 * clumps);
  grass = mix(grass, grass * vec3(0.75, 1.0, 0.7), hollow);
  grass = mix(grass, lin(vec3(0.7, 0.62, 0.4)), 0.3 * smoothstep(0.96, 1.0, f.a) * smoothstep(1.4, 0.5, aridity));
  // tussocks and bare patches, too small to see from afar
  if (near) {
    float tufts = gnoise(pw / 2.3) + 0.5 * gnoise(pw / 1.1 + 7.7);
    grass *= 1.0 + 0.3 * fade * tufts;
    grass = mix(grass, grass * vec3(1.2, 1.1, 0.85), 0.5 * fade * smoothstep(0.15, 0.45, gnoise(pw / 13.0 + 3.3)));
  }
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

  // Bare rock on steep slopes, as the model has it: dark lava flows with red-brown beds of ash
  // and rubble between them, at the heights the model's beds lie (dipping gently out to sea,
  // as a shield volcano's flows do), black dikes, which stand bare on gentler slopes than the
  // rest, and none where sediment lies deep.
  float sediment = smoothstep(0.5, 4.0, ground.g);
  float dike = smoothstep(0.3, 0.7, ground.r);
  float rock = smoothstep(0.65, 1.05, steep + 0.4 * clumps + 0.4 * dike) * (1.0 - bar) * (1.0 - sediment);
  // the same bands as ashBed in sim.js
  // (wobbling a little: flows are lumpy, so a bed's edge never runs dead level)
  float strataY = (w.y + ground.b + 1.5 * clumps + 0.8 * fine) / ${LAYER_THICKNESS.toFixed(1)};
  float bed = fract(strataY);
  float bedBlur = min(0.25, fwidth(strataY));
  float ash = smoothstep(0.6 - bedBlur, 0.7 + bedBlur, bed) * smoothstep(1.0 + bedBlur, 0.9 - bedBlur, bed);
  // faint layering within the flows that wanders, rather than contour lines
  float flows = fbm(vec2(w.y / 9.0 + 3.0 * broad + 1.5 * clumps, 0.37), 3.0 * fade);
  vec3 lava = mix(lin(vec3(0.3, 0.29, 0.28)), lin(vec3(0.44, 0.41, 0.37)), smoothstep(-0.3, 0.3, flows));
  vec3 rockColor = mix(lava, lin(vec3(0.5, 0.36, 0.28)), 0.7 * ash * smoothstep(-0.4, 0.2, clumps));
  rockColor = mix(rockColor, lin(vec3(0.14, 0.15, 0.16)), dike);
  rockColor *= 0.75 + 0.35 * smoothstep(-0.2, 0.5, clumps);
  // Water running down a cliff leaves streaks and flutes straight down it, darker where it
  // wets and stains the rock, as on the Na Pali cliffs. They fade out where a pixel covers more
  // than a few meters, or they'd shimmer.
  vec2 downhill = normalize(n.xz + 1e-5);
  vec2 sq = vec2(dot(pw, vec2(-downhill.y, downhill.x)) / 7.0, dot(pw, downhill) / 90.0);
  float streaks = gnoise(sq) + 0.5 * gnoise(sq * vec2(2.7, 1.9) + 4.1);
  float streakFade = max(fade, 0.4 * (1.0 - smoothstep(8.0, 20.0, length(fwidth(pw)))));
  rockColor *= mix(1.0, 0.7 + 0.5 * smoothstep(-0.35, 0.35, streaks), streakFade);
  color = mix(color, rockColor, rock);
  // Fresh lava flows are bare: glassy black at first, weathering brown, and grown over within a
  // few tens of thousands of years. (Ferns take decades on a real flow, but at 2,000 years a step
  // the flows would never show.)
  float years = ground.a + 8e3 * clumps;
  float fresh = (1.0 - smoothstep(4e3, 3e4, years)) * (1.0 - sediment);
  vec3 freshLava = mix(lin(vec3(0.06, 0.06, 0.07)), lin(vec3(0.25, 0.2, 0.17)), smoothstep(3e3, 2.5e4, years));
  freshLava *= 0.8 + 0.4 * smoothstep(-0.3, 0.3, fine);
  color = mix(color, freshLava, fresh);
  // landslide scars and fresh debris on steep sediment: bare gravel
  color = mix(color, lin(vec3(0.5, 0.45, 0.38)), sediment * smoothstep(0.6, 0.9, steep) * (1.0 - bar));
  bumpHeight = mix(bumpHeight, 1.5, rock);
  bumpScale = mix(bumpScale, 5.0, rock);
  bumpHeight *= 1.0 - bar;
  rough = mix(0.95, 0.55, fresh * smoothstep(1e4, 2e3, years));
  // lake beds are mud
  color = mix(color, lin(vec3(0.33, 0.3, 0.24)), smoothstep(0.3, 0.8, river.z));

  // beaches, wet sand at the waterline, and the sea floor
  float beach = smoothstep(3.5 + 2.5 * broad, 1.0, above) * smoothstep(0.5, 0.25, steep);
  color = mix(color, lin(vec3(0.9, 0.82, 0.64)), beach);
  float wet = smoothstep(0.8, 0.2, above);
  color = mix(color, lin(vec3(0.62, 0.56, 0.44)), wet * beach);
  rough = mix(rough, 0.45, wet * beach);
  if (above < 0.0) {
    vec3 floorColor = mix(lin(vec3(0.86, 0.82, 0.7)), lin(vec3(0.22, 0.3, 0.16)), smoothstep(0.0, 0.45, clumps) * smoothstep(1.0, 6.0, -above));
    floorColor = mix(floorColor, lin(vec3(0.35, 0.36, 0.33)), smoothstep(30.0, 150.0, -above));
    // living reef: coral heads in browns, ochres and mauves between channels of white sand,
    // densest where it grows fastest
    float heads = 0.9 * smoothstep(0.6, 0.05, coral) + 0.2 - 0.6 * clumps - 0.35 * fine;
    vec3 reefColor = mix(lin(vec3(0.55, 0.36, 0.2)), lin(vec3(0.45, 0.28, 0.38)), smoothstep(-0.3, 0.3, broad));
    reefColor = mix(reefColor, lin(vec3(0.62, 0.52, 0.3)), smoothstep(0.0, 0.4, clumps * fine + 0.3 * fine));
    float reef = smoothstep(0.03, 0.1, coral) * smoothstep(0.1, -0.1, heads) * smoothstep(-0.3, -1.0, above);
    floorColor = mix(floorColor, reefColor, reef);
    color = mix(color, floorColor, smoothstep(0.0, -1.0, above));
    bumpHeight = mix(bumpHeight, mix(0.3, 1.2, reef), smoothstep(0.0, -1.0, above));
    bumpScale = mix(bumpScale, 3.0, reef * smoothstep(0.0, -1.0, above));
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
vec4 fields = smoothAt(fieldsTex, grid);
float viewDist = length(vViewPosition);
// how much fine detail this pixel can show without shimmering
float footprint = max(length(fwidth(vWorld.xz)), 0.5);
float fade = 1.0 - smoothstep(4.0, 30.0, footprint);
float octaves = clamp(7.0 - log2(footprint / 1.5), 2.0, 6.0);
float underDepth = seaLevel - vWorld.y;
// Past 80 m down, only a few percent of the floor's light makes it back up through the water
// (throughWater), so it gets plain mud instead of the full ground, which was most of the screen.
bool deep = underDepth > 80.0;

// slope of the simulated ground plus the same fine relief the vertices got
vec3 nb = baseNormalAt(grid);
vec2 slope = -nb.xz / nb.y;
vec3 surfaceColor;
float surfaceRough;
float bumpHeight;
float bumpScale;
vec4 river = vec4(63.0, 1.0, 0.0, 0.0);
vec4 groundHere = vec4(0.0, 0.0, 0.0, 1e9);
if (deep) {
  surfaceColor = mix(lin(vec3(0.86, 0.82, 0.7)), lin(vec3(0.35, 0.36, 0.33)), smoothstep(30.0, 150.0, underDepth));
  surfaceRough = 0.95;
  bumpHeight = 0.0;
  bumpScale = 5.0;
} else {
  vec2 rc = riverCoord(grid);
  river = riverSample(rc);
  slope += detailHeightd(vWorld.xz, detailAmp(grid, vWorld.y, river), octaves).yz;
  // the channel's banks, from the river texture either side (the wander barely bends over a
  // couple of meters, so it's left out of the gradient)
  float e = max(1.5, footprint) / cellSize;
  float c0 = channelDepth(river, 0.0);
  vec2 dc = vec2(channelDepth(riverSample(rc + vec2(e, 0.0)), 0.0),
                 channelDepth(riverSample(rc + vec2(0.0, e)), 0.0)) - c0;
  // (no banks where groundHeight kept the channel from cutting below the sea)
  slope -= dc / (e * cellSize) * smoothstep(0.5, 2.5, vWorld.y + c0 - seaLevel);
  vec3 shapeNormal = normalize(vec3(-slope.x, 1.0, -slope.y));
  groundHere = groundAt(grid);
  groundHere.a = lavaYearsAt(grid);
  terrainSurface(vWorld, shapeNormal, fields, groundHere, river, coralAt(grid), fade, surfaceColor, surfaceRough, bumpHeight, bumpScale);
}

// Crossing a beach, a stream spreads out shallow and wide and soaks the sand on either side;
// drawn at its width upstream it had no banks or greenery there and broke into dashes.
float mouth = smoothstep(3.0, 0.6, vWorld.y - seaLevel) * smoothstep(0.0, 0.4, vWorld.y + 0.5 - seaLevel) * (1.0 - river.z);
float soaked = (1.0 - smoothstep(2.5 * river.y + 2.0, 6.0 * river.y + 10.0, river.x)) * mouth;
surfaceColor *= 1.0 - 0.35 * soaked;
surfaceRough = mix(surfaceRough, 0.5, soaked);
// the river itself, never thinner than about half a pixel so it doesn't break up far away
// Waterfalls: where a river drops steeply (over a hard lava flow or a sea cliff, mostly) it
// spreads into white water streaming downhill, with spray around it.
// (Fully white from a drop of 0.15 turned every small stream on a hillside into white lines;
// from 0.25 to 0.5 left about two dozen points on the whole island.)
float fall = smoothstep(0.18, 0.4, river.w) * (1.0 - river.z);
float waterEdge = max(river.y * (1.0 + 1.5 * mouth + 2.0 * fall), 0.5 * footprint);
float spray = fall * (1.0 - smoothstep(waterEdge, 3.0 * waterEdge + 8.0, river.x));
surfaceColor = mix(surfaceColor, lin(vec3(0.75, 0.8, 0.78)), 0.4 * spray);
float inWater = (1.0 - smoothstep(waterEdge - 0.5 * footprint, waterEdge + 0.5 * footprint, river.x)) * (1.0 - river.z);
if (inWater > 0.0) {
  float middle = 1.0 - smoothstep(0.0, waterEdge, river.x);
  vec3 riverColor = mix(lin(vec3(0.24, 0.32, 0.28)), lin(vec3(0.07, 0.2, 0.22)), middle);
  // white water in streaks drawn out downhill, running down
  vec2 down = normalize(nb.xz + 1e-5);
  vec2 sq = vec2(dot(vWorld.xz, vec2(-down.y, down.x)) / 1.5, dot(vWorld.xz, down) / 8.0 - time * 2.5);
  float foam = fall * smoothstep(-0.3, 0.3, gnoise(sq) + 0.5 * gnoise(sq * 2.3) + 0.6 * fall - 0.2);
  riverColor = mix(riverColor, lin(vec3(0.92, 0.95, 0.95)), foam);
  surfaceColor = mix(surfaceColor, riverColor, inWater);
  surfaceRough = mix(surfaceRough, mix(0.08, 0.5, foam), inWater);
  bumpHeight *= 1.0 - inWater;
  // water lies flat across, with ripples running on it, except where it falls
  vec2 q = vWorld.xz / 4.0;
  vec2 ripple = vec2(gnoise(q + time * 0.8), gnoise(q.yx - time * 0.7)) * 0.12 * fade;
  slope = mix(slope, ripple, inWater * (1.0 - fall));
}

// tree crowns, tussocks and rubble, too small for the mesh
if (fade > 0.0 && bumpHeight > 0.0) {
  slope += bumpHeight * fade * fbmd(vWorld.xz / bumpScale, 3.0 * fade).yz / bumpScale;
}
vec3 worldNormal = normalize(vec3(-slope.x, 1.0, -slope.y));
normal = normalize((viewMatrix * vec4(worldNormal, 0.0)).xyz);
diffuseColor.rgb = surfaceColor;
roughnessFactor = surfaceRough;
// The newest flows still glow through the cracks in their crust, which only shows once the sun
// is low, and at night they're the brightest thing on the island.
float heatRaw = lavaHeatAt(grid);
float heat = min(heatRaw, 1.0);
// by day only the hottest, and dim: with the sun low by default, older flows glowed orange in
// broad patches all over the coast
heat *= mix(heat * heat, 1.0, night);
if (heat > 0.01 && vWorld.y > seaLevel) {
  vec2 pl = vWorld.xz;
  // a network of thin cracks in the crust (where noise crosses zero; blobs above a level read
  // as leopard spots), fading to an even glow where a pixel covers several (they glittered)
  float crackNoise = gnoise(pl / 14.0) + 0.5 * gnoise(pl / 6.0 + 2.7);
  float lines = 1.0 - smoothstep(0.0, 0.05, abs(crackNoise));
  float cracks = smoothstep(-0.05, 0.25, fbm(pl / 60.0, 1.0 + 2.0 * fade))
    * mix(0.3, lines, fade);
  float dusk = 0.15 + 0.85 * smoothstep(0.35, 0.05, sunDirection.y);
  // At night the whole flow glows through a dark, broken crust, most along the middle of the
  // widest, freshest flows, where it runs yellow.
  float core = smoothstep(1.0, 2.0, heatRaw);
  float crusted = smoothstep(-0.1, 0.5, fbm(pl / 30.0, 1.0 + 2.0 * fade)) * (1.0 - core);
  vec3 hot = mix(lin(vec3(0.9, 0.16, 0.03)), lin(vec3(1.0, 0.42, 0.1)), heat * heat);
  hot = mix(hot, lin(vec3(1.0, 0.62, 0.22)), core);
  float body = night * (0.15 + 1.5 * core) * (1.0 - 0.85 * crusted);
  totalEmissiveRadiance += hot * heat * (mix(0.6 * dusk, 5.0, night) * cracks + 2.5 * body);
}
float terrainAO = fields.a;
float sunThrough = cloudShadow(vWorld);
// the rippling net of light that waves focus onto a shallow floor
float caustics = 0.0;
// only where a pixel is small enough to show the net, or it turns to glittering streaks
float causticFade = smoothstep(3.0, 1.0, footprint);
if (underDepth > 0.0 && causticFade > 0.0) {
  vec2 cq = vWorld.xz / 5.0;
  float lines = 1.0 - abs(gnoise(cq + time * vec2(0.21, 0.13)) + gnoise(cq * 1.7 - time * vec2(0.11, 0.19)));
  caustics = 3.0 * pow(clamp(lines, 0.0, 1.0), 8.0) * smoothstep(0.0, 0.8, underDepth) * exp(-underDepth / 10.0) * causticFade;
}
`;

const terrainAO = /* glsl */ `
reflectedLight.directDiffuse *= sunThrough * (1.0 + caustics);
reflectedLight.directSpecular *= sunThrough;
reflectedLight.indirectDiffuse *= terrainAO;
reflectedLight.indirectSpecular *= terrainAO;
reflectedLight.directDiffuse *= mix(1.0, terrainAO, 0.35);
// Rivers reflect the environment map, which only holds the sky: on a slope facing away from a
// low sun they mirrored the bright sky round it straight through the ridge above them. So the
// reflected ray is marched over the heights, and where ground rises across it the river
// reflects dark hillside instead.
if (inWater > 0.0) {
  vec3 r = reflect(normalize(vWorld - cameraPosition), worldNormal);
  float blocked = r.y > 0.0 ? 0.0 : 1.0;
  float t = 30.0;
  for (int k = 0; k < 8; k++) {
    if (blocked >= 1.0) break;
    vec3 p = vWorld + r * t;
    vec2 g = toGrid(p.xz);
    if (!onGrid(g)) break;
    blocked = max(blocked, smoothstep(0.0, 15.0, fieldsAt(g).r - p.y));
    t *= 1.8;
  }
  // (in full, not by inWater: from afar a stream is narrower than a pixel and its glint still
  // shows across all of it)
  reflectedLight.indirectSpecular *= 1.0 - 0.92 * blocked;
  // and the sun's glint, off ripples that face a sun the hillside around them doesn't see (the
  // shadow map, at a few meters a texel, lets it through)
  float shaded = 0.0;
  t = 30.0;
  for (int k = 0; k < 8; k++) {
    vec3 p = vWorld + sunDirection * t;
    vec2 g = toGrid(p.xz);
    if (!onGrid(g)) break;
    shaded = max(shaded, smoothstep(0.0, 15.0, fieldsAt(g).r - p.y));
    t *= 1.8;
  }
  reflectedLight.directSpecular *= 1.0 - shaded;
}
// single very bright pixels (the sun mirrored in a stream) bloomed into stacks of squares
reflectedLight.directSpecular = min(reflectedLight.directSpecular, vec3(6.0));
reflectedLight.indirectSpecular = min(reflectedLight.indirectSpecular, vec3(3.0));
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
        `#include <common>\n${common}\n${underwater}\n${terrainSurface}\nvarying vec3 vWorld;`,
      )
      .replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>\n${terrainFragment}`,
      )
      .replace('#include <aomap_fragment>', terrainAO)
      .replace(
        '#include <opaque_fragment>',
        'outgoingLight = throughWater(outgoingLight, vWorld, sunThrough);\n#include <opaque_fragment>',
      );
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

// Water, for the sea and lakes alike. The sea's surface only reflects the sky and the sun and
// carries foam; the color under it comes from the terrain shader, which lets the light through
// the water to the floor and back. Lakes are murkier and get their color here. The swell rolls
// in on the wind, is calmer in the island's lee, and breaks where the bottom shoals suddenly.
const waterFragment = /* glsl */ `
vec2 grid = toGrid(vWater.xz);
float ground = onGrid(grid) ? baseHeight(grid) : ${DEEP_FLOOR.toFixed(1)};
float depth = max(vWater.y - ground, 0.0);
float viewDist = length(vViewPosition);
// Flats can lie within centimeters of sea level, closer than the depth buffer can tell water
// from ground 10 km away, and the surface flickered on and off over them as the land shifted
// by millimeters. So it fades out over the thinnest water, measured to the ground as drawn,
// and looks the same whichever wins.
float film = 1.0;
if (depth < 8.0 && onGrid(grid)) {
  film = smoothstep(0.0, 0.15 + 2e-9 * viewDist * viewDist, vWater.y - groundHeight(grid, vWater.xz));
}

vec2 p = vWater.xz;
float calm = 1.0 - smoothstep(3000.0, 25000.0, viewDist);
float e = max(2.0, length(fwidth(p)));
// the smallest ripples drop out where a pixel covers several of them, or they glitter
float ripples = 1.0 - smoothstep(2.0, 6.0, e);
#define WAVES(q) (0.9 * gnoise(q / 60.0 + time * vec2(0.03, 0.02)) + 0.45 * gnoise(q / 21.0 - time * vec2(0.05, -0.04)) + 0.2 * ripples * gnoise(q / 7.0 + time * 0.09))
float w0 = WAVES(p);
vec2 waveSlope = vec2(WAVES(p + vec2(e, 0.0)) - w0, WAVES(p + vec2(0.0, e)) - w0) / e * 1.2 * calm;

// land upwind shelters the water behind it
float shelter = 0.0;
for (int k = 1; k <= 4; k++) {
  vec2 gu = toGrid(p - wind * 300.0 * float(k * k));
  if (onGrid(gu)) shelter = max(shelter, smoothstep(seaLevel - 3.0, seaLevel + 10.0, fieldsAt(gu).r));
}
// three long swells from about the wind's direction, with sharp crests and broad troughs, at
// the speed deep-water waves of their length really travel
float swellAmp = SURF * (1.0 - 0.85 * shelter) * (1.0 - smoothstep(10.0, 40.0, e)) * smoothstep(0.5, 6.0, depth);
float crest = 0.0;
for (int k = 0; k < 3; k++) {
  float angle = (float(k) - 1.0) * 0.35;
  vec2 d = mat2(cos(angle), sin(angle), -sin(angle), cos(angle)) * wind;
  float len = k == 0 ? 95.0 : k == 1 ? 140.0 : 70.0;
  float amp = k == 1 ? 0.022 : 0.015; // crest height over wavelength
  float kw = 6.2832 / len;
  float ph = kw * dot(d, p) - sqrt(9.81 * kw) * time + float(k) * 1.7;
  float s = 0.5 + 0.5 * sin(ph);
  if (k == 1) crest = s;
  waveSlope += swellAmp * amp * 6.2832 * s * cos(ph) * d;
}
vec3 waterNormal = normalize(vec3(-waveSlope.x, 1.0, -waveSlope.y));
normal = normalize((viewMatrix * vec4(waterNormal, 0.0)).xyz);

float swash = gnoise(p / 8.0 + vec2(time * 0.25, -time * 0.18)) + 0.5 * gnoise(p / 3.0 - time * 0.3);
// Waves break where the bottom shoals suddenly, at a beach or a reef's edge, not across the
// broad flats behind them, and hardest where the swell comes straight in.
float deepest = depth;
float highest = ground;
for (int k = 0; k < 4; k++) {
  vec2 o = vec2(k == 0 ? 50.0 : k == 1 ? -50.0 : 0.0, k == 2 ? 50.0 : k == 3 ? -50.0 : 0.0);
  vec2 gk = toGrid(p + o);
  // (bilinear is plenty 50 m out, and a quarter of the cost of the smooth height)
  float hk = onGrid(gk) ? fieldsAt(gk).r : ${DEEP_FLOOR.toFixed(1)};
  deepest = max(deepest, vWater.y - hk);
  highest = max(highest, hk);
}
// Over broad flats next to land only the thin line of swash at the water's edge foams, and
// only where there's water deep enough nearby for waves to arrive.
float breaking = smoothstep(4.0, 15.0, deepest - depth) * smoothstep(2.5, 0.3, depth);
float swashLine = smoothstep(-1.0, 0.5, highest - vWater.y) * smoothstep(0.6, 0.1, depth) * smoothstep(1.0, 3.0, deepest);
float foam = SURF * max(breaking, swashLine) * calm * (1.0 - 0.6 * shelter)
  * smoothstep(-0.1, 0.45, swash + 0.5 * sin(depth * 3.5 - time * 1.4) + 0.3 * crest);
vec4 water = vec4(vec3(0.9), 0.95 * foam);
if (SURF == 0.0) {
  // lakes: tea-colored in the shallows, dark green deeper
  vec3 lake = mix(lin(vec3(0.35, 0.4, 0.3)), lin(vec3(0.04, 0.12, 0.12)), smoothstep(0.0, 8.0, depth));
  water = vec4(lake, mix(0.5, 0.97, smoothstep(0.0, 6.0, depth)));
}
diffuseColor = water;
roughnessFactor = mix(0.04, 0.7, foam);
`;

// The surface is drawn premultiplied: foam and lake color cover what's below by their alpha,
// and reflections add on top at full strength, so a nearly clear sea still mirrors the sky.
const waterOutput = /* glsl */ `
// the sun's glints are capped, or single bright pixels bloom into squares
gl_FragColor = vec4(totalDiffuse * diffuseColor.a + min(totalSpecular, vec3(12.0)), diffuseColor.a) * film;
`;
const waterFog = /* glsl */ `
#ifdef USE_FOG
float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor * gl_FragColor.a, fogFactor);
#endif
`;

/**
 * @param {import('three').MeshStandardMaterial} material
 * @param {object} uniforms
 * @param {{surf: boolean}} options waves break on the sea's shores, not on lakes
 */
export function waterMaterial(material, uniforms, {surf}) {
  material.defines = {SURF: surf ? '1.0' : '0.0'};
  material.blending = THREE.CustomBlending;
  material.blendSrc = THREE.OneFactor;
  material.blendDst = THREE.OneMinusSrcAlphaFactor;
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
      )
      .replace(
        '#include <aomap_fragment>',
        'reflectedLight.directSpecular *= cloudShadow(vWater);',
      )
      .replace('#include <opaque_fragment>', waterOutput)
      .replace('#include <fog_fragment>', waterFog);
  };
  return material;
}
