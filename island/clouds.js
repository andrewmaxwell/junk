// Clouds where the model condenses them: cumulus caps over the windward slopes and peaks, where
// rising air turns vapor into the rain that carves the island, and scattered trade-wind cumulus
// over the sea. They're raymarched through a slab of sky after the scene is drawn, stopping at
// whatever the depth buffer says is in the way, and the terrain shader reads the same density
// for their shadows.
import * as THREE from 'three';
import {Pass, FullScreenQuad} from 'three/addons/postprocessing/Pass.js';
import {makeRandom} from './terrain.js';
import {MAX_VENTS} from './eruptions.js';

export const CLOUD_BASE = 600; // m above the sea: where rising tropical air starts to condense
export const CLOUD_TOP = 2400; // m: the trade-wind inversion caps the tallest of them

// Shared with the terrain and water shaders, which use it for cloud shadows.
export const cloudCommon = /* glsl */ `
uniform sampler2D cloudTex;
uniform highp sampler3D noiseTex;
uniform vec2 wind;
uniform vec3 sunDirection;
uniform float cloudsOn;
#define CLOUD_BASE ${CLOUD_BASE.toFixed(1)}
#define CLOUD_TOP ${CLOUD_TOP.toFixed(1)}
// how much of the sky here is cloud, 0..1, from the condensed water the model carries
float cloudCover(vec2 xz) {
  vec2 g = xz / cellSize + (gridN - 1.0) * 0.5;
  float water = texture(cloudTex, (g + 0.5) / gridN).r;
  // trade-wind cumulus dot the open sea; condensation over the land piles them up, but only
  // into scattered towers (at full cover a solid cap hid the summit and everything around it)
  return cloudsOn * (0.42 + 0.26 * smoothstep(0.025, 0.11, water));
}
vec3 cloudDrift() { return vec3(wind.x, 0.0, wind.y) * time * 25.0; }
// cloud density at p: billows from tileable noise, flat bottoms, and tops that rise higher
// where there's more cloud
float cloudDensity(vec3 p, float cover, float detail) {
  float h = (p.y - seaLevel - CLOUD_BASE) / (CLOUD_TOP - CLOUD_BASE);
  if (h <= 0.0 || h >= 1.0 || cover <= 0.0) return 0.0;
  vec3 q = (p + cloudDrift()) / 3000.0;
  // a second, much broader lookup hides that the noise repeats every 3 km
  float shape = texture(noiseTex, q).r * (0.55 + 0.6 * texture(noiseTex, q * 0.17 + 0.31).g);
  float profile = smoothstep(0.0, 0.06, h) * smoothstep(cover * cover, 0.3 * cover * cover, h);
  float d = (shape * profile - (1.0 - cover)) / cover;
  if (d <= 0.0) return 0.0;
  if (detail > 0.0) d -= (1.0 - texture(noiseTex, q * 4.3 + 0.37).g) * 0.45 * (1.0 - d);
  return clamp(d, 0.0, 1.0);
}
// how much sunlight gets through the clouds to the ground at w, from the densest of three
// heights along the way to the sun (one, at the middle of the cloud base, missed most of the
// small cumulus, which are thin there)
float cloudShadow(vec3 w) {
  if (cloudsOn == 0.0 || sunDirection.y <= 0.02) return 1.0;
  float d = 0.0;
  for (int k = 0; k < 3; k++) {
    float height = seaLevel + CLOUD_BASE + 150.0 + 450.0 * float(k);
    vec3 p = w + sunDirection * max(height - w.y, 0.0) / sunDirection.y;
    d = max(d, cloudDensity(p, cloudCover(p.xz), 0.0));
  }
  return 1.0 - 0.8 * smoothstep(0.0, 0.2, d);
}
`;

const cloudFragment = /* glsl */ `
uniform sampler2D tDepth;
uniform mat4 projectionInverse;
uniform mat4 cameraWorld;
uniform vec3 eye;
uniform float cameraNear;
uniform float cameraFar;
uniform float gridN;
uniform float cellSize;
uniform float seaLevel;
uniform float time;
uniform vec3 sunColor;
uniform vec3 skyLight;
uniform vec3 fogColor;
uniform float fogDensity;
uniform sampler2D shadowMap;
uniform mat4 shadowMatrix;
uniform float shadowReady;
uniform float shadowSize;
uniform vec4 vents[${MAX_VENTS}];
varying vec2 vUv;
${cloudCommon}

// orange light from erupting vents (eruptions.js), falling off over VENT_REACH m. Only the
// haze takes it: lighting the clouds with it too, their 56 steps across the slab caught it at
// random and drew streaks.
#define VENT_REACH 350.0
#define LAVA_LIGHT vec3(1.0, 0.36, 0.08)

#include <packing>

// Henyey-Greenstein, scaled so scattering evenly in all directions gives 1
float phase(float c, float g) {
  return (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * c, 1.5);
}

// Haze: sea salt and water droplets in the air, thickest near the sea and thinning with height
// (falling off by 1/e every HAZE_HEIGHT m), so valleys and the lowlands fade into the distance
// while the peaks stand clear. Sunlight scatters off it mostly forward, so looking toward a low
// sun it glows, and wherever a cloud or a mountain shades the air it's dark: shafts of light.
#define HAZE_DENSITY 5e-5
#define HAZE_HEIGHT 450.0
// 1 where the sun reaches p past the land, from the terrain's shadow map, fading to lit toward
// the map's edges (past them, a mountain's shadow ended in a hard line across the sky)
float landShadow(vec3 p) {
  if (shadowReady == 0.0) return 1.0;
  vec4 s = shadowMatrix * vec4(p, 1.0);
  s.xyz /= s.w;
  if (s.x < 0.0 || s.y < 0.0 || s.x > 1.0 || s.y > 1.0 || s.z > 1.0) return 1.0;
  vec2 edge = min(s.xy, 1.0 - s.xy);
  float inside = smoothstep(0.0, 0.15, min(edge.x, edge.y));
  // compared at the four nearest texels and blended, or the shafts' edges stepped from texel
  // to texel in a checkerboard
  vec2 st = s.xy * shadowSize - 0.5;
  vec2 f = fract(st);
  vec2 uv = (floor(st) + 0.5) / shadowSize;
  float d = 1.0 / shadowSize;
  #define LIT(o) step(s.z, unpackRGBAToDepth(texture2D(shadowMap, uv + o)) + 0.002)
  float lit = mix(mix(LIT(vec2(0.0)), LIT(vec2(d, 0.0)), f.x), mix(LIT(vec2(0.0, d)), LIT(vec2(d)), f.x), f.y);
  return mix(1.0, lit, inside);
}
// light the haze adds along the ray, and how much of what's behind it shows through
vec4 haze(vec3 dir, float tEnd, float jitter) {
  float tMax = min(tEnd, 40000.0);
  float dt = tMax / float(HAZE_STEPS);
  float t = dt * jitter;
  float c = dot(dir, sunDirection);
  // forward scattering off the haze, plus a little every way
  float g = 0.75;
  float ph = 0.7 * (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * c, 1.5) + 0.3;
  vec3 sun = sunColor * ph * 1.0;
  vec3 ambient = skyLight * 0.3;
  float optical = 0.0;
  vec3 light = vec3(0.0);
  for (int i = 0; i < HAZE_STEPS; i++) {
    vec3 p = eye + dir * t;
    float density = HAZE_DENSITY * exp(-max(p.y - seaLevel, 0.0) / HAZE_HEIGHT);
    float lit = sunDirection.y > 0.0 ? cloudShadow(p) * landShadow(p) : 0.0;
    float stepOptical = density * dt;
    light += exp(-optical) * (1.0 - exp(-stepOptical)) * (sun * lit + ambient);
    optical += stepOptical;
    t += dt;
  }
  // The vents' glow in the haze, worked out exactly along the ray rather than marched: it falls
  // off within a few hundred meters, which steps a kilometer or more apart caught at random and
  // drew as stripes. The integral of 1 / (1 + d² / R²) along a line passing h from the vent is
  // R² / s · atan(t / s) with s² = R² + h², taken at the haze's density at the vent.
  for (int k = 0; k < ${MAX_VENTS}; k++) {
    if (vents[k].w <= 0.0) continue;
    vec3 toVent = vents[k].xyz - eye;
    float along = dot(toVent, dir);
    float s = sqrt(VENT_REACH * VENT_REACH + max(dot(toVent, toVent) - along * along, 0.0));
    float reach = VENT_REACH * VENT_REACH / s * (atan((tMax - along) / s) + atan(along / s));
    float density = HAZE_DENSITY * exp(-max(vents[k].xyz.y - seaLevel, 0.0) / HAZE_HEIGHT);
    light += LAVA_LIGHT * 1.2 * vents[k].w * density * reach * exp(-optical * clamp(along / tMax, 0.0, 1.0));
  }
  return vec4(light, exp(-optical));
}

void main() {
  float depth = texture2D(tDepth, vUv).r;
  vec4 view = projectionInverse * vec4(vUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  view /= view.w;
  vec3 hit = (cameraWorld * view).xyz;
  vec3 dir = normalize(hit - eye);
  float tEnd = depth < 1.0 ? distance(hit, eye) : 80000.0;
  // a fixed per-pixel offset hides the banding of so few steps as fine grain
  float jitter = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  // only through the air: down to the sea floor, the haze was thicker over the deep floor beyond
  // the grid than over the shallows on it, which showed the grid's square at low angles
  float tAir = dir.y < 0.0 ? min(tEnd, (seaLevel - eye.y) / dir.y) : tEnd;
  vec4 air = haze(dir, tAir, jitter);

  // where the ray crosses the slab of sky clouds live in
  float bottom = seaLevel + CLOUD_BASE;
  float top = seaLevel + CLOUD_TOP;
  float tA = (bottom - eye.y) / dir.y;
  float tB = (top - eye.y) / dir.y;
  float t0 = max(min(tA, tB), 0.0);
  float t1 = min(max(tA, tB), tEnd);
  if (abs(dir.y) < 1e-4 || t1 <= t0 || cloudsOn == 0.0) {
    gl_FragColor = air;
    return;
  }

  float stepLength = (t1 - t0) / float(STEPS);
  float t = t0 + stepLength * jitter;
  float c = dot(dir, sunDirection);
  // mostly forward scattering, which lights up cloud edges against the sun
  float ph = mix(phase(c, 0.6), phase(c, -0.2), 0.4);
  vec3 light = vec3(0.0);
  float through = 1.0;
  for (int i = 0; i < STEPS; i++) {
    vec3 p = eye + dir * t;
    float cover = cloudCover(p.xz);
    float d = cloudDensity(p, cover, 1.0);
    if (d > 0.0) {
      // how much cloud lies between here and the sun
      float toSun = 0.0;
      float ls = 80.0;
      vec3 lp = p;
      for (int j = 0; j < LIGHT_STEPS; j++) {
        lp += sunDirection * ls;
        toSun += cloudDensity(lp, cloudCover(lp.xz), 0.0) * ls;
        ls *= 2.0;
      }
      float sigma = 0.008 * d; // per meter
      // Beer's law, softened as light scattered many times inside a cloud still gets through
      float sun = exp(-0.012 * toSun) + 0.3 * exp(-0.003 * toSun);
      float h = (p.y - bottom) / (top - bottom);
      vec3 radiance = sunColor * sun * ph + skyLight * (0.45 + 0.55 * h);
      float stepThrough = exp(-sigma * stepLength);
      float fog = exp(-fogDensity * fogDensity * t * t);
      light += through * (1.0 - stepThrough) * mix(fogColor, radiance, fog);
      through *= stepThrough;
      if (through < 0.01) break;
    }
    t += stepLength;
  }
  // the clouds are in front of the haze behind them
  gl_FragColor = vec4(air.rgb * through + light, air.a * through);
}
`;

/**
 * Draws clouds and haze over the rendered scene, reading its depth. They're worked out at half
 * the resolution each way, as the light they add and how much of the scene shows through, and
 * then laid over it: at full resolution they took about 15 ms a frame on an M4.
 */
export class CloudPass extends Pass {
  /**
   * @param {THREE.PerspectiveCamera} camera
   * @param {object} uniforms shared with the terrain: grid, sea level, time, sun, wind, clouds
   * @param {{lowPower: boolean, light: THREE.DirectionalLight}} options light: the sun, whose
   *   shadow map shades the haze
   */
  constructor(camera, uniforms, {lowPower, light}) {
    super();
    this.camera = camera;
    this.light = light;
    this.material = new THREE.ShaderMaterial({
      defines: {
        STEPS: lowPower ? 24 : 56,
        LIGHT_STEPS: lowPower ? 2 : 4,
        HAZE_STEPS: lowPower ? 12 : 28,
      },
      uniforms: {
        ...uniforms,
        tDepth: {value: null},
        projectionInverse: {value: camera.projectionMatrixInverse},
        cameraWorld: {value: camera.matrixWorld},
        eye: {value: new THREE.Vector3()},
        cameraNear: {value: camera.near},
        cameraFar: {value: camera.far},
        shadowMap: {value: null},
        shadowMatrix: {value: new THREE.Matrix4()},
        shadowReady: {value: 0},
        shadowSize: {value: light.shadow.mapSize.x},
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }`,
      fragmentShader: cloudFragment,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.material);
    this.target = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
    });
    this.blend = new FullScreenQuad(
      new THREE.ShaderMaterial({
        uniforms: {
          tColor: {value: null},
          tClouds: {value: this.target.texture},
          tDepth: {value: null},
          texel: {value: new THREE.Vector2()},
          cameraNear: {value: camera.near},
          cameraFar: {value: camera.far},
        },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = vec4(position.xy, 0.0, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform sampler2D tColor;
          uniform sampler2D tClouds;
          uniform sampler2D tDepth;
          uniform vec2 texel;
          uniform float cameraNear;
          uniform float cameraFar;
          varying vec2 vUv;
          float distanceAt(vec2 uv) {
            float d = texture2D(tDepth, uv).r;
            return cameraNear * cameraFar / (cameraFar - d * (cameraFar - cameraNear));
          }
          void main() {
            vec4 scene = texture2D(tColor, vUv);
            // The 3×3 half-size pixels around this one, weighted by nearness, which smooths out
            // the grain the march is jittered with (read once, it showed as a checkerboard two
            // pixels wide), and by how close each one's depth is to this pixel's: blended
            // regardless, the sky's haze bled over every ridge and blurred its edge.
            float here = distanceAt(vUv);
            vec2 center = (floor(vUv / texel) + 0.5) * texel;
            vec4 sum = vec4(0.0);
            float total = 0.0;
            for (int y = -1; y <= 1; y++) {
              for (int x = -1; x <= 1; x++) {
                vec2 uv = center + vec2(x, y) * texel;
                vec2 off = (uv - vUv) / texel;
                float near = max(0.0, 1.5 - length(off));
                float same = exp(-abs(distanceAt(uv) - here) / here * 40.0);
                float w = near * same + 1e-4 * near;
                sum += w * texture2D(tClouds, uv);
                total += w;
              }
            }
            vec4 clouds = sum / total;
            gl_FragColor = vec4(scene.rgb * clouds.a + clouds.rgb, scene.a);
          }`,
        depthTest: false,
        depthWrite: false,
      }),
    );
  }

  setSize(width, height) {
    this.target.setSize(Math.ceil(width / 2), Math.ceil(height / 2));
    this.blend.material.uniforms.texel.value.set(
      1 / Math.ceil(width / 2),
      1 / Math.ceil(height / 2),
    );
  }

  render(renderer, writeBuffer, readBuffer) {
    const u = this.material.uniforms;
    u.tDepth.value = readBuffer.depthTexture;
    u.eye.value.setFromMatrixPosition(this.camera.matrixWorld);
    const shadow = this.light.castShadow && this.light.shadow.map;
    u.shadowReady.value = shadow ? 1 : 0;
    if (shadow) {
      u.shadowMap.value = shadow.texture;
      u.shadowMatrix.value.copy(this.light.shadow.matrix);
    }
    renderer.setRenderTarget(this.target);
    this.quad.render(renderer);
    this.blend.material.uniforms.tColor.value = readBuffer.texture;
    this.blend.material.uniforms.tDepth.value = readBuffer.depthTexture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.blend.render(renderer);
  }
}

/**
 * Tileable billowy noise for cloud shapes: red is Worley noise at 4, 8 and 16 cells across,
 * inverted so cells are puffs; green is the same an octave finer, for eroding their edges.
 */
export function makeCloudNoise(size = 64) {
  const random = makeRandom(12345);
  const worleyAt = (cells) => {
    const points = Float32Array.from({length: cells ** 3 * 3}, random);
    const out = new Float32Array(size ** 3);
    for (let z = 0; z < size; z++) {
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const px = (x / size) * cells;
          const py = (y / size) * cells;
          const pz = (z / size) * cells;
          const cx = Math.floor(px);
          const cy = Math.floor(py);
          const cz = Math.floor(pz);
          let best = 9;
          for (let dz = -1; dz <= 1; dz++) {
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                const ix = (cx + dx + cells) % cells;
                const iy = (cy + dy + cells) % cells;
                const iz = (cz + dz + cells) % cells;
                const k = ((iz * cells + iy) * cells + ix) * 3;
                const ddx = cx + dx + points[k] - px;
                const ddy = cy + dy + points[k + 1] - py;
                const ddz = cz + dz + points[k + 2] - pz;
                const d2 = ddx * ddx + ddy * ddy + ddz * ddz;
                if (d2 < best) best = d2;
              }
            }
          }
          out[(z * size + y) * size + x] = 1 - Math.min(1, Math.sqrt(best));
        }
      }
    }
    return out;
  };
  const w4 = worleyAt(4);
  const w8 = worleyAt(8);
  const w16 = worleyAt(16);
  const w32 = worleyAt(32);
  const data = new Uint8Array(size ** 3 * 2);
  for (let i = 0; i < size ** 3; i++) {
    data[i * 2] = 255 * (0.625 * w4[i] + 0.25 * w8[i] + 0.125 * w16[i]);
    data[i * 2 + 1] = 255 * (0.625 * w8[i] + 0.25 * w16[i] + 0.125 * w32[i]);
  }
  const texture = new THREE.Data3DTexture(data, size, size, size);
  texture.format = THREE.RGFormat;
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.wrapS = texture.wrapT = texture.wrapR = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}
