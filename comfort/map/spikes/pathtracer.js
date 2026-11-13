// A progressive path tracer for one scene: a grid of flat-topped columns
// standing on an endless ground plane. Because every column fills its cell
// exactly, the scene is a heightfield, and a ray can walk it cell by cell (2D
// DDA) and hit the boxes exactly, with no triangles or BVH.
//
// Each frame adds one sample per pixel to a float buffer: a jittered camera
// ray, then up to `bounces` diffuse bounces. At every hit the sun is sampled
// directly, from a disk of `sunRadius` degrees so shadows have real penumbras,
// and bounce rays that escape pick up the sky dome. Shade is lit only by the
// sky and by light bounced off the columns, which is what makes it blue.
import * as THREE from 'three';

const vertexShader = /* glsl */ `
in vec3 position;
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const traceShader = /* glsl */ `
precision highp float;
precision highp int;
precision highp sampler2D;

uniform sampler2D uColumns; // rgb: linear albedo of the top, a: height in cells
uniform sampler2D uPrev;
uniform ivec2 uGrid;
uniform vec3 uOrigin; // world position of the grid's (0, 0) corner
uniform float uCell; // world size of one cell
uniform float uMaxH; // tallest column, in cells
uniform mat4 uCamWorld;
uniform mat4 uProjInv;
uniform vec3 uCamPos;
uniform vec3 uSunDir;
uniform float uSunCos;
uniform vec3 uSun;
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform vec3 uGround;
uniform vec3 uBase; // column sides fade up from this at the ground
uniform int uFrame;
uniform int uBounces;
uniform vec2 uRes;
out vec4 fragColor;

const float INF = 1e30;
const float PI = 3.14159265;

uint seed;
uint pcg(uint v) {
  uint s = v * 747796405u + 2891336453u;
  uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}
float rand() {
  seed = pcg(seed);
  return float(seed) / 4294967296.0;
}

vec4 column(ivec2 c) { return texelFetch(uColumns, c, 0); }

// In grid space (x and z in cells, y in cell widths). Returns the distance to
// the first hit (INF for none), its normal, and the cell hit (-1 for ground).
float trace(vec3 o, vec3 d, out vec3 n, out ivec2 hitCell) {
  hitCell = ivec2(-1);
  n = vec3(0.0, 1.0, 0.0);
  float tGround = d.y < 0.0 ? -o.y / d.y : INF;

  vec3 inv = 1.0 / d;
  vec3 t0 = -o * inv;
  vec3 t1 = (vec3(float(uGrid.x), uMaxH, float(uGrid.y)) - o) * inv;
  vec3 tn = min(t0, t1);
  vec3 tf = max(t0, t1);
  float tEnter = max(max(tn.x, tn.z), max(tn.y, 0.0));
  float tExit = min(min(tf.x, tf.y), tf.z);
  if (tEnter >= tExit) return tGround;

  vec3 p = o + d * tEnter;
  ivec2 cell = clamp(ivec2(floor(p.xz)), ivec2(0), uGrid - 1);
  ivec2 stp = ivec2(d.x > 0.0 ? 1 : -1, d.z > 0.0 ? 1 : -1);
  vec2 tDelta = abs(inv.xz);
  vec2 tMax = vec2(
    (float(cell.x + (stp.x > 0 ? 1 : 0)) - o.x) * inv.x,
    (float(cell.y + (stp.y > 0 ? 1 : 0)) - o.z) * inv.z
  );
  float tCur = tEnter;
  vec3 lastN = tn.x > tn.z ? vec3(-float(stp.x), 0.0, 0.0) : vec3(0.0, 0.0, -float(stp.y));

  for (int i = 0; i < 8192; i++) {
    float tNext = min(min(tMax.x, tMax.y), tExit);
    float h = column(cell).a;
    if (h > 0.0) {
      if (o.y + d.y * tCur <= h) {
        n = lastN;
        hitCell = cell;
        return tCur;
      }
      if (o.y + d.y * tNext <= h) {
        hitCell = cell;
        return (h - o.y) / d.y;
      }
    }
    if (tGround <= tNext) return tGround;
    if (tNext >= tExit) break;
    if (d.y > 0.0 && o.y + d.y * tNext > uMaxH) break;
    if (tMax.x < tMax.y) {
      cell.x += stp.x;
      tCur = tMax.x;
      tMax.x += tDelta.x;
      lastN = vec3(-float(stp.x), 0.0, 0.0);
    } else {
      cell.y += stp.y;
      tCur = tMax.y;
      tMax.y += tDelta.y;
      lastN = vec3(0.0, 0.0, -float(stp.y));
    }
    if (any(lessThan(cell, ivec2(0))) || any(greaterThanEqual(cell, uGrid))) break;
  }
  return tGround;
}

vec3 sky(vec3 d) {
  return mix(uSkyHorizon, uSkyZenith, sqrt(clamp(d.y, 0.0, 1.0)));
}

vec3 albedoAt(ivec2 c, vec3 p, vec3 n) {
  if (c.x < 0) return uGround;
  vec4 col = column(c);
  if (n.y > 0.5) return col.rgb;
  float f = clamp(p.y / col.a, 0.0, 1.0);
  return mix(uBase, col.rgb, f * f);
}

void basis(vec3 n, out vec3 t, out vec3 b) {
  t = normalize(cross(abs(n.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0), n));
  b = cross(n, t);
}

vec3 sampleCone(vec3 axis, float cosMax) {
  float c = mix(1.0, cosMax, rand());
  float s = sqrt(max(0.0, 1.0 - c * c));
  float phi = 2.0 * PI * rand();
  vec3 t, b;
  basis(axis, t, b);
  return normalize(t * cos(phi) * s + b * sin(phi) * s + axis * c);
}

vec3 sampleCosine(vec3 n) {
  float r = sqrt(rand());
  float phi = 2.0 * PI * rand();
  vec3 t, b;
  basis(n, t, b);
  return normalize(t * r * cos(phi) + b * r * sin(phi) + n * sqrt(max(0.0, 1.0 - r * r)));
}

void main() {
  seed = pcg(uint(gl_FragCoord.x) * 1973u + uint(gl_FragCoord.y) * 9277u + uint(uFrame) * 26699u);
  vec2 ndc = (gl_FragCoord.xy - 0.5 + vec2(rand(), rand())) / uRes * 2.0 - 1.0;
  vec4 view = uProjInv * vec4(ndc, 1.0, 1.0);
  vec3 d = normalize((uCamWorld * vec4(view.xyz / view.w, 0.0)).xyz);
  if (abs(d.x) < 1e-7) d.x = 1e-7;
  if (abs(d.z) < 1e-7) d.z = 1e-7;
  vec3 o = (uCamPos - uOrigin) / uCell;

  vec3 radiance = vec3(0.0);
  vec3 throughput = vec3(1.0);
  for (int bounce = 0; bounce <= uBounces; bounce++) {
    vec3 n;
    ivec2 c;
    float t = trace(o, d, n, c);
    if (t >= INF) {
      radiance += throughput * sky(d);
      break;
    }
    vec3 p = o + d * t;
    vec3 albedo = albedoAt(c, p, n);
    o = p + n * 1e-3;

    // Direct sun, from a random point on its disk.
    vec3 l = sampleCone(uSunDir, uSunCos);
    float cosL = dot(n, l);
    if (cosL > 0.0) {
      vec3 sn;
      ivec2 sc;
      if (trace(o, l, sn, sc) >= INF || sc.x < 0) radiance += throughput * albedo * uSun * cosL;
    }
    if (bounce == uBounces) break;
    d = sampleCosine(n);
    if (abs(d.x) < 1e-7) d.x = 1e-7;
    if (abs(d.z) < 1e-7) d.z = 1e-7;
    throughput *= albedo;
  }

  vec4 prev = uFrame == 0 ? vec4(0.0) : texelFetch(uPrev, ivec2(gl_FragCoord.xy), 0);
  fragColor = prev + vec4(radiance, 1.0);
}
`;

const displayShader = /* glsl */ `
precision highp float;
uniform sampler2D uAccum;
uniform float uExposure;
uniform vec2 uScale; // accumulation pixels per screen pixel
out vec4 fragColor;

// Narkowicz's fit of the ACES filmic curve.
vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}
vec3 toSrgb(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

// The accumulated sample at a screen pixel, bilinear when the accumulation
// is smaller than the screen (a fast preview).
vec4 accum(vec2 frag) {
  if (uScale == vec2(1.0)) return texelFetch(uAccum, ivec2(frag), 0);
  vec2 p = frag * uScale - 0.5;
  ivec2 size = textureSize(uAccum, 0);
  ivec2 i = ivec2(floor(p));
  vec2 f = p - floor(p);
  vec4 a = texelFetch(uAccum, clamp(i, ivec2(0), size - 1), 0);
  vec4 b = texelFetch(uAccum, clamp(i + ivec2(1, 0), ivec2(0), size - 1), 0);
  vec4 c = texelFetch(uAccum, clamp(i + ivec2(0, 1), ivec2(0), size - 1), 0);
  vec4 d = texelFetch(uAccum, clamp(i + ivec2(1, 1), ivec2(0), size - 1), 0);
  vec4 ab = mix(a / max(a.a, 1.0), b / max(b.a, 1.0), f.x);
  vec4 cd = mix(c / max(c.a, 1.0), d / max(d.a, 1.0), f.x);
  return vec4(mix(ab, cd, f.y).rgb, 1.0);
}

void main() {
  vec4 a = accum(gl_FragCoord.xy);
  vec3 c = toSrgb(aces(a.rgb / max(a.a, 1.0) * uExposure));
  // A touch of noise so the smooth ground doesn't band.
  float dither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
  fragColor = vec4(c + dither / 255.0, 1.0);
}
`;

export function createPathTracer(renderer) {
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  quad.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(quad);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const targetOptions = {
    type: THREE.FloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthBuffer: false,
  };
  // An accumulation buffer pair (read is the latest complete sum, write the
  // one being drawn), one at full resolution and one small for previews.
  const pair = () => ({
    read: new THREE.WebGLRenderTarget(1, 1, targetOptions),
    write: new THREE.WebGLRenderTarget(1, 1, targetOptions),
    width: 1,
    height: 1,
    samples: 0,
  });
  const main = pair();
  const small = pair();
  const setSize = (p, width, height) => {
    [p.width, p.height] = [Math.max(1, width), Math.max(1, height)];
    p.read.setSize(p.width, p.height);
    p.write.setSize(p.width, p.height);
    p.samples = 0;
  };

  const linear = (hex) => new THREE.Color(hex);
  const trace = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader,
    fragmentShader: traceShader,
    uniforms: {
      uColumns: {value: null},
      uPrev: {value: null},
      uGrid: {value: new THREE.Vector2(1, 1)},
      uOrigin: {value: new THREE.Vector3()},
      uCell: {value: 1},
      uMaxH: {value: 1},
      uCamWorld: {value: new THREE.Matrix4()},
      uProjInv: {value: new THREE.Matrix4()},
      uCamPos: {value: new THREE.Vector3()},
      uSunDir: {value: new THREE.Vector3(0, 1, 0)},
      uSunCos: {value: 1},
      uSun: {value: new THREE.Vector3()},
      uSkyZenith: {value: new THREE.Vector3()},
      uSkyHorizon: {value: new THREE.Vector3()},
      uGround: {value: linear('#ffffff')},
      uBase: {value: linear('#ffffff')},
      uFrame: {value: 0},
      uBounces: {value: 3},
      uRes: {value: new THREE.Vector2(1, 1)},
    },
  });
  const display = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader,
    fragmentShader: displayShader,
    uniforms: {
      uAccum: {value: null},
      uExposure: {value: 1},
      uScale: {value: new THREE.Vector2(1, 1)},
    },
  });
  const u = trace.uniforms;

  let columns;
  let screen = [1, 1];
  let row = 0; // first row of the next band of the sample being drawn
  let rows = 64; // rows per band, adjusted to keep each band near budgetMs
  let lastStep = 0;

  // Draws rows [y0, y0 + count) of the next sample into p.write.
  function draw(p, view, y0, count, frame, bounces) {
    u.uCamWorld.value.copy(view.matrixWorld);
    u.uProjInv.value.copy(view.projectionMatrixInverse);
    u.uCamPos.value.setFromMatrixPosition(view.matrixWorld);
    u.uFrame.value = frame;
    u.uPrev.value = p.read.texture;
    u.uRes.value.set(p.width, p.height);
    const saved = u.uBounces.value;
    u.uBounces.value = bounces;
    p.write.scissor.set(0, y0, p.width, count);
    p.write.scissorTest = count < p.height;
    quad.material = trace;
    renderer.setRenderTarget(p.write);
    renderer.render(scene, camera);
    u.uBounces.value = saved;
  }
  const swap = (p) => {
    [p.read, p.write] = [p.write, p.read];
    p.samples++;
  };

  const tracer = {
    samples: 0, // complete full-resolution samples per pixel
    uniforms: u,
    // Milliseconds of GPU work to aim for per step. 0 draws each whole sample
    // in one go; a budget splits it into bands of rows over several steps, so
    // a big screen never holds up the next frame (and camera input) for long.
    budgetMs: 0,
    previewScale: 0.3, // preview resolution, as a fraction of the screen's
    previewBounces: 1,
    reset() {
      tracer.samples = 0;
      main.samples = 0;
      small.samples = 0;
      row = 0;
    },
    resize(width, height) {
      screen = [width, height];
      setSize(main, width, height);
      setSize(
        small,
        Math.round(width * tracer.previewScale),
        Math.round(height * tracer.previewScale),
      );
      tracer.reset();
    },
    // `data` holds RGBA floats per cell: linear albedo and height in cells.
    setColumns(data, width, height, cell, origin) {
      columns?.dispose();
      columns = new THREE.DataTexture(
        data,
        width,
        height,
        THREE.RGBAFormat,
        THREE.FloatType,
      );
      columns.needsUpdate = true;
      u.uColumns.value = columns;
      u.uGrid.value.set(width, height);
      u.uCell.value = cell;
      u.uOrigin.value.copy(origin);
      let maxH = 0;
      for (let i = 3; i < data.length; i += 4) maxH = Math.max(maxH, data[i]);
      u.uMaxH.value = maxH + 1e-3;
      tracer.reset();
    },
    // Advances the full-resolution render: one whole sample per pixel, or one
    // band of one when there's a budget.
    step(view) {
      if (!tracer.budgetMs) {
        draw(main, view, 0, main.height, main.samples, u.uBounces.value);
        swap(main);
        tracer.samples = main.samples;
        return;
      }
      // Nothing on screen for this view yet: a quick preview first.
      if (main.samples === 0 && small.samples === 0) tracer.preview(view);
      // Steps come once a frame, so the time since the last one shows how far
      // behind the GPU is; resize the bands toward the budget.
      const now = performance.now();
      const dt = now - lastStep;
      lastStep = now;
      if (dt < 200) {
        if (dt > tracer.budgetMs * 1.3)
          rows = Math.max(8, Math.floor(rows * 0.7));
        else if (dt < tracer.budgetMs)
          rows = Math.min(main.height, Math.ceil(rows * 1.15));
      }
      const count = Math.min(rows, main.height - row);
      draw(main, view, row, count, main.samples, u.uBounces.value);
      row += count;
      if (row >= main.height) {
        row = 0;
        swap(main);
        tracer.samples = main.samples;
      }
    },
    // One quick low-resolution sample, for while the view is moving.
    preview(view) {
      draw(small, view, 0, small.height, small.samples, tracer.previewBounces);
      swap(small);
    },
    // Shows the full render, or the preview until the full one has a whole
    // sample.
    show(exposure) {
      const p = main.samples === 0 && small.samples > 0 ? small : main;
      display.uniforms.uAccum.value = p.read.texture;
      display.uniforms.uExposure.value = exposure;
      display.uniforms.uScale.value.set(
        p.width / screen[0],
        p.height / screen[1],
      );
      quad.material = display;
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
    },
  };
  return tracer;
}
