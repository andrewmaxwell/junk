// Clouds where the model condenses them: cumulus caps over the windward slopes and peaks, where
// rising air turns vapor into the rain that carves the island, and scattered trade-wind cumulus
// over the sea. They're raymarched through a slab of sky after the scene is drawn, stopping at
// whatever the depth buffer says is in the way, and the terrain shader reads the same density
// for their shadows.
import * as THREE from 'three';
import {Pass, FullScreenQuad} from 'three/addons/postprocessing/Pass.js';
import {makeRandom} from './terrain.js';

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
  // trade-wind cumulus dot the open sea; condensation over the land piles them up
  return cloudsOn * (0.47 + 0.53 * smoothstep(0.025, 0.11, water));
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
// how much sunlight gets through the clouds to the ground at w
float cloudShadow(vec3 w) {
  if (cloudsOn == 0.0 || sunDirection.y <= 0.02) return 1.0;
  float mid = seaLevel + CLOUD_BASE + 350.0;
  vec3 p = w + sunDirection * max(mid - w.y, 0.0) / sunDirection.y;
  float d = cloudDensity(p, cloudCover(p.xz), 0.0);
  return 1.0 - 0.8 * smoothstep(0.0, 0.25, d);
}
`;

const cloudFragment = /* glsl */ `
uniform sampler2D tColor;
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
varying vec2 vUv;
${cloudCommon}

#include <packing>

// Henyey-Greenstein, scaled so scattering evenly in all directions gives 1
float phase(float c, float g) {
  return (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * c, 1.5);
}

void main() {
  vec4 scene = texture2D(tColor, vUv);
  float depth = texture2D(tDepth, vUv).r;
  vec4 view = projectionInverse * vec4(vUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  view /= view.w;
  vec3 hit = (cameraWorld * view).xyz;
  vec3 dir = normalize(hit - eye);
  float tEnd = depth < 1.0 ? distance(hit, eye) : 80000.0;

  // where the ray crosses the slab of sky clouds live in
  float bottom = seaLevel + CLOUD_BASE;
  float top = seaLevel + CLOUD_TOP;
  float tA = (bottom - eye.y) / dir.y;
  float tB = (top - eye.y) / dir.y;
  float t0 = max(min(tA, tB), 0.0);
  float t1 = min(max(tA, tB), tEnd);
  if (abs(dir.y) < 1e-4 || t1 <= t0 || cloudsOn == 0.0) {
    gl_FragColor = scene;
    return;
  }

  float stepLength = (t1 - t0) / float(STEPS);
  // a fixed per-pixel offset hides the banding of so few steps as fine grain
  float jitter = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
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
      float sigma = 0.012 * d; // per meter
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
  gl_FragColor = vec4(scene.rgb * through + light, scene.a);
}
`;

/** Draws clouds over the rendered scene, reading its color and depth. */
export class CloudPass extends Pass {
  /**
   * @param {THREE.PerspectiveCamera} camera
   * @param {object} uniforms shared with the terrain: grid, sea level, time, sun, wind, clouds
   * @param {{lowPower: boolean}} options
   */
  constructor(camera, uniforms, {lowPower}) {
    super();
    this.camera = camera;
    this.material = new THREE.ShaderMaterial({
      defines: {STEPS: lowPower ? 24 : 56, LIGHT_STEPS: lowPower ? 2 : 4},
      uniforms: {
        ...uniforms,
        tColor: {value: null},
        tDepth: {value: null},
        projectionInverse: {value: camera.projectionMatrixInverse},
        cameraWorld: {value: camera.matrixWorld},
        eye: {value: new THREE.Vector3()},
        cameraNear: {value: camera.near},
        cameraFar: {value: camera.far},
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
  }

  render(renderer, writeBuffer, readBuffer) {
    const u = this.material.uniforms;
    u.tColor.value = readBuffer.texture;
    u.tDepth.value = readBuffer.depthTexture;
    u.eye.value.setFromMatrixPosition(this.camera.matrixWorld);
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
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
